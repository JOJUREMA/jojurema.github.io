-- ============================================================================
-- CUSSHMI · Solicitud de edición para un registro confirmado de
-- "Identificación y registro"
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Antes, un programador solo veía el aviso "solicite habilitación al
-- administrador" sin ninguna forma real de avisarle — tenía que hacerlo por
-- fuera del sistema (llamada, WhatsApp). Esto agrega el aviso real: el
-- programador dispara una solicitud que queda guardada en el propio
-- registro, y el administrador tiene de dónde leerlas todas juntas
-- (listarSolicitudesEdicionIdentificacion) para aprobar (desbloquear) o
-- rechazar. Mientras no se aprueba, los campos siguen bloqueados exactamente
-- igual que antes — esto no cambia ese comportamiento.
-- ============================================================================

alter table identificacion_registros add column if not exists solicitud_edicion boolean not null default false;
alter table identificacion_registros add column if not exists solicitud_edicion_por uuid references profiles(id);
alter table identificacion_registros add column if not exists solicitud_edicion_por_nombre text;
alter table identificacion_registros add column if not exists solicitud_edicion_en timestamptz;

create index if not exists idx_identreg_solicitud on identificacion_registros (comision_id, solicitud_edicion) where solicitud_edicion = true;

-- La política identreg_update (012) bloquea a un programador de tocar un
-- registro con confirmado=true, a propósito — es el candado que protege un
-- registro ya confirmado. Por eso "solicitar edición" no puede ser un
-- update() normal del cliente: necesita su propia función con privilegios
-- propios (security definer), que valida por su cuenta que quien llama es
-- admin/programador de la misma comisión del registro, y que SOLO marca la
-- solicitud — nunca toca `confirmado` ni ningún dato del formulario.
create or replace function public.solicitar_edicion_identificacion(registro_id uuid, nombre_solicitante text)
returns setof identificacion_registros
language plpgsql security definer set search_path = public
as $$
declare
  v_comision uuid;
begin
  select comision_id into v_comision from identificacion_registros where id = registro_id;
  if v_comision is null then
    raise exception 'Registro no encontrado';
  end if;
  if public.rol_actual() not in ('admin', 'programador') then
    raise exception 'No autorizado';
  end if;
  if public.rol_actual() <> 'admin' and v_comision <> public.comision_actual() then
    raise exception 'No autorizado';
  end if;

  update identificacion_registros
     set solicitud_edicion = true,
         solicitud_edicion_por = auth.uid(),
         solicitud_edicion_por_nombre = coalesce(nombre_solicitante, 'un programador'),
         solicitud_edicion_en = now()
   where id = registro_id and confirmado = true;

  return query select * from identificacion_registros where id = registro_id;
end;
$$;

grant execute on function public.solicitar_edicion_identificacion(uuid, text) to authenticated;
