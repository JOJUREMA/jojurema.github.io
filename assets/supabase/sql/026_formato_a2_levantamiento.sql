-- ============================================================================
-- CUSSHMI · Formato A-2 — Levantamiento de Observaciones ANA
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Distinto de `identificacion_registros.clasificacion` (A-1/A-2 calculado
-- del formulario existente según "¿tiene derecho?") — esto es un ejercicio
-- de cumplimiento puntual (Oficio Múltiple N°101-2026-JUSHMCH-CA-GERENCIA-
-- ING/JMPM): 93 usuarios que ANA ya "observó" en un Excel oficial
-- ("Formato A-2 ... LEVANTADO"), algunos ya cruzados contra el padrón
-- digital SIGA por la propia comisión, que ahora hay que terminar de
-- verificar/completar en campo. Por eso el nombre interno lleva
-- "levantamiento" — para no confundirse nunca con la `clasificacion` ya
-- existente, aunque el botón que ve el usuario diga "Formato A-2" a secas.
--
-- Columnas 1-17 del Excel oficial ("datos observados", lo que ANA ya
-- reportó) quedan de SOLO LECTURA en el móvil — nunca las edita un
-- sectorista. Columnas 18-47 ("datos de verificación") son las que el
-- sectorista completa/corrige en campo — de ahí el reparto dedicadas vs
-- `campos_verificacion` jsonb (mismo criterio que
-- assets/core/inventarioInfraestructura.js, TIPOS_ESTRUCTURA_GENERICOS:
-- dedicadas para lo consultable/tipado, jsonb para el resto).
-- ============================================================================

create table if not exists formato_a2_levantamiento (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text, -- null = no se pudo resolver la toma al importar (revisar en escritorio)

    -- Cols 1-17 del Excel — "datos observados" (ANA), SOLO LECTURA en el móvil
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
    canal_derivacion text,
    fuente_agua text,
    cut_expediente text,
    tipo_uso text,
    volumen_m3 numeric,

    -- Cols 18-47 del Excel — "datos de verificación/levantamiento", EDITABLES en el móvil
    conductor_actual text,
    conductor_tipo_documento text,
    conductor_numero_documento text,
    estado text,
    ultima_fecha_riego text, -- texto tal cual venga (formato de fecha inconsistente en el Excel fuente)
    este numeric,
    norte numeric,
    zona text,
    uc_ref text,
    se_ubica_bloque text check (se_ubica_bloque in ('Dentro','Fuera')),
    nombre_bloque_riego text,
    sector text,
    observaciones text,
    -- Resto de cols 18-47 (CD/CP, L01-L06, área verificada, cultivos 1-4):
    -- { cdCp, l01, l02, l03, l04, l05, l06, areaTotalVerificadaHa,
    --   areaBajoRiegoVerificadaHa, cultivo1, areaInstalada1, ... cultivo4, areaInstalada4 }
    campos_verificacion jsonb not null default '{}'::jsonb,

    -- Clasificación importada desde el color de la hoja 'Margen Izquierda' del Excel
    -- (verde=DNI exacto en SIGA, naranja=por nombre/otra toma a confirmar,
    -- amarillo=sin info digital) — insignia de solo lectura, nunca la toca el sectorista.
    estado_verificacion text check (estado_verificacion in ('verde','naranja','amarillo')),

    -- Bandera manual, separada del color importado a propósito (evita inventar
    -- lógica de re-clasificación automática): el sectorista confirma "ya lo revisé en campo".
    verificado_en_campo boolean not null default false,
    verificado_en_campo_en timestamptz,
    verificado_en_campo_por uuid references profiles(id),

    -- Candado — mismo patrón que identificacion_registros (012) + su solicitud de edición (017)
    confirmado boolean not null default false,
    confirmado_en timestamptz,
    solicitud_edicion boolean not null default false,
    solicitud_edicion_por uuid references profiles(id),
    solicitud_edicion_por_nombre text,
    solicitud_edicion_en timestamptz,

    creado_por uuid references profiles(id),
    actualizado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),

    unique (comision_id, toma_nombre, numero_orden)
);

-- Reintento seguro para quien ya haya creado la tabla con la clave anterior
-- (comision_id, apellidos_nombres) — esa clave colisiona en la práctica: una
-- misma persona/asociación puede aparecer varias veces en la MISMA hoja de
-- toma (varios predios, ej. "ASOCIACION TIERRAS NUEVAS AGRICOLAS" 7 filas en
-- SD11), y (comision_id, toma_nombre, numero_orden) sí las distingue siempre
-- (numero_orden es la posición real de cada fila en su propia hoja).
alter table formato_a2_levantamiento drop constraint if exists formato_a2_levantamiento_comision_id_apellidos_nombres_key;
alter table formato_a2_levantamiento drop constraint if exists formato_a2_levantamiento_comision_id_toma_nombre_numero_orden_key;
alter table formato_a2_levantamiento add constraint formato_a2_levantamiento_comision_id_toma_nombre_numero_orden_key
    unique (comision_id, toma_nombre, numero_orden);

create index if not exists idx_formatoA2Lev_comision_toma on formato_a2_levantamiento (comision_id, toma_nombre);
create index if not exists idx_formatoA2Lev_solicitud on formato_a2_levantamiento (comision_id, solicitud_edicion) where solicitud_edicion = true;

alter table formato_a2_levantamiento enable row level security;

drop policy if exists formatoA2Lev_select on formato_a2_levantamiento;
create policy formatoA2Lev_select on formato_a2_levantamiento for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists formatoA2Lev_insert on formato_a2_levantamiento;
create policy formatoA2Lev_insert on formato_a2_levantamiento for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists formatoA2Lev_update on formato_a2_levantamiento;
create policy formatoA2Lev_update on formato_a2_levantamiento for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual() and confirmado = false))
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists formatoA2Lev_delete on formato_a2_levantamiento;
create policy formatoA2Lev_delete on formato_a2_levantamiento for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on formato_a2_levantamiento to authenticated;

-- Misma razón que solicitar_edicion_identificacion (017): la política de update de
-- arriba bloquea a un programador de tocar un registro confirmado=true a propósito —
-- "solicitar edición" necesita su propia función con privilegios propios que SOLO
-- marca la solicitud, nunca toca `confirmado` ni ningún dato del formulario.
create or replace function public.solicitar_edicion_formato_a2_levantamiento(registro_id uuid, nombre_solicitante text)
returns setof formato_a2_levantamiento
language plpgsql security definer set search_path = public
as $$
declare
  v_comision uuid;
begin
  select comision_id into v_comision from formato_a2_levantamiento where id = registro_id;
  if v_comision is null then
    raise exception 'Registro no encontrado';
  end if;
  if public.rol_actual() not in ('admin', 'programador') then
    raise exception 'No autorizado';
  end if;
  if public.rol_actual() <> 'admin' and v_comision <> public.comision_actual() then
    raise exception 'No autorizado';
  end if;

  update formato_a2_levantamiento
     set solicitud_edicion = true,
         solicitud_edicion_por = auth.uid(),
         solicitud_edicion_por_nombre = coalesce(nombre_solicitante, 'un programador'),
         solicitud_edicion_en = now()
   where id = registro_id and confirmado = true;

  return query select * from formato_a2_levantamiento where id = registro_id;
end;
$$;

grant execute on function public.solicitar_edicion_formato_a2_levantamiento(uuid, text) to authenticated;
