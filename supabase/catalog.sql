-- GD3D Creative — catálogo na cloud (Opção B)
-- Correr no SQL Editor do Supabase APÓS supabase/setup.sql

-- Bucket público para imagens e modelos 3D
insert into storage.buckets (id, name, public, file_size_limit)
values ('product-assets', 'product-assets', true, 104857600)
on conflict (id) do update set public = true, file_size_limit = 104857600;

create table if not exists public.products (
  id bigint primary key,
  category text not null,
  subcategory text,
  slug text not null,
  name text not null,
  price numeric(10, 2) default 0,
  description text,
  icon text,
  tag text,
  sizes jsonb default '[]'::jsonb,
  featured boolean default false,
  featured_order int default 0,
  published boolean default true,
  preview_image text,
  preview_images jsonb default '[]'::jsonb,
  model_url text,
  model_glb_url text,
  model3mf_url text,
  colors jsonb default '[]'::jsonb,
  model_color text,
  model_rotation jsonb,
  model_facing double precision,
  model3mf_rotation jsonb,
  model3mf_facing double precision,
  card3mf_rotation jsonb,
  card3mf_facing double precision,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists products_path_unique
  on public.products (category, coalesce(subcategory, ''), slug);

create or replace function public.products_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute function public.products_set_updated_at();

alter table public.products enable row level security;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on table public.products to postgres, service_role;
grant select on table public.products to anon;
grant select, insert, update, delete on table public.products to authenticated;

drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products for select
  using (published = true);

drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all"
  on public.products for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Storage: leitura pública, escrita só admin
drop policy if exists "product_assets_public_read" on storage.objects;
create policy "product_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'product-assets');

drop policy if exists "product_assets_admin_insert" on storage.objects;
create policy "product_assets_admin_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'product-assets'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "product_assets_admin_update" on storage.objects;
create policy "product_assets_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'product-assets'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

drop policy if exists "product_assets_admin_delete" on storage.objects;
create policy "product_assets_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'product-assets'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
