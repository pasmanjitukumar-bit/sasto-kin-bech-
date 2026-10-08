insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,3145728,array['image/jpeg','image/png','image/webp']);
create policy product_image_read on storage.objects for select using(bucket_id='product-images');
create policy own_product_image_upload on storage.objects for insert to authenticated with check(
 bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.products where id::text=(storage.foldername(name))[2] and seller_id=auth.uid())
 and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);
create policy own_product_image_delete on storage.objects for delete to authenticated using(
 bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text
);
