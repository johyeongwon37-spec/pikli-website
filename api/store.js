import { handleRequest } from '../server/store.js';
/** Vercel Node handler. Only one server endpoint; credentials stay server-side. */
export default async function handler(req,res){
  const host=req.headers.host||'pikli-website.vercel.app';
  const method=req.method||'GET';
  let body;
  if(method!=='GET'&&method!=='HEAD'){
    if(req.body!==undefined) body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
    else {const parts=[];let length=0;for await(const part of req){length+=part.length;if(length>16384){res.statusCode=413;res.end('{"error":"REQUEST_TOO_LARGE"}');return;}parts.push(part);}body=Buffer.concat(parts);}
  }
  const request=new Request(`https://${host}${req.url}`,{method,headers:req.headers,...(body!==undefined?{body}:{} )});
  const result=await handleRequest(request);
  res.statusCode=result.status;for(const [k,v] of result.headers)res.setHeader(k,v);
  res.end(await result.text());
}
