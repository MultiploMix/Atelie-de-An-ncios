'use strict';
const APP='http://127.0.0.1:32817/';
const SELLER='https://seller.shopee.com.br/';
function validDraft(d){return !!d && d.schema==='atelie-single-shopee-v1'&&typeof d.sku==='string'&&d.sku.length<=100&&typeof d.title==='string'&&d.title.length<=140&&typeof d.description==='string'&&d.description.length<=60000&&Array.isArray(d.variants)&&d.variants.length<=120;}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 const url=sender.url||'';
 (async()=>{
  if(!url.startsWith(SELLER))throw Error('Acesso permitido somente no Seller.');
  if(message?.type==='ATELIE_IMPORT_TOKEN'){
    const token=message.token;if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))throw Error('Sessão inválida');
    let response;
    const timeout=new AbortController();
    const timer=setTimeout(()=>timeout.abort(),8500);
    try{
      response=await fetch('http://127.0.0.1:32817/bridge/single?token='+token,{cache:'no-store',signal:timeout.signal});
    }catch(e){
      throw Error('Não foi possível conectar ao Ateliê (127.0.0.1:32817). Deixe o programa aberto e atualize a extensão Shopee para a versão 1.0.1. Depois clique em Tentar novamente.');
    }finally{clearTimeout(timer);}
    if(!response.ok){
      if(response.status===404||response.status===410)throw Error('Sessão do produto não encontrada ou expirada. Volte ao Ateliê e clique novamente em Preparar Listagem Única.');
      throw Error('O Ateliê respondeu com erro HTTP '+response.status+'. Reabra a Listagem Única pelo aplicativo.');
    }
    const draft=await response.json();if(!validDraft(draft))throw Error('Dados do produto inválidos ou incompatíveis. Prepare novamente o anúncio no Ateliê.');
    await chrome.storage.local.set({atelieDraft:draft,atelieDraftAt:Date.now()});return {ok:true,draft};
  }
  if(message?.type==='ATELIE_GET'){
    const result=await chrome.storage.local.get(['atelieDraft','atelieDraftAt']);
    if(!result.atelieDraft||Date.now()-(result.atelieDraftAt||0)>86400000)throw Error('Nenhum anúncio recente foi preparado no Ateliê.');
    return {ok:true,draft:result.atelieDraft};
  }
  throw Error('Comando inválido');
 })().then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
});
