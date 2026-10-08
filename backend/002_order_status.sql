-- Run after 001_marketplace.sql.
create function public.update_order_status(order_id uuid, next_status text)
returns void language plpgsql security definer set search_path=public as $$
declare o public.orders; item public.order_items;
begin
 select * into o from orders where id=order_id for update;
 if not found or auth.uid() is null or (o.seller_id<>auth.uid() and not public.is_admin())
 then raise exception 'ORDER_ACCESS_DENIED'; end if;
 if not ((o.status='pending' and next_status in ('accepted','cancelled'))
 or (o.status='accepted' and next_status in ('shipped','cancelled'))
 or (o.status='shipped' and next_status='delivered')) then raise exception 'INVALID_STATUS_TRANSITION'; end if;
 if next_status='cancelled' then
 for item in select * from order_items where order_items.order_id=o.id order by variant_id loop
 update variants set stock=stock+item.quantity where id=item.variant_id;
 end loop; end if;
 update orders set status=next_status where id=o.id;
end $$;
revoke all on function public.update_order_status(uuid,text) from public;
grant execute on function public.update_order_status(uuid,text) to authenticated;
