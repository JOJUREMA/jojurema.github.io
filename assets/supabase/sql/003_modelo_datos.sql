-- ============================================================================
-- CUSSHMI · Fase 3 — Modelo de datos completo
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Solo crea estructura (tablas, RLS, grants). No migra datos todavía —
-- eso es la Fase 4.
-- Idempotente.
-- ============================================================================

-- ── Catálogo simple de cultivos (uso en reportes/validaciones futuras) ────
create table if not exists cultivos (
    id uuid primary key default gen_random_uuid(),
    nombre text unique not null
);

insert into cultivos (nombre) values
    ('ARROZ'), ('PLATANO'), ('MANGO'), ('LIMON'), ('MENESTRAS'), ('MAIZ'), ('OTROS')
on conflict (nombre) do nothing;

-- ── Programación semanal por toma ──────────────────────────────────────────
-- Una fila = una toma programada en una semana. `datos` guarda el mismo
-- objeto que hoy vive en consolidadoDemandas[i] (cultivos, totales,
-- caudalesPorDia, etc.) — se mantiene como JSON para no tener que
-- renormalizar ni tocar los cálculos existentes; Fase 5 decide campo por
-- campo qué vale la pena sacar a columna real más adelante.
create table if not exists programaciones_semanales (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text not null,
    semana_inicio date not null,
    semana_fin date not null,
    estado text not null default 'disponible'
        check (estado in ('disponible', 'en_edicion', 'programada', 'confirmada')),
    datos jsonb not null default '{}'::jsonb,
    version integer not null default 1,
    creado_por uuid references profiles(id),
    actualizado_por uuid references profiles(id),
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),
    unique (comision_id, toma_nombre, semana_inicio)
);

-- ── Turnos de riego ─────────────────────────────────────────────────────
-- Espejo de window.turnosDeRiego[toma]: caudalesPorDia, caudalesPorDiaDetallado
-- (con horasPorCultivo ya incluido), distribucionDias, etc.
create table if not exists turnos_riego (
    id uuid primary key default gen_random_uuid(),
    programacion_id uuid not null references programaciones_semanales(id) on delete cascade,
    datos jsonb not null default '{}'::jsonb,
    actualizado_en timestamptz not null default now(),
    unique (programacion_id)
);

-- ── Selección de usuarios para el Anexo G3 ─────────────────────────────
-- Espejo de window.usuariosG3['toma|cultivo']: qué usuarios aptos quedaron
-- seleccionados para regar, por cultivo, dentro de cada programación.
create table if not exists usuarios_g3_seleccionados (
    id uuid primary key default gen_random_uuid(),
    programacion_id uuid not null references programaciones_semanales(id) on delete cascade,
    cultivo text not null,
    usuarios jsonb not null default '[]'::jsonb,
    actualizado_en timestamptz not null default now(),
    unique (programacion_id, cultivo)
);

-- ── Nota general del Anexo G2 ───────────────────────────────────────────
-- Una nota por comisión y semana (ver fix de impresión de la sesión anterior).
create table if not exists notas_anexo_g2 (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    semana_inicio date not null,
    semana_fin date not null,
    texto text not null default '',
    actualizado_por uuid references profiles(id),
    actualizado_en timestamptz not null default now(),
    unique (comision_id, semana_inicio)
);

-- ── Bloqueo por toma ─────────────────────────────────────────────────────
-- La tabla se crea ahora; la lógica de tomar/soltar el bloqueo y la
-- liberación automática por inactividad se implementa en la Fase 6.
-- El "estado" de una toma (disponible/en edición/bloqueada) se calcula
-- consultando esta tabla, no se duplica como columna en otro lado.
create table if not exists bloqueos_toma (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid not null references comisiones(id),
    toma_nombre text not null,
    usuario_id uuid not null references profiles(id),
    iniciado_en timestamptz not null default now(),
    ultima_actividad timestamptz not null default now(),
    unique (comision_id, toma_nombre)
);

