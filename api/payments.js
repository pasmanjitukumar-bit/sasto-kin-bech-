const {methods,configured,initiate,verify}=require('../server/providers.cjs');
const {authenticate,privateDb,checked}=require('../server/auth.cjs');
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 const action=req.query?.action||new URL(req.url,'http://local').searchParams.get('action');
 if(req.method==='GET'&&action==='methods'){
  let enabled=false;try{const {createClient}=require('@supabase/supabase-js');const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});enabled=(await checked(db.from('platform_settings').select('online_payments_enabled').single())).online_payments_enabled;}catch{}
  return res.status(200).json({methods:methods().map(m=>({...m,available:m.available&&enabled}))});
 }
 // A gateway redirect contains untrusted hints. Verification happens only after buyer login.
 if(req.method==='GET'&&action==='return'){
  const hint=req.query?.attempt||req.query?.purchase_order_id;
  return res.redirect(303,/^[0-9a-f-]{36}$/i.test(hint||'')?'/#market/payment/'+hint:'/#market/orders');
 }
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  if(req.headers.origin&&req.headers.origin!==new URL(process.env.APP_ORIGIN).origin)throw Error('ORIGIN_DENIED');
  const {db,user}=await authenticate(req),body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(JSON.stringify(body).length>20000)throw Error('REQUEST_TOO_LARGE');
  if(action==='start'){
   if(!configured(body.provider))throw Error('PAYMENT_UNAVAILABLE');
   const admin=privateDb();
   const attempt=await checked(db.rpc('reserve_online_order',{items:body.items,delivery_address:body.address,expected_total:body.total,provider_name:body.provider}));
   const saved=await checked(admin.from('payment_attempts').select('*').eq('id',attempt).single());
   const next=await initiate(body.provider,saved);
   await checked(admin.from('payment_attempts').update({provider_reference:next.reference,status:'initiated'}).eq('id',attempt));
   return res.status(200).json({attempt,order:saved.order_id,...next});
  }
  if(action==='verify'){
   const attempt=await checked(db.from('payment_attempts').select('*').eq('id',body.attempt).eq('buyer_id',user.id).single());
   if(['paid','failed'].includes(attempt.status))return res.status(200).json({status:attempt.status,order:attempt.order_id});
   const result=await verify(attempt.provider,attempt);
   if(result.paid){if(!result.reference)throw Error('INVALID_PROVIDER_RESPONSE');await checked(privateDb().rpc('confirm_online_payment',{attempt_id:attempt.id,transaction_reference:result.reference,verified_amount:attempt.amount}));}
   if(result.terminal)await checked(privateDb().rpc('release_failed_payment',{attempt_id:attempt.id}));
   return res.status(200).json({status:result.paid?'paid':result.terminal?'failed':'pending',providerStatus:result.status,order:attempt.order_id});
  }
  throw Error('INVALID_ACTION');
 }catch(e){const code=e.message||'PAYMENT_FAILED';return res.status(code==='SIGN_IN_REQUIRED'?401:400).json({error:/^[A-Z_]+$/.test(code)?code:'PAYMENT_FAILED'});}
};
