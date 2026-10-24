/* Loaded ONLY on https://chatgpt.com/. Prepares an unsent draft for user review. */
'use strict';
(async function(){
 const m=location.hash.match(/(?:^#|[&#])atelie_v51=([0-9a-f]{64})(?:&|$)/);
 if(!m)return;
 const token=m[1];
 try{history.replaceState(null,'',location.pathname+location.search);}catch(_){ /* no-op */ }
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const msg=payload=>new Promise((resolve,reject)=>{chrome.runtime.sendMessage({...payload,token},reply=>{
   if(chrome.runtime.lastError)return reject(new Error(chrome.runtime.lastError.message));
   if(!reply?.ok)return reject(new Error(reply?.error||'Falha na comunicação com o Ateliê'));
   resolve(reply.data??reply.bytes);
 });});
 function notice(text,isError=false){
   let box=document.getElementById('atelie-v51-status');
   if(!box){box=document.createElement('div');box.id='atelie-v51-status';box.style.cssText='position:fixed;z-index:2147483647;right:18px;top:65px;max-width:380px;padding:16px 18px;border-radius:12px;background:#143052;color:white;box-shadow:0 8px 30px #0007;font:14px system-ui,sans-serif;line-height:1.5;white-space:pre-wrap;';document.body.append(box);}
   box.style.background=isError?'#8b2631':'#143052';box.textContent=text;
 }
 async function waitFor(get,ms=30000){const stop=Date.now()+ms;while(Date.now()<stop){let item=get();if(item)return item;await delay(400);}return null;}
 function composer(){return document.querySelector('#prompt-textarea[contenteditable="true"], [data-testid="composer-input"][contenteditable="true"], [contenteditable="true"][role="textbox"], #prompt-textarea, textarea[placeholder]');}
 function putText(el,text){
   el.focus();
   if(el.tagName==='TEXTAREA'||el.tagName==='INPUT'){
     const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
     if(setter)setter.call(el,text);else el.value=text;
     el.dispatchEvent(new Event('input',{bubbles:true}));return true;
   }
   try{if(document.execCommand('insertText',false,text))return true;}catch(_){ /* fall back */ }
   el.textContent=text;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));return !!el.textContent;
 }
 function inputFile(){const els=[...document.querySelectorAll('input[type="file"]')];return els.find(e=>!e.disabled&&(e.accept?.includes('image')||e.accept?.includes('*')||e.multiple))||els.find(e=>!e.disabled)||null;}
 async function findFileInput(){
   let el=inputFile();if(el)return el;
   const trigger=document.querySelector('button[data-testid="composer-plus-btn"],button[aria-label*="Attach"],button[aria-label*="Anexar"],button[aria-label*="Add files"],button[aria-label*="Adicionar"]');
   if(trigger)trigger.click();
   return await waitFor(inputFile,7000);
 }
 try{
   if(!await waitFor(()=>document.body,20000))throw Error('O ChatGPT não terminou de carregar');
   notice('Ateliê: carregando prompt e fotos para esta conversa…');
   const job=await msg({type:'JOB'});
   if(!job?.prompt||!Array.isArray(job.files)||job.files.length===0)throw Error('O pacote não contém prompt e fotos');
   const editor=await waitFor(composer,35000);
   if(!editor)throw Error('Não encontrei o campo de mensagem do ChatGPT');
   if(!putText(editor,job.prompt))throw Error('Não foi possível preencher o prompt');
   notice('Prompt preenchido. Preparando '+job.files.length+' foto(s)…');
   const files=[];
   for(const info of job.files){
      const chunks=[];
      for(let offset=0;offset<info.size;offset+=262144){
        const bytes=await msg({type:'PHOTO',index:info.index,start:offset,length:Math.min(262144,info.size-offset)});
        chunks.push(new Uint8Array(bytes));
      }
      files.push(new File(chunks,info.name,{type:info.mime,lastModified:Date.now()}));
   }
   let fileInput=await findFileInput();
   if(!fileInput)throw Error('Prompt preenchido, mas o ChatGPT não apresentou um campo de anexos. Anexe as fotos pelo botão +.');
   const transfer=new DataTransfer();for(const file of files)transfer.items.add(file);
   fileInput.files=transfer.files;
   fileInput.dispatchEvent(new Event('input',{bubbles:true}));
   fileInput.dispatchEvent(new Event('change',{bubbles:true}));
   notice('Ateliê: prompt e '+files.length+' foto(s) enviados ao campo de anexos.\n\nCONFIRA se todas as miniaturas aparecem no ChatGPT antes de clicar em Enviar.\n\nSe não aparecerem, anexe as fotos manualmente.');
   // Keep job available for up to 20 minutes so the user can recover after an upload rejection.
 }catch(err){notice('Ateliê: '+err.message+'\n\nO envio da mensagem não foi realizado. Verifique o prompt e anexe as fotos manualmente se necessário.',true);}
})();
