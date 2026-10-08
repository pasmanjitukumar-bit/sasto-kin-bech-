begin;
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check(payment_method in ('cod','esewa','khalti'));
alter table public.orders add column payment_status text not null default 'unpaid' check(payment_status in ('unpaid','pending','paid','refund_required'));
create table public.account_controls(user_id uuid primary key references public.profiles(id), suspended boolean not null default false, reason text not null check(length(reason) between 3 and 2000), updated_by uuid not null references public.admins(user_id), updated_at timestamptz not null default now());
alter table public.account_controls enable row level security;
create policy controls_read on public.account_controls for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy controls_manage on public.account_controls for all to authenticated using(public.is_admin()) with check(public.is_admin() and updated_by=auth.uid());
create function public.account_suspended(uid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from account_controls where user_id=uid and suspended) $$;
create table public.payment_attempts(id uuid primary key default gen_random_uuid(),order_id uuid not null unique references public.orders(id),buyer_id uuid not null references public.profiles(id),provider text not null check(provider in ('esewa','khalti')),amount numeric(12,2) not null check(amount>0),provider_reference text,transaction_reference text unique,status text not null default 'created' check(status in ('created','initiated','paid')),created_at timestamptz not null default now(),verified_at timestamptz);
alter table public.payment_attempts enable row level security;
create policy payment_read on public.payment_attempts for select to authenticated using(buyer_id=auth.uid() or public.is_admin());
revoke insert,update,delete on public.payment_attempts from anon,authenticated;
create or replace function public.place_order_core(items jsonb, delivery_address jsonb, expected_total numeric, pay_method text)
 returns uuid language plpgsql security definer set search_path=public as $$
declare entry jsonb; v public.variants; p public.products; oid uuid:=gen_random_uuid();
 seller uuid; computed_subtotal numeric:=0; charge numeric:=0; price numeric; qty integer;
begin
 if auth.uid() is null then raise exception 'SIGN_IN_REQUIRED'; end if;
 if public.account_suspended(auth.uid()) then raise exception 'ACCOUNT_SUSPENDED'; end if;
 if pay_method not in ('cod','esewa','khalti') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
 if (select count(*) from orders where buyer_id=auth.uid() and created_at>now()-interval '1 hour')>=15 then raise exception 'ORDER_RATE_LIMIT'; end if;
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
 if p.status<>'published' or p.method<>'checkout' or (pay_method='cod' and not p.cod_supported) or not p.delivery_available
 or p.seller_id=auth.uid() or v.stock<qty then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 if seller is not null and seller<>p.seller_id then raise exception 'ONE_SELLER_PER_ORDER'; end if;
 seller:=p.seller_id; charge:=greatest(charge,p.delivery_charge);
 price:=case when p.offer_price is not null and (p.offer_start is null or p.offer_start<=now())
 and (p.offer_end is null or p.offer_end>now()) then p.offer_price else p.regular_price end;
 computed_subtotal:=computed_subtotal+price*qty;
 if not exists(select 1 from orders where id=oid) then
 insert into orders(id,buyer_id,seller_id,address,subtotal,delivery_charge,payment_method,payment_status)
 values(oid,auth.uid(),seller,delivery_address,0,0,pay_method,case when pay_method='cod' then 'unpaid' else 'pending' end); end if;
 insert into order_items(order_id,product_id,variant_id,title,size,colour,quantity,unit_price)
 values(oid,p.id,v.id,p.title,v.size,v.colour,qty,price);
 update variants set stock=stock-qty where id=v.id;
 end loop;
 if expected_total is null or expected_total<>computed_subtotal+charge then raise exception 'PRICE_CHANGED'; end if;
 update orders set subtotal=computed_subtotal,delivery_charge=charge where id=oid;
 return oid;
end $$;


revoke all on function public.place_order_core(jsonb,jsonb,numeric,text) from public,anon,authenticated;
create or replace function public.place_cod_order(items jsonb,delivery_address jsonb,expected_total numeric) returns uuid language sql security definer set search_path=public as $$ select public.place_order_core(items,delivery_address,expected_total,'cod') $$;
create function public.reserve_online_order(items jsonb,delivery_address jsonb,expected_total numeric,provider_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid; aid uuid;
begin
 if provider_name not in ('esewa','khalti') then raise exception 'INVALID_PROVIDER'; end if;
 oid:=public.place_order_core(items,delivery_address,expected_total,provider_name);
 insert into payment_attempts(order_id,buyer_id,provider,amount) values(oid,auth.uid(),provider_name,expected_total) returning id into aid;
 return aid;
end $$;
revoke all on function public.reserve_online_order(jsonb,jsonb,numeric,text) from public;
grant execute on function public.reserve_online_order(jsonb,jsonb,numeric,text) to authenticated;
create function public.confirm_online_payment(attempt_id uuid,transaction_reference text,verified_amount numeric) returns void language plpgsql security definer set search_path=public as $$
declare a public.payment_attempts; o public.orders;
begin
 select * into a from payment_attempts where id=attempt_id for update;
 if not found or a.amount<>verified_amount or length(coalesce(transaction_reference,''))<1 then raise exception 'PAYMENT_MISMATCH'; end if;
 if a.status='paid' then return; end if;
 select * into o from orders where id=a.order_id for update;
 update payment_attempts set status='paid',transaction_reference=confirm_online_payment.transaction_reference,verified_at=now() where id=a.id;
 update orders set payment_status=case when o.status='cancelled' then 'refund_required' else 'paid' end where id=o.id;
end $$;
revoke all on function public.confirm_online_payment(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.confirm_online_payment(uuid,text,numeric) to service_role;
-- Fulfilment can never proceed while an online payment awaits verification.
create function public.guard_order_payment() returns trigger language plpgsql set search_path=public as $$
begin
 if new.payment_method<>'cod' and new.status in ('accepted','shipped','delivered') and new.payment_status<>'paid' then raise exception 'PAYMENT_NOT_VERIFIED'; end if;
 if old.payment_method<>'cod' and new.status='cancelled' and old.status<>'cancelled' then raise exception 'ONLINE_CANCELLATION_REQUIRES_RECONCILIATION'; end if;
 return new;
end $$;
create trigger payment_fulfilment_guard before update on public.orders for each row execute function public.guard_order_payment();
commit;

