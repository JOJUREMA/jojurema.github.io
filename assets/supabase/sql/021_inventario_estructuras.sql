-- ============================================================================
-- CUSSHMI · Módulo móvil "Actualización del Inventario" — Fase 2 (los 12
-- tipos de obra restantes: Acueductos, Sifón Invertido, Caídas, Rápidas,
-- Repartidor, Pase Vehicular, Pase Peatonal, Alcantarilla, Medidores,
-- Canales Laterales, Dren Principal, Drenes Secundarios)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- A diferencia de Tomas/Compuertas (020_inventario_infraestructura.sql, una
-- tabla por tipo), estos 12 tipos comparten UNA sola tabla genérica —
-- `tipo_estructura` distingue el tipo y `campos` (jsonb) guarda las
-- columnas propias de cada uno (dimensiones/materiales, distintas entre
-- tipos). Solo `estado` y `observacion` son editables desde el móvil; el
-- resto de `campos` es de solo lectura (viene del levantamiento de
-- ingeniería, no se re-mide en cada visita de campo).
--
-- Las 2 hojas restantes del Excel ("Res. Obras Arte" / "Resumen
-- Inventario") son reportes derivados, no entidades — no se sincronizan.
-- ============================================================================

create table if not exists inventario_estructuras (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    tipo_estructura text not null,  -- 'acueducto' | 'sifon_invertido' | 'caida' | 'rapida' |
                                     -- 'repartidor' | 'pase_vehicular' | 'pase_peatonal' |
                                     -- 'alcantarilla' | 'medidor' | 'canal_lateral' |
                                     -- 'dren_principal' | 'dren_secundario'
    toma_nombre text, -- SD3, SI4... null si la cadena de canales no resolvió a una toma conocida

    canal_fuente text not null,   -- "Nombre del Canal Fuente" del Excel, tal cual
    nombre_canal text not null,   -- "Nombre del canal" del Excel, tal cual
    progresiva_km text,
    nombre_obra text,             -- "Nombre" del Excel (ej. "Acu 01_C. Mario") — identifica la obra puntual

    zona_utm text, este numeric, norte numeric, margen text,

    estado text,    -- B/R/M — único campo técnico editable además de observación
    bloque_riego text,
    observacion text,

    campos jsonb not null default '{}'::jsonb, -- resto de columnas propias del tipo, solo lectura en el móvil

    confirmado boolean not null default false,
    confirmado_en timestamptz,

    solicitud_edicion boolean not null default false,
    solicitud_edicion_por uuid references profiles(id),
    solicitud_edicion_por_nombre text,
    solicitud_edicion_en timestamptz,

    creado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),

    unique (comision_id, tipo_estructura, canal_fuente, nombre_canal, progresiva_km)
);

create index if not exists idx_inv_estructuras_comision_toma on inventario_estructuras (comision_id, tipo_estructura, toma_nombre);
create index if not exists idx_inv_estructuras_solicitud on inventario_estructuras (comision_id, solicitud_edicion) where solicitud_edicion = true;

alter table inventario_estructuras enable row level security;

drop policy if exists inv_estructuras_select on inventario_estructuras;
create policy inv_estructuras_select on inventario_estructuras for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists inv_estructuras_insert on inventario_estructuras;
create policy inv_estructuras_insert on inventario_estructuras for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists inv_estructuras_update on inventario_estructuras;
create policy inv_estructuras_update on inventario_estructuras for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual() and confirmado = false))
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists inv_estructuras_delete on inventario_estructuras;
create policy inv_estructuras_delete on inventario_estructuras for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on inventario_estructuras to authenticated;

create or replace function public.solicitar_edicion_inventario_estructura(registro_id uuid, nombre_solicitante text)
returns setof inventario_estructuras
language plpgsql security definer set search_path = public
as $$
declare
  v_comision uuid;
begin
  select comision_id into v_comision from inventario_estructuras where id = registro_id;
  if v_comision is null then
    raise exception 'Registro no encontrado';
  end if;
  if public.rol_actual() not in ('admin', 'programador') then
    raise exception 'No autorizado';
  end if;
  if public.rol_actual() <> 'admin' and v_comision <> public.comision_actual() then
    raise exception 'No autorizado';
  end if;

  update inventario_estructuras
     set solicitud_edicion = true,
         solicitud_edicion_por = auth.uid(),
         solicitud_edicion_por_nombre = coalesce(nombre_solicitante, 'un programador'),
         solicitud_edicion_en = now()
   where id = registro_id and confirmado = true;

  return query select * from inventario_estructuras where id = registro_id;
end;
$$;

grant execute on function public.solicitar_edicion_inventario_estructura(uuid, text) to authenticated;
