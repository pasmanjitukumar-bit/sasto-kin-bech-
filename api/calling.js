const crypto=require('node:crypto');
const {authenticate,checked}=require('../server/auth.cjs');
function ready(){return process.env.CALLING_ENABLED==='true'&&Boolean(process.env.TURN_URLS&&process.env.TURN_SHARED_SECRET);}
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET')return res.status(200).json({configured:ready()});
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 try{
  if(!ready())throw Error('CALL_UNAVAILABLE');
  if(req.headers.origin&&req.headers.origin!==new URL(process.env.APP_ORIGIN).origin)throw Error('ORIGIN_DENIED');
  const {db,user}=await authenticate(req),settings=await checked(db.from('platform_settings').select('calls_enabled').eq('id',true).single());
  if(!settings.calls_enabled)throw Error('CALL_UNAVAILABLE');
  const urls=process.env.TURN_URLS.split(',').map(x=>x.trim());if(urls.some(x=>!/^turns?:[^\s]+$/.test(x)))throw Error('TURN_CONFIGURATION_INVALID');
  const expires=Math.floor(Date.now()/1000)+3600,username=expires+':'+user.id;
  const credential=crypto.createHmac('sha1',process.env.TURN_SHARED_SECRET).update(username).digest('base64');
  return res.status(200).json({iceServers:[{urls,username,credential}],expires});
 }catch(e){return res.status(400).json({error:/^[A-Z_]+$/.test(e.message)?e.message:'CALL_FAILED'});}
};
