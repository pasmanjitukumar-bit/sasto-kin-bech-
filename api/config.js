module.exports = function config(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!publishableKey)return res.status(503).json({error:'BACKEND_NOT_CONFIGURED'});
 return res.status(200).json({url,publishableKey});
};
