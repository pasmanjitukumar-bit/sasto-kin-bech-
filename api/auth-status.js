module.exports=function(req,res){res.setHeader('Cache-Control','no-store');return res.status(200).json({smsEnabled:process.env.SMS_LOGIN_ENABLED==='true'});};
