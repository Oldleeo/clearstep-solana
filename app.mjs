import {explain,losslessParse} from './parser.mjs';
import {fixture} from './fixtures.mjs';
const $ = id=>document.getElementById(id);
let current, original, sequence=0;
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function status(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
async function rpc(kind,value,network) {
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const url=local?'/api/rpc':network==='mainnet'?'https://api.mainnet-beta.solana.com':'https://api.devnet.solana.com';
  const body=local?{kind,value,network}:{jsonrpc:'2.0',id:1,method:kind==='address'?'getSignaturesForAddress':'getTransaction',params:kind==='address'?[value,{limit:10,commitment:'finalized'}]:[value,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:0}]};
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('RPC lookup returned HTTP '+response.status+'. Try later or import saved JSON.');
  const data=losslessParse(await response.text());if(data.error)throw Error('RPC: '+data.error.message);return data;
}
function render(data,context) {
  const receipt=explain(data,context);current=receipt;original=data;
  $('receipt').hidden=false;$('empty').hidden=true;$('history').hidden=true;
  $('source').textContent=receipt.source+' · '+receipt.network;
  $('summary').replaceChildren();
  for(const [label,value,cls] of [['Execution',receipt.outcome,receipt.outcome==='Failed'?'fail':''],['Network fee',receipt.fee+' SOL',''],['Decoder gaps',String(receipt.unknown)+' instructions','']]){
    const card=el('div',undefined,'metric '+cls);card.append(el('small',label),el('strong',value));$('summary').append(card);
  }
  $('coverage').textContent=receipt.actions.length+' recorded instructions';$('actions').replaceChildren();
  for(const action of receipt.actions){
    const card=el('article',undefined,'action '+action.attention);card.append(el('span',action.attempted?'ATTEMPTED · ROLLED BACK':action.attention.toUpperCase(),'badge'),el('h4',action.title),el('p',action.detail));
    const details=el('details');details.append(el('summary','View instruction evidence'),el('p',action.path,'address'),el('p','Program: '+action.program,'address'),el('pre',JSON.stringify(action.raw,null,2)));card.append(details);$('actions').append(card);
  }
  if(!receipt.actions.length)$('actions').append(el('p','No instructions were supplied.','fine'));
  $('changes').replaceChildren();
  for(const change of receipt.changes){
    const card=el('article',undefined,'change');card.append(el('div',(change.delta.startsWith('-')?'':'+')+change.delta,'delta '+(change.delta.startsWith('-')?'negative':'positive')),el('p',change.asset,'asset'),el('p','Account: '+change.account,'address'));
    if(change.kind==='token')card.append(el('p','Owner before: '+(change.ownerBefore??'not supplied')+' · after: '+(change.ownerAfter??'not supplied'),'address'));
    card.append(el('p',change.evidence,'address'));$('changes').append(card);
  }
  if(!receipt.changes.length)$('changes').append(el('p','No nonzero changes in the supplied balance metadata.','fine'));
  $('notes').replaceChildren(...receipt.notes.map(n=>el('li',n)));
  if(receipt.error)$('notes').prepend(el('li','Execution error: '+JSON.stringify(receipt.error)));
  $('raw').textContent=JSON.stringify(data,null,2);
  status(context.source.startsWith('Synthetic')?'Synthetic fixture loaded. These addresses, amounts, and outcomes are examples; no real transaction was made.':context.source.startsWith('Imported')?'Imported evidence explained. Its provenance and network have not been independently verified.':'Finalized RPC evidence loaded. Slot '+receipt.slot+'.');
}
async function lookup(value,network,kind){
  const ticket=++sequence;$('inspect').disabled=true;status('Reading finalized '+network+' evidence…');
  // Hide a prior receipt while loading: never show it under a new query.
  $('receipt').hidden=true;$('history').hidden=true;current=null;
  try{
    if(!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value))throw Error('Enter a valid base58 Solana address or signature.');
    const data=await rpc(kind,value,network);if(ticket!==sequence)return;
    if(kind==='signature')render(data,{source:'Live Solana RPC · finalized',network});
    else{
      if(!Array.isArray(data.result))throw Error('Unexpected transaction history response.');
      $('history').hidden=false;$('empty').hidden=true;$('historylist').replaceChildren();
      for(const item of data.result){const button=el('button',item.signature+' · '+(item.err?'Failed':'Succeeded')+' · slot '+item.slot);button.addEventListener('click',()=>{$('value').value=item.signature;lookup(item.signature,network,'signature');});$('historylist').append(button);}
      status(data.result.length?'Select a transaction to inspect its receipt.':'No finalized transaction history found for this address on '+network+'.');
    }
  }catch(error){if(ticket===sequence)status(error.name==='TimeoutError'?'RPC timed out. Try again or import saved JSON.':error.message,true);}
  finally{if(ticket===sequence)$('inspect').disabled=false;}
}
$('lookup').addEventListener('submit',event=>{event.preventDefault();const value=$('value').value.trim();lookup(value,$('network').value,value.length<=44?'address':'signature');});
for(const button of document.querySelectorAll('[data-demo]'))button.addEventListener('click',()=>{sequence++;$('inspect').disabled=false;render(fixture(button.dataset.demo),{source:'Synthetic example · '+button.dataset.demo,network:'Not a chain transaction'});});
$('import').addEventListener('click',()=>{sequence++;$('inspect').disabled=false;$('receipt').hidden=true;current=null;try{if($('json').value.length>5_000_000)throw Error('Import exceeds 5 MB.');render(losslessParse($('json').value),{source:'Imported JSON (unverified source)'});}catch(error){status(error.message,true);}});
$('export').addEventListener('click',async()=>{
  const saved=current,raw=original;if(!saved)return;
  const evidenceText=JSON.stringify(raw);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(evidenceText));
  const bundle={receipt:saved,evidence:raw,evidenceSha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''),hashScope:'UTF-8 JSON.stringify(evidence); verifies this exported artifact, not chain authenticity',exportedAt:new Date().toISOString()};
  const link=el('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));link.download='clearstep-receipt.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);status('Evidence bundle downloaded with a SHA-256 integrity hash.');
});
