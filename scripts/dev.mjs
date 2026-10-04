import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {handleRequest} from '../server/store.js';
const port=8787;
http.createServer(async(req,res)=>{
 const url=new URL(req.url,`http://localhost:${port}`);
 if(url.pathname==='/api/store'){
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=Buffer.concat(chunks).toString();
  const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{} )});
  const result=await handleRequest(request,{NODE_ENV:'test'});
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
 }
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(name.includes('..')){res.writeHead(403);res.end();return;}
 const file=path.join(process.cwd(),'public',name);
 if(!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('Not found');return;}
 const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.end(fs.readFileSync(file));
}).listen(port,()=>console.log(`PIKLI preview http://localhost:${port}`));
