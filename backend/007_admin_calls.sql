begin;
create table public.platform_settings(id boolean primary key default true check(id),moderation_enabled boolean not null default false,calls_enabled boolean not null default false);
insert into public.platform_settings(id) values(true);
alter table public.platform_settings enable row level security;
create policy settings_read on public.platform_settings for select using(true);
create policy settings_admin on public.platform_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());
create table public.categories(id text primary key check(id ~ '^[a-z][a-z0-9-]{1,40}$'),name_ne text not null check(length(name_ne) between 1 and 80),name_en text not null check(length(name_en) between 1 and 80),enabled boolean not null default true);
insert into public.categories(id,name_ne,name_en) values('clothing','कपडा','Clothing'),('electronics','इलेक्ट्रोनिक्स','Electronics'),('phones','मोबाइल','Phones'),('home','घरायसी सामान','Household'),('beauty','सौन्दर्य','Beauty'),('groceries','खाद्यान्न','Groceries'),('footwear','जुत्ता','Footwear'),('accessories','सहायक सामान','Accessories'),('other','अन्य','Other');
alter table public.categories enable row level security;
create policy category_read on public.categories for select using(true);
create policy category_admin on public.categories for all to authenticated using(public.is_admin()) with check(public.is_admin());
alter table public.products drop constraint products_category_check;
alter table public.products add foreign key(category) references public.categories(id);
create table public.banners(id uuid primary key default gen_random_uuid(),title_ne text not null check(length(title_ne) between 1 and 180),title_en text not null check(length(title_en) between 1 and 180),link text not null check(link ~ '^#market(/[a-z0-9/-]*)?$'),active boolean not null default true);
alter table public.banners enable row level security;
create policy banner_read on public.banners for select using(active or public.is_admin());
create policy banner_admin on public.banners for all to authenticated using(public.is_admin()) with check(public.is_admin());
create table public.listing_reviews(product_id uuid primary key references public.products(id),decision text not null check(decision in ('approved','rejected')),reason text not null check(length(reason) between 3 and 2000),reviewed_by uuid not null references public.admins(user_id),reviewed_at timestamptz not null default now());
alter table public.listing_reviews enable row level security;
create policy listing_review_read on public.listing_reviews for select to authenticated using(public.is_admin() or exists(select 1 from products where id=product_id and seller_id=auth.uid()));
create policy listing_review_admin on public.listing_reviews for all to authenticated using(public.is_admin()) with check(public.is_admin() and reviewed_by=auth.uid());
create function public.listing_approved(pid uuid) returns boolean language sql stable security definer set search_path=public as $$select not (select moderation_enabled from platform_settings where id) or exists(select 1 from listing_reviews where product_id=pid and decision='approved')$$;
drop policy view_products on public.products;
create policy view_products on public.products for select using((status='published' and not public.account_suspended(seller_id) and public.listing_approved(id)) or seller_id=auth.uid() or public.is_admin());
create function public.guard_seller_write() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() and public.account_suspended(auth.uid()) then raise exception 'ACCOUNT_SUSPENDED'; end if;
 if tg_table_name='products' and not public.is_admin() then
  if tg_op='UPDATE' then delete from listing_reviews where product_id=new.id; end if;
 end if;
 return new;
