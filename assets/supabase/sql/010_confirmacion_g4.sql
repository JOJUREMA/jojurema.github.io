-- ============================================================================
-- CUSSHMI · Confirmación digital de recepción del Anexo G-4 + "Orden de Riego"
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Primera vez que el sistema expone algo a alguien SIN sesión de Supabase
-- Auth: el usuario que recibe el Anexo G-4 no tiene cuenta, así que confirma
-- la recepción desde un enlace público. Por eso NO se le da acceso directo
-- a la tabla (ni con RLS "using (true)": un cliente público podría pedir
-- "select *" sin filtro y descargar los datos de todos los usuarios). En su
-- lugar, dos funciones `security definer` — corren con privilegios propios,
-- ignoran RLS por dentro, pero solo devuelven/tocan una fila cuando el
-- token exacto coincide. Al rol anon solo se le da permiso de EJECUTAR esas
-- dos funciones, nunca select/update directo sobre la tabla.
-- ============================================================================

create table if not exists g4_confirmaciones (
    id uuid primary key default gen_random_uuid(),
    token uuid not null unique default gen_random_uuid(),
    programacion_id uuid not null references programaciones_semanales(id),
    cultivo text not null,
    usuario_nombre text not null,
    unidad_catastral text,
    -- Snapshot al momento de generar el enlace: el horario/caudal ya
    -- calculado no debe cambiar retroactivamente lo que el usuario ve y
    -- confirma, aunque después se reprograme la toma.
    comision_nombre text not null,
    toma_nombre text not null,
    semana_inicio date not null,
    canal text not null,
    caudal_ls numeric not null default 0,
    horas_total numeric not null default 0,
    volumen_m3 numeric not null default 0,
    inicio_texto text,
    termino_texto text,
    estado text not null default 'pendiente', -- 'pendiente' | 'confirmado'
    dispositivo text,
    confirmado_en timestamptz,
    creado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    unique (programacion_id, cultivo, usuario_nombre, unidad_catastral)
);

create index if not exists idx_g4c_programacion on g4_confirmaciones (programacion_id);

-- ============================================================================
-- RLS — acceso normal (autenticado) para generar enlaces y ver el panel
-- "Orden de Riego": mismo criterio que usuarios_g3_seleccionados, cruzando
-- por comisión a través de programaciones_semanales.
-- ============================================================================

alter table g4_confirmaciones enable row level security;

drop policy if exists g4c_select on g4_confirmaciones;
create policy g4c_select on g4_confirmaciones for select
    using (public.rol_actual() = 'admin' or exists (
        select 1 from programaciones_semanales p
        where p.id = programacion_id and p.comision_id = public.comision_actual()
    ));

drop policy if exists g4c_insert on g4_confirmaciones;
create policy g4c_insert on g4_confirmaciones for insert
    with check (public.rol_actual() = 'admin' or (public.rol_actual() = 'programador' and exists (
        select 1 from programaciones_semanales p
        where p.id = programacion_id and p.comision_id = public.comision_actual()
    )));

grant select, insert on g4_confirmaciones to authenticated;
-- Sin update/delete para authenticated: una vez confirmado, solo la RPC
-- confirmar_g4() (más abajo) puede cambiar el estado.

-- ============================================================================
-- RPC públicas — únicas puertas de entrada para el rol anon.
-- ============================================================================

create or replace function public.obtener_g4_por_token(token_param uuid)
returns setof g4_confirmaciones
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into auditoria (accion, modulo, registro_afectado)
        select 'Apertura de enlace', 'Anexo G-4 / Orden de Riego', usuario_nombre
        from g4_confirmaciones where token = token_param;

    return query select * from g4_confirmaciones where token = token_param;
end;
$$;

create or replace function public.confirmar_g4(token_param uuid, dispositivo_param text)
returns setof g4_confirmaciones
language plpgsql
security definer
set search_path = public
as $$
begin
    update g4_confirmaciones
        set estado = 'confirmado', confirmado_en = now(), dispositivo = dispositivo_param
        where token = token_param and estado = 'pendiente';

    insert into auditoria (accion, modulo, registro_afectado)
        select 'Confirmación de recepción G-4', 'Anexo G-4 / Orden de Riego', usuario_nombre
        from g4_confirmaciones where token = token_param;

    return query select * from g4_confirmaciones where token = token_param;
end;
$$;

grant execute on function public.obtener_g4_por_token(uuid) to anon, authenticated;
grant execute on function public.confirmar_g4(uuid, text) to anon, authenticated;

-- ============================================================================
-- Realtime — para que el panel "Orden de Riego" vea los ✅ en vivo sin
-- recargar (mismo patrón que 009_realtime_seguimiento.sql).
-- ============================================================================

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename = 'g4_confirmaciones'
    ) then
        alter publication supabase_realtime add table g4_confirmaciones;
    end if;
end $$;
