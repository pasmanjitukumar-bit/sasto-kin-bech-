const crypto = require('node:crypto');
const catalog = [
 ['esewa','eSewa'],['khalti','Khalti by IME / IME Pay'],['connectips','connectIPS'],
 ['fonepay','Fonepay QR'],['nepalpay','NEPALPAY QR'],['cards','Visa / Mastercard / Bank cards'],
 ['other-wallets','Other Nepal wallets']
];
function configured(name,env=process.env){
 const base=env.PAYMENTS_ENABLED==='true' && env.MERCHANT_MARKETPLACE_APPROVED==='true' && env.APP_ORIGIN && env.SUPABASE_SERVICE_ROLE_KEY;
 return Boolean(base && (name==='esewa'?env.ESEWA_PRODUCT_CODE&&env.ESEWA_SECRET_KEY:name==='khalti'?env.KHALTI_SECRET_KEY:false));
}
function methods(env=process.env){return catalog.map(([id,name])=>({id,name,available:configured(id,env),sandbox:env.PAYMENT_ENV!=='production',reason:['esewa','khalti'].includes(id)?'MERCHANT_CONFIGURATION_REQUIRED':'OFFICIAL_MERCHANT_API_REQUIRED'}));}
function signature(fields,secret){return crypto.createHmac('sha256',secret).update(fields).digest('base64');}
function mode(env){if(!['sandbox','production'].includes(env.PAYMENT_ENV))throw Error('PAYMENT_ENV_REQUIRED');return env.PAYMENT_ENV==='production';}
async function jsonFetch(url,options={},fetcher=fetch,allow400=false){const r=await fetcher(url,{...options,signal:AbortSignal.timeout(15000)});if(!r.ok&&!(allow400&&r.status===400))throw Error('PROVIDER_UNAVAILABLE');return r.json();}
async function initiate(provider,attempt,env=process.env,fetcher=fetch){
 if(!configured(provider,env))throw Error('PAYMENT_UNAVAILABLE');
 const live=mode(env),origin=new URL(env.APP_ORIGIN).origin;
 if(live&&!origin.startsWith('https://'))throw Error('HTTPS_REQUIRED');
 const back=origin+'/api/payments?action=return&provider=esewa&attempt='+encodeURIComponent(attempt.id);
 if(provider==='khalti'){
  const result=await jsonFetch((live?'https://khalti.com':'https://dev.khalti.com')+'/api/v2/epayment/initiate/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Key '+env.KHALTI_SECRET_KEY},body:JSON.stringify({return_url:origin+'/api/payments?action=return&provider=khalti',website_url:origin,amount:Math.round(Number(attempt.amount)*100),purchase_order_id:attempt.id,purchase_order_name:'SastoKinBech order '+attempt.order_id})},fetcher);
  const url=new URL(result.payment_url);if(url.protocol!=='https:'||!['pay.khalti.com','test-pay.khalti.com'].includes(url.hostname)||!result.pidx)throw Error('INVALID_PROVIDER_RESPONSE');
  return {reference:result.pidx,redirect:url.href};
 }
 const total=Number(attempt.amount).toFixed(2),fields={amount:total,tax_amount:'0',total_amount:total,transaction_uuid:attempt.id,product_code:env.ESEWA_PRODUCT_CODE,product_service_charge:'0',product_delivery_charge:'0',success_url:back,failure_url:back,signed_field_names:'total_amount,transaction_uuid,product_code'};
 fields.signature=signature(`total_amount=${total},transaction_uuid=${attempt.id},product_code=${fields.product_code}`,env.ESEWA_SECRET_KEY);
 return {reference:attempt.id,form:{action:(live?'https://epay.esewa.com.np':'https://rc-epay.esewa.com.np')+'/api/epay/main/v2/form',fields}};
}
async function verify(provider,attempt,env=process.env,fetcher=fetch){
 if(!configured(provider,env))throw Error('PAYMENT_UNAVAILABLE');const live=mode(env);
 if(provider==='khalti'){
  if(!attempt.provider_reference)throw Error('PAYMENT_NOT_INITIATED');
  const r=await jsonFetch((live?'https://khalti.com':'https://dev.khalti.com')+'/api/v2/epayment/lookup/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Key '+env.KHALTI_SECRET_KEY},body:JSON.stringify({pidx:attempt.provider_reference})},fetcher,true);
  if(r.pidx!==attempt.provider_reference||Number(r.total_amount)!==Math.round(Number(attempt.amount)*100))throw Error('PAYMENT_AMOUNT_MISMATCH');
  return {paid:r.status==='Completed'&&!r.refunded,terminal:['Expired','User canceled'].includes(r.status),reference:r.transaction_id,status:r.status};
 }
 const url=new URL((live?'https://esewa.com.np':'https://rc.esewa.com.np')+'/api/epay/transaction/status/');url.search=new URLSearchParams({product_code:env.ESEWA_PRODUCT_CODE,total_amount:Number(attempt.amount).toFixed(2),transaction_uuid:attempt.id});
 const r=await jsonFetch(url,{},fetcher);
 if(r.product_code!==env.ESEWA_PRODUCT_CODE||r.transaction_uuid!==attempt.id||Number(r.total_amount)!==Number(attempt.amount))throw Error('PAYMENT_AMOUNT_MISMATCH');
 return {paid:r.status==='COMPLETE',terminal:['CANCELED','NOT_FOUND'].includes(r.status),reference:r.ref_id,status:r.status};
}
module.exports={methods,configured,signature,initiate,verify};