end $$;
create trigger product_suspension_guard before insert or update on public.products for each row execute function public.guard_seller_write();
create trigger shop_suspension_guard before insert or update on public.shops for each row execute function public.guard_seller_write();
create trigger message_suspension_guard before insert on public.messages for each row execute function public.guard_seller_write();
create table public.admin_audit(id bigint generated always as identity primary key,actor uuid not null,entity text not null,operation text not null,record_id text not null,created_at timestamptz not null default now());
alter table public.admin_audit enable row level security;
create policy audit_admin_read on public.admin_audit for select to authenticated using(public.is_admin());
create function public.audit_admin_change() returns trigger language plpgsql security definer set search_path=public as $$
begin if public.is_admin() then insert into admin_audit(actor,entity,operation,record_id) values(auth.uid(),tg_table_name,tg_op,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'user_id',to_jsonb(new)->>'product_id',to_jsonb(new)->>'shop_id','settings')); end if; return new; end $$;
create trigger audit_controls after insert or update on public.account_controls for each row execute function public.audit_admin_change();
create trigger audit_settings after update on public.platform_settings for each row execute function public.audit_admin_change();
create trigger audit_reviews after insert or update on public.listing_reviews for each row execute function public.audit_admin_change();
create trigger audit_verification after insert or update on public.shop_reviews for each row execute function public.audit_admin_change();
create trigger audit_products after update on public.products for each row execute function public.audit_admin_change();
create trigger audit_categories after insert or update on public.categories for each row execute function public.audit_admin_change();
create trigger audit_banners after insert or update on public.banners for each row execute function public.audit_admin_change();
create table public.support_presence(agent_id uuid primary key references public.admins(user_id),available boolean not null default false,heartbeat timestamptz not null default now());
alter table public.support_presence enable row level security;
create policy own_agent on public.support_presence for all to authenticated using(agent_id=auth.uid() and public.is_admin()) with check(agent_id=auth.uid() and public.is_admin());
create table public.support_calls(id uuid primary key default gen_random_uuid(),caller_id uuid not null references public.profiles(id),agent_id uuid references public.admins(user_id),status text not null default 'ringing' check(status in ('ringing','accepted','rejected','ended')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(caller_id<>agent_id));
alter table public.support_calls enable row level security;
create policy call_read on public.support_calls for select to authenticated using(auth.uid() in (caller_id,agent_id));
revoke insert,update,delete on public.support_calls from anon,authenticated;
create function public.request_support_call() returns uuid language plpgsql security definer set search_path=public as $$
declare agent uuid; cid uuid;
begin
 if auth.uid() is null or public.account_suspended(auth.uid()) then raise exception 'SIGN_IN_REQUIRED'; end if;
 if not (select calls_enabled from platform_settings where id) then raise exception 'CALL_UNAVAILABLE'; end if;
 if exists(select 1 from support_calls where caller_id=auth.uid() and status in ('ringing','accepted') and updated_at>now()-interval '2 minutes') then raise exception 'CALL_ALREADY_ACTIVE'; end if;
 if (select count(*) from support_calls where caller_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'CALL_RATE_LIMIT'; end if;
 select agent_id into agent from support_presence p where available and heartbeat>now()-interval '45 seconds' and agent_id<>auth.uid() and not exists(select 1 from support_calls c where c.agent_id=p.agent_id and c.status in ('ringing','accepted') and c.updated_at>now()-interval '2 minutes') order by heartbeat desc for update skip locked limit 1;
 if agent is null then raise exception 'SUPPORT_OFFLINE'; end if;
 insert into support_calls(caller_id,agent_id) values(auth.uid(),agent) returning id into cid; return cid;
end $$;
create function public.set_support_call(call_id uuid,next_status text) returns void language plpgsql security definer set search_path=public as $$
declare c support_calls;
begin
 select * into c from support_calls where id=call_id for update;
 if auth.uid() is null or not found or auth.uid() not in (c.caller_id,c.agent_id) then raise exception 'CALL_ACCESS_DENIED'; end if;
 if next_status='heartbeat' and c.status in ('ringing','accepted') then update support_calls set updated_at=now() where id=c.id; return; end if;
 if not ((next_status='accepted' and c.status='ringing' and auth.uid()=c.agent_id) or (next_status='rejected' and c.status='ringing' and auth.uid()=c.agent_id) or (next_status='ended' and c.status in ('ringing','accepted'))) then raise exception 'INVALID_CALL_TRANSITION'; end if;
 update support_calls set status=next_status,updated_at=now() where id=c.id;
end $$;
revoke all on function public.request_support_call(),public.set_support_call(uuid,text) from public;
grant execute on function public.request_support_call(),public.set_support_call(uuid,text) to authenticated;
create table public.call_signals(id bigint generated always as identity primary key,call_id uuid not null references public.support_calls(id) on delete cascade,sender_id uuid not null references public.profiles(id),kind text not null check(kind in ('offer','answer','ice')),payload jsonb not null check(octet_length(payload::text)<20000),created_at timestamptz not null default now());
alter table public.call_signals enable row level security;
create policy signals_read on public.call_signals for select to authenticated using(exists(select 1 from support_calls c where c.id=call_id and auth.uid() in(c.caller_id,c.agent_id)));
create policy signals_send on public.call_signals for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from support_calls c where c.id=call_id and c.status='accepted' and c.updated_at>now()-interval '2 minutes' and ((kind='offer' and auth.uid()=c.caller_id) or(kind='answer' and auth.uid()=c.agent_id) or(kind='ice' and auth.uid() in(c.caller_id,c.agent_id)))));
create function public.limit_signals() returns trigger language plpgsql security definer set search_path=public as $$begin if (select count(*) from call_signals where call_id=new.call_id)>=500 then raise exception 'SIGNAL_LIMIT'; end if; return new; end $$;
create trigger signal_limit before insert on public.call_signals for each row execute function public.limit_signals();
commit;
