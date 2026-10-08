create or replace function public.place_cod_order(items jsonb, delivery_address jsonb, expected_total numeric)
 returns uuid language plpgsql security definer set search_path=public as $$
declare entry jsonb; v public.variants; p public.products; oid uuid:=gen_random_uuid();
 seller uuid; computed_subtotal numeric:=0; charge numeric:=0; price numeric; qty integer;
begin
 if auth.uid() is null then raise exception 'SIGN_IN_REQUIRED'; end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 30 then raise exception 'INVALID_CART'; end if;
 if jsonb_typeof(delivery_address)<>'object' then raise exception 'INVALID_ADDRESS'; end if;
 if length(coalesce(delivery_address->>'name','')) not between 2 and 120
 or coalesce(delivery_address->>'phone','') !~ '^\+?[0-9]{7,15}$'
 or coalesce(delivery_address->>'province','')='' or coalesce(delivery_address->>'district','')=''
 or coalesce(delivery_address->>'municipality','')='' or coalesce(delivery_address->>'tole','')=''
 or coalesce(delivery_address->>'ward','') !~ '^[0-9]{1,2}$'
 then raise exception 'INVALID_ADDRESS'; end if;
 if (delivery_address->>'ward')::integer not between 1 and 35 then raise exception 'INVALID_ADDRESS'; end if;
 -- Stable lock order prevents two concurrent carts from deadlocking each other.
 for entry in select value from jsonb_array_elements(items) order by value->>'variant_id' loop
 qty:=(entry->>'quantity')::integer;
 if qty is null or qty not between 1 and 100 then raise exception 'INVALID_QUANTITY'; end if;
 select * into v from variants where id=(entry->>'variant_id')::uuid for update;
 if not found then raise exception 'VARIANT_NOT_FOUND'; end if;
 select * into p from products where id=v.product_id for share;
 if p.status<>'published' or p.method<>'checkout' or not p.cod_supported or not p.delivery_available
 or p.seller_id=auth.uid() or v.stock<qty then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 if seller is not null and seller<>p.seller_id then raise exception 'ONE_SELLER_PER_ORDER'; end if;
 seller:=p.seller_id; charge:=greatest(charge,p.delivery_charge);
 price:=case when p.offer_price is not null and (p.offer_start is null or p.offer_start<=now())
 and (p.offer_end is null or p.offer_end>now()) then p.offer_price else p.regular_price end;
 computed_subtotal:=computed_subtotal+price*qty;
 if not exists(select 1 from orders where id=oid) then
 insert into orders(id,buyer_id,seller_id,address,subtotal,delivery_charge)
 values(oid,auth.uid(),seller,delivery_address,0,0); end if;
 insert into order_items(order_id,product_id,variant_id,title,size,colour,quantity,unit_price)
 values(oid,p.id,v.id,p.title,v.size,v.colour,qty,price);
 update variants set stock=stock-qty where id=v.id;
 end loop;
 if expected_total is null or expected_total<>computed_subtotal+charge then raise exception 'PRICE_CHANGED'; end if;
 update orders set subtotal=computed_subtotal,delivery_charge=charge where id=oid;
 return oid;
end $$;
