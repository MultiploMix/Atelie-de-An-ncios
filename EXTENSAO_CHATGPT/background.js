'use strict';
const base='http://127.0.0.1:32817/bridge/';
const valid = token => typeof token==='string' && /^[0-9a-f]{64}$/.test(token);
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(!sender.url?.startsWith('https://chatgpt.com/') || !valid(msg?.token)) {respond({ok:false,error:'Origem ou token inválido'});return;}
  (async()=>{
    const route=msg.type==='JOB'?'job?token='+msg.token:
      msg.type==='PHOTO' && Number.isInteger(msg.index)&&msg.index>=0&&msg.index<15 && Number.isInteger(msg.start)&&msg.start>=0 && Number.isInteger(msg.length)&&msg.length>=1&&msg.length<=262144 ? `photo?token=${msg.token}&index=${msg.index}&start=${msg.start}&length=${msg.length}`:
      msg.type==='DONE'?'done?token='+msg.token:null;
    if(!route)throw Error('Comando inválido');
    const response=await fetch(base+route,{method:msg.type==='DONE'?'POST':'GET',cache:'no-store'});
    if(!response.ok)throw Error(`Aplicativo não respondeu (${response.status})`);
    if(msg.type==='PHOTO'){
      const binary=await response.arrayBuffer();
      // Array of numeric bytes: no exposure to the website; isolated extension context only.
      return {ok:true,bytes:[...new Uint8Array(binary)]};
    }
    return {ok:true,data:await response.json()};
  })().then(respond).catch(err=>respond({ok:false,error:err.message}));
  return true;
});