-- ── Auditoría ────────────────────────────────────────────────────────────
create table if not exists auditoria (
    id bigint generated always as identity primary key,
    usuario_id uuid references profiles(id),
    accion text not null,
    modulo text not null,
    registro_afectado text,
    valor_anterior jsonb,
    valor_nuevo jsonb,
    creado_en timestamptz not null default now()
);

-- ── Historial de versiones ──────────────────────────────────────────────
-- Cada modificación de una programación agrega una fila acá (nunca se
-- sobrescribe); Fase 6 conecta el trigger/llamada que la alimenta.
create table if not exists historial_programaciones (
    id bigint generated always as identity primary key,
    programacion_id uuid not null references programaciones_semanales(id) on delete cascade,
    version integer not null,
    datos jsonb not null,
    modificado_por uuid references profiles(id),
    modificado_en timestamptz not null default now()
);

-- ── Configuración ────────────────────────────────────────────────────────
-- Clave/valor simple, global (comision_id null) o por comisión.
create table if not exists configuracion (
    id uuid primary key default gen_random_uuid(),
    comision_id uuid references comisiones(id),
    clave text not null,
    valor jsonb not null,
    actualizado_en timestamptz not null default now(),
    unique (comision_id, clave)
);

-- ── Índices ──────────────────────────────────────────────────────────────
create index if not exists idx_prog_sem_comision on programaciones_semanales (comision_id, semana_inicio);
create index if not exists idx_bloqueos_comision on bloqueos_toma (comision_id);
create index if not exists idx_auditoria_usuario on auditoria (usuario_id, creado_en desc);
create index if not exists idx_historial_programacion on historial_programaciones (programacion_id, version desc);

-- ============================================================================
-- RLS — mismo criterio en todas las tablas de datos operativos:
--   admin           → acceso total
--   programador     → solo filas de su propia comisión (lectura y escritura)
--   consulta        → solo lectura, solo de su propia comisión
-- Reutiliza rol_actual()/comision_actual() creadas en la Fase 2.
-- ============================================================================

alter table cultivos enable row level security;
alter table programaciones_semanales enable row level security;
alter table turnos_riego enable row level security;
alter table usuarios_g3_seleccionados enable row level security;
alter table notas_anexo_g2 enable row level security;
alter table bloqueos_toma enable row level security;
alter table auditoria enable row level security;
alter table historial_programaciones enable row level security;
alter table configuracion enable row level security;

-- cultivos: catálogo de lectura libre para cualquier autenticado; solo admin edita.
drop policy if exists cultivos_select on cultivos;
create policy cultivos_select on cultivos for select using (auth.role() = 'authenticated');
drop policy if exists cultivos_admin_write on cultivos;
create policy cultivos_admin_write on cultivos for all
    using (public.rol_actual() = 'admin') with check (public.rol_actual() = 'admin');

-- programaciones_semanales
drop policy if exists prog_sem_select on programaciones_semanales;
create policy prog_sem_select on programaciones_semanales for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists prog_sem_write on programaciones_semanales;
create policy prog_sem_write on programaciones_semanales for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists prog_sem_update on programaciones_semanales;
create policy prog_sem_update on programaciones_semanales for update
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

drop policy if exists prog_sem_delete on programaciones_semanales;
create policy prog_sem_delete on programaciones_semanales for delete
    using (public.rol_actual() = 'admin');

-- turnos_riego / usuarios_g3_seleccionados / historial_programaciones cuelgan
-- de programaciones_semanales — el acceso se resuelve contra la fila padre.
drop policy if exists turnos_select on turnos_riego;
create policy turnos_select on turnos_riego for select using (
    exists (select 1 from programaciones_semanales p where p.id = programacion_id
        and (public.rol_actual() = 'admin' or p.comision_id = public.comision_actual()))
);
drop policy if exists turnos_write on turnos_riego;
create policy turnos_write on turnos_riego for all using (
    exists (select 1 from programaciones_semanales p where p.id = programacion_id
        and (public.rol_actual() = 'admin' or
            (public.rol_actual() = 'programador' and p.comision_id = public.comision_actual())))
) with check (
    exists (select 1 from programaciones_semanales p where p.id = programacion_id
        and (public.rol_actual() = 'admin' or
            (public.rol_actual() = 'programador' and p.comision_id = public.comision_actual())))
);

