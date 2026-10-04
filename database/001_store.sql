-- PIKLI ONLY. Review and apply to a NEW PIKLI project, never SPARTERS.
-- No sales are enabled by this migration. No public role may read customer data.
begin;
create table if not exists public.pikli_products (
  id text primary key, data jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.pikli_variants (
  sku text primary key, product_id text not null references public.pikli_products(id),
  color text not null, size text not null, price bigint not null check(price>=0),
  available integer not null default 0 check(available>=0), unique(product_id,color,size)
);
create table if not exists public.pikli_settings (
  id boolean primary key default true check(id), checkout_enabled boolean not null default false,
  cod_enabled boolean not null default false, shipping_fee bigint check(shipping_fee>=0),
  free_over bigint check(free_over>=0), delivery jsonb,
  merchant jsonb not null default '{}'::jsonb, policies jsonb not null default '{}'::jsonb
);
insert into public.pikli_settings(id) values(true) on conflict do nothing;
create table if not exists public.pikli_orders (
  id uuid primary key default gen_random_uuid(), idempotency_key uuid not null unique,
  token_hash text not null check(length(token_hash)=64), fingerprint text not null,
  status text not null default 'pending_confirmation' check(status in('pending_confirmation','processing','shipped','delivered','cancelled','refunded')),
  payment_method text not null default 'cod' check(payment_method='cod'),
  payment_status text not null default 'unpaid' check(payment_status in('unpaid','paid','refunded')),
  currency text not null default 'VND' check(currency='VND'),
  customer jsonb not null, policy_version text not null, consent_at timestamptz not null default now(),
  subtotal bigint not null check(subtotal>=0), shipping bigint not null check(shipping>=0),
  total bigint not null check(total=subtotal+shipping), tracking_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.pikli_order_items (
  order_id uuid not null references public.pikli_orders(id) on delete cascade,
  sku text not null, name text not null, color text not null, size text not null,
  quantity integer not null check(quantity between 1 and 10), unit_price bigint not null check(unit_price>=0),
  primary key(order_id,sku)
);
create table if not exists public.pikli_rate_windows (
  key text not null, bucket timestamptz not null, hits integer not null, primary key(key,bucket)
);
-- Restrict BOTH grants and policies. The browser only talks to our server.
alter table public.pikli_products enable row level security;
alter table public.pikli_variants enable row level security;
alter table public.pikli_settings enable row level security;
alter table public.pikli_orders enable row level security;
alter table public.pikli_order_items enable row level security;
alter table public.pikli_rate_windows enable row level security;
revoke all on public.pikli_products,public.pikli_variants,public.pikli_settings,public.pikli_orders,public.pikli_order_items,public.pikli_rate_windows from anon,authenticated;
grant select,insert,update,delete on public.pikli_products,public.pikli_variants,public.pikli_settings,public.pikli_orders,public.pikli_order_items,public.pikli_rate_windows to service_role;

create or replace function public.pikli_catalog() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'mode','preview','currency','VND','connected',true,
 'orderEnabled',s.checkout_enabled and s.cod_enabled and s.shipping_fee is not null
   and coalesce(length(s.merchant->>'name'),0)>0 and coalesce(length(s.merchant->>'email'),0)>0
   and coalesce(length(s.merchant->>'address'),0)>0
   and coalesce(length(s.policies->>'version'),0)>0
   and coalesce(length(s.policies->>'shipping'),0)>0 and coalesce(length(s.policies->>'returns'),0)>0
   and coalesce(length(s.policies->>'privacy'),0)>0 and coalesce(length(s.policies->>'terms'),0)>0,
 'paymentMethods','[]'::jsonb,
 'shipping',jsonb_build_object('country','VN','fee',s.shipping_fee,'freeOver',s.free_over,'delivery',s.delivery),
 'merchant',s.merchant,'policies',s.policies,
 'products',coalesce((select jsonb_agg(p.data||jsonb_build_object('id',p.id,'variants',
   coalesce((select jsonb_agg(jsonb_build_object('sku',v.sku,'color',v.color,'size',v.size,'price',v.price,'available',v.available) order by v.sku)
     from public.pikli_variants v where v.product_id=p.id),'[]'::jsonb)) order by p.created_at,p.id) from public.pikli_products p),'[]'::jsonb)
) from public.pikli_settings s where s.id=true;
$$;

create or replace function public.pikli_rate_limit(p_key text) returns boolean language plpgsql security invoker set search_path='' as $$
declare bucket_at timestamptz; n integer;
begin
 if length(p_key)<>64 then raise exception 'INVALID_CUSTOMER'; end if;
 bucket_at:=date_bin('15 minutes'::interval,now(),'2026-01-01'::timestamptz);
 insert into public.pikli_rate_windows(key,bucket,hits) values(p_key,bucket_at,1)
 on conflict(key,bucket) do update set hits=public.pikli_rate_windows.hits+1 returning hits into n;
 if n>15 then raise exception 'RATE_LIMITED'; end if;
 delete from public.pikli_rate_windows where bucket<now()-interval '2 days';
 return true;
end; $$;

create or replace function public.pikli_order_status(p_order_id uuid,p_token_hash text) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('id',o.id,'status',o.status,'paymentMethod',o.payment_method,'paymentStatus',o.payment_status,
 'subtotal',o.subtotal,'shipping',o.shipping,'total',o.total,'currency',o.currency,'createdAt',o.created_at,'trackingCode',o.tracking_code,
 'items',(select jsonb_agg(jsonb_build_object('sku',i.sku,'name',i.name,'color',i.color,'size',i.size,'quantity',i.quantity,'unitPrice',i.unit_price)) from public.pikli_order_items i where i.order_id=o.id))
from public.pikli_orders o where o.id=p_order_id and o.token_hash=p_token_hash;
$$;

create or replace function public.pikli_create_cod_order(
 p_key uuid,p_token_hash text,p_fingerprint text,p_items jsonb,p_customer jsonb,p_expected_total bigint,p_policy_version text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.pikli_settings%rowtype; prior public.pikli_orders%rowtype; v public.pikli_variants%rowtype;
 x jsonb; product jsonb; q integer; qty integer:=0; sub bigint:=0; fee bigint; oid uuid; payable boolean;
begin
 -- The config row lock serializes launch/price settings and idempotent order creation for this small first drop.
 select * into s from public.pikli_settings where id=true for update;
 select coalesce((public.pikli_catalog()->>'orderEnabled')::boolean,false) into payable;
 if not coalesce(payable,false) then raise exception 'STORE_NOT_READY'; end if;
 if p_policy_version is distinct from s.policies->>'version' then raise exception 'POLICY_CHANGED'; end if;
 if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' or p_fingerprint is null or length(p_fingerprint)<>64 then raise exception 'INVALID_CUSTOMER'; end if;
 select * into prior from public.pikli_orders where idempotency_key=p_key;
 if found then
   if prior.fingerprint<>p_fingerprint or prior.token_hash<>p_token_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return public.pikli_order_status(prior.id,p_token_hash);
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'INVALID_CART'; end if;
 if (select count(*)<>count(distinct value->>'sku') from jsonb_array_elements(p_items)) then raise exception 'INVALID_CART'; end if;
 if p_customer->>'country' is distinct from 'VN' or coalesce(length(p_customer->>'email'),0)<3
    or coalesce(length(p_customer->>'address'),0)<5 or coalesce(length(p_customer->>'fullName'),0)<2 then raise exception 'INVALID_CUSTOMER'; end if;
 for x in select value from jsonb_array_elements(p_items) order by value->>'sku' loop
   if coalesce(x->>'quantity','') !~ '^[0-9]+$' then raise exception 'INVALID_CART'; end if;
   q:=(x->>'quantity')::integer; qty:=qty+q;
   if q not between 1 and 10 or qty>30 then raise exception 'INVALID_CART'; end if;
   select * into v from public.pikli_variants where sku=x->>'sku' for update;
   if not found then raise exception 'OUT_OF_STOCK'; end if;
   select data into product from public.pikli_products where id=v.product_id;
   if coalesce((product->>'approved')::boolean,false)=false or v.available<q then raise exception 'OUT_OF_STOCK'; end if;
   sub:=sub+v.price*q;
 end loop;
 fee:=case when s.free_over is not null and sub>=s.free_over then 0 else s.shipping_fee end;
 if sub+fee is distinct from p_expected_total then raise exception 'PRICE_CHANGED'; end if;
 insert into public.pikli_orders(idempotency_key,token_hash,fingerprint,customer,policy_version,subtotal,shipping,total)
 values(p_key,p_token_hash,p_fingerprint,p_customer,p_policy_version,sub,fee,sub+fee) returning id into oid;
 for x in select value from jsonb_array_elements(p_items) order by value->>'sku' loop
   select * into v from public.pikli_variants where sku=x->>'sku';
   select data into product from public.pikli_products where id=v.product_id;
   q:=(x->>'quantity')::integer;
   insert into public.pikli_order_items(order_id,sku,name,color,size,quantity,unit_price) values(oid,v.sku,product->>'name',v.color,v.size,q,v.price);
   update public.pikli_variants set available=available-q where sku=v.sku;
 end loop;
 -- COD is NOT paid, NOT 300-paid-preorders. Payment changes require verified staff/provider reconciliation.
 return public.pikli_order_status(oid,p_token_hash);
end; $$;

revoke all on function public.pikli_catalog(),public.pikli_rate_limit(text),public.pikli_order_status(uuid,text),public.pikli_create_cod_order(uuid,text,text,jsonb,jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.pikli_catalog(),public.pikli_rate_limit(text),public.pikli_order_status(uuid,text),public.pikli_create_cod_order(uuid,text,text,jsonb,jsonb,bigint,text) to service_role;
commit;
