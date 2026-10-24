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
    const response=await fetch('http://127.0.0.1:32817/bridge/single?token='+token,{cache:'no-store'});
    if(!response.ok)throw Error('O Ateliê não está aberto ou a sessão expirou');
    const draft=await response.json();if(!validDraft(draft))throw Error('Dados inválidos');
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
