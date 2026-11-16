-- ============================================================================
-- CUSSHMI · Módulo móvil "Actualización del Inventario" — Fase 1 (Tomas y
-- Compuertas)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Origen: Formato oficial de ANA "Inventario de Obras de Arte" (Ministerio
-- de Desarrollo Agrario y Riego), archivo real
-- "1.Formatos de Inventario CUSSHMI.xlsx" — 16 hojas, una por tipo de
-- estructura hidráulica. Esta fase cubre solo dos: Tomas (1354 filas
-- reales) y Compuertas (829 filas reales), los tipos con más registros y
-- ya centrales en el resto del sistema (PDA, Anexo G-3, Mapa de predios).
-- Los 12 tipos restantes (Acueductos, Sifón Invertido, Caídas, Rápidas,
-- Repartidor, Pase Vehicular/Peatonal, Alcantarilla, Medidores, Canales
-- Laterales, Drenes) quedan para fases futuras, mismo patrón.
--
-- `canal_fuente`/`nombre_canal` se guardan TAL CUAL vienen del Excel (sin
-- interpretar) — son la clave natural de cada fila. `toma_nombre` es un
-- campo derivado (SD3, SI4... o null si no se pudo resolver la cadena de
-- canales hasta una toma conocida — ver resolverTomaPorCanal() en
-- assets/core/inventarioInfraestructura.js), solo para poder filtrar/
-- agrupar en la app — nunca se usa como clave de identidad de la fila.
--
-- Mismo candado tras confirmar + solicitud de edición vía RPC que
-- identificacion_registros/siembra_intenciones/sinceramiento_areas — se
-- copia el patrón tal cual, sin inventar reglas nuevas.
-- ============================================================================

create table if not exists inventario_tomas (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text, -- SD3, SI4... null si la cadena de canales no resolvió a una toma conocida

    canal_fuente text not null,   -- "Nombre del Canal Fuente" del Excel, tal cual
    nombre_canal text not null,   -- "Nombre del Canal" del Excel, tal cual
    progresiva_km text,

    zona_utm text, este numeric, norte numeric, margen text, -- margen: D/C/I

    material text,  -- FE/PVC/RU/C/O
    tipo text,      -- RT/TD/TP/O (Tipo de Captación)
    estado text,    -- B/R/M

    dimension_a numeric, dimension_h numeric, dimension_d numeric,
    observacion text,

    confirmado boolean not null default false,
    confirmado_en timestamptz,

    solicitud_edicion boolean not null default false,
    solicitud_edicion_por uuid references profiles(id),
    solicitud_edicion_por_nombre text,
    solicitud_edicion_en timestamptz,

    creado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),

    unique (comision_id, canal_fuente, nombre_canal, progresiva_km)
);

create index if not exists idx_inv_tomas_comision_toma on inventario_tomas (comision_id, toma_nombre);
create index if not exists idx_inv_tomas_solicitud on inventario_tomas (comision_id, solicitud_edicion) where solicitud_edicion = true;

alter table inventario_tomas enable row level security;

drop policy if exists inv_tomas_select on inventario_tomas;
create policy inv_tomas_select on inventario_tomas for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists inv_tomas_insert on inventario_tomas;
create policy inv_tomas_insert on inventario_tomas for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists inv_tomas_update on inventario_tomas;
create policy inv_tomas_update on inventario_tomas for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual() and confirmado = false))
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists inv_tomas_delete on inventario_tomas;
create policy inv_tomas_delete on inventario_tomas for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on inventario_tomas to authenticated;

create or replace function public.solicitar_edicion_inventario_toma(registro_id uuid, nombre_solicitante text)
returns setof inventario_tomas
language plpgsql security definer set search_path = public
as $$
declare
  v_comision uuid;
begin
  select comision_id into v_comision from inventario_tomas where id = registro_id;
  if v_comision is null then
    raise exception 'Registro no encontrado';
  end if;
  if public.rol_actual() not in ('admin', 'programador') then
    raise exception 'No autorizado';
  end if;
  if public.rol_actual() <> 'admin' and v_comision <> public.comision_actual() then
    raise exception 'No autorizado';
  end if;

  update inventario_tomas
     set solicitud_edicion = true,
         solicitud_edicion_por = auth.uid(),
         solicitud_edicion_por_nombre = coalesce(nombre_solicitante, 'un programador'),
         solicitud_edicion_en = now()
   where id = registro_id and confirmado = true;

  return query select * from inventario_tomas where id = registro_id;
end;
$$;

grant execute on function public.solicitar_edicion_inventario_toma(uuid, text) to authenticated;


create table if not exists inventario_compuertas (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text,

    canal_fuente text not null,
    nombre_canal text not null,
    orden_compuerta text, -- "Orden" del Excel (posición de la compuerta en el canal, no es un ranking propio)
    progresiva_km text,

    zona_utm text, este numeric, norte numeric, margen text,

    tipo text,      -- F/G/T
    material text,  -- FE/MD/O
    estado text,    -- B/R/M
    operacion text, -- MA/ME/MI/O

    hoja_a numeric, hoja_h numeric, marco_a numeric, marco_h numeric,
    bloque_riego text,
    observacion text,

    confirmado boolean not null default false,
    confirmado_en timestamptz,

    solicitud_edicion boolean not null default false,
    solicitud_edicion_por uuid references profiles(id),
    solicitud_edicion_por_nombre text,
    solicitud_edicion_en timestamptz,

    creado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),

    unique (comision_id, canal_fuente, nombre_canal, progresiva_km)
);

create index if not exists idx_inv_compuertas_comision_toma on inventario_compuertas (comision_id, toma_nombre);
create index if not exists idx_inv_compuertas_solicitud on inventario_compuertas (comision_id, solicitud_edicion) where solicitud_edicion = true;

alter table inventario_compuertas enable row level security;

drop policy if exists inv_compuertas_select on inventario_compuertas;
create policy inv_compuertas_select on inventario_compuertas for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists inv_compuertas_insert on inventario_compuertas;
create policy inv_compuertas_insert on inventario_compuertas for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists inv_compuertas_update on inventario_compuertas;
create policy inv_compuertas_update on inventario_compuertas for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual() and confirmado = false))
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists inv_compuertas_delete on inventario_compuertas;
create policy inv_compuertas_delete on inventario_compuertas for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on inventario_compuertas to authenticated;

create or replace function public.solicitar_edicion_inventario_compuerta(registro_id uuid, nombre_solicitante text)
returns setof inventario_compuertas
language plpgsql security definer set search_path = public
as $$
declare
  v_comision uuid;
begin
  select comision_id into v_comision from inventario_compuertas where id = registro_id;
  if v_comision is null then
    raise exception 'Registro no encontrado';
  end if;
  if public.rol_actual() not in ('admin', 'programador') then
    raise exception 'No autorizado';
  end if;
  if public.rol_actual() <> 'admin' and v_comision <> public.comision_actual() then
    raise exception 'No autorizado';
  end if;

  update inventario_compuertas
     set solicitud_edicion = true,
         solicitud_edicion_por = auth.uid(),
         solicitud_edicion_por_nombre = coalesce(nombre_solicitante, 'un programador'),
         solicitud_edicion_en = now()
   where id = registro_id and confirmado = true;

  return query select * from inventario_compuertas where id = registro_id;
end;
$$;

grant execute on function public.solicitar_edicion_inventario_compuerta(uuid, text) to authenticated;
