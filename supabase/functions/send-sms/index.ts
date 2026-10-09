import { Webhook } from 'npm:standardwebhooks@1.0.0';
// Supabase signs this hook. Browser requests must never send SMS directly.
Deno.serve(async (req: Request) => {
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const secret=Deno.env.get('SEND_SMS_HOOK_SECRET');
 const sid=Deno.env.get('TWILIO_ACCOUNT_SID');
 const token=Deno.env.get('TWILIO_AUTH_TOKEN');
 const sender=Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
 if(!secret||!sid||!token||!sender)return Response.json({error:{http_code:503,message:'SMS service unavailable'}},{status:503});
 try{
  const raw=await req.text();if(raw.length>20000)return new Response('Too large',{status:413});
  const event=new Webhook(secret.replace(/^v1,whsec_/, '')).verify(raw,Object.fromEntries(req.headers)) as {user:{phone:string};sms:{otp:string}};
  const phone='+'+String(event.user.phone).replace(/^\+/,'');
  if(!/^\+9779[78]\d{8}$/.test(phone)||!/^\d{6,8}$/.test(event.sms.otp))throw Error();
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+btoa(sid+':'+token),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:phone,MessagingServiceSid:sender,Body:`SastoKinBech login code: ${event.sms.otp}. Do not share this code.`}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)return Response.json({error:{http_code:502,message:'SMS delivery request failed'}},{status:502});
  return Response.json({});
 }catch{return Response.json({error:{http_code:400,message:'Invalid SMS hook request'}},{status:400});}
});