drop policy if exists usuariosg3_select on usuarios_g3_seleccionados;
create policy usuariosg3_select on usuarios_g3_seleccionados for select using (
    exists (select 1 from programaciones_semanales p where p.id = programacion_id
        and (public.rol_actual() = 'admin' or p.comision_id = public.comision_actual()))
);
drop policy if exists usuariosg3_write on usuarios_g3_seleccionados;
create policy usuariosg3_write on usuarios_g3_seleccionados for all using (
    exists (select 1 from programaciones_semanales p where p.id = programacion_id
        and (public.rol_actual() = 'admin' or
            (public.rol_actual() = 'programador' and p.comision_id = public.comision_actual())))
) with check (
    exists (select 1 from programaciones_semanales p where p.id = programacion_id
        and (public.rol_actual() = 'admin' or
            (public.rol_actual() = 'programador' and p.comision_id = public.comision_actual())))
);

drop policy if exists historial_select on historial_programaciones;
create policy historial_select on historial_programaciones for select using (
    exists (select 1 from programaciones_semanales p where p.id = programacion_id
        and (public.rol_actual() = 'admin' or p.comision_id = public.comision_actual()))
);
-- El historial nunca se edita ni se borra desde el cliente, solo se inserta
-- (vía función/trigger de Fase 6, que corre con privilegios propios).

-- notas_anexo_g2
drop policy if exists notas_g2_select on notas_anexo_g2;
create policy notas_g2_select on notas_anexo_g2 for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());
drop policy if exists notas_g2_write on notas_anexo_g2;
create policy notas_g2_write on notas_anexo_g2 for all
    using (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()))
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));

-- bloqueos_toma: cualquier autenticado de la comisión puede ver quién tiene
-- qué toma bloqueada (para mostrar el aviso); solo el dueño del bloqueo o
-- un admin puede soltarlo/editarlo.
drop policy if exists bloqueos_select on bloqueos_toma;
create policy bloqueos_select on bloqueos_toma for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());
drop policy if exists bloqueos_insert on bloqueos_toma;
create policy bloqueos_insert on bloqueos_toma for insert
    with check (public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and comision_id = public.comision_actual()));
drop policy if exists bloqueos_delete on bloqueos_toma;
create policy bloqueos_delete on bloqueos_toma for delete
    using (public.rol_actual() = 'admin' or usuario_id = auth.uid());

-- auditoria: cualquier autenticado puede insertar su propia acción; solo ve
-- su propio historial, salvo el admin que ve todo.
drop policy if exists auditoria_select on auditoria;
create policy auditoria_select on auditoria for select
    using (public.rol_actual() = 'admin' or usuario_id = auth.uid());
drop policy if exists auditoria_insert on auditoria;
create policy auditoria_insert on auditoria for insert
    with check (usuario_id = auth.uid());

-- configuracion
drop policy if exists config_select on configuracion;
create policy config_select on configuracion for select
    using (comision_id is null or public.rol_actual() = 'admin' or comision_id = public.comision_actual());
drop policy if exists config_write on configuracion;
create policy config_write on configuracion for all
    using (public.rol_actual() = 'admin')
    with check (public.rol_actual() = 'admin');

-- ============================================================================
-- GRANTS — sin esto, "permission denied" aunque las políticas de arriba
-- estén perfectas (mismo motivo que en 002_grants_fase2.sql).
-- ============================================================================
grant select, insert, update, delete on
    cultivos, programaciones_semanales, turnos_riego, usuarios_g3_seleccionados,
    notas_anexo_g2, bloqueos_toma, configuracion
    to authenticated;

-- historial_programaciones y auditoria son de solo agregar desde el cliente
-- (la política RLS ya bloquea update/delete aunque el grant fuera más amplio,
-- pero se deja el grant acotado para que quede explícito).
grant select, insert on historial_programaciones to authenticated;
grant select, insert on auditoria to authenticated;

grant usage on all sequences in schema public to authenticated;
