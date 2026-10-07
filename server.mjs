import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root = fileURLToPath(new URL('./public/', import.meta.url));
const endpoints = {mainnet:'https://api.mainnet-beta.solana.com', devnet:'https://api.devnet.solana.com'};
export function rpcRequest(body) {
  if (!body || !Object.hasOwn(endpoints, body.network)) throw Error('Select mainnet or devnet.');
  const alphabet = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (typeof body.value !== 'string' || !alphabet.test(body.value)) throw Error('Enter a base58 address or signature.');
  // Decode length rather than trusting lexical length.
  let n = 0n; const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  for (const c of body.value) n = n * 58n + BigInt(chars.indexOf(c));
  const bytes = (n === 0n ? 0 : Math.ceil(n.toString(16).length / 2)) + (body.value.match(/^1*/)?.[0].length ?? 0);
  if (body.kind === 'address' && bytes === 32) return {endpoint:endpoints[body.network],payload:{jsonrpc:'2.0',id:1,method:'getSignaturesForAddress',params:[body.value,{limit:10,commitment:'finalized'}]}};
  if (body.kind === 'signature' && bytes === 64) return {endpoint:endpoints[body.network],payload:{jsonrpc:'2.0',id:1,method:'getTransaction',params:[body.value,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]}};
  throw Error('Expected a 32-byte address or a 64-byte signature.');
}
const files = new Map(['index.html','styles.css','app.mjs','parser.mjs','fixtures.mjs','logo.svg'].map(f=>['/'+f,f]));
const types = {html:'text/html',css:'text/css',mjs:'text/javascript',svg:'image/svg+xml'};
export function makeServer() {
  let inFlight = 0; let last = 0;
  return createServer(async(req,res)=> {
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://solana-rpc.publicnode.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/api/rpc' && req.method === 'POST') {
      if (req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1):4177$/.test(req.headers.origin)) {res.writeHead(403);res.end();return;}
      try {
        let text = ''; for await (const chunk of req) { text += chunk; if(text.length>2048) throw Error('Request too large.'); }
        const {endpoint,payload} = rpcRequest(JSON.parse(text));
        if(inFlight>=3 || Date.now()-last<150) {res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Please wait briefly before another lookup.'}}));return;}
        last=Date.now();inFlight++;
        try {
          const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
          const raw=await response.text();
          if(!response.ok) throw Error('Public RPC returned HTTP '+response.status+'. Try later or import a saved RPC response.');
          res.writeHead(200,{'Content-Type':'application/json'});res.end(raw);
        } finally {inFlight--;}
      } catch(error) {res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:error.message}}));}
      return;
    }
    if(req.method!=='GET') {res.writeHead(405);res.end();return;}
    const name=files.get(url.pathname==='/'?'/index.html':url.pathname);
    if(!name) {res.writeHead(404);res.end('Not found');return;}
    try { const content=await readFile(join(root,name));res.writeHead(200,{'Content-Type':types[name.split('.').pop()]+'; charset=utf-8'});res.end(content); }
    catch {res.writeHead(500);res.end('File unavailable');}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) makeServer().listen(4177,'127.0.0.1',()=>console.log('Clearstep ready at http://127.0.0.1:4177'));
