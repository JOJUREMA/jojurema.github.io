-- ============================================================================
-- CUSSHMI · Módulo móvil "Identificación y registro" (Fase A)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Registro de verificación de campo por usuario de agua: el sectorista
-- (rol "programador" — mismo rol que ya programa el PDA, no se crea rol
-- nuevo) visita cada predio y confirma/corrige lo que hay en el padrón
-- (`padron_usuarios`, Fase 2), agregando lo que el padrón nunca tuvo:
-- documento de identidad, área verificada, tipo de riego, y el derecho de
-- uso de agua (resolución/CUT/volumen) — todo pensado para poder exportar
-- más adelante los Formatos A-1/A-2 de la R.J. N° 0155-2022-ANA (misma
-- resolución que ya usa el Anexo G-4 del sistema).
--
-- Fase A: solo Secciones A, B, C y F del formulario (identificación,
-- predio, derecho de agua, estado/observaciones). Vértices GPS/UTM y fotos
-- (Secciones D y E) se agregan en fases posteriores con `alter table`, no
-- hace falta rediseñar nada de esto para eso.
--
-- Bloqueo tras confirmar: una vez `confirmado = true`, la política de
-- update de abajo ya no deja que un programador la vuelva a tocar (using
-- evalúa la fila ANTES del cambio) — solo admin puede seguir editando o
-- "desbloquear" (volver a poner confirmado=false). No hace falta una
-- función/RPC aparte para este candado.
-- ============================================================================

create table if not exists identificacion_registros (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text not null,
    padron_usuario_id uuid references padron_usuarios(id), -- null si vino de "+ Agregar usuario nuevo"

    -- Sección A — Datos del usuario
    apellidos_nombres text not null,
    tipo_documento text check (tipo_documento in ('DNI','RUC')),
    numero_documento text,
    unidad_catastral text,

    -- Sección B — Datos del predio
    area_total_ha numeric,
    area_bajo_riego_ha numeric,
    tipo_riego text check (tipo_riego in ('Gravedad','Goteo','Aspersión','Otro')),
    cultivo_actual text,

    -- Sección C — Derecho de uso de agua
    tiene_derecho text check (tiene_derecho in ('si','no','no_sabe')),
    numero_resolucion text,
    clase_derecho text,
    volumen_m3_anio numeric,
    cut_expediente text,
    clasificacion text check (clasificacion in ('A-1','A-2')), -- calculado en cliente: si->A-1, no/no_sabe->A-2

    -- Sección F — Estado y observaciones
    estado_predio text check (estado_predio in ('en_produccion','en_preparacion','abandonado','sin_agua')),
    observaciones text,

    confirmado boolean not null default false,
    confirmado_en timestamptz,
    creado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

create index if not exists idx_identreg_comision_toma on identificacion_registros (comision_id, toma_nombre);

alter table identificacion_registros enable row level security;

drop policy if exists identreg_select on identificacion_registros;
create policy identreg_select on identificacion_registros for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists identreg_insert on identificacion_registros;
create policy identreg_insert on identificacion_registros for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists identreg_update on identificacion_registros;
create policy identreg_update on identificacion_registros for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual() and confirmado = false))
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists identreg_delete on identificacion_registros;
create policy identreg_delete on identificacion_registros for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on identificacion_registros to authenticated;
