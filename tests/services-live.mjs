import {createClient} from '@supabase/supabase-js';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),users=[],run=randomUUID(),password=randomUUID()+randomUUID();let product,shop,variant,call,banner,settings;const orders=[];
const ok=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
async function account(role){const email=`skb-services-${role}-${run}@example.invalid`,r=await ok(service.auth.admin.createUser({email,password,email_confirm:true}));users.push(r.user.id);const db=createClient(url,key,{auth:{persistSession:false}});await ok(db.auth.signInWithPassword({email,password}));return {id:r.user.id,db};}
try{
 settings=await ok(service.from('platform_settings').select('*').single());
 const seller=await account('seller'),buyer=await account('buyer'),agent=await account('admin'),other=await account('outsider');
 await ok(service.from('admins').insert({user_id:agent.id}));
 const anon=createClient(url,key,{auth:{persistSession:false}});
 assert.ok((await other.db.from('platform_settings').update({calls_enabled:true}).eq('id',true).select()).data?.length===0);
 await ok(agent.db.from('platform_settings').update({moderation_enabled:true}).eq('id',true));
 shop=await ok(seller.db.from('shops').insert({owner_id:seller.id,name:'TEST ONLY — services shop',contact_name:'Synthetic',phone:'9800000000',province:'Madhesh',district:'Mahottari',municipality:'Pipra',ward:5,tole:'TEST ONLY'}).select().single());
 product=await ok(seller.db.from('products').insert({seller_id:seller.id,shop_id:shop.id,title:'TEST ONLY — services product',category:'other',description:'Synthetic test fixture. Not a real item for sale.',condition:'new',regular_price:500,method:'checkout',status:'published',province:'Madhesh',district:'Mahottari',municipality:'Pipra',pickup_address:'TEST ONLY',delivery_available:true,delivery_charge:20,cod_supported:true}).select().single());
 variant=await ok(seller.db.from('variants').insert({product_id:product.id,size:'M',colour:'Green',stock:10}).select().single());
 assert.equal((await ok(anon.from('products').select('id').eq('id',product.id))).length,0);
 assert.ok((await seller.db.from('listing_reviews').insert({product_id:product.id,decision:'approved',reason:'Spoof attempt',reviewed_by:agent.id})).error);
 await ok(agent.db.from('listing_reviews').insert({product_id:product.id,decision:'approved',reason:'Synthetic QA review only',reviewed_by:agent.id}));
 assert.equal((await ok(anon.from('products').select('id').eq('id',product.id))).length,1);
 await ok(agent.db.from('shop_reviews').insert({shop_id:shop.id,reviewed_by:agent.id,verified:true,notes:'Synthetic QA review only'}));
 assert.ok((await seller.db.from('shop_reviews').update({verified:true}).eq('shop_id',shop.id).select()).data?.length===0);
 banner=await ok(agent.db.from('banners').insert({title_ne:'परीक्षण मात्र',title_en:'TEST ONLY',link:'#market'}).select().single());
 assert.ok((await agent.db.from('banners').insert({title_ne:'परीक्षण',title_en:'TEST ONLY',link:'https://attacker.example'})).error);
 console.log('PASS protected admin settings, moderation, review verification and safe banners');
 const address={name:'Synthetic buyer',phone:'9800000001',province:'Madhesh',district:'Mahottari',municipality:'Pipra',ward:'5',tole:'TEST ONLY'},cart={items:[{variant_id:variant.id,quantity:1}],delivery_address:address,expected_total:520};
 await ok(agent.db.from('account_controls').insert({user_id:seller.id,suspended:true,reason:'Synthetic test only',updated_by:agent.id}));
 assert.equal((await ok(anon.from('products').select('id').eq('id',product.id))).length,0);assert.ok((await buyer.db.rpc('place_cod_order',cart)).error);assert.ok((await seller.db.from('products').update({title:'Spoof write'}).eq('id',product.id)).error);
 await ok(agent.db.from('account_controls').update({suspended:false}).eq('user_id',seller.id));
 const cod=await ok(buyer.db.rpc('place_cod_order',cart));orders.push(cod);await ok(seller.db.rpc('update_order_status',{order_id:cod,next_status:'cancelled'}));
 assert.equal((await ok(seller.db.from('variants').select('stock').eq('id',variant.id).single())).stock,10);
 console.log('PASS suspension enforcement, checkout restrictions, COD cancellation stock restoration');
 await ok(service.from('platform_settings').update({online_payments_enabled:false}).eq('id',true));assert.ok((await buyer.db.rpc('reserve_online_order',{...cart,provider_name:'khalti'})).error);
 await ok(service.from('platform_settings').update({online_payments_enabled:true}).eq('id',true));
 const aid=await ok(buyer.db.rpc('reserve_online_order',{...cart,provider_name:'khalti'})),attempt=await ok(buyer.db.from('payment_attempts').select('*').eq('id',aid).single());orders.push(attempt.order_id);
 assert.equal((await ok(other.db.from('payment_attempts').select('*').eq('id',aid))).length,0);
 assert.ok((await seller.db.rpc('update_order_status',{order_id:attempt.order_id,next_status:'accepted'})).error);
 assert.ok((await buyer.db.rpc('confirm_online_payment',{attempt_id:aid,transaction_reference:'forged',verified_amount:520})).error);
 assert.ok((await service.rpc('confirm_online_payment',{attempt_id:aid,transaction_reference:'synthetic-'+run,verified_amount:1})).error);
 await ok(service.rpc('confirm_online_payment',{attempt_id:aid,transaction_reference:'synthetic-'+run,verified_amount:520}));await ok(service.rpc('confirm_online_payment',{attempt_id:aid,transaction_reference:'synthetic-'+run,verified_amount:520}));
 assert.equal((await ok(buyer.db.from('orders').select('payment_status').eq('id',attempt.order_id).single())).payment_status,'paid');
 await ok(seller.db.rpc('update_order_status',{order_id:attempt.order_id,next_status:'accepted'}));assert.ok((await seller.db.rpc('update_order_status',{order_id:attempt.order_id,next_status:'cancelled'})).error);
 const failed=await ok(buyer.db.rpc('reserve_online_order',{...cart,provider_name:'esewa'})),f=await ok(buyer.db.from('payment_attempts').select('*').eq('id',failed).single());orders.push(f.order_id);
 assert.ok((await buyer.db.rpc('release_failed_payment',{attempt_id:failed})).error);
 await ok(service.rpc('release_failed_payment',{attempt_id:failed}));await ok(service.rpc('release_failed_payment',{attempt_id:failed}));assert.equal((await ok(seller.db.from('variants').select('stock').eq('id',variant.id).single())).stock,9);
 console.log('PASS unpaid fulfilment blocked, private attempts, service-only confirmation, amount checks, idempotency and verified-failure stock release (synthetic, no gateway money moved)');
 await ok(service.from('platform_settings').update({calls_enabled:false}).eq('id',true));assert.ok((await buyer.db.rpc('request_support_call')).error);
 await ok(agent.db.from('platform_settings').update({calls_enabled:true}).eq('id',true));assert.ok((await buyer.db.rpc('request_support_call')).error);
 await ok(agent.db.from('support_presence').insert({agent_id:agent.id,available:true}));assert.ok((await other.db.from('support_presence').insert({agent_id:other.id,available:true})).error);
 const cid=await ok(buyer.db.rpc('request_support_call'));call=cid;
 assert.equal((await ok(other.db.from('support_calls').select('*').eq('id',cid))).length,0);assert.ok((await buyer.db.rpc('set_support_call',{call_id:cid,next_status:'accepted'})).error);
 await ok(agent.db.rpc('set_support_call',{call_id:cid,next_status:'accepted'}));
 await ok(buyer.db.from('call_signals').insert({call_id:cid,sender_id:buyer.id,kind:'offer',payload:{type:'offer',sdp:'synthetic signal only'}}));
 assert.equal((await ok(agent.db.from('call_signals').select('*').eq('call_id',cid))).length,1);assert.equal((await ok(other.db.from('call_signals').select('*').eq('call_id',cid))).length,0);
 assert.ok((await other.db.from('call_signals').insert({call_id:cid,sender_id:other.id,kind:'ice',payload:{candidate:'spoof'}})).error);
 await ok(agent.db.rpc('set_support_call',{call_id:cid,next_status:'ended'}));assert.ok((await agent.db.rpc('set_support_call',{call_id:cid,next_status:'accepted'})).error);
 assert.ok((await ok(agent.db.from('admin_audit').select('id').eq('actor',agent.id))).length>0);
 console.log('PASS private calling assignment, agent-only accept, participant-only signals, ended-call protection and admin audit');
 console.log('EXTENDED LIVE TESTS PASSED; audio/TURN and merchant gateway end-to-end still require configuration');
}finally{
 if(settings)await ok(service.from('platform_settings').update({moderation_enabled:settings.moderation_enabled,calls_enabled:settings.calls_enabled,online_payments_enabled:settings.online_payments_enabled}).eq('id',true));
 if(call)await ok(service.from('support_calls').delete().eq('id',call));
 for(const id of users){await ok(service.from('support_presence').delete().eq('agent_id',id));await ok(service.from('account_controls').delete().eq('user_id',id));await ok(service.from('admin_audit').delete().eq('actor',id));}
 for(const id of orders){await ok(service.from('payment_attempts').delete().eq('order_id',id));await ok(service.from('order_items').delete().eq('order_id',id));await ok(service.from('orders').delete().eq('id',id));}
 if(product){await ok(service.from('listing_reviews').delete().eq('product_id',product.id));await ok(service.from('products').delete().eq('id',product.id));}
 if(shop){await ok(service.from('shop_reviews').delete().eq('shop_id',shop.id));await ok(service.from('shops').delete().eq('id',shop.id));}
 if(banner)await ok(service.from('banners').delete().eq('id',banner.id));
 for(const id of users){await ok(service.from('admins').delete().eq('user_id',id));await ok(service.auth.admin.deleteUser(id));}
 console.log('PASS synthetic fixtures removed and platform settings restored');
}
