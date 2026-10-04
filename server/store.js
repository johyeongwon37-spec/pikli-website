import { createHash } from 'node:crypto';
import { preview, quote, normalizeItems, validateCustomer, StoreError } from './catalog.js';

const hash=s=>createHash('sha256').update(s).digest('hex');
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function configured(env){return Boolean(env.SUPABASE_URL&&(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY));}
async function rpc(env,name,body,fetcher){
  if(!configured(env)) throw new StoreError('STORE_NOT_READY',503);
  const u=new URL(env.SUPABASE_URL);
  if(u.protocol!=='https:') throw new StoreError('STORE_NOT_READY',503);
  const key=env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY;
  const headers={'Content-Type':'application/json',apikey:key};
  if(!env.SUPABASE_SECRET_KEY) headers.Authorization=`Bearer ${key}`;
  const r=await fetcher(`${u.origin}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(9000)});
  if(!r.ok){
    let msg='';try{msg=(await r.json()).message||'';}catch{}
    const safe=['OUT_OF_STOCK','STORE_NOT_READY','PRICE_CHANGED','IDEMPOTENCY_CONFLICT','INVALID_CART','RATE_LIMITED','INVALID_CUSTOMER','POLICY_CHANGED'];
    throw new StoreError(safe.includes(msg)?msg:'STORE_UNAVAILABLE',msg==='RATE_LIMITED'?429:(['OUT_OF_STOCK','PRICE_CHANGED','IDEMPOTENCY_CONFLICT','POLICY_CHANGED'].includes(msg)?409:503));
  }
  return r.json();
}
export async function getCatalog(env,fetcher=fetch){
  if(!configured(env)) return structuredClone(preview);
  const data=await rpc(env,'pikli_catalog',{},fetcher);
  if(!data||!Array.isArray(data.products)||!data.shipping||!data.policies) throw new StoreError('CATALOG_UNAVAILABLE',503);
  // A server switch alone cannot launch the shop; the DB also requires approved policies and products.
  const approved=env.PIKLI_LIVE_APPROVED==='true'&&data.orderEnabled===true&&Boolean(env.SITE_URL)&&String(env.PIKLI_RATE_LIMIT_SALT||'').length>=32;
  return {...data,connected:true,orderEnabled:approved,mode:approved?'live':'preview',paymentMethods:approved?['cod']:[]};
}
export async function handleRequest(request,env=process.env,fetcher=fetch){
  try{
    const url=new URL(request.url),action=url.searchParams.get('action')||'catalog';
    if(request.method==='GET'&&action==='catalog') return json(await getCatalog(env,fetcher));
    if(request.method!=='POST') return json({error:'METHOD_NOT_ALLOWED'},405);
    const allowed=env.SITE_URL?new URL(env.SITE_URL).origin:'https://pikli-website.vercel.app';
    const origin=request.headers.get('origin');
    if(origin!==allowed&&!(env.NODE_ENV==='test'&&origin==='http://localhost:8787')) return json({error:'ORIGIN_NOT_ALLOWED'},403);
    if(!(request.headers.get('content-type')||'').includes('application/json')) return json({error:'JSON_REQUIRED'},415);
    const text=await request.text();
    if(Buffer.byteLength(text)>16384) return json({error:'REQUEST_TOO_LARGE'},413);
    let body;try{body=JSON.parse(text);}catch{throw new StoreError('INVALID_JSON');}
    if(!body||typeof body!=='object'||Array.isArray(body)) throw new StoreError('INVALID_JSON');
    if(action==='quote') return json(quote(body.items,await getCatalog(env,fetcher)));
    if(action==='order'){
      const catalog=await getCatalog(env,fetcher);
      if(!catalog.orderEnabled||body.paymentMethod!=='cod') throw new StoreError('STORE_NOT_READY',503);
      const q=quote(body.items,catalog),customer=validateCustomer(body.customer);
      if(body.consent!==true||body.policyVersion!==catalog.policies.version) throw new StoreError('POLICY_CHANGED',409);
      if(body.expectedTotal!==q.total) throw new StoreError('PRICE_CHANGED',409);
      const idempotency=request.headers.get('idempotency-key')||'';
      if(!/^[0-9a-f-]{36}$/.test(idempotency)||!/^([0-9a-f]{64})$/.test(body.accessToken||'')) throw new StoreError('INVALID_REQUEST');
      const ip=request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'unknown';
      const limitKey=hash(`${env.PIKLI_RATE_LIMIT_SALT}|order|${ip.split(',')[0].trim()}`);
      await rpc(env,'pikli_rate_limit',{p_key:limitKey},fetcher);
      const canonical={items:normalizeItems(body.items),customer,total:q.total,policyVersion:body.policyVersion};
      const order=await rpc(env,'pikli_create_cod_order',{p_key:idempotency,p_token_hash:hash(body.accessToken),p_fingerprint:hash(JSON.stringify(canonical)),p_items:canonical.items,p_customer:customer,p_expected_total:q.total,p_policy_version:body.policyVersion},fetcher);
      return json({order},201);
    }
    if(action==='order-status'){
      const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
      if(!/^[0-9a-f]{64}$/.test(token)||!/^([0-9a-f-]{36})$/.test(body.orderId||'')) throw new StoreError('ORDER_NOT_FOUND',404);
      const order=await rpc(env,'pikli_order_status',{p_order_id:body.orderId,p_token_hash:hash(token)},fetcher);
      if(!order) throw new StoreError('ORDER_NOT_FOUND',404);
      return json({order});
    }
    // A form never silently "registers" someone only in localStorage.
    if(action==='waitlist') return json({error:'WAITLIST_NOT_READY'},503);
    return json({error:'NOT_FOUND'},404);
  }catch(e){
    if(e instanceof StoreError) return json({error:e.code},e.status);
    // No addresses, emails, credentials or upstream bodies in public errors or logs.
    return json({error:'STORE_UNAVAILABLE'},503);
  }
}
