-- ============================================================================
-- CUSSHMI · Módulo móvil "Declaración de Intención de Siembra" (DIS)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- El Formato E-4.1 "Demanda de Agua del Usuario" (uno por toma) hoy se
-- llena a mano con totales agregados. Esta tabla guarda lo que cada
-- agricultor declara (qué va a sembrar y en cuánta área) para que el
-- escritorio arme el E-4.1 de cada toma sumando estas declaraciones —
-- mismo patrón que `identificacion_registros` (012) para el Padrón A-1,
-- incluyendo el mismo candado tras confirmar y la misma solicitud de
-- edición vía RPC (017).
--
-- La fecha de siembra y el período vegetativo NO se guardan por registro:
-- salen de una tabla de referencia por cultivo (assets/core/modulosRiego.js),
-- igual que ya están fijos en el Excel real (todos los cultivos de todas
-- las hojas usan la misma fecha de siembra y una duración fija según el
-- cultivo) — así que esta tabla solo necesita el par cultivo+área por
-- usuario, igual que `padron_usuarios.cultivos`.
-- ============================================================================

create table if not exists siembra_intenciones (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text not null,
    padron_usuario_id uuid references padron_usuarios(id), -- null si vino de "+ Agregar usuario nuevo"

    apellidos_nombres text not null,
    unidad_catastral text,
    cultivos jsonb not null default '[]'::jsonb, -- [{cultivo, area}, ...]

    confirmado boolean not null default false,
    confirmado_en timestamptz,

    -- Solicitud de edición (mismo mecanismo que identificacion_registros,
    -- ver 017_solicitud_edicion_identificacion.sql para el porqué).
    solicitud_edicion boolean not null default false,
    solicitud_edicion_por uuid references profiles(id),
    solicitud_edicion_por_nombre text,
    solicitud_edicion_en timestamptz,

    creado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),

    unique (comision_id, toma_nombre, unidad_catastral)
);

create index if not exists idx_siembra_comision_toma on siembra_intenciones (comision_id, toma_nombre);
create index if not exists idx_siembra_solicitud on siembra_intenciones (comision_id, solicitud_edicion) where solicitud_edicion = true;

alter table siembra_intenciones enable row level security;

drop policy if exists siembra_select on siembra_intenciones;
create policy siembra_select on siembra_intenciones for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists siembra_insert on siembra_intenciones;
create policy siembra_insert on siembra_intenciones for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

-- Mismo candado que identreg_update: una vez confirmado=true, un
-- programador ya no puede tocar la fila (using evalúa la fila ANTES del
-- cambio) — solo admin puede seguir editando o desbloquear. La solicitud
-- de edición pasa por la función RPC de abajo, no por este update directo.
drop policy if exists siembra_update on siembra_intenciones;
create policy siembra_update on siembra_intenciones for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual() and confirmado = false))
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists siembra_delete on siembra_intenciones;
create policy siembra_delete on siembra_intenciones for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on siembra_intenciones to authenticated;

-- RPC: un programador (o admin) pide habilitar la edición de un registro ya
-- confirmado. No lo desbloquea — solo deja la solicitud guardada. Copia
-- exacta del patrón de solicitar_edicion_identificacion (017), adaptada a
-- esta tabla.
create or replace function public.solicitar_edicion_siembra(registro_id uuid, nombre_solicitante text)
returns setof siembra_intenciones
language plpgsql security definer set search_path = public
as $$
declare
  v_comision uuid;
begin
  select comision_id into v_comision from siembra_intenciones where id = registro_id;
  if v_comision is null then
    raise exception 'Registro no encontrado';
  end if;
  if public.rol_actual() not in ('admin', 'programador') then
    raise exception 'No autorizado';
  end if;
  if public.rol_actual() <> 'admin' and v_comision <> public.comision_actual() then
    raise exception 'No autorizado';
  end if;

  update siembra_intenciones
     set solicitud_edicion = true,
         solicitud_edicion_por = auth.uid(),
         solicitud_edicion_por_nombre = coalesce(nombre_solicitante, 'un programador'),
         solicitud_edicion_en = now()
   where id = registro_id and confirmado = true;

  return query select * from siembra_intenciones where id = registro_id;
end;
$$;

grant execute on function public.solicitar_edicion_siembra(uuid, text) to authenticated;
