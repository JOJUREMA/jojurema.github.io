-- ============================================================================
-- CUSSHMI · Fase 2 — Autenticación y roles
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query
-- Idempotente: se puede volver a correr sin duplicar nada.
-- ============================================================================

-- ── Catálogo de comisiones ──────────────────────────────────────────────
-- Espejo del objeto COMISIONES ya existente en el JS (branding/tema aparte,
-- acá solo lo necesario para que profiles.comision_id tenga a qué apuntar).
create table if not exists comisiones (
    id uuid primary key default gen_random_uuid(),
    clave text unique not null,
    nombre text not null,
    creado_en timestamptz not null default now()
);

insert into comisiones (clave, nombre) values
    ('POECHOS_PELADOS',  'Comisión de Usuarios del Subsector Hidráulico Poechos Pelados'),
    ('MIGUEL_CHECA',     'Comisión de Usuarios Miguel Checa'),
    ('DANIEL_ESCOBAR',   'Comisión de Usuarios Daniel Escobar'),
    ('CIENEGUILLO',      'Comisión de Usuarios Cieneguillo'),
    ('MARGEN_DERECHA',   'Comisión de Usuarios Margen Derecha'),
    ('MARGEN_IZQUIERDA', 'Comisión de Usuarios del Sub Sector Hidráulico Margen Izquierda'),
    ('EL_ARENAL',        'Comisión de Usuarios El Arenal')
on conflict (clave) do nothing;

-- ── Roles ────────────────────────────────────────────────────────────────
do $$
begin
    if not exists (select 1 from pg_type where typname = 'rol_usuario') then
        create type rol_usuario as enum ('admin', 'programador', 'consulta');
    end if;
end $$;

-- ── Perfiles (extiende auth.users con lo que el sistema necesita) ─────────
-- nombre_usuario = primerNombre.primerApellido, normalizado (ver auth.js).
-- Es lo que el programador escribe para entrar; el email real usado por
-- Supabase Auth por debajo es "{nombre_usuario}@cusshmi.local" (sintético,
-- nunca se envía correo ahí).
create table if not exists profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    primer_nombre text not null,
    primer_apellido text not null,
    nombre_usuario text unique not null,
    rol rol_usuario not null default 'consulta',
    comision_id uuid references comisiones(id),
    activo boolean not null default true,
    creado_en timestamptz not null default now()
);

-- ── Helper anti-recursión para políticas RLS ───────────────────────────────
-- Una policy en `profiles` que consulta `profiles` directamente entra en
-- recursión infinita. La forma correcta en Postgres/Supabase es envolver la
-- lectura del propio rol en una función `security definer`, que sí puede
-- leer la tabla sin volver a disparar RLS. Se reutiliza en todas las
-- políticas de las fases siguientes, no solo acá.
create or replace function public.rol_actual()
returns rol_usuario
language sql
security definer
stable
set search_path = public
as $$
    select rol from profiles where id = auth.uid();
$$;

create or replace function public.comision_actual()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
    select comision_id from profiles where id = auth.uid();
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table comisiones enable row level security;
alter table profiles enable row level security;

drop policy if exists comisiones_select_authenticated on comisiones;
create policy comisiones_select_authenticated on comisiones
    for select
    using (auth.role() = 'authenticated');

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
    for select
    using (id = auth.uid());

drop policy if exists profiles_select_admin on profiles;
create policy profiles_select_admin on profiles
    for select
    using (public.rol_actual() = 'admin');

-- Por ahora nadie puede insertar/editar profiles desde el cliente (anon/
-- authenticated): la alta de usuarios en esta fase es manual, vía SQL o
-- el Dashboard, por quien administra el proyecto. Se revisita si más
-- adelante se construye una pantalla de administración de usuarios.

-- ============================================================================
-- Alta de un usuario (plantilla — repetir por cada programador):
--
-- 1. Dashboard → Authentication → Users → "Add user"
--      Email:  nombre.apellido@cusshmi.local   (todo minúsculas, sin tildes)
--      Password: la que corresponda
--      Auto Confirm User: ✅ activado
--
-- 2. Copiar el UUID del usuario recién creado y correr:
--
--   insert into profiles (id, primer_nombre, primer_apellido, nombre_usuario, rol, comision_id)
--   values (
--       'UUID-DEL-USUARIO-DE-AUTH',
--       'Juan', 'Perez', 'juan.perez',
--       'programador',
--       (select id from comisiones where clave = 'MARGEN_IZQUIERDA')
--   );
-- ============================================================================
