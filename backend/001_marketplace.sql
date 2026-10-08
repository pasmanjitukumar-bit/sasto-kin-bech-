-- Initial Supabase/PostgreSQL migration. Run in a new project only.
-- Requires Supabase Auth. No demonstration users, products or sales are inserted.
begin;
create extension if not exists pgcrypto;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check (length(display_name)<=120),
 phone text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
 language text not null default 'ne' check (language in ('ne','en')),
 created_at timestamptz not null default now()
);
create table public.admins (user_id uuid primary key references public.profiles(id));
create function public.is_admin() returns boolean language sql stable security definer
 set search_path=public as $$ select exists(select 1 from admins where user_id=auth.uid()) $$;
create function public.initialize_profile() returns trigger language plpgsql security definer
 set search_path=public as $$ begin insert into profiles(id) values(new.id); return new; end $$;
create trigger create_profile after insert on auth.users for each row execute function public.initialize_profile();

create table public.shops (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 name text not null check (length(name) between 2 and 120),
 description text not null default '' check (length(description)<=5000),
 contact_name text not null, phone text not null check(phone ~ '^\+?[0-9]{7,15}$'),
 whatsapp text check(whatsapp is null or whatsapp ~ '^\+?[0-9]{7,15}$'),
 province text not null, district text not null, municipality text not null,
 ward integer not null check(ward between 1 and 35), tole text not null,
 landmark text not null default '', logo_path text, cover_path text,
 opening_hours text not null default '', delivery_areas text not null default '',
 return_policy text not null default '', created_at timestamptz not null default now()
);
-- Verification is held separately: sellers cannot grant their own badge.
create table public.shop_reviews (
 shop_id uuid primary key references public.shops(id),
 reviewed_by uuid not null references public.admins(user_id),
 verified boolean not null default false, reviewed_at timestamptz not null default now()
);
create table public.products (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles(id),
 shop_id uuid references public.shops(id), title text not null check(length(title) between 3 and 180),
 category text not null check(category in ('clothing','electronics','phones','home','beauty','groceries','footwear','accessories','other')),
 description text not null check(length(description) between 10 and 10000),
 condition text not null check(condition in ('new','used')),
 regular_price numeric(12,2) not null check(regular_price>0),
 offer_price numeric(12,2), offer_start timestamptz, offer_end timestamptz,
 method text not null check(method in ('checkout','contact')),
 status text not null default 'draft' check(status in ('draft','published','paused','sold-out')),
 province text not null, district text not null, municipality text not null, pickup_address text not null,
 delivery_available boolean not null default false,
 delivery_charge numeric(12,2) not null default 0 check(delivery_charge>=0),
 cod_supported boolean not null default false, return_policy text not null default '',
 created_at timestamptz not null default now(),
 check(offer_price is null or (offer_price>0 and offer_price<regular_price)),
 check(offer_end is null or offer_start is null or offer_end>offer_start),
 check(method<>'checkout' or shop_id is not null)
);
create table public.variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 size text not null default '', colour text not null default '',
 stock integer not null check(stock>=0), unique(product_id,size,colour)
);
create table public.product_photos (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
 storage_path text not null, position integer not null check(position between 0 and 9),
 unique(product_id,position)
);
create table public.favourites (
 user_id uuid references public.profiles(id) on delete cascade,
 product_id uuid references public.products(id) on delete cascade,
 primary key(user_id,product_id)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.profiles(id),
 seller_id uuid not null references public.profiles(id),
 address jsonb not null, subtotal numeric(12,2) not null check(subtotal>=0),
 delivery_charge numeric(12,2) not null check(delivery_charge>=0),
 total numeric(12,2) generated always as (subtotal+delivery_charge) stored,
 payment_method text not null default 'cod' check(payment_method='cod'),
 status text not null default 'pending' check(status in ('pending','accepted','shipped','delivered','cancelled')),
 created_at timestamptz not null default now()
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
 product_id uuid not null references public.products(id), variant_id uuid not null references public.variants(id),
 title text not null, size text not null, colour text not null,
 quantity integer not null check(quantity between 1 and 100), unit_price numeric(12,2) not null check(unit_price>0)
);
create table public.reports (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 product_id uuid not null references public.products(id), reason text not null check(length(reason) between 10 and 2000),
 created_at timestamptz not null default now()
);
create index products_search on public.products(category,district,status);
create index orders_buyer on public.orders(buyer_id,created_at desc);
create index orders_seller on public.orders(seller_id,created_at desc);

-- A listing must belong to its shop owner, including when ownership fields change.
create function public.validate_shop_owner() returns trigger language plpgsql set search_path=public as $$
begin
 if new.shop_id is not null and not exists(select 1 from shops where id=new.shop_id and owner_id=new.seller_id)
 then raise exception 'SHOP_OWNERSHIP_REQUIRED'; end if; return new;
end $$;
create trigger enforce_shop_owner before insert or update on public.products
 for each row execute function public.validate_shop_owner();

-- Single seller, atomic COD checkout; prices and totals always come from the database.
-- The client supplies a displayed expected total to detect price/offer changes.
create function public.place_cod_order(items jsonb, delivery_address jsonb, expected_total numeric)
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
revoke all on function public.place_cod_order(jsonb,jsonb,numeric) from public;
grant execute on function public.place_cod_order(jsonb,jsonb,numeric) to authenticated;

-- Default deny for every table. Ownership checks apply to both old and new rows.
alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.shops enable row level security;
alter table public.shop_reviews enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.product_photos enable row level security;
alter table public.favourites enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reports enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy edit_profile on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy read_admin_role on public.admins for select to authenticated using(user_id=auth.uid());
create policy view_shops on public.shops for select using(true);
create policy own_shops on public.shops for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy read_verification on public.shop_reviews for select using(true);
create policy review_shop on public.shop_reviews for all to authenticated using(public.is_admin()) with check(public.is_admin() and reviewed_by=auth.uid());
create policy view_products on public.products for select using(status='published' or seller_id=auth.uid() or public.is_admin());
create policy own_products on public.products for all to authenticated using(seller_id=auth.uid()) with check(seller_id=auth.uid());
create policy view_variants on public.variants for select using(exists(select 1 from products where id=product_id));
create policy own_variants on public.variants for all to authenticated
 using(exists(select 1 from products where id=product_id and seller_id=auth.uid()))
 with check(exists(select 1 from products where id=product_id and seller_id=auth.uid()));
create policy view_photos on public.product_photos for select using(exists(select 1 from products where id=product_id));
create policy own_photos on public.product_photos for all to authenticated
 using(exists(select 1 from products where id=product_id and seller_id=auth.uid()))
 with check(exists(select 1 from products where id=product_id and seller_id=auth.uid()));
create policy own_favourites on public.favourites for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy authorized_orders on public.orders for select to authenticated using(buyer_id=auth.uid() or seller_id=auth.uid() or public.is_admin());
create policy authorized_items on public.order_items for select to authenticated
 using(exists(select 1 from orders where id=order_id and (buyer_id=auth.uid() or seller_id=auth.uid() or public.is_admin())));
create policy submit_report on public.reports for insert to authenticated with check(user_id=auth.uid());
create policy view_reports on public.reports for select to authenticated using(user_id=auth.uid() or public.is_admin());
-- All writes to orders must go through validated RPCs, never direct browser updates.
revoke insert,update,delete on public.orders,public.order_items from anon,authenticated;
revoke insert,update,delete on public.admins from anon,authenticated;
commit;
