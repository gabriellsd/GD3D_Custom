-- Correr se catalog:seed der "permission denied for table products"
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.products to postgres, service_role;
grant select on table public.products to anon;
grant select, insert, update, delete on table public.products to authenticated;
