-- GD3D Creative — configurar Supabase Auth
-- SQL Editor → New query → Run
--
-- Se a secção 1 der erro de permissão, ignore-a: o site já trata
-- utilizadores sem papel como "client". Use só a secção 2 para admin.

-- ---------------------------------------------------------------------------
-- 1) (Opcional) Papel "client" automático em novos registos
-- ---------------------------------------------------------------------------
create or replace function public.gd3d_assign_client_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"client"}'::jsonb
  where id = new.id
    and coalesce(raw_app_meta_data->>'role', '') = '';
  return new;
end;
$$;

drop trigger if exists gd3d_assign_client_role_trigger on auth.users;
create trigger gd3d_assign_client_role_trigger
  after insert on auth.users
  for each row execute function public.gd3d_assign_client_role();

-- ---------------------------------------------------------------------------
-- 2) Promover administrador — substitua o email e corra só esta parte
-- ---------------------------------------------------------------------------
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'teu@email.com';

-- ---------------------------------------------------------------------------
-- 3) Nome no site (opcional)
-- ---------------------------------------------------------------------------
-- update auth.users
-- set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"name":"Gabriel"}'::jsonb
-- where email = 'teu@email.com';
