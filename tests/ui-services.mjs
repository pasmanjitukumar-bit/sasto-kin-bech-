import {createClient} from '@supabase/supabase-js';import fs from 'node:fs/promises';
const accounts=JSON.parse(await fs.readFile('test-credentials.local.json','utf8')),db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function ok(p){const r=await p;if(r.error)throw Error(r.error.message);return r.data;}
await ok(db.from('admins').insert({user_id:accounts.retailer.id}));
const shop=await ok(db.from('shops').insert({owner_id:accounts.retailer.id,name:'TEST ONLY — payment UI shop',contact_name:'Synthetic retailer',phone:'9800000000',province:'Madhesh',district:'Mahottari',municipality:'Pipra',ward:5,tole:'TEST ONLY'}).select().single());
const product=await ok(db.from('products').insert({seller_id:accounts.retailer.id,shop_id:shop.id,title:'TEST ONLY — payment UI product',category:'other',description:'Synthetic browser fixture. Not a real product for sale.',condition:'new',regular_price:500,method:'checkout',status:'published',province:'Madhesh',district:'Mahottari',municipality:'Pipra',pickup_address:'TEST ONLY',delivery_available:true,delivery_charge:20,cod_supported:true}).select().single());
await ok(db.from('variants').insert({product_id:product.id,size:'M',colour:'Green',stock:3}));
console.log('PASS temporary admin and product prepared for browser checks');
