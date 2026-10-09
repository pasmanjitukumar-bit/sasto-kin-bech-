export function passwordControls(root,t){
 root.querySelectorAll('input[type=password]').forEach((input,index)=>{
 input.id=input.id||'password-'+index;input.autocomplete='current-password';
 const toggle=document.createElement('button');toggle.type='button';toggle.className='button secondary';toggle.setAttribute('aria-controls',input.id);toggle.setAttribute('aria-pressed','false');toggle.textContent=t('पासवर्ड देखाउनुहोस्','Show password');input.after(toggle);
 toggle.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';toggle.setAttribute('aria-pressed',String(show));toggle.textContent=show?t('पासवर्ड लुकाउनुहोस्','Hide password'):t('पासवर्ड देखाउनुहोस्','Show password');};
 });
}

export function phoneForm(t){return '<section><h3>'+t('Email वा मोबाइल नम्बरबाट login','Login with email or mobile number')+'</h3><p>'+t('मोबाइल SMS अहिले उपलब्ध छैन: SMS provider जोड्न बाँकी छ। Email मा login link वा configured भए OTP आउँछ।','Mobile SMS is currently unavailable: SMS provider setup is pending. Email receives a login link or an OTP if configured.')+'</p><form id="phone-send"><label>'+t('Email वा मोबाइल नम्बर','Email or mobile number')+'<input name="identity" type="text" autocomplete="username" placeholder="you@example.com / 98XXXXXXXX" required></label><button class="button">'+t('Login link / OTP माग्नुहोस्','Request login link / OTP')+'</button></form><form id="phone-verify" hidden><label>'+t('Email मा code आएको भए यहाँ राख्नुहोस्','If your email contains a code, enter it here')+'<input name="token" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" maxlength="8" required></label><button class="button">'+t('OTP पुष्टि गरेर login','Verify OTP and sign in')+'</button></form></section>';}
export function bindPhone({root,db,t,notify,onSuccess}){
 let sentEmail,lastSent=0;const send=root.querySelector('#phone-send'),verify=root.querySelector('#phone-verify');
 send.onsubmit=async e=>{e.preventDefault();const identity=String(new FormData(send).get('identity')).trim();verify.hidden=true;sentEmail=null;
 if(!identity.includes('@')){notify(t('मोबाइल SMS login अहिले उपलब्ध छैन। SMS सेवा जोड्न बाँकी छ। Email/password प्रयोग गर्नुहोस्।','Mobile SMS login is unavailable until SMS service is connected. Use email/password.'));return;}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)){notify(t('मान्य Email राख्नुहोस्।','Enter a valid email.'));return;}
 if(Date.now()-lastSent<60000){notify(t('फेरि code माग्न १ मिनेट पर्खनुहोस्।','Wait one minute before requesting another code.'));return;}
 const button=e.submitter;button.disabled=true;try{const r=await db.auth.signInWithOtp({email:identity,options:{emailRedirectTo:location.origin+'/#market/account'}});if(r.error)throw r.error;sentEmail=identity;lastSent=Date.now();verify.hidden=false;notify(t('Email हेर्नुहोस्: login link खोल्नुहोस् वा code आएको भए यहाँ राख्नुहोस्।','Check your email: open the login link or enter the code if provided.'));}catch{notify(t('Email पठाउन सकिएन। केही समयपछि प्रयास गर्नुहोस् वा password बाट login गर्नुहोस्।','Email could not be sent. Try later or sign in with your password.'));}finally{button.disabled=false;}};
 verify.onsubmit=async e=>{e.preventDefault();if(!sentEmail)return;const button=e.submitter;button.disabled=true;try{const r=await db.auth.verifyOtp({email:sentEmail,token:String(new FormData(verify).get('token')).trim(),type:'email'});if(r.error||!r.data.session)throw Error();await onSuccess(r.data.user);}catch{notify(t('OTP गलत वा म्याद सकिएको छ।','OTP is invalid or expired.'));}finally{button.disabled=false;}};
}
