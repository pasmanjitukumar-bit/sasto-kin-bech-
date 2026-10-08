create table public.messages (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
 buyer_id uuid not null references public.profiles(id), seller_id uuid not null references public.profiles(id),
 sender_id uuid not null references public.profiles(id), body text not null check(length(body) between 1 and 2000),
 created_at timestamptz not null default now(), check(buyer_id<>seller_id)
);
alter table public.messages enable row level security;
create policy read_own_messages on public.messages for select to authenticated using(auth.uid() in (buyer_id,seller_id));
create policy send_own_messages on public.messages for insert to authenticated with check(
 sender_id=auth.uid() and auth.uid() in (buyer_id,seller_id)
 and exists(select 1 from public.products where id=product_id and products.seller_id=messages.seller_id)
);
create function public.limit_message_spam() returns trigger language plpgsql security definer set search_path=public as $$
begin if (select count(*) from messages where sender_id=new.sender_id and created_at>now()-interval '1 hour')>=60
then raise exception 'MESSAGE_RATE_LIMIT'; end if; return new; end $$;
create trigger message_rate_limit before insert on public.messages for each row execute function public.limit_message_spam();
create table public.reviews (
 id uuid primary key default gen_random_uuid(), order_item_id uuid not null unique references public.order_items(id),
 buyer_id uuid not null references public.profiles(id), product_id uuid not null references public.products(id),
 rating integer not null check(rating between 1 and 5), body text not null check(length(body) between 3 and 2000),
 created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
create policy read_reviews on public.reviews for select using(true);
create policy purchased_reviews on public.reviews for insert to authenticated with check(
 buyer_id=auth.uid() and exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
 where i.id=order_item_id and i.product_id=reviews.product_id and o.buyer_id=auth.uid() and o.status='delivered')
);
create table public.account_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 request_type text not null check(request_type in ('deletion','complaint','return')),
 body text not null check(length(body) between 10 and 3000), status text not null default 'open' check(status in ('open','reviewed','resolved')),
 created_at timestamptz not null default now()
);
alter table public.account_requests enable row level security;
create policy request_submit on public.account_requests for insert to authenticated with check(user_id=auth.uid());
create policy request_view on public.account_requests for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy request_manage on public.account_requests for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_product_manage on public.products for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_shop_manage on public.shops for update to authenticated using(public.is_admin()) with check(public.is_admin());
