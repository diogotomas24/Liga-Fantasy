-- Ejecuta esto en Supabase: Panel del proyecto → SQL Editor → New query → pega
-- todo esto → Run. Es seguro ejecutarlo varias veces (no borra nada si ya existe).

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- De momento dejamos la tabla "abierta" (cualquiera con la clave publishable
-- puede leer y escribir) a propósito, para poder terminar de montar la app
-- sin líos de permisos. La cerramos de verdad en el paso de login/seguridad.
alter table kv_store enable row level security;

drop policy if exists "kv_store abierta temporalmente" on kv_store;
create policy "kv_store abierta temporalmente"
  on kv_store
  for all
  using (true)
  with check (true);
