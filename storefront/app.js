(()=>{
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,session=false)=>{try{return JSON.parse((session?sessionStorage:localStorage).getItem(key));}catch{return null;}};
const write=(key,v,session=false)=>{try{(session?sessionStorage:localStorage).setItem(key,JSON.stringify(v));return true;}catch{return false;}};
let lang;try{lang=localStorage.getItem('pikliLang')==='en'?'en':'vi';}catch{lang='vi';}
let catalog=null,cart=[],checkout={step:1,customer:{country:'VN'},quote:null},selection={color:null,size:null,quantity:1},toastTimer;
const page=document.body.dataset.page||'home', root=$('#commerceRoot'), query=new URLSearchParams(location.search);
const T=k=>window.PIKLI_SHOP_MESSAGES[lang][k]||k;
const money=n=>n==null?T('notConfirmed'):new Intl.NumberFormat(lang==='vi'?'vi-VN':'en-US',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
const product=id=>catalog.products.find(p=>p.id===id);
const variant=sku=>{for(const p of catalog.products){const v=p.variants.find(v=>v.sku===sku);if(v)return {p,v};}return null;};
const cartPayload=()=>cart.map(x=>({sku:x.sku,quantity:x.quantity}));
const sizeLabel=s=>s==='ONE SIZE'?T('one'):s;
const colorLabel=c=>T(c);
const safeImage=u=>{try{const x=new URL(u,location.origin);return ['https:','http:'].includes(x.protocol)&&(x.protocol==='https:'||x.origin===location.origin)?x.href:'';}catch{return '';}};
const symbol=()=>'<span class="mark" aria-hidden="true">'+ '<i></i>'.repeat(7)+'</span>';
function visual(p,color=null,extra=''){
 const chosen=color||p.colors[0],src=safeImage(p.images?.find(i=>typeof i==='object'&&i.color===chosen)?.url||p.images?.[0]?.url||p.images?.[0]||'');
 const garment=chosen==='forest'?'#16382f':'#f7f2e9';
 return `<div class="commerce-visual ${esc(p.visual)} ${src?'has-image':''} ${extra}" style="--garment:${garment};--mark-bg:${chosen==='forest'?'#f6f1e8':'#16382f'};--mark-hole:${chosen==='forest'?'#16382f':'#f6f1e8'}">${src?`<img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy">`:symbol()}${!p.approved?`<span class="product-tag">${T('sample')}</span>`:''}</div>`;
}
function toast(message){const e=$('#toast');if(!e)return;e.textContent=message;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),3500);}
function errorText(code){return ({OUT_OF_STOCK:T('out'),VARIANT_UNAVAILABLE:T('out'),INVALID_CUSTOMER:T('invalid'),PRICE_CHANGED:T('recheck'),POLICY_CHANGED:T('recheck'),ORDER_NOT_FOUND:T('noOrder'),STORE_NOT_READY:T('paymentUnavailable'),WAITLIST_NOT_READY:T('waitlist'),QUANTITY_LIMIT:T('out')})[code]||T('unavailable');}
async function api(action,body,headers={}){
 const r=await fetch('/api/store?action='+encodeURIComponent(action),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 let data;try{data=await r.json();}catch{throw Error('STORE_UNAVAILABLE');}
 if(!r.ok)throw Error(data.error||'STORE_UNAVAILABLE');return data;
}
function migrateCart(){
 const existing=read('pikliCartV2'),old=Array.isArray(existing)?existing:read('pikliCart');const map=new Map();
 for(const item of (Array.isArray(old)?old:[]).slice(0,60)){
  let sku=item.sku,quantity=item.quantity??1;
  if(!sku){const p=product(item.id);if(!p)continue;const color=p.colors.includes(item.color)?item.color:p.colors[0];const v=p.variants.find(v=>v.color===color&&v.size===item.size);if(!v)continue;sku=v.sku;}
  if(!variant(sku)||!Number.isInteger(quantity)||quantity<1)continue;
  map.set(sku,Math.min(10,(map.get(sku)||0)+quantity));
 }
 cart=[...map].slice(0,30).map(([sku,quantity])=>({sku,quantity}));saveCart();
}
function saveCart(){write('pikliCartV2',cart);const n=cart.reduce((s,x)=>s+x.quantity,0);['cartCount','mobileCartCount'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=n;});}
function localTotals(){const subtotal=cart.reduce((s,x)=>s+(variant(x.sku)?.v.price||0)*x.quantity,0);let shipping=Number.isSafeInteger(catalog.shipping.fee)?catalog.shipping.fee:null;if(shipping!==null&&catalog.shipping.freeOver!=null&&subtotal>=catalog.shipping.freeOver)shipping=0;return {subtotal,shipping,total:shipping==null?null:subtotal+shipping};}
function policyLinks(){return ['shipping','returns','privacy','terms'].map(k=>`<a href="policies.html?section=${k}" target="_blank" rel="noopener">${T(k)}</a>`).join(' · ');}
function note(){return catalog.orderEnabled?'':`<div class="store-note">${T('preview')}</div>`;}
function crumbs(current){return `<div class="crumbs"><a href="index.html">${T('home')}</a> / <a href="shop.html">${T('shop')}</a> / ${esc(current)}</div>`;}
function summary(q=localTotals(),button=false){return `<aside class="summary-card"><h2>${T('review')}</h2><div class="summary-line"><span>${T('subtotal')}</span><strong>${money(q.subtotal)}</strong></div><div class="summary-line"><span>${T('shippingFee')}</span><span>${money(q.shipping)}</span></div><div class="summary-line grand"><span>${T('total')}</span><strong>${money(q.total)}</strong></div><p class="commerce-muted">${T(catalog.orderEnabled?'secure':'estimate')}</p>${button?`<a class="action-primary" href="checkout.html">${T('checkout')}</a>`:''}<p class="commerce-muted">${policyLinks()}</p></aside>`;}
function header(){
 document.documentElement.lang=lang;
 $('#langToggle')?.replaceChildren(document.createTextNode(lang==='vi'?'EN':'VI'));
 ['VI','EN'].forEach(code=>{const b=$('#mobile'+code);if(b){b.classList.toggle('active',lang===code.toLowerCase());b.setAttribute('aria-pressed',String(lang===code.toLowerCase()));}});
 $$('[data-nav-filter]').forEach(a=>a.textContent=T(a.dataset.navFilter==='all'?'shop':a.dataset.navFilter));
 $$('[data-policy]').forEach(a=>a.textContent=T(a.dataset.policy));
 $('#orderLink')?.replaceChildren(document.createTextNode(T('order')));
 if(page!=='home'){$('.top').textContent=catalog.orderEnabled?'PIKLI · COURT TO CITY.':T('preview');document.title=`PIKLI — ${T(({cart:'bag',product:'details',checkout:'checkout',order:'order',policies:'policyLinks'})[page]||'shop')}`;}
 saveCart();
}
function translateHome(){
 const c=window.PIKLI_HOME_MESSAGES?.[lang];if(!c)return;
 const set=(s,v,html=false)=>{const e=$(s);if(e){if(html)e.innerHTML=v;else e.textContent=v;}};
 set('.top',catalog.orderEnabled?c.announcement:(lang==='vi'?'PIKLI DROP 001 · BẢN XEM TRƯỚC — CHƯA MỞ BÁN':'PIKLI DROP 001 · COLLECTION PREVIEW — SALES NOT OPEN'));
 $$('.navlinks a').forEach((a,k)=>{if(c.nav[k])a.textContent=c.nav[k];});
 $$('.slide').forEach((s,k)=>{const cp=c.heroEy[k];if(!cp)return;s.querySelector('.eyebrow').textContent=cp;s.querySelector('h1,h2').innerHTML=c.heroTitle[k];s.querySelector('.slide-copy>p:not(.eyebrow)').textContent=c.heroBody[k];s.querySelector('.btn.fill').textContent=c.heroBtn[k];});
 set('.slide:first-child .btn:not(.fill)',c.discover);
 $$('.category a').forEach((a,k)=>a.textContent=c.cats[k]);
 set('#drop .eyebrow',c.bestEy);set('#drop h2',c.best);set('#drop .section-head>a',c.view);
 catalog.products.forEach(p=>{const card=$(`.card[data-id="${p.id}"]`);if(!card)return;const text=card.querySelector('.meta span');if(text)text.textContent=p.colors.map(colorLabel).join(' / ');card.querySelector('.meta>b').textContent=money(p.variants[0].price);card.querySelector('.visual')?.setAttribute('data-view-label',T('details'));});
 const story=$('#story .copy');if(story){story.querySelector('.eyebrow').textContent=c.storyEy;story.querySelector('h2').innerHTML=c.storyTitle;story.querySelectorAll('p')[1].textContent=c.storyBody;story.querySelectorAll('p')[2].textContent=c.storyTag;}
 set('.symbol-sec .eyebrow',c.symbolEy);set('.symbol-sec h2',c.symbolTitle,true);
 const social=$('#social .copy');if(social){social.querySelector('.eyebrow').textContent=c.socialEy;social.querySelector('h3').innerHTML=c.socialTitle;social.querySelectorAll('p')[1].textContent=c.socialBody;social.querySelector('.btn').textContent=c.early;}
 set('#preorder>.eyebrow',c.preEy);set('#preorder h2',c.preTitle);set('#preorder>p:not(.eyebrow)',c.preBody);set('#preorder .counter',c.preCounter);set('#earlyForm button',c.early);$('#earlyEmail')?.setAttribute('placeholder',c.email);
 set('#homePreviewNote',T('preview'));set('#earlyMsg',T('waitlist'));
 document.title=lang==='vi'?'PIKLI — Court to City | Việt Nam':'PIKLI — Court to City';
}
function setupHome(){
 $$('.card[data-id]').forEach(c=>{const go=()=>location.href='product.html?id='+encodeURIComponent(c.dataset.id);c.onclick=go;c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};c.setAttribute('role','link');});
 $('#earlyForm')?.addEventListener('submit',e=>{e.preventDefault();$('#earlyMsg').textContent=T('waitlist');toast(T('waitlist'));});
 const slides=$$('.slide'),dots=$$('.dot');let i=0,previousX=null,timer;
 const show=n=>{i=(n+slides.length)%slides.length;slides.forEach((s,k)=>{s.classList.toggle('active',k===i);s.setAttribute('aria-hidden',String(k!==i));s.inert=k!==i;});dots.forEach((d,k)=>d.classList.toggle('active',k===i));};
 const start=()=>{clearInterval(timer);if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.hidden)timer=setInterval(()=>show(i+1),5500);};
 $('.next')?.addEventListener('click',()=>{show(i+1);start();});$('.prev')?.addEventListener('click',()=>{show(i-1);start();});dots.forEach((d,k)=>d.onclick=()=>{show(k);start();});
 $('#hero')?.addEventListener('touchstart',e=>{previousX=e.touches[0].clientX;},{passive:true});$('#hero')?.addEventListener('touchend',e=>{if(previousX!==null){const dx=e.changedTouches[0].clientX-previousX;if(Math.abs(dx)>50)show(i+(dx<0?1:-1));previousX=null;start();}},{passive:true});
 document.addEventListener('visibilitychange',start);show(0);start();
}
function shop(){
 const audience=['women','men'].includes(query.get('category'))?query.get('category'):'all';
 root.innerHTML=`${crumbs(T('shop'))}<h1>${T('shop')} / DROP 001</h1>${note()}<div class="shop-tools"><input id="productSearch" type="search" placeholder="${T('search')}" aria-label="${T('search')}"><select id="productSort" aria-label="${T('sort')}"><option value="featured">${T('featured')}</option><option value="low">${T('low')}</option><option value="high">${T('high')}</option></select></div><div class="shop-tabs">${['all','women','men','tops','bottoms','accessories'].map(k=>`<button type="button" data-shop-tab="${k}" class="${k===audience?'active':''}">${T(k)}</button>`).join('')}</div><p id="shopCount" class="shop-count"></p><div class="shop-grid" id="shopGrid"></div>`;
 let filter=audience;
 const draw=()=>{const search=$('#productSearch').value.trim().toLocaleLowerCase(),sort=$('#productSort').value;let ps=catalog.products.filter(p=>(filter==='all'||p.audiences.includes(filter)||p.category===filter)&&`${p.name} ${T(p.category)} ${p.description[lang]}`.toLocaleLowerCase().includes(search));if(sort!=='featured')ps=ps.slice().sort((a,b)=>(a.variants[0].price-b.variants[0].price)*(sort==='low'?1:-1));$('#shopCount').textContent=`${ps.length} ${T('items')}`;$('#shopGrid').innerHTML=ps.length?ps.map(p=>`<a class="product-tile" href="product.html?id=${encodeURIComponent(p.id)}">${visual(p)}<h2>${esc(p.name)}</h2><p>${p.colors.map(colorLabel).join(' / ')}</p><p><strong>${money(p.variants[0].price)}</strong></p></a>`).join(''):`<p>${T('noResults')}</p>`;};
 $('#productSearch').oninput=draw;$('#productSort').onchange=draw;$$('[data-shop-tab]').forEach(b=>b.onclick=()=>{filter=b.dataset.shopTab;$$('[data-shop-tab]').forEach(x=>x.classList.toggle('active',x===b));draw();});draw();
}
function productPage(){
 const p=product(query.get('id'));if(!p){root.innerHTML=`<h1>${T('noResults')}</h1><a href="shop.html">${T('continueShopping')}</a>`;return;}
 if(!selection.color)selection.color=p.colors[0];if(p.sizes.length===1)selection.size=p.sizes[0];
 const v=p.variants.find(v=>v.color===selection.color&&v.size===selection.size), price=v?.price??p.variants[0].price;
 root.innerHTML=`${crumbs(p.name)}${note()}<div class="product-layout"><div class="product-gallery">${visual(p,selection.color)}<div class="thumbs">${(p.images||[]).map((im,k)=>`<button type="button" data-image="${k}" aria-label="${T('details')} ${k+1}"><img src="${esc(safeImage(im.url||im))}" alt=""></button>`).join('')}</div></div><div class="product-details"><p class="eyebrow">PIKLI · DROP 001</p><h1>${esc(p.name)}</h1><p class="product-price">${money(price)}</p><p class="commerce-muted">${esc(p.description[lang])}</p><p class="option-caption">${T('color')}</p><div class="option-row">${p.colors.map(c=>`<button type="button" class="option-btn ${selection.color===c?'active':''}" data-color="${c}" aria-pressed="${selection.color===c}"><span class="color-swatch" style="background:${c==='forest'?'#16382f':'#f6f1e8'}"></span>${colorLabel(c)}</button>`).join('')}</div><p class="option-caption">${T('size')}</p><div class="option-row">${p.sizes.map(s=>{const v=p.variants.find(v=>v.color===selection.color&&v.size===s);const disabled=catalog.orderEnabled&&(!v||v.available<1);return `<button type="button" class="option-btn ${selection.size===s?'active':''}" data-size="${s}" aria-pressed="${selection.size===s}" ${disabled?'disabled':''}>${sizeLabel(s)}</button>`;}).join('')}</div><p class="option-caption">${T('quantity')}</p><div class="quantity"><button type="button" id="less" aria-label="-" ${selection.quantity<=1?'disabled':''}>−</button><output>${selection.quantity}</output><button type="button" id="more" aria-label="+" ${selection.quantity>=10?'disabled':''}>+</button></div><div class="purchase-actions"><button type="button" class="action-primary" id="addProduct">${T('add')}</button><button type="button" class="action-secondary" id="buyProduct">${T('buy')}</button></div><p class="inline-error" id="productError" role="status"></p><details><summary>${T('sizeGuide')}</summary><p>${esc(p.sizeGuide?.[lang]||T('sizePending'))}</p></details><details><summary>${T('material')}</summary><p>${esc(p.care?.[lang]||T('materialPending'))}</p></details><details><summary>${T('shipping')} & ${T('returns')}</summary><p>${esc(catalog.policies.shipping||T('policyPending'))}</p><p>${policyLinks()}</p></details></div></div>`;
 $$('[data-color]').forEach(b=>b.onclick=()=>{selection.color=b.dataset.color;productPage();});$$('[data-size]').forEach(b=>b.onclick=()=>{selection.size=b.dataset.size;productPage();});$('#less').onclick=()=>{selection.quantity=Math.max(1,selection.quantity-1);productPage();};$('#more').onclick=()=>{selection.quantity=Math.min(10,selection.quantity+1);productPage();};
 const add=go=>{const v=p.variants.find(v=>v.color===selection.color&&v.size===selection.size);if(!v){$('#productError').textContent=T('choose');return;}const existing=cart.find(x=>x.sku===v.sku),n=(existing?.quantity||0)+selection.quantity;if(n>10||(catalog.orderEnabled&&v.available<n)){ $('#productError').textContent=T('out');return;}if(existing)existing.quantity=n;else cart.push({sku:v.sku,quantity:selection.quantity});saveCart();if(go)location.href='checkout.html';else toast(T('added'));};
 $('#addProduct').onclick=()=>add(false);$('#buyProduct').onclick=()=>add(true);
 $$('[data-image]').forEach(b=>b.onclick=()=>{const im=p.images[+b.dataset.image];$('.product-gallery .commerce-visual img').src=safeImage(im.url||im);});
}
function cartPage(){
 if(!cart.length){root.innerHTML=`${crumbs(T('bag'))}<h1>${T('bag')}</h1><div class="empty-cart"><p>${T('empty')}</p><a href="shop.html" class="action-primary">${T('continueShopping')}</a></div>`;return;}
 root.innerHTML=`${crumbs(T('bag'))}<h1>${T('bag')} (${cart.reduce((s,x)=>s+x.quantity,0)})</h1>${note()}<div class="cart-layout"><div>${cart.map(x=>{const {p,v}=variant(x.sku);return `<article class="bag-line"><a href="product.html?id=${p.id}">${visual(p,v.color)}</a><div><h2><a href="product.html?id=${p.id}">${esc(p.name)}</a></h2><p>${colorLabel(v.color)} / ${esc(sizeLabel(v.size))}</p><div class="quantity"><button type="button" data-change="${esc(v.sku)}" data-delta="-1" ${x.quantity===1?'disabled':''}>−</button><output>${x.quantity}</output><button type="button" data-change="${esc(v.sku)}" data-delta="1" ${x.quantity>=10?'disabled':''}>+</button></div><button type="button" class="text-button" data-remove="${esc(v.sku)}">${T('remove')}</button></div><strong>${money(v.price*x.quantity)}</strong></article>`;}).join('')}<p><a class="text-button" href="shop.html">${T('continueShopping')}</a></p></div>${summary(undefined,true)}</div>`;
 $$('[data-remove]').forEach(b=>b.onclick=()=>{cart=cart.filter(x=>x.sku!==b.dataset.remove);saveCart();cartPage();});$$('[data-change]').forEach(b=>b.onclick=()=>{const x=cart.find(x=>x.sku===b.dataset.change),{v}=variant(x.sku),n=x.quantity+Number(b.dataset.delta);if(n<1||n>10||(catalog.orderEnabled&&v.available<n)){toast(T('out'));return;}x.quantity=n;saveCart();cartPage();});
}
function captureDraft(){const form=$('#customerForm');if(form)checkout.customer={...checkout.customer,...Object.fromEntries(new FormData(form))};}
function customerForm(){
 const c=checkout.customer;
 const field=(key,type='text',full=false,optional=false)=>`<label class="field ${full?'full':''}"><span>${T(key)}</span><input name="${key}" type="${type}" value="${esc(c[key]||'')}" ${optional?'':'required'} maxlength="${key==='email'?254:240}" ${key==='phone'?'pattern="[+0-9 ()\\-]{8,24}" inputmode="tel"':''} autocomplete="${({fullName:'name',email:'email',phone:'tel',province:'address-level1',ward:'address-level2',address:'street-address'})[key]||'off'}"></label>`;
 return `<form id="customerForm"><h2>${T('customer')}</h2>${!catalog.orderEnabled?`<p class="commerce-muted">${T('noSave')} <button class="text-button" id="exampleCustomer" type="button">${T('example')}</button></p>`:''}<div class="form-grid">${field('fullName')}${field('email','email')}${field('phone','tel')}<label class="field"><span>${T('country')}</span><select name="country"><option value="VN">Việt Nam</option></select></label>${field('province')}${field('ward')}${field('address','text',true)}<label class="field full"><span>${T('note')}</span><textarea name="note" maxlength="500">${esc(c.note||'')}</textarea></label></div><div class="form-actions"><a href="cart.html" class="action-secondary">${T('back')}</a><button class="action-primary" type="submit">${T('next')}</button></div><p class="inline-error" id="checkoutError" role="alert"></p></form>`;
}
function reviewForm(){const c=checkout.customer;return `<h2>${T('review')}</h2><div class="review-block"><h3>${T('customer')}</h3><p>${esc(c.fullName)}<br>${esc(c.email)}<br>${esc(c.phone)}<br>${esc([c.address,c.ward,c.province,'Việt Nam'].filter(Boolean).join(', '))}</p><button type="button" class="text-button" id="editCustomer">${T('edit')}</button></div><div class="review-block">${cart.map(x=>{const {p,v}=variant(x.sku);return `<div class="order-mini"><span>${esc(p.name)} × ${x.quantity}<br><small>${colorLabel(v.color)} / ${esc(sizeLabel(v.size))}</small></span><strong>${money(v.price*x.quantity)}</strong></div>`;}).join('')}</div><div class="review-block"><h3>${T('payment')}</h3>${catalog.orderEnabled?`<p>${T('cod')}</p><p class="commerce-muted">${T('codNote')}</p>`:`<div class="store-note">${T('paymentUnavailable')}</div>`}</div><label class="consent"><input id="consent" type="checkbox" ${catalog.orderEnabled?'':'disabled'}><span>${T('consent')}<br>${policyLinks()}</span></label><button class="action-primary" id="placeOrder" type="button" disabled>${T(catalog.orderEnabled?'place':'closed')}</button><p class="inline-error" id="checkoutError" role="alert"></p>`;}
function checkoutPage(){
 if(!cart.length){cartPage();return;}
 root.innerHTML=`${crumbs(T('checkout'))}<h1>${T('checkout')}</h1>${note()}<ol class="steps"><li class="${checkout.step===1?'active':''}">01 ${T('customer')}</li><li class="${checkout.step===2?'active':''}">02 ${T('review')}</li><li>03 ${T('payment')}</li></ol><div class="checkout-layout"><div>${checkout.step===1?customerForm():reviewForm()}</div>${summary(checkout.quote||localTotals())}</div>`;
 if(checkout.step===1){
  $('#exampleCustomer')?.addEventListener('click',()=>{checkout.customer={fullName:'Khách thử nghiệm',email:'preview@example.com',phone:'0900000000',country:'VN',province:'TP. Hồ Chí Minh',ward:'Phường mẫu',address:'Địa chỉ mẫu — không giao hàng',note:''};checkoutPage();});
  $('#customerForm').onsubmit=async e=>{e.preventDefault();captureDraft();const b=e.submitter;b.disabled=true;try{checkout.quote=await api('quote',{items:cartPayload()});checkout.step=2;checkoutPage();window.scrollTo({top:0,behavior:'smooth'});}catch(err){$('#checkoutError').textContent=errorText(err.message);b.disabled=false;}};
 }else{
  $('#editCustomer').onclick=()=>{checkout.step=1;checkoutPage();};
  $('#consent').onchange=e=>{$('#placeOrder').disabled=!catalog.orderEnabled||!e.target.checked;};
  $('#placeOrder').onclick=placeOrder;
 }
}
async function placeOrder(){
 const b=$('#placeOrder');if(!catalog.orderEnabled||!$('#consent').checked)return;b.disabled=true;b.textContent=T('sending');
 const basic={items:cartPayload(),customer:checkout.customer,expectedTotal:checkout.quote?.total,consent:true,policyVersion:checkout.quote?.policyVersion,paymentMethod:'cod'};
 try{
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(basic))))).map(x=>x.toString(16).padStart(2,'0')).join('');
  let attempt=read('pikliCheckoutAttempt',true);
  if(!attempt||attempt.fingerprint!==fingerprint){attempt={fingerprint,key:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('')};write('pikliCheckoutAttempt',attempt,true);}
  const {order}=await api('order',{...basic,accessToken:attempt.token},{'Idempotency-Key':attempt.key});
  if(!order?.id)throw Error('STORE_UNAVAILABLE');
  write('pikliLastOrder',{id:order.id,token:attempt.token},true);cart=[];saveCart();location.href='order.html';
 }catch(err){$('#checkoutError').textContent=errorText(err.message);b.textContent=T('place');b.disabled=false;}
}
async function orderPage(){
 root.innerHTML=`${crumbs(T('order'))}<h1>${T('order')}</h1><p class="commerce-muted">${T('lookupIntro')}</p><form id="orderLookup"><div class="form-grid"><label class="field full"><span>${T('orderId')}</span><input name="orderId" required maxlength="36" autocomplete="off"></label><label class="field full"><span>${T('orderToken')}</span><input name="token" required maxlength="64" autocomplete="off"></label></div><p><button class="action-primary" type="submit">${T('lookup')}</button></p></form><p class="inline-error" id="orderError" role="alert"></p><section id="orderResult"></section>`;
 const saved=read('pikliLastOrder',true);if(saved){$('#orderLookup [name="orderId"]').value=saved.id;$('#orderLookup [name="token"]').value=saved.token;}
 const lookup=async e=>{
  if(e)e.preventDefault();const form=$('#orderLookup'),values=Object.fromEntries(new FormData(form));form.querySelector('button').disabled=true;
  try{const {order:o}=await api('order-status',{orderId:values.orderId},{Authorization:'Bearer '+values.token});
   $('#orderError').textContent='';$('#orderResult').innerHTML=`<div class="review-block"><h2>${T('saved')}</h2><span class="order-state">${T(o.status)}</span><p>${o.paymentStatus==='unpaid'?T('notPaid'):T(o.paymentStatus)}</p><p class="commerce-muted">${T('orderId')}: ${esc(o.id)}</p>${o.items.map(x=>`<div class="order-mini"><span>${esc(x.name)} × ${x.quantity}<br>${esc(colorLabel(x.color))} / ${esc(sizeLabel(x.size))}</span><strong>${money(x.unitPrice*x.quantity)}</strong></div>`).join('')}<div class="summary-line"><span>${T('total')}</span><strong>${money(o.total)}</strong></div>${o.trackingCode?`<p>${T('tracking')}: ${esc(o.trackingCode)}</p>`:''}<p class="commerce-muted">${T('keepCode')}</p><p class="order-code">${esc(values.token)}</p><button class="text-button" id="copyOrder" type="button">${T('copy')}</button></div>`;
   $('#copyOrder').onclick=async()=>{try{await navigator.clipboard.writeText(`${T('orderId')}: ${o.id}\n${T('orderToken')}: ${values.token}`);toast(T('copied'));}catch{toast(T('keepCode'));}};
  }catch(err){$('#orderError').textContent=errorText(err.message);$('#orderResult').innerHTML='';}finally{form.querySelector('button').disabled=false;}
 };
 $('#orderLookup').onsubmit=lookup;if(saved)await lookup();
}
function policies(){const key=['shipping','returns','privacy','terms'].includes(query.get('section'))?query.get('section'):'shipping';root.innerHTML=`<div class="store-policy">${crumbs(T(key))}<h1>${T(key)}</h1><p>${policyLinks()}</p><div class="policy-copy">${esc(catalog.policies[key]||T('policyPending'))}</div>${catalog.merchant.name?`<hr><p>${esc(catalog.merchant.name)}<br>${esc(catalog.merchant.address||'')}<br>${esc(catalog.merchant.email||'')}</p>`:''}</div>`;}
function render(){header();({home:translateHome,shop,product:productPage,cart:cartPage,checkout:checkoutPage,order:orderPage,policies})[page]?.();$$('.commerce-visual img').forEach(im=>im.onerror=()=>{im.parentElement.classList.remove('has-image');im.remove();});}
function setLang(l){if(page==='checkout')captureDraft();lang=l;try{localStorage.setItem('pikliLang',lang);}catch{}render();}
$('#langToggle')?.addEventListener('click',()=>setLang(lang==='vi'?'en':'vi'));$('#mobileVI')?.addEventListener('click',()=>setLang('vi'));$('#mobileEN')?.addEventListener('click',()=>setLang('en'));
['bagBtn','mobileBagBtn'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>location.href='cart.html'));
api('catalog').then(c=>{catalog=c;migrateCart();if(page==='home')setupHome();render();}).catch(()=>{if(root)root.innerHTML=`<h1>PIKLI</h1><div class="store-note">${T('catalogDown')}</div>`;else toast(T('catalogDown'));});
})();
