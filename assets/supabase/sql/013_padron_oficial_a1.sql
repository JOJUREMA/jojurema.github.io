-- ============================================================================
-- CUSSHMI · Padrón oficial A-1 (R.J. N° 0155-2022-ANA)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Distinto de `padron_usuarios` (Fase 2 — padrón operativo por toma, sale
-- del Excel semanal de riego): esta tabla es el padrón FORMAL de derechos de
-- agua que la Junta recibe de ANA en el "Formato A-1" oficial — trae DNI/RUC,
-- área verificada, resolución/certificado, clase de derecho y volumen
-- otorgado, datos que el padrón operativo nunca tuvo. Alimenta el
-- autocompletado de "Identificación y registro" (Secciones A y C) y, más
-- adelante, la exportación de los propios Formatos A-1/A-2.
--
-- El Excel oficial de ANA no tiene columna de "toma" (solo "Sub Sector
-- Hidráulico", a nivel de toda la comisión) — el cruce con una toma
-- concreta se hace en el cliente contra `padron_usuarios` por unidad
-- catastral o nombre, igual que ya hace el Mapa de predios con el KML.
--
-- `origen`: 'ana_a1' = vino del archivo oficial cargado desde escritorio.
-- 'campo' = usuario que el sectorista registró en campo porque no aparecía
-- en el padrón oficial (Anexo A-2, "+ Agregar usuario nuevo" en
-- Identificación y registro) — estas filas se guardan sin resolución/clase
-- de derecho/volumen (no tienen derecho formalizado) y con `observacion`
-- fija "Remitir a la Junta", tal como lo pidió el usuario.
-- ============================================================================

create table if not exists padron_oficial_a1 (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    numero_orden integer,
    apellidos_nombres text not null,
    tipo_documento text check (tipo_documento in ('DNI','RUC')),
    numero_documento text,
    departamento text,
    provincia text,
    distrito text,
    localidad text,
    unidad_catastral text,
    area_total_ha numeric,
    area_bajo_riego_ha numeric,
    sub_sector_hidraulico text,
    numero_resolucion text,
    clase_derecho text,
    tipo_uso text,
    volumen_m3 numeric,
    origen text not null default 'ana_a1' check (origen in ('ana_a1','campo')),
    observacion text,
    actualizado_por uuid references profiles(id),
    actualizado_en timestamptz not null default now(),
    unique (comision_id, unidad_catastral)
);

create index if not exists idx_padronA1_comision_nombre on padron_oficial_a1 (comision_id, apellidos_nombres);

alter table padron_oficial_a1 enable row level security;

drop policy if exists padronA1_select on padron_oficial_a1;
create policy padronA1_select on padron_oficial_a1 for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists padronA1_write on padron_oficial_a1;
create policy padronA1_write on padron_oficial_a1 for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists padronA1_update on padron_oficial_a1;
create policy padronA1_update on padron_oficial_a1 for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists padronA1_delete on padron_oficial_a1;
create policy padronA1_delete on padron_oficial_a1 for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on padron_oficial_a1 to authenticated;
