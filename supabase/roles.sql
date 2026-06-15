-- GD3D Creative — papéis de utilizador no Supabase Auth
-- Correr no SQL Editor do painel Supabase (após criar utilizadores em Authentication → Users)

-- Definir administrador (substitua o email):
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'admin@gd3d.com';

-- Definir cliente (substitua o email):
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"client"}'::jsonb
-- where email = 'cliente@example.com';

-- Nome apresentado no site (opcional, user_metadata):
-- update auth.users
-- set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"name":"Gabriel"}'::jsonb
-- where email = 'admin@gd3d.com';
