-- ============================================================================
-- CUSSHMI · Fase 2 PWA (móvil) — Padrón de usuarios sincronizado
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Hasta ahora el padrón completo (nombre, deuda desglosada, cultivos,
-- unidad catastral) solo vivía en la memoria del navegador de escritorio
-- tras cada carga de Excel (tomasData[toma]) — nunca se guardaba acá, así
-- que no había forma de consultarlo desde otro dispositivo. Esta tabla es
-- el destino de esa sincronización (botón "Sincronizar Padrón" en
-- escritorio, ver sincronizarPadronASupabase() en Sistema_Riego_CUSSHMI_14.html),
-- y la fuente de la búsqueda del módulo "Condición del Usuario" en el móvil.
--
-- `cultivos` guarda el arreglo [{cultivo, area}, ...] que ya arma
-- obtenerParesCultivoAreaUsuario() en assets/core/clasificacion.js — esa
-- función ya normaliza el formato clásico (cultivo1/area1/cultivo2/area2)
-- y el extendido de Cieneguillo (cultivo1..10/area1..10) al mismo arreglo,
-- así que no hace falta lógica nueva acá para esa diferencia entre
-- comisiones.
-- ============================================================================

create table if not exists padron_usuarios (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text not null,
    nombre text not null,
    unidad_catastral text,
    tipo_riego text,
    cultivos jsonb not null default '[]'::jsonb,
    deuda_campana numeric not null default 0,
    deuda_atrasada numeric not null default 0,
    deuda_convenio numeric not null default 0,
    deuda_total numeric not null default 0,
    al_dia boolean,
    debito numeric,
    celular text,
    actualizado_por uuid references profiles(id),
    actualizado_en timestamptz not null default now(),
    unique (comision_id, toma_nombre, nombre, unidad_catastral)
);

create index if not exists idx_padron_comision_nombre on padron_usuarios (comision_id, nombre);

-- ============================================================================
-- RLS — mismo criterio que programaciones_semanales (003_modelo_datos.sql):
--   admin           → acceso total
--   programador     → lectura y escritura, solo de su propia comisión
--   consulta        → solo lectura, solo de su propia comisión (es el rol
--                     que usa el módulo móvil de campo)
-- ============================================================================

alter table padron_usuarios enable row level security;

drop policy if exists padron_select on padron_usuarios;
create policy padron_select on padron_usuarios for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists padron_insert on padron_usuarios;
create policy padron_insert on padron_usuarios for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists padron_update on padron_usuarios;
create policy padron_update on padron_usuarios for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists padron_delete on padron_usuarios;
create policy padron_delete on padron_usuarios for delete
    using (public.rol_actual() = 'admin');

-- ============================================================================
-- GRANTS — sin esto, "permission denied" aunque las políticas de arriba
-- estén perfectas (mismo motivo que en 002_grants_fase2.sql).
-- ============================================================================
grant select, insert, update, delete on padron_usuarios to authenticated;
