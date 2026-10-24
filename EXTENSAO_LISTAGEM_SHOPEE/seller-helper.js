/* Ateliê — preenchimento assistido, nunca clica em Publicar/Salvar. */
'use strict';
(()=>{
  if(document.getElementById('atelie-single-panel'))return;
  const send=(type)=>new Promise((resolve,reject)=>chrome.runtime.sendMessage({type},res=>{
    const err=chrome.runtime.lastError?.message;if(err||!res?.ok)return reject(Error(err||res?.error||'Falha na extensão'));resolve(res);
  }));
  const normalize=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const sendWithToken=token=>new Promise((resolve,reject)=>chrome.runtime.sendMessage({type:'ATELIE_IMPORT_TOKEN',token},res=>{const err=chrome.runtime.lastError?.message;if(err||!res?.ok)return reject(Error(err||res?.error||'Falha na importação'));resolve(res);}));
  function updateInput(el,value){
    if(!el||el.disabled||el.readOnly)return false;
    const tag=el.tagName.toLowerCase();el.focus();
    if(['input','textarea'].includes(tag)){
      const setter=Object.getOwnPropertyDescriptor(tag==='textarea'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')?.set;
      if(setter)setter.call(el,String(value));else el.value=String(value);
      el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;
    }
    if(el.isContentEditable){el.textContent=String(value);el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));return true;}
    return false;
  }
  function candidates(){return [...document.querySelectorAll('input:not([type=hidden]):not([type=file]),textarea,[contenteditable=true]')].filter(el=>el.getClientRects().length&&!el.disabled&&!el.readOnly);}
  function labelsFor(el){
    const a=[];
    if(el.id){const lab=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);if(lab)a.push(lab.textContent);}
    for(const k of ['aria-label','placeholder','name','data-testid'])a.push(el.getAttribute(k)||'');
    let ancestor=el.parentElement;
    for(let n=0;n<3&&ancestor;n++,ancestor=ancestor.parentElement){
      const labels=[...ancestor.querySelectorAll('label,.form-label,.shopee-form-item__label,.eds-form-item__label')].slice(0,3);
      for(const lab of labels)a.push(lab.textContent);
    }
    return normalize(a.join(' '));
  }
  function findInput(patterns,kind){
    const list=candidates().filter(el=>kind==='text'?el.tagName==='TEXTAREA'||el.isContentEditable:el.tagName==='INPUT');
    const matches=[];
    for(const el of list){const lab=labelsFor(el),ph=normalize(el.getAttribute('placeholder'));for(const pat of patterns){if(pat.test(lab)||pat.test(ph)){matches.push(el);break;}}}
    return [...new Set(matches)];
  }
  function fill(patterns,value,kind,log,label){
    if(value===''||value===null||value===undefined)return;
    const matches=findInput(patterns,kind);
    if(matches.length===1&&updateInput(matches[0],value))log.push('✓ '+label);
    else log.push('⚠ '+label+' — '+(matches.length===0?'campo não encontrado':'mais de um campo possível')+', preencher manualmente');
  }
  function findControlAround(text){
    const rx=new RegExp(text,'i');
    const nodes=[...document.querySelectorAll('label,span,div,p')].filter(el=>el.children.length===0&&rx.test(normalize(el.textContent))&&el.getClientRects().length);
    for(const el of nodes){
      let p=el;
      for(let i=0;i<5&&p;i++,p=p.parentElement){
        const switches=[...p.querySelectorAll('[role="switch"],input[type="checkbox"],button[aria-checked]')].filter(x=>x.getClientRects().length);
        if(switches.length===1)return switches[0];
      }
    }
    return null;
  }
  function stateSwitch(el){
    if(el.tagName==='INPUT'&&el.type==='checkbox')return !!el.checked;
    const aria=el.getAttribute('aria-checked');if(aria==='true')return true;if(aria==='false')return false;
    return null;
  }
  function disabledSwitch(el){return !!(el.disabled||el.getAttribute('aria-disabled')==='true'||el.closest('[aria-disabled="true"]'));}
  function setShipping(label,regex,desired,log){
    const sw=findControlAround(regex);if(!sw){log.push('⚠ '+label+' — controle não localizado');return;}
    if(disabledSwitch(sw)){log.push('⚠ '+label+' — canal bloqueado pela Shopee');return;}
    const current=stateSwitch(sw);
    if(current===null){log.push('⚠ '+label+' — estado não identificado, conferir manualmente');return;}
    if(current!==desired)sw.click();
    log.push('✓ '+label+' — '+(desired?'ativação solicitada':'desativação solicitada')+'; confirme na tela');
  }
  const panel=document.createElement('aside');panel.id='atelie-single-panel';panel.style.cssText='position:fixed;z-index:2147483645;bottom:18px;right:18px;width:min(370px,calc(100vw - 36px));max-height:68vh;overflow:auto;background:#10223d;color:white;border-radius:14px;box-shadow:0 8px 30px #0007;padding:16px;font:13px system-ui,sans-serif;line-height:1.45;';
  panel.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:15px">Ateliê · Listagem Única</strong><button id="atclose" style="background:none;color:white;border:0;cursor:pointer" title="Minimizar">−</button></div><p id="atsummary">Buscando produto preparado...</p><div style="display:flex;flex-wrap:wrap;gap:7px"><button id="atfill">Preencher campos</button><button id="atcat">Selecionar categoria</button><button id="atshipping">Canais de envio</button><button id="atcopy">Copiar variações</button></div><pre id="atlog" style="white-space:pre-wrap;font:12px system-ui;max-height:180px;overflow:auto;margin-top:12px"></pre><p style="font-size:11px;opacity:.8">Confira fotos, categoria, atributos, variações, preços e frete. O Ateliê nunca publica automaticamente.</p>`;
  function setup(){if(document.getElementById('atelie-single-panel'))return;document.body.append(panel);for(const b of panel.querySelectorAll('button:not(#atclose)'))b.style.cssText='background:#e8eefc;color:#11264d;border:0;border-radius:7px;padding:8px;cursor:pointer;font-size:12px;';}
  let draft=null;const log=txt=>panel.querySelector('#atlog').textContent=txt;
  const tokenMatch=location.hash.match(/(?:^#|&)atelie_listagem=([0-9a-f]{64})(?:&|$)/);
  const load=tokenMatch?sendWithToken(tokenMatch[1]):send('ATELIE_GET');
  if(tokenMatch){try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}}
  load.then(res=>{draft=res.draft;panel.querySelector('#atsummary').textContent=`${draft.sku} · ${draft.productName} (${draft.category.confirmed?draft.category.name:'categoria não confirmada'})`;}).catch(err=>{panel.querySelector('#atsummary').textContent=err.message;});
  panel.querySelector('#atclose').addEventListener('click',()=>{panel.style.maxHeight=panel.style.maxHeight==='43px'?'68vh':'43px';panel.style.overflow=panel.style.maxHeight==='43px'?'hidden':'auto';});
  panel.querySelector('#atfill').addEventListener('click',()=>{
    if(!draft)return log('Abra primeiro o Ateliê e clique Preparar Listagem Única.');
    const result=[];
    fill([/nome do produto/,/titulo do produto/,/product name/],draft.title,'input',result,'Título');
    fill([/descricao do produto/,/description/],draft.description,'text',result,'Descrição');
    if(draft.variants.length===1){const v=draft.variants[0];
      fill([/seller sku/,/sku do vendedor/,/codigo sku/,/sku do produto/],v.sku||draft.sku,'input',result,'SKU');
      fill([/preco/,/price/],v.price||draft.draftPrice,'input',result,'Preço (PROVISÓRIO — revisar)');
      fill([/estoque/,/stock/],v.stock,'input',result,'Estoque (PROVISÓRIO — revisar)');
    }else result.push('⚠ '+draft.variants.length+' variações: crie os grupos no Seller e copie os valores do painel.');
    fill([/^peso\b/,/peso do pacote/,/weight/],draft.weight,'input',result,'Peso em kg');
    fill([/comprimento/,/length/],draft.length,'input',result,'Comprimento');
    fill([/largura/,/width/],draft.width,'input',result,'Largura');
    fill([/altura/,/height/],draft.height,'input',result,'Altura');
    result.push('⚠ Categoria e fotos: use as ações específicas; confira dados antes de salvar.');
    log(result.join('\n'));
  });
  panel.querySelector('#atcat').addEventListener('click',()=>{
    if(!draft)return;
    const cat=draft.category;
    if(!cat?.confirmed)return log('Categoria não confirmada no Ateliê. Selecione uma categoria válida manualmente na Shopee.');
    const matches=[...document.querySelectorAll('[data-category-id],[data-id]')].filter(el=>el.getClientRects().length&&[el.dataset.categoryId,el.dataset.id].includes(String(cat.id)));
    if(matches.length===1){matches[0].click();log(`Categoria ID ${cat.id} clicada na interface. CONFIRME o caminho antes de prosseguir.`);return;}
    const fields=findInput([/categoria/,/category/],'input');
    if(fields.length===1){updateInput(fields[0],cat.name);log(`Busca por categoria preenchida: ${cat.name}. Escolha o resultado correspondente ao ID ${cat.id}.`);return;}
    log(`Categoria sugerida: ${cat.name} (ID ${cat.id}). A interface não expôs um seletor confiável. Selecione-a manualmente.`);
  });
  panel.querySelector('#atshipping').addEventListener('click',()=>{
    if(!draft)return;
    const result=[];
    setShipping('Shopee Xpress','shopee xpress|shopee express|spx',true,result);
    setShipping('Retirada pelo Comprador','retirada pelo comprador',true,result);
    setShipping('Expresso Aéreo','expresso aereo|expresso aéreo',false,result);
    log(result.join('\n'));
  });
  panel.querySelector('#atcopy').addEventListener('click',async()=>{
    if(!draft)return;const txt=draft.variants.map(v=>[v.option1,v.option2,v.sku,v.price,v.stock].join(' | ')).join('\n');
    try{await navigator.clipboard.writeText(txt);log('Variações copiadas. Cole na área desejada ou use como referência.');}catch(_){log(txt+'\n\nO Chrome bloqueou a cópia; selecione o texto neste painel.');}
  });
  if(document.body)setup();else document.addEventListener('DOMContentLoaded',setup,{once:true});
})();
