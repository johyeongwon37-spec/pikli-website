import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), src=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=src.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const dictionary=src.match(/const C=(\{[\s\S]*?\});\s*let lang=/)?.[1];
const navSource=src.match(/<nav class="nav">[\s\S]*?<\/nav>/)?.[0];
const footer=src.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0];
if(!css||!dictionary||!navSource||!footer)throw Error('Original homepage structure changed. Review before rebuilding; nothing has been published.');
const output=path.join(root,'public');fs.mkdirSync(output,{recursive:true});
const copy=(from,to)=>fs.copyFileSync(path.join(root,from),path.join(output,to));
const nav=navSource.replace('<div class="mobile">MENU</div>','')
 .replace('href="#"','href="index.html"')
 .replace(/href="#drop" data-filter="(all|women|men)"/g,(_,k)=>`href="shop.html?category=${k}" data-nav-filter="${k}"`)
 .replace(/href="#story"/g,'href="index.html#story"').replace(/href="#social"/g,'href="index.html#social"')
 .replace('type="button">BAG <span','type="button"><span class="bag-label">BAG</span> <span');
const links='<div class="commerce-footer"><a href="shop.html" data-nav-filter="all">Shop</a><a href="cart.html">BAG</a><a href="order.html" id="orderLink">Order status</a>'+['shipping','returns','privacy','terms'].map(k=>`<a href="policies.html?section=${k}" data-policy="${k}">${k}</a>`).join('')+'</div>';
const scripts='<script src="/messages.js" defer></script><script src="/home-messages.js" defer></script><script src="/commerce.js" defer></script>';
let home=src.replace(/<script>[\s\S]*?<\/script>/g,'').replace(navSource,nav)
 .replace(/<body>/,'<body data-page="home">').replace('<html lang="en">','<html lang="vi">')
 .replace('</head>','<meta name="theme-color" content="#16382f"><link rel="stylesheet" href="/commerce.css"></head>')
 .replace(/<div class="overlay" id="overlay">[\s\S]*?(?=<footer class="footer">)/,'<div id="toast" class="toast" role="status" aria-live="polite"></div>')
 .replace('<a class="btn fill" href="#drop">SHOP WOMEN</a>','<a class="btn fill" href="shop.html?category=women">SHOP WOMEN</a>')
 .replace(/href="#drop" data-filter="(all|women|men)"/g,(_,k)=>`href="shop.html?category=${k}"`)
 .replace(/href="#drop"/g,'href="shop.html"')
 .replace('<a href="#preorder">VIEW DROP →</a>','<a href="shop.html">VIEW DROP →</a>')
 .replace('<div class="products">','<p class="home-preview" id="homePreviewNote">Collection preview — sales are not open yet.</p><div class="products">')
 .replace(footer,links+footer).replace('</body>',scripts+'</body>');
if(home.includes('id="productModal"')||home.includes('localStorage.setItem(\'pikliEarlyAccess\''))throw Error('Legacy checkout was not fully removed.');
fs.writeFileSync(path.join(output,'index.html'),home);
fs.writeFileSync(path.join(output,'legacy.css'),css);
fs.writeFileSync(path.join(output,'home-messages.js'),'window.PIKLI_HOME_MESSAGES='+dictionary+';\n');
copy('storefront/app.js','commerce.js');copy('storefront/messages.js','messages.js');copy('storefront/commerce.css','commerce.css');
for(const name of ['pikli-symbol.svg','pikli-logo.svg'])if(fs.existsSync(name))copy(name,name);
for(const page of ['shop','product','cart','checkout','order','policies']){
 const title={shop:'Shop',product:'Product',cart:'Your bag',checkout:'Checkout',order:'Order status',policies:'Store policies'}[page];
 const robots=['checkout','order','cart','policies'].includes(page)?'<meta name="robots" content="noindex, nofollow">':'';
 const html=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>PIKLI — ${title}</title><meta name="theme-color" content="#16382f">${robots}<link rel="icon" href="/pikli-symbol.svg"><link rel="stylesheet" href="/legacy.css"><link rel="stylesheet" href="/commerce.css"></head><body data-page="${page}"><div class="top">PIKLI · COURT TO CITY.</div>${nav}<main id="commerceRoot" class="commerce"><p>Đang tải… / Loading…</p><noscript>Vui lòng bật JavaScript để sử dụng cửa hàng. / Enable JavaScript to use the store.</noscript></main>${links}${footer}<div id="toast" class="toast" role="status" aria-live="polite"></div>${scripts}</body></html>`;
 fs.writeFileSync(path.join(output,page+'.html'),html);
}
console.log('Built PIKLI storefront: existing homepage + shop, product, bag, checkout, order status and policies.');
