/* Ateliê — Listagem Única Shopee V1.0.5. Preenchimento assistido e mapeamento guiado; nunca publica. */
'use strict';
(()=>{
  if(window.__atelieSellerHelperV105)return;
  window.__atelieSellerHelperV105=true;
  // O executável legado inicia uma sessão em /portal/product/list/all.
  // Redireciona imediatamente para Novo Produto sem perder o token temporário.
  // Redireciona SOMENTE quando há sessão do Ateliê na URL; não interfere na
  // navegação normal do vendedor pelo catálogo Shopee.
  const newProductURL='https://seller.shopee.com.br/portal/product/new?pageEntry=product_list';
  if(location.pathname==='/portal/product/list/all' && /(?:^#|[&#])atelie_listagem=[0-9a-f]{64}(?:&|$)/.test(location.hash)){
    location.replace(newProductURL+location.hash);
    return;
  }
  const APP_ID='atelie-single-panel';
  const SELECT_CONTROL='select,[role="combobox"],[aria-haspopup="listbox"],.eds-select,.shopee-select,.eds-select-selector,.eds-select-selection,[class*="select-selector"],[class*="select__control"],[class*="select-selection"],input[readonly]';
  const FIELDS=[
    {id:'title',label:'Nome do produto',type:'text',rx:[/nome do produto/,/titulo do produto/,/product name/,/product title/]},
    {id:'description',label:'Descrição',type:'rich',rx:[/descricao do produto/,/descri[cç][aã]o/,/description/]},
    {id:'sku',label:'SKU do vendedor',type:'text',rx:[/seller sku/,/sku do vendedor/,/codigo sku/,/sku do produto/]},
    {id:'price',label:'Preço',type:'number',rx:[/^pre[cç]o\b/,/pre[cç]o de venda/,/^price\b/]},
    {id:'stock',label:'Estoque',type:'number',rx:[/^estoque\b/,/quantidade em estoque/,/^stock\b/]},
    {id:'weight',label:'Peso do pacote',type:'number',rx:[/^peso\b/,/peso do pacote/,/weight/]},
    {id:'length',label:'Comprimento',type:'number',rx:[/comprimento/,/length/]},
    {id:'width',label:'Largura',type:'number',rx:[/largura/,/width/]},
    {id:'height',label:'Altura',type:'number',rx:[/altura/,/height/]}
  ];
  const VARIANT_FIELDS=[
    {id:'variation1Name',label:'Nome da variação 1',type:'variant',rx:[]},
    {id:'variation1Options',label:'Opções da variação 1',type:'variant',rx:[]},
    {id:'variation2Name',label:'Nome da variação 2',type:'variant',rx:[]},
    {id:'variation2Options',label:'Opções da variação 2',type:'variant',rx:[]}
  ];
  const SELECT_FIELDS=[
    {id:'brand',label:'Marca',type:'select',desired:'Sem Marca'},
    {id:'country',label:'País de Origem',type:'select',desired:'China'},
    {id:'condition',label:'Condição',type:'select',desired:'Novo'}
  ];
  const norm=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const short=t=>norm(t).slice(0,250);
  const escSelector=t=>(window.CSS?.escape?CSS.escape(t):String(t).replace(/([ #.;?+*~':"!^$[\]()=>|/@])/g,'\\$1'));
  const state={draft:null,fields:{},mapping:null,hovered:null,log:[],loading:false};
  const storageKey='atelieSellerFieldMapsV102'; // preserva mapeamentos anteriores
  const pageKey=()=>location.pathname.replace(/\/[0-9a-z-]{12,}$/i,'/:id');
  const notify=(type,payload={})=>new Promise((resolve,reject)=>{
    chrome.runtime.sendMessage({type,...payload},res=>{
      const error=chrome.runtime.lastError?.message;
      if(error||!res?.ok)reject(Error(error||res?.error||'Falha na extensão'));
      else resolve(res);
    });
  });
  const visible=el=>!!(el&&el.isConnected&&!el.closest('#'+APP_ID)&&!el.closest('[aria-hidden="true"]')&&!el.disabled&&!el.readOnly&&el.getClientRects().length);
  const inputLike=el=>el&&((el.matches?.('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=password]),textarea,[contenteditable="true"],[contenteditable=""]'))||el.isContentEditable);
  const candidateFields=()=>[...document.querySelectorAll('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=password]),textarea,[contenteditable="true"],[contenteditable=""]')].filter(visible);
  function suitable(el,field){
    if(field.type==='select')return visible(el)&&el.matches?.(SELECT_CONTROL);
    if(!visible(el)||!inputLike(el))return false;
    const tag=el.tagName.toLowerCase(),type=el.getAttribute('type');
    if(field.type==='rich')return tag==='textarea'||el.isContentEditable||['text','search',null].includes(type);
    return tag==='input'&&(type!=='search')&&(!type||['text','number','tel'].includes(type));
  }
  function directLabels(el){
    const chunks=[];
    if(el.labels)for(const l of el.labels)chunks.push(l.textContent);
    if(el.id){try{for(const l of document.querySelectorAll('label[for="'+escSelector(el.id)+'"]'))chunks.push(l.textContent);}catch(_){}}
    for(const key of ['aria-label','placeholder','name','data-testid','id'])chunks.push(el.getAttribute(key)||'');
    return short(chunks.join(' '));
  }
  function contextLabels(el){
    const out=[];let a=el.parentElement;
    for(let step=0;step<5&&a;step++,a=a.parentElement){
      if(a===document.body||a===document.documentElement)break;
      const siblings=[...a.querySelectorAll('input,textarea,[contenteditable]')].filter(visible);
      if(siblings.length>2)continue;
      const nodes=[...a.querySelectorAll('label,[class*="label"],[class*="Label"],.eds-form-item__label,.shopee-form-item__label')]
        .filter(n=>n!==el&&!n.contains(el));
      for(const n of nodes.slice(0,5)){
        if(n.textContent?.length<100)out.push(n.textContent);
      }
      if(a.textContent?.length<130)out.push(a.textContent);
    }
    return short(out.join(' '));
  }
  function findBest(field){
    if(field.type==='select')return findDropdownByLabel(field);
    if(field.type==='variant')return null; // ensinar individualmente para evitar variações trocadas
    const list=[];
    for(const el of candidateFields().filter(x=>suitable(x,field))){
      const direct=directLabels(el),context=contextLabels(el);
      const d=field.rx.some(rx=>rx.test(direct)),c=field.rx.some(rx=>rx.test(context));
      let score=d?100:c?50:0;
      if(!score)continue;
      if(/pesquisar|busca geral|filtro|chat|mensagem|pesquise aqui/.test(direct))score-=110;
      if((field.id==='length'||field.id==='width'||field.id==='height')&&/produto|roupa|vestu[aá]rio/.test(direct)&&!/(pacote|embalagem)/.test(direct))score-=20;
      if(field.id==='title'&&/sku|varia[cç][aã]o/.test(direct))score-=110;
      if(field.id==='price'&&/promocional|desconto|pre[cç]o original/.test(direct))score-=80;
      if(score>0)list.push({el,score});
    }
    list.sort((a,b)=>b.score-a.score);
    if(!list.length)return null;
    if(list[0].score<50||(list[1]&&list[0].score===list[1].score))return null;
    return list[0].el;
  }
  function cssLocator(el){
    if(el.id&&!/^\d+$/.test(el.id))return '#'+escSelector(el.id);
    for(const attr of ['data-testid','name','placeholder','aria-label']){
      const val=el.getAttribute(attr);
      if(val&&val.length<100){const sel=el.tagName.toLowerCase()+'['+attr+'="'+String(val).replaceAll('\\','\\\\').replaceAll('"','\\"')+'"]';if(document.querySelectorAll(sel).length===1)return sel;}
    }
    // O caminho CSS é reserva. Requer que a estrutura do formulário continue igual.
    let node=el,parts=[];
    for(let i=0;i<9&&node&&node!==document.body;i++,node=node.parentElement){
      const tag=node.tagName.toLowerCase(),par=node.parentElement;
      if(!par)break;
      const siblings=[...par.children].filter(n=>n.tagName===node.tagName);
      const nth=siblings.length>1?':nth-of-type('+([...par.children].filter(n=>n.tagName===node.tagName).indexOf(node)+1)+')':'';
      parts.unshift(tag+nth);
      if(par.id&&!/^\d+$/.test(par.id)){parts.unshift('#'+escSelector(par.id));break;}
    }
    return parts.join(' > ');
  }
  function locateSaved(field){
    const entry=state.fields[field.id];if(!entry)return null;
    try{
      const els=[...document.querySelectorAll(entry.selector)].filter(el=>suitable(el,field));
      if(els.length!==1)return null;
      const el=els[0];
      // No DOM alterado nunca usa um caminho estrutural salvo que aponte para tipo diferente.
      if(entry.tag&&entry.tag!==el.tagName.toLowerCase())return null;
      return el;
    }catch(_){return null;}
  }
  function findField(field){return locateSaved(field)||findBest(field);}
  function valueFor(field,draft){
    if(!draft)return null;
    const v=draft.variants||[];
    const uniq=arr=>[...new Set(arr.map(x=>String(x||'').trim()).filter(Boolean))];
    if(field.id==='variation1Name')return draft.option1Name||draft.variant1Name||'Cor';
    if(field.id==='variation2Name')return draft.option2Name||draft.variant2Name||'Tamanho';
    if(field.id==='variation1Options')return uniq(v.map(x=>x.option1)).join(', ');
    if(field.id==='variation2Options')return uniq(v.map(x=>x.option2)).join(', ');
    if(['sku','price','stock'].includes(field.id)){
      if(v.length!==1)return null;
      if(field.id==='sku')return v[0].sku||draft.sku||null;
      if(field.id==='price')return v[0].price||draft.draftPrice||null;
      return v[0].stock??null;
    }
    const vals={title:draft.title,description:draft.description,weight:draft.weight,length:draft.length,width:draft.width,height:draft.height};
    return vals[field.id]??null;
  }
  function assign(el,value){
    if(!visible(el))return false;
    try{
      el.focus();let v=String(value),tag=el.tagName.toLowerCase();
      if(tag==='input'||tag==='textarea'){
        const proto=tag==='textarea'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
        if(setter)setter.call(el,v);else el.value=v;
      }else if(el.isContentEditable){el.textContent=v;}
      else return false;
      try{el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:v}));}catch(_){el.dispatchEvent(new Event('input',{bubbles:true}));}
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.dispatchEvent(new Event('blur',{bubbles:true}));
      return true;
    }catch(_){return false;}
  }
  const panel=document.createElement('aside');panel.id=APP_ID;
  panel.style.cssText='position:fixed!important;z-index:2147483645!important;bottom:18px;right:18px;width:min(370px,calc(100vw - 36px));max-height:76vh;overflow:auto;background:#10223d;color:white;border-radius:14px;box-shadow:0 8px 30px #0009;padding:15px;font:13px system-ui,sans-serif;line-height:1.45;direction:ltr;text-align:left;';
  panel.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong style="font-size:15px">Ateliê · Listagem Única <small style="opacity:.6">1.0.5</small></strong><button id="atclose" title="Minimizar">−</button></div>
    <p id="atsummary" style="margin:6px 0 10px">Carregando produto...</p>
    <p id="atstage" style="border-radius:7px;background:#243a59;padding:8px;font-size:12px;margin:8px 0"></p>
    <div style="display:flex;flex-wrap:wrap;gap:6px" id="atbuttons">
      <button id="atretry">↻ Recarregar produto</button><button id="atfill">Preencher campos</button><button id="atmap">Ensinar campos</button><button id="atdiag">Diagnosticar tela</button>
      <button id="atcat">Selecionar categoria</button><button id="atdefaults">Marca / Origem / Novo</button><button id="atvariants">Preencher variações</button><button id="atshipping">Canais de envio</button><button id="atcopy">Copiar variações</button>
    </div>
    <div id="atmapbox" style="display:none;background:#233b5a;margin-top:8px;padding:9px;border-radius:8px">
      <label for="atfield">Qual campo deseja ensinar?</label><select id="atfield" style="width:100%;padding:7px;margin:6px 0;color:#152d4c;background:white;border-radius:5px"></select>
      <button id="atpick">Selecionar campo na página</button><button id="atcancel" style="display:none">Cancelar escolha</button>
      <p id="atmaphelp" style="font-size:11px;margin:8px 0 0">Escolha o campo e depois clique sobre a caixa correspondente no formulário Shopee. O Ateliê memorizará a localização para próximas listagens.</p>
    </div>
    <pre id="atlog" style="white-space:pre-wrap;overflow:auto;max-height:210px;font:12px system-ui;margin:12px 0 3px"></pre>
    <p style="font-size:11px;opacity:.8;margin-bottom:0">Revise categoria, variações, imagens, preço e frete. Nunca publicamos automaticamente.</p>`;
  const $=id=>panel.querySelector('#'+id);
  function say(lines){$('atlog').textContent=Array.isArray(lines)?lines.join('\n'):String(lines);}
  function stage(){
    if(!document.body)return;
    const hay=norm(document.body.innerText.replace(panel.innerText,'').slice(0,20000));
    const hasField=candidateFields().some(el=>/nome do produto|titulo do produto|product name/.test(directLabels(el)+' '+contextLabels(el)));
    const probablyEditor=hasField || /nome do produto/.test(hay)&&(/pre[cç]o|estoque|peso|categoria/.test(hay));
    $('atstage').textContent=probablyEditor?'Formulário detectado. Se algum campo não for localizado, use “Ensinar campos”.':'Não identifiquei o formulário de cadastro. Abra “Adicionar novo produto” ou “Listagem Única” na Shopee e tente novamente.';
    $('atstage').style.background=probablyEditor?'#1c534a':'#614b21';
  }
  const token=(location.hash.match(/(?:^#|&)atelie_listagem=([0-9a-f]{64})(?:&|$)/)||[])[1];
  if(token){try{history.replaceState(null,'',location.pathname+location.search);}catch(_){}}
  async function loadDraft(){
    if(state.loading)return;state.loading=true;
    $('atsummary').textContent='Carregando produto...';
    try{
      const res=token?await notify('ATELIE_IMPORT_TOKEN',{token}):await notify('ATELIE_GET');
      state.draft=res.draft;
      $('atsummary').textContent=`${state.draft.sku} · ${state.draft.productName} (${state.draft.category?.confirmed?'categoria confirmada':'categoria não confirmada'})`;
      say('✓ Produto recebido do Ateliê. Abra o cadastro individual na Shopee, preencha e revise antes de salvar.');
    }catch(e){state.draft=null;$('atsummary').textContent='Falha: '+e.message;say('Deixe o Ateliê aberto; clique novamente em Preparar Listagem Única se a sessão tiver expirado.');}
    finally{state.loading=false;stage();}
  }
  async function loadFieldMap(){
    try{const res=await chrome.storage.local.get(storageKey);state.fields=(res?.[storageKey]?.[pageKey()]||{});}catch(_){state.fields={};}
  }
  async function saveFieldMap(){
    try{const res=await chrome.storage.local.get(storageKey),maps=res?.[storageKey]||{};maps[pageKey()]={...state.fields};await chrome.storage.local.set({[storageKey]:maps});return true;}
    catch(_){return false;}
  }
  async function fillAll(){
    if(!state.draft)return say('Primeiro prepare uma listagem no Ateliê.');
    const res=[],missing=[];
    for(const field of FIELDS){
      const value=valueFor(field,state.draft);
      if(value===null||value===undefined||value==='')continue;
      const el=findField(field);
      if(!el){missing.push(field.label);continue;}
      if(assign(el,value))res.push('✓ '+field.label);
      else missing.push(field.label);
    }
    if(state.draft.variants?.length>1)res.push('ℹ '+state.draft.variants.length+' variações: crie os grupos no Seller; SKUs, preços e estoques variam por linha.');
    if(missing.length)res.push('⚠ Não localizados: '+missing.join(', ')+'. Use “Ensinar campos”.');
    const opts=await applySelectDefaults({quiet:true});res.push(...opts);
    if(isSectionVisible(/informa[cç][oõ]es de vendas|habilitar varia[cç]/))res.push(...await populateVariants({quiet:true}));
    if(isSectionVisible(/taxa de envio|shopee xpress|retirada pelo comprador/))res.push(...await applyShipping({quiet:true}));
    res.push('Confira todos os valores, categoria, fotos e frete.');
    say(res);stage();
  }
  function diagnostics(){
    const found=FIELDS.map(f=>({label:f.label,found:!!findField(f),saved:!!locateSaved(f)}));
    const counts=candidateFields().length;
    const lines=['Endereço: '+location.pathname,'Campos editáveis visíveis: '+counts,...found.map(f=>(f.found?'✓ ':'⚠ ')+f.label+(f.saved?' (ensinado)':''))];
    if(counts<3)lines.push('A página parece não estar no formulário de criação. Abra o cadastro individual.');
    say(lines);stage();
  }
  function stopPick(){
    state.mapping=null;
    if(state.hovered)state.hovered.style.outline='';
    state.hovered=null;$('atcancel').style.display='none';
    document.removeEventListener('pointerover',hoverPick,true);
    document.removeEventListener('click',capturePick,true);
  }
  function hoverPick(e){
    if(!state.mapping)return;
    let el=state.mapping.type==='select'?dropdownTarget(e.target):e.target?.closest?.('input,textarea,[contenteditable]');
    if(!el||!suitable(el,state.mapping))return;
    if(state.hovered&&state.hovered!==el)state.hovered.style.outline='';
    state.hovered=el;el.style.outline='3px solid #23bcb1';
  }
  async function capturePick(e){
    if(!state.mapping)return;
    const el=state.mapping.type==='select'?dropdownTarget(e.target):e.target?.closest?.('input,textarea,[contenteditable]');
    if(!el||!suitable(el,state.mapping))return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const field=state.mapping,selector=cssLocator(el);
    state.fields[field.id]={selector,tag:el.tagName.toLowerCase()};
    const saved=await saveFieldMap();
    stopPick();
    const value=valueFor(field,state.draft);
    const filled=field.type!=='select'&&field.type!=='variant'&&value!==null&&value!==undefined&&value!==''?assign(el,value):false;
    say(`✓ Campo “${field.label}” identificado ${saved?'e salvo':'nesta sessão'} para esta página. ${field.type==='select'?'Agora clique em “Marca / Origem / Novo” para selecionar.':field.type==='variant'?'Agora clique em “Preencher variações”.':filled?'Valor inserido, confira na Shopee.':'Sem valor individual para preencher; confira variações e dados.'}`);
    $('atmaphelp').textContent='Campo aprendido. Para outros campos, selecione a opção e clique em “Selecionar campo na página”.';
  }
  function beginPick(){
    const field=[...FIELDS,...SELECT_FIELDS,...VARIANT_FIELDS].find(x=>x.id===$('atfield').value);if(!field)return;
    stopPick();state.mapping=field;$('atcancel').style.display='inline-block';
    $('atmaphelp').textContent=`Clique na caixa de “${field.label}” do formulário Shopee. A borda ficará verde antes de selecionar. Pressione “Cancelar escolha” para desistir.`;
    document.addEventListener('pointerover',hoverPick,true);document.addEventListener('click',capturePick,true);
  }
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  function outsidePanel(el){return !!(el&&el.isConnected&&!el.closest('#'+APP_ID)&&el.getClientRects().length&&!el.closest('[aria-hidden="true"]'));}
  function leafText(t){return norm((t||'').replace(/^[\s*]+/,'').replace(/\s*\*\s*$/,''));}
  function byExactText(str,{root=document,tag='label,span,div,p,strong,button,li,[role="option"]'}={}){
    const wanted=leafText(str);
    return [...root.querySelectorAll(tag)].filter(e=>outsidePanel(e)&&leafText(e.textContent)===wanted&&!([...e.children].some(c=>leafText(c.textContent)===wanted)));
  }
  function dropdownTarget(node){
    if(!node?.closest)return null;
    return node.closest(SELECT_CONTROL);
  }
  function isActuallyVisible(el){
    if(!outsidePanel(el))return false;
    const cs=getComputedStyle(el);
    return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||'1')>0;
  }
  const DROPDOWN_ROOT='[role="listbox"],[role="menu"],.eds-select-dropdown,.shopee-select-dropdown,[class*="select-dropdown"],[class*="selectDropdown"],[class*="dropdown-menu"],[class*="dropdownMenu"],[class*="popper"],[class*="Popper"]';
  const ITEM_ROOT='[role="option"],li,.eds-option,.shopee-select-option,.eds-select-option,.eds-select-dropdown__item,.shopee-select-dropdown__item,[class*="select-option"],[class*="selectOption"],[class*="dropdown-item"],[class*="dropdownItem"],[class*="option-item"]';
  function findDropdownByLabel(f){
    const labels=byExactText(f.label).filter(e=>!e.closest('aside,[class*="preview"],[class*="Preview"]'));
    for(const label of labels){
      let box=label;
      for(let i=0;i<6&&box;i++,box=box.parentElement){
        if(box===document.body)break;
        const ctrls=[...box.querySelectorAll(SELECT_CONTROL)].filter(isActuallyVisible);
        // Keep the outside clickable control, not several nested elements of the same select.
        const outer=ctrls.filter(e=>!ctrls.some(other=>other!==e&&other.contains(e)));
        if(outer.length===1)return outer[0];
        if(outer.length>1)break;
      }
    }
    return null;
  }
  function optionElements(text,control){
    const wanted=leafText(text),a=control.getBoundingClientRect();
    const nodes=[...document.querySelectorAll(ITEM_ROOT+',span,div')]
      .filter(e=>isActuallyVisible(e)&&leafText(e.textContent)===wanted)
      .filter(e=>![...e.children].some(c=>leafText(c.textContent)===wanted));
    let choices=[];
    for(const n of nodes){
      const row=n.closest(ITEM_ROOT)||n;
      if(!isActuallyVisible(row))continue;
      const r=row.getBoundingClientRect();
      const near=(r.top>=a.top-350 && r.top<=a.bottom+750 && r.right>=a.left-125 && r.left<=a.right+400);
      if(!near)continue;
      const popup=row.closest(DROPDOWN_ROOT);
      const role=row.getAttribute('role');
      const cls=String(row.className?.baseVal||row.className||'');
      // Never click arbitrary duplicate page text. Require a visible popup or a real option element.
      const optionStyle=role==='option'||/option|dropdown.item/i.test(cls);
      if(!popup&&!optionStyle)continue;
      const dist=Math.abs(r.top-a.bottom)+Math.abs((r.left+r.right)/2-(a.left+a.right)/2)*.15;
      choices.push({el:row,dist,score:(popup?3:0)+(optionStyle?2:0)});
    }
    choices.sort((x,y)=>y.score-x.score||x.dist-y.dist);
    if(!choices.length)return null;
    // If two unrelated options match, do not guess.
    if(choices.length>1&&choices[0].score===choices[1].score&&Math.abs(choices[0].dist-choices[1].dist)<18&&choices[0].el!==choices[1].el)return null;
    return choices[0].el;
  }
  function dropdownSearchInput(control){
    const a=control.getBoundingClientRect();
    const found=[...document.querySelectorAll('input:not([readonly]):not([disabled]):not([type="hidden"])')]
      .filter(isActuallyVisible).filter(e=>{
        const r=e.getBoundingClientRect();
        if(r.top<a.top-160||r.top>a.bottom+650||r.right<a.left-130||r.left>a.right+450)return false;
        const descriptor=norm([e.placeholder,e.getAttribute('aria-label'),e.getAttribute('type')].join(' '));
        return /insira ao menos|digite|pesquis|buscar|search|caracteres|encontre/.test(descriptor)||!!e.closest(DROPDOWN_ROOT);
      });
    found.sort((a,b)=>Number(!!b.closest(DROPDOWN_ROOT))-Number(!!a.closest(DROPDOWN_ROOT))||a.getBoundingClientRect().top-b.getBoundingClientRect().top);
    return found.length===1?found[0]:(found[0]&&found[0].closest(DROPDOWN_ROOT)?found[0]:null);
  }
  function selectedText(control){
    if(control.tagName==='SELECT')return leafText(control.selectedOptions?.[0]?.textContent||'');
    // Shopee custom select components typically keep the selected label in one of these elements.
    const names=['[class*="selection-item"]','[class*="selected-value"]','[class*="selectedValue"]','[class*="selection__rendered"]','[class*="selection__render"]','[class*="select-value"]'];
    const c=control.querySelector?.(names.join(','));
    if(c)return leafText(c.textContent||c.getAttribute('title')||'');
    const i=control.matches('input')?control:control.querySelector('input[readonly]');
    if(i&&i.value)return leafText(i.value);
    return leafText(control.textContent||control.getAttribute('title')||'');
  }
  function selectionConfirmed(control,target){
    const val=selectedText(control),wanted=leafText(target);
    return val===wanted||new RegExp('(?:^|\\s)'+wanted.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|\\s)').test(val)&&val.length<wanted.length+25;
  }
  async function selectValue(field){
    const target=field.desired;
    let el=locateSaved(field)||findDropdownByLabel(field);
    if(!el)return `⚠ ${field.label}: seletor não identificado. Use “Ensinar campos”.`;
    if(el.tagName==='SELECT'){
      const opt=[...el.options].find(o=>leafText(o.textContent)===leafText(target));
      if(!opt)return `⚠ ${field.label}: opção “${target}” não encontrada.`;
      el.value=opt.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      return selectionConfirmed(el,target)?`✓ ${field.label}: ${target} confirmado.`:`⚠ ${field.label}: seleção não confirmada.`;
    }
    if(selectionConfirmed(el,target))return `✓ ${field.label}: já está ${target}.`;
    try{el.scrollIntoView({block:'center',behavior:'instant'});}catch(_){/* visual only */}
    el.click();await pause(250);
    let opt=optionElements(target,el);
    if(!opt){
      const search=dropdownSearchInput(el);
      if(search){
        assign(search,target);
        for(let i=0;i<7&&!opt;i++){await pause(170);opt=optionElements(target,el);}
      }
    }
    if(!opt)return `⚠ ${field.label}: menu aberto, mas não encontrei com segurança a opção “${target}”. Escolha manualmente.`;
    opt.click();await pause(230);
    if(selectionConfirmed(el,target))return `✓ ${field.label}: ${target} selecionado e confirmado.`;
    // Some Shopee widgets rerender their control element following selection.
    const updated=locateSaved(field)||findDropdownByLabel(field);
    if(updated&&selectionConfirmed(updated,target))return `✓ ${field.label}: ${target} selecionado e confirmado.`;
    return `⚠ ${field.label}: clique em “${target}” executado, mas a confirmação na tela não foi identificada. Confira manualmente.`;
  }
  async function applySelectDefaults({quiet=false}={}){
    const logs=[];
    for(const f of SELECT_FIELDS){
      if(locateSaved(f)||findDropdownByLabel(f))logs.push(await selectValue(f));
      else if(!quiet)logs.push(`⚠ ${f.label}: abra a seção correspondente e use “Ensinar campos”.`);
    }
    if(!quiet)say(logs.length?logs:'Abra “Especificação” para Marca e País, ou “Outros” para Condição.');
    return logs;
  }
  function isSectionVisible(rx){return [...document.querySelectorAll('h1,h2,h3,h4,label,button,span')].some(e=>outsidePanel(e)&&e.children.length===0&&rx.test(norm(e.textContent||'')));}
  function toggleRow(label){
    const leaf=[...document.querySelectorAll('span,div,p,label,strong')].filter(e=>outsidePanel(e)&&norm(e.textContent||'').startsWith(norm(label))&&norm(e.textContent||'').length<110&&!([...e.children].some(c=>norm(c.textContent||'').startsWith(norm(label)))));
    for(const node of leaf){let box=node;
      for(let i=0;i<6&&box;i++,box=box.parentElement){
        const sw=[...box.querySelectorAll('[role="switch"],input[type="checkbox"],button[aria-checked],.eds-switch,.shopee-switch,[class*="switch"]')]
          .filter(outsidePanel).filter(e=>!e.closest('#'+APP_ID));
        const unique=sw.filter(e=>!sw.some(o=>o!==e&&o.contains(e)));
        if(unique.length===1){
          const item=unique[0];if(box.innerText&&norm(box.innerText).length>260)continue;
          return item;
        }
      }
    }
    return null;
  }
  function switchStatus(e){
    if(e.matches('input[type="checkbox"]'))return e.checked;
    if(e.getAttribute('aria-checked')==='true')return true;
    if(e.getAttribute('aria-checked')==='false')return false;
    const cb=e.querySelector('input[type=checkbox]');if(cb)return cb.checked;
    const c=(e.className?.baseVal||e.className||'').toString().toLowerCase();
    if(/(?:^|[\s_-])(?:checked|enabled|on|active)(?:$|[\s_-])/.test(c))return true;
    if(/(?:^|[\s_-])(?:unchecked|off)(?:$|[\s_-])/.test(c))return false;
    return null;
  }
  async function toggleTo(label,desired){
    const e=toggleRow(label);
    if(!e)return `⚠ ${label}: não encontrei o interruptor. Abra “Envio” e confira.`;
    if(e.disabled||e.getAttribute('aria-disabled')==='true'||e.closest('[aria-disabled="true"]'))return `⚠ ${label}: desativado/bloqueado pela Shopee.`;
    const before=switchStatus(e);
    if(before===null)return `⚠ ${label}: estado do interruptor não identificável. Para evitar inverter o frete, confira manualmente.`;
    if(before===desired)return `✓ ${label}: já estava ${desired?'ligado':'desligado'}.`;
    e.click();await pause(130);const after=switchStatus(e);
    return after===desired?`✓ ${label}: ${desired?'ligado':'desligado'}.`:`⚠ ${label}: clique solicitado, mas sem confirmação de estado; confira a Shopee.`;
  }
  async function applyShipping({quiet=false}={}){
    const hasShipping=[...document.querySelectorAll('span,div,label')].some(e=>outsidePanel(e)&&norm(e.textContent||'').length<100&&/^(shopee xpress|retirada pelo comprador)/.test(norm(e.textContent||''))); 
    if(!hasShipping){if(!quiet)say('Abra a seção “Envio” antes de usar Canais de envio.');return [];}
    const rows=[await toggleTo('Shopee Xpress',true),await toggleTo('Retirada pelo Comprador',true),await toggleTo('Expresso Aéreo',false)];
    if(!quiet)say(rows);return rows;
  }
  async function setShipping(){return applyShipping();}
  const uniques=arr=>[...new Set(arr.map(x=>String(x??'').trim()).filter(Boolean))];
  function variationInputs(){
    return [...document.querySelectorAll('input')].filter(e=>outsidePanel(e)&&!e.disabled&&!e.readOnly);
  }
  function hasVariationScreen(){return isSectionVisible(/habilitar varia[cç][oõ]es|nome da varia[cç][aã]o|informa[cç][oõ]es de vendas/);}
  function pickInput(rx){
    const arr=variationInputs().filter(e=>rx.test(norm([e.placeholder,e.getAttribute('aria-label'),e.name].join(' '))));
    return arr.length===1?arr[0]:null;
  }
  function emitEnter(e){
    e.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',code:'Enter'}));
    e.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter'}));
  }
  async function fillVariantRows(variants){
    let completed=0;
    for(const variant of variants){
      const options=[variant.option1,variant.option2].map(norm).filter(Boolean);
      const rows=[...document.querySelectorAll('tr,[role="row"]')].filter(outsidePanel).filter(r=>options.every(o=>norm(r.innerText).includes(o)));
      if(rows.length!==1)continue;
      const row=rows[0];let changed=0;
      const inputs=[...row.querySelectorAll('input')].filter(outsidePanel);
      for(const [value,rx] of [[variant.sku,/sku|c[oó]digo/],[variant.price,/pre[cç]o|price/],[variant.stock,/estoque|stock/]]){
        const hits=inputs.filter(e=>rx.test(norm([e.placeholder,e.getAttribute('aria-label'),e.name].join(' '))));
        if(hits.length===1&&value!==undefined&&value!==null){assign(hits[0],value);changed++;}
      }
      if(changed===3)completed++;
    }
    return completed;
  }
  async function populateVariants({quiet=false}={}){
    const logs=[],variants=state.draft?.variants||[];
    if(!variants.length){if(!quiet)say('Produto sem variações cadastradas.');return logs;}
    if(!hasVariationScreen()){if(!quiet)say('Abra a seção “Informações de vendas” antes de preencher as variações.');return logs;}
    const button=byExactText('Habilitar Variações',{tag:'button,span,div'}).find(e=>e.closest('button,[role=button]'));
    if(button){const act=button.closest('button,[role=button]');if(act&&!act.disabled){act.click();await pause(220);logs.push('✓ Habilitar Variações acionado.');}}
    const group1=uniques(variants.map(v=>v.option1)),group2=uniques(variants.map(v=>v.option2));
    // Só preenche grupos se o Seller expuser entradas textuais identificáveis. Nunca insere valores em caixas desconhecidas.
    let nameInputs=variationInputs().filter(e=>/nome da varia[cç][aã]o|variation name|tipo de varia[cç][aã]o/.test(norm(e.placeholder+' '+e.getAttribute('aria-label'))));
    let optionInputs=variationInputs().filter(e=>/op[cç][oõ]es da varia[cç][aã]o|nome da op[cç][aã]o|variation option|valor da varia[cç][aã]o/.test(norm(e.placeholder+' '+e.getAttribute('aria-label'))));
    const desiredNames=[state.draft.option1Name||'Cor',state.draft.option2Name||'Tamanho'];
    const groupList=[group1,group2].filter(arr=>arr.length);
    if(groupList.length>1&&nameInputs.length<2){
      const add=byExactText('Adicionar Variação',{tag:'button,span,div'}).map(e=>e.closest('button,[role=button]')).filter(Boolean);
      if(add.length===1&&!add[0].disabled){add[0].click();await pause(200);}
      nameInputs=variationInputs().filter(e=>/nome da varia[cç][aã]o|variation name|tipo de varia[cç][aã]o/.test(norm(e.placeholder+' '+e.getAttribute('aria-label'))));
      optionInputs=variationInputs().filter(e=>/op[cç][oõ]es da varia[cç][aã]o|nome da op[cç][aã]o|variation option|valor da varia[cç][aã]o/.test(norm(e.placeholder+' '+e.getAttribute('aria-label'))));
    }
    let prepared=0;
    for(let i=0;i<groupList.length;i++){
      const nField=VARIANT_FIELDS.find(f=>f.id===`variation${i+1}Name`);
      const oField=VARIANT_FIELDS.find(f=>f.id===`variation${i+1}Options`);
      // Prioriza campos ensinados; uso de posição apenas se a quantidade de campos corresponde exatamente aos grupos.
      const name=locateSaved(nField)||(nameInputs.length===groupList.length?nameInputs[i]:null);
      const options=locateSaved(oField)||(optionInputs.length===groupList.length?optionInputs[i]:null);
      if(!name||!options){logs.push(`⚠ Grupo ${i+1}: campos ainda não identificados. Use “Ensinar campos” → Nome/Opções da variação ${i+1}.`);continue;}
      assign(name,desiredNames[i]);
      for(const option of groupList[i]){assign(options,option);emitEnter(options);await pause(55);}
      prepared++;
      logs.push(`↪ Grupo ${i+1}: ${groupList[i].length} opções inseridas no controle. Confira os nomes e se todas as opções foram confirmadas na Shopee.`);
    }
    if(prepared!==groupList.length)logs.push(`⚠ ${groupList.length-prepared} grupo(s) de variações ainda dependem de preenchimento ou mapeamento.`);
    await pause(100);
    const completed=await fillVariantRows(variants);
    logs.push(completed===variants.length?`✓ ${completed} linhas de SKU, preço e estoque preenchidas; revise.`:
      `⚠ ${completed}/${variants.length} linhas de variações completamente preenchidas. É necessário conferir ou completar as linhas no Seller.`);
    if(!quiet)say(logs);
    return logs;
  }
  function category(){
    if(!state.draft)return say('Prepare o anúncio no Ateliê primeiro.');
    const cat=state.draft.category||{};
    if(!cat.confirmed)return say('⚠ A categoria ainda NÃO foi confirmada no Ateliê. Abra o seletor na Shopee, escolha uma categoria real e depois cadastre o ID confirmado em “Categorias Inteligentes”.');
    const matches=[...document.querySelectorAll('[data-category-id],[data-id]')].filter(x=>visible(x)&&[x.dataset.categoryId,x.dataset.id].includes(String(cat.id)));
    if(matches.length===1){matches[0].click();say(`Categoria ID ${cat.id} selecionada; confira o caminho: ${cat.name}.`);return;}
    say(`Categoria sugerida: ${cat.name} (ID ${cat.id}). Abra o seletor da Shopee e confirme a categoria; não encontrei um controle inequívoco para escolher automaticamente.`);
  }
  async function copyVariants(){
    if(!state.draft)return;
    const vs=state.draft.variants||[];
    const s=vs.map(v=>[v.option1,v.option2,v.sku,v.price,v.stock].join(' | ')).join('\n');
    try{await navigator.clipboard.writeText(s);say(`✓ ${vs.length} linhas de variação copiadas. Use nos campos correspondentes da Shopee.`);}
    catch(_){say(s+'\n\nPermissão negada: selecione o texto acima para copiar.');}
  }
  function mount(){
    if(!document.body||document.getElementById(APP_ID))return;
    document.body.appendChild(panel);
    for(const b of panel.querySelectorAll('button')){
      if(b.id==='atclose')b.style.cssText='border:0;background:transparent;color:white;cursor:pointer;font-size:16px';
      else b.style.cssText='background:#e8eefc;color:#11264d;border:0;border-radius:7px;padding:7px;cursor:pointer;font-size:12px;';
    }
    for(const f of [...FIELDS,...SELECT_FIELDS,...VARIANT_FIELDS]){const opt=document.createElement('option');opt.value=f.id;opt.textContent=f.label;$('atfield').appendChild(opt);}
    $('atclose').addEventListener('click',()=>{panel.style.maxHeight=panel.style.maxHeight==='43px'?'76vh':'43px';panel.style.overflow=panel.style.maxHeight==='43px'?'hidden':'auto';});
    $('atretry').addEventListener('click',loadDraft);
    $('atfill').addEventListener('click',fillAll);
    $('atdiag').addEventListener('click',diagnostics);
    $('atmap').addEventListener('click',()=>{$('atmapbox').style.display=$('atmapbox').style.display==='none'?'block':'none';stopPick();});
    $('atpick').addEventListener('click',beginPick);
    $('atcancel').addEventListener('click',stopPick);
    $('atcat').addEventListener('click',category);
    $('atshipping').addEventListener('click',()=>{setShipping().catch(e=>say('Erro no frete: '+e.message));});
    $('atdefaults').addEventListener('click',()=>{applySelectDefaults().catch(e=>say('Erro nos padrões: '+e.message));});
    $('atvariants').addEventListener('click',()=>{populateVariants().catch(e=>say('Erro nas variações: '+e.message));});
    $('atcopy').addEventListener('click',copyVariants);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')stopPick();});
    loadFieldMap().then(loadDraft);
    window.addEventListener('popstate',()=>{stopPick();stage();});
    window.addEventListener('hashchange',()=>{stopPick();stage();});
  }
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});
})();
