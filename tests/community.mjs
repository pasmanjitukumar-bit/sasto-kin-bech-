import {createClient} from '@supabase/supabase-js';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const a=JSON.parse(await fs.readFile('test-credentials.local.json','utf8')),url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),retailer=createClient(url,key,{auth:{persistSession:false}}),buyer=createClient(url,key,{auth:{persistSession:false}});
async function ok(p){const r=await p;if(r.error)throw Error(r.error.message);return r.data;}
await ok(retailer.auth.signInWithPassword(a.retailer));await ok(buyer.auth.signInWithPassword(a.buyer));
const p=await ok(retailer.from('products').select('*').eq('seller_id',a.retailer.id).single());
await ok(buyer.from('favourites').upsert({user_id:a.buyer.id,product_id:p.id}));assert.equal((await ok(retailer.from('favourites').select('*').eq('user_id',a.buyer.id))).length,0);console.log('PASS favourite persistence and ownership');
await ok(buyer.from('messages').insert({product_id:p.id,buyer_id:a.buyer.id,seller_id:a.retailer.id,sender_id:a.buyer.id,body:'TEST ONLY — buyer inquiry'}));const messages=await ok(retailer.from('messages').select('*').eq('product_id',p.id));assert.ok(messages.length);console.log('PASS buyer inquiry and seller inbox');
const order=await ok(buyer.from('orders').select('*,order_items(*)').eq('buyer_id',a.buyer.id).single());assert.equal(order.status,'delivered');
await ok(buyer.from('reviews').insert({order_item_id:order.order_items[0].id,buyer_id:a.buyer.id,product_id:p.id,rating:5,body:'TEST ONLY — purchase review'}));
assert.ok((await retailer.from('reviews').insert({order_item_id:order.order_items[0].id,buyer_id:a.retailer.id,product_id:p.id,rating:5,body:'TEST ONLY — unauthorized review'})).error);console.log('PASS purchase-only review enforcement');
assert.equal(await ok(retailer.rpc('is_admin')),false);await ok(service.from('admins').insert({user_id:a.retailer.id}));assert.equal(await ok(retailer.rpc('is_admin')),true);console.log('PASS controlled synthetic admin role; ready for UI verification');
