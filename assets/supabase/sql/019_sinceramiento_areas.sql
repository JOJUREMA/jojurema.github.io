-- ============================================================================
-- CUSSHMI · Módulo móvil "Sinceramiento de Áreas"
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Captura de campo independiente (no depende de "Identificación y
-- registro" ni de "Declaración de Intención de Siembra"): el sectorista
-- camina el perímetro del predio capturando un vértice GPS por esquina
-- (convertido a UTM WGS84 Zona 17S en el propio celular, ver
-- assets/core/coordenadasUtm.js), el polígono se dibuja solo, y se
-- compara el área resultante (Shoelace) contra
-- padron_oficial_a1.area_bajo_riego_ha — de ahí el nombre: sincerar el
-- área oficialmente registrada contra la medida real en campo.
--
-- Mismo candado tras confirmar + solicitud de edición vía RPC que
-- identificacion_registros (012/017) y siembra_intenciones (018) — se
-- copia el patrón tal cual, sin inventar reglas nuevas.
--
-- La captura de vértices/fotos debe funcionar SIN conexión (se guardan
-- primero en IndexedDB en el celular, ver assets/core/capturaOffline.js,
-- y se sincronizan solas cuando vuelve la señal) — esta tabla es el
-- destino final de esa sincronización, no participa en la lógica offline
-- en sí.
-- ============================================================================

create table if not exists sinceramiento_areas (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text not null,
    padron_usuario_id uuid references padron_usuarios(id), -- null si vino de "+ Agregar usuario nuevo"

    apellidos_nombres text not null,
    unidad_catastral text,

    vertices_utm jsonb not null default '[]'::jsonb,
    -- [{orden, easting, northing, zonaUtm:'17S', lat, lon, precisionM, capturadoEn}, ...]
    area_medida_ha numeric,          -- Shoelace sobre vertices_utm (assets/core/coordenadasUtm.js)
    area_declarada_ha numeric,       -- snapshot de padron_oficial_a1.area_bajo_riego_ha al confirmar
    fotos_urls jsonb not null default '[]'::jsonb, -- [{path, nombreArchivo, subidoEn}, ...]

    confirmado boolean not null default false,
    confirmado_en timestamptz,

    solicitud_edicion boolean not null default false,
    solicitud_edicion_por uuid references profiles(id),
    solicitud_edicion_por_nombre text,
    solicitud_edicion_en timestamptz,

    creado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),

    unique (comision_id, toma_nombre, unidad_catastral)
);

create index if not exists idx_sinceramiento_comision_toma on sinceramiento_areas (comision_id, toma_nombre);
create index if not exists idx_sinceramiento_solicitud on sinceramiento_areas (comision_id, solicitud_edicion) where solicitud_edicion = true;

alter table sinceramiento_areas enable row level security;

drop policy if exists sinceramiento_select on sinceramiento_areas;
create policy sinceramiento_select on sinceramiento_areas for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists sinceramiento_insert on sinceramiento_areas;
create policy sinceramiento_insert on sinceramiento_areas for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

-- Mismo candado que identreg_update/siembra_update: una vez
-- confirmado=true, un programador ya no puede tocar la fila directamente
-- — la solicitud de edición pasa por la función RPC de abajo.
drop policy if exists sinceramiento_update on sinceramiento_areas;
create policy sinceramiento_update on sinceramiento_areas for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual() and confirmado = false))
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists sinceramiento_delete on sinceramiento_areas;
create policy sinceramiento_delete on sinceramiento_areas for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on sinceramiento_areas to authenticated;

-- RPC: copia exacta del patrón de solicitar_edicion_siembra (018),
-- adaptada a esta tabla.
create or replace function public.solicitar_edicion_sinceramiento(registro_id uuid, nombre_solicitante text)
returns setof sinceramiento_areas
language plpgsql security definer set search_path = public
as $$
declare
  v_comision uuid;
begin
  select comision_id into v_comision from sinceramiento_areas where id = registro_id;
  if v_comision is null then
    raise exception 'Registro no encontrado';
  end if;
  if public.rol_actual() not in ('admin', 'programador') then
    raise exception 'No autorizado';
  end if;
  if public.rol_actual() <> 'admin' and v_comision <> public.comision_actual() then
    raise exception 'No autorizado';
  end if;

  update sinceramiento_areas
     set solicitud_edicion = true,
         solicitud_edicion_por = auth.uid(),
         solicitud_edicion_por_nombre = coalesce(nombre_solicitante, 'un programador'),
         solicitud_edicion_en = now()
   where id = registro_id and confirmado = true;

  return query select * from sinceramiento_areas where id = registro_id;
end;
$$;

grant execute on function public.solicitar_edicion_sinceramiento(uuid, text) to authenticated;

-- ── Storage: fotos del predio (primer bucket de este proyecto) ──────────────
-- Bucket privado — mostrar una foto ya subida requiere URL firmada
-- (createSignedUrl), no hay URLs públicas persistentes. Ruta de cada
-- archivo: {comision_id}/{registro_id}/{archivo} — las políticas de abajo
-- verifican el primer segmento de esa ruta contra la comisión de quien
-- pide el acceso, mismo criterio de aislamiento por comisión que el
-- resto de tablas del sistema.
insert into storage.buckets (id, name, public)
values ('sinceramiento-fotos', 'sinceramiento-fotos', false)
on conflict (id) do nothing;

drop policy if exists sinceramiento_fotos_select on storage.objects;
create policy sinceramiento_fotos_select on storage.objects for select
    using (bucket_id = 'sinceramiento-fotos' and (
        public.rol_actual() = 'admin' or (storage.foldername(name))[1] = public.comision_actual()::text
    ));

drop policy if exists sinceramiento_fotos_insert on storage.objects;
create policy sinceramiento_fotos_insert on storage.objects for insert
    with check (bucket_id = 'sinceramiento-fotos' and (
        public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and (storage.foldername(name))[1] = public.comision_actual()::text)
    ));

drop policy if exists sinceramiento_fotos_delete on storage.objects;
create policy sinceramiento_fotos_delete on storage.objects for delete
    using (bucket_id = 'sinceramiento-fotos' and public.rol_actual() = 'admin');
