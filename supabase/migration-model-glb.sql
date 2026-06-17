-- Opcional: executar no SQL Editor se a tabela products já existir.
alter table public.products
  add column if not exists model_glb_url text;
