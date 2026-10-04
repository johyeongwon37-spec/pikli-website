/** Draft fixtures, not inventory or confirmed sales prices. */
export const products = [
  {id:'tee', name:'COURT TEE', category:'tops', audiences:['women','men'], visual:'tee', price:499000,
   colors:['cream','forest'], sizes:['XS','S','M','L','XL'], images:[], sizeGuide:null, approved:false,
   description:{en:'A court-to-city tee concept for the first PIKLI collection. Final fabric, measurements and product photography will be confirmed after sample approval.',vi:'Mẫu áo thun từ sân đấu đến phố trong bộ sưu tập PIKLI đầu tiên. Chất liệu, số đo và ảnh sản phẩm sẽ được xác nhận sau khi duyệt mẫu.'}},
  {id:'bottom', name:'COURT BOTTOM', category:'bottoms', audiences:['women','men'], visual:'shorts', price:599000,
   colors:['forest','cream'], sizes:['XS','S','M','L','XL'], images:[], sizeGuide:null, approved:false,
   description:{en:'A versatile shorts concept for pickleball and everyday plans. This is a design preview, not a photograph of a finished garment.',vi:'Mẫu quần short linh hoạt cho pickleball và hoạt động hằng ngày. Đây là hình minh họa thiết kế, chưa phải ảnh sản phẩm hoàn thiện.'}},
  {id:'cap', name:'CLUB CAP', category:'accessories', audiences:['women','men'], visual:'cap', price:449000,
   colors:['forest','cream'], sizes:['ONE SIZE'], images:[], sizeGuide:null, approved:false,
   description:{en:'The PIKLI cap concept. Final construction, fit and delivery details will be published before sales open.',vi:'Mẫu mũ PIKLI. Kết cấu, kích thước và thông tin giao hàng sẽ được công bố trước khi mở bán.'}}
].map(p=>({...p,variants:p.colors.flatMap(color=>p.sizes.map(size=>({sku:[p.id,color,size.replaceAll(' ','-')].join('_'),color,size,price:p.price,available:null})))}));

export const preview = {
  mode:'preview', currency:'VND', connected:false, orderEnabled:false, paymentMethods:[],
  shipping:{country:'VN',fee:null,freeOver:null,delivery:null},
  merchant:{name:null,email:null,address:null},
  policies:{version:null,shipping:null,returns:null,privacy:null,terms:null}, products
};

export class StoreError extends Error {
  constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
export function normalizeItems(raw) {
  if(!Array.isArray(raw)||raw.length<1||raw.length>30) throw new StoreError('INVALID_CART');
  const map=new Map();
  for(const x of raw){
    if(!x||typeof x.sku!=='string'||!/^[A-Za-z0-9_-]{3,80}$/.test(x.sku)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>10) throw new StoreError('INVALID_QUANTITY');
    const n=(map.get(x.sku)||0)+x.quantity;
    if(n>10) throw new StoreError('QUANTITY_LIMIT');
    map.set(x.sku,n);
  }
  if([...map.values()].reduce((a,b)=>a+b,0)>30) throw new StoreError('QUANTITY_LIMIT');
  return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([sku,quantity])=>({sku,quantity}));
}
export function quote(raw,catalog) {
  const items=normalizeItems(raw).map(x=>{
    const product=catalog.products.find(p=>p.variants.some(v=>v.sku===x.sku));
    const variant=product?.variants.find(v=>v.sku===x.sku);
    if(!variant) throw new StoreError('VARIANT_UNAVAILABLE',409);
    if(!Number.isSafeInteger(variant.price)||variant.price<0) throw new StoreError('CATALOG_UNAVAILABLE',503);
    if(catalog.mode==='live'&&(!product.approved||!Number.isInteger(variant.available)||variant.available<x.quantity)) throw new StoreError('OUT_OF_STOCK',409);
    return {...x,productId:product.id,name:product.name,color:variant.color,size:variant.size,unitPrice:variant.price,lineTotal:variant.price*x.quantity};
  });
  const subtotal=items.reduce((s,x)=>s+x.lineTotal,0);
  let shipping=Number.isSafeInteger(catalog.shipping.fee)&&catalog.shipping.fee>=0?catalog.shipping.fee:null;
  if(shipping!==null&&Number.isSafeInteger(catalog.shipping.freeOver)&&subtotal>=catalog.shipping.freeOver) shipping=0;
  return {currency:'VND',items,subtotal,shipping,total:shipping===null?null:subtotal+shipping,
    orderEnabled:catalog.orderEnabled&&shipping!==null,mode:catalog.mode,policyVersion:catalog.policies.version};
}
export function validateCustomer(raw) {
  const fields={fullName:[2,100],email:[3,254],phone:[8,24],province:[2,100],ward:[2,100],address:[5,240],note:[0,500]};
  const out={};
  for(const [key,[min,max]] of Object.entries(fields)){
    const s=typeof raw?.[key]==='string'?raw[key].trim():'';
    if(s.length<min||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) throw new StoreError('INVALID_CUSTOMER');
    out[key]=s;
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)||!/^\+?[0-9 ()-]{8,24}$/.test(out.phone)||raw.country!=='VN') throw new StoreError('INVALID_CUSTOMER');
  return {...out,email:out.email.toLowerCase(),country:'VN'};
}
