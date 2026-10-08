let cleanup=()=>{};
export function leaveCalling(){cleanup();cleanup=()=>{};}
export async function callingPage(ctx){
 leaveCalling();const {db,user,t,esc,layout,checked,root,notify,requireUser}=ctx;await requireUser();
 const [config,settings,admin]=await Promise.all([fetch('/api/calling').then(r=>r.json()),checked(db.from('platform_settings').select('*').single()),checked(db.rpc('is_admin'))]);
 const fallback=`<a class="button" href="tel:+9779807605076">${t('फोन गर्नुहोस्','Call support')}</a><a class="button secondary" href="https://wa.me/9779761658442">WhatsApp</a><p>${t('सामान्य फोनमा मोबाइल कम्पनीको शुल्क लाग्न सक्छ।','Ordinary telephone calls may incur carrier charges.')}</p>`;
 if(!config.configured||!settings.calls_enabled){layout(`<h2>${t('निःशुल्क इन्टरनेट कल','Free Internet Call')}</h2><p>${t('इन्टरनेट कल अहिले उपलब्ध छैन।','Internet calling is currently unavailable.')}</p>${fallback}`);return;}
 layout(`<h2>${t('निःशुल्क इन्टरनेट कल','Free Internet Call')}</h2><p>${t('इन्टरनेट डेटा शुल्क लाग्न सक्छ। माइक्रोफोन अनुमति आवश्यक छ।','Internet data charges may apply. Microphone permission is required.')}</p>${admin?`<label><input id="agent-available" type="checkbox">${t('Support agent उपलब्ध','Support agent available')}</label>`:`<button id="start-call" class="button">${t('Support लाई कल गर्नुहोस्','Call support')}</button>`}<p id="call-state" role="status">${t('कल सुरु भएको छैन।','No active call.')}</p><div id="call-controls" class="actions"></div><audio id="remote-audio" autoplay controls></audio>${fallback}`);
 let call=null,pc=null,stream=null,lastSignal=0,busy=false,disposed=false,pendingIce=[],muted=false,connectedCall=null;
 const state=root.querySelector('#call-state'),controls=root.querySelector('#call-controls');
 const label=s=>t(({ringing:'घण्टी बज्दैछ',accepted:'कल जडान हुँदैछ',rejected:'कल अस्वीकार भयो',ended:'कल सकियो'})[s]||s,s);
 const stopMedia=()=>{stream?.getTracks().forEach(track=>track.stop());stream=null;pc?.close();pc=null;connectedCall=null;};
 const signal=async(kind,payload)=>checked(db.from('call_signals').insert({call_id:call.id,sender_id:user.id,kind,payload}));
 async function media(){const session=(await db.auth.getSession()).data.session;const r=await fetch('/api/calling',{method:'POST',headers:{Authorization:'Bearer '+session.access_token}}),ice=await r.json();if(!r.ok)throw Error(t('कल सेवा उपलब्ध छैन।','Calling service unavailable.'));if(disposed)throw Error('CALL_ENDED');stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});if(disposed){stopMedia();throw Error('CALL_ENDED');}pc=new RTCPeerConnection({iceServers:ice.iceServers});stream.getTracks().forEach(track=>pc.addTrack(track,stream));pc.ontrack=e=>{root.querySelector('#remote-audio').srcObject=e.streams[0];root.querySelector('#remote-audio').play().catch(()=>notify(t('आवाज सुन्न Play थिच्नुहोस्।','Press Play to hear audio.')));};pc.onicecandidate=e=>{if(e.candidate)signal('ice',e.candidate.toJSON()).catch(()=>notify(t('कल संकेत पठाउन समस्या भयो।','Call signaling failed.')));};pc.onconnectionstatechange=()=>{if(pc?.connectionState==='connected')state.textContent=t('कल जोडियो।','Call connected.');if(pc?.connectionState==='failed'){notify(t('कल जडान हुन सकेन। फेरि प्रयास गर्नुहोस्।','Call connection failed. Try again.'));end();}};}
 async function end(){if(call)await checked(db.rpc('set_support_call',{call_id:call.id,next_status:'ended'}));stopMedia();}
 async function show(c){call=c;state.textContent=label(c.status);if(['ended','rejected'].includes(c.status)){stopMedia();controls.innerHTML='';return;}
 controls.innerHTML=`${c.status==='ringing'&&c.agent_id===user.id?`<button id="accept-call" class="button">${t('स्वीकार','Accept')}</button><button id="reject-call" class="button secondary">${t('अस्वीकार','Reject')}</button>`:''}${c.status==='accepted'?`<button id="mute-call" class="button secondary">${muted?t('आवाज खोल्नुहोस्','Unmute'):t('आवाज बन्द','Mute')}</button>`:''}<button id="end-call" class="button secondary">${t('कल अन्त्य','End call')}</button>`;
 root.querySelector('#end-call').onclick=()=>end().catch(e=>notify(e.message));
 if(root.querySelector('#accept-call'))root.querySelector('#accept-call').onclick=async()=>{try{await media();await checked(db.rpc('set_support_call',{call_id:c.id,next_status:'accepted'}));}catch(e){stopMedia();notify(t('माइक्रोफोन अनुमति वा कल जडान हुन सकेन।','Microphone permission or calling connection failed.'));}};
 if(root.querySelector('#reject-call'))root.querySelector('#reject-call').onclick=async()=>{await checked(db.rpc('set_support_call',{call_id:c.id,next_status:'rejected'}));stopMedia();};
 if(root.querySelector('#mute-call'))root.querySelector('#mute-call').onclick=()=>{muted=!muted;stream?.getAudioTracks().forEach(x=>x.enabled=!muted);root.querySelector('#mute-call').textContent=muted?t('आवाज खोल्नुहोस्','Unmute'):t('आवाज बन्द','Mute');};
 }
 async function tick(){if(disposed||busy)return;busy=true;try{
 if(admin&&root.querySelector('#agent-available')?.checked)await checked(db.from('support_presence').upsert({agent_id:user.id,available:true,heartbeat:new Date().toISOString()}));
 if(!call||['ended','rejected'].includes(call.status)){const rows=await checked(db.from('support_calls').select('*').in('status',['ringing','accepted']).gt('updated_at',new Date(Date.now()-120000).toISOString()).order('created_at',{ascending:false}).limit(1));if(rows[0]){lastSignal=0;await show(rows[0]);}}
 if(!call||!['ringing','accepted'].includes(call.status))return;
 const current=await checked(db.from('support_calls').select('*').eq('id',call.id).single());if(current.status!==call.status)await show(current);
 if(!['ringing','accepted'].includes(current.status))return;
 await checked(db.rpc('set_support_call',{call_id:call.id,next_status:'heartbeat'}));
 if(current.status==='accepted'){
  if(!pc)await media();
  if(current.caller_id===user.id&&connectedCall!==call.id){connectedCall=call.id;await pc.setLocalDescription(await pc.createOffer());await signal('offer',pc.localDescription.toJSON());}
  const signals=await checked(db.from('call_signals').select('*').eq('call_id',call.id).gt('id',lastSignal).order('id').limit(100));
  for(const s of signals){lastSignal=s.id;if(s.sender_id===user.id)continue;if(s.kind==='offer'){await pc.setRemoteDescription(s.payload);await pc.setLocalDescription(await pc.createAnswer());await signal('answer',pc.localDescription.toJSON());}else if(s.kind==='answer')await pc.setRemoteDescription(s.payload);else pendingIce.push(s.payload);}
  if(pc.remoteDescription){for(const candidate of pendingIce)await pc.addIceCandidate(candidate);pendingIce=[];}
 }
 }catch(e){if(!disposed){notify(t('कल सेवा जाँच गर्दा समस्या भयो।','Unable to check calling service.'));if(call?.status==='accepted'){stopMedia();await db.rpc('set_support_call',{call_id:call.id,next_status:'ended'});}}}finally{busy=false;}}
 if(admin){root.querySelector('#agent-available').onchange=async e=>{await checked(db.from('support_presence').upsert({agent_id:user.id,available:e.target.checked,heartbeat:new Date().toISOString()}));};}
 else root.querySelector('#start-call').onclick=async e=>{e.target.disabled=true;try{const id=await checked(db.rpc('request_support_call'));lastSignal=0;await show(await checked(db.from('support_calls').select('*').eq('id',id).single()));}catch(err){notify(err.message==='SUPPORT_OFFLINE'?t('Support agent अहिले offline छन्।','Support agents are currently offline.'):t('कल उपलब्ध छैन।','Call unavailable.'));}finally{e.target.disabled=false;}};
 const timer=setInterval(tick,2500);await tick();
 cleanup=()=>{disposed=true;clearInterval(timer);stopMedia();if(call&&['ringing','accepted'].includes(call.status))db.rpc('set_support_call',{call_id:call.id,next_status:'ended'}).then(()=>{});if(admin)db.from('support_presence').upsert({agent_id:user.id,available:false,heartbeat:new Date().toISOString()}).then(()=>{});};
}
