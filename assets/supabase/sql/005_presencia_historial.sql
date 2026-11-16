-- ============================================================================
-- CUSSHMI · Fase 6 — Presencia (usuarios conectados) + fix de historial
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
-- ============================================================================

-- ── Presencia ────────────────────────────────────────────────────────────
-- Una fila por usuario (no por sesión/pestaña): se sobrescribe con cada
-- latido. "Conectado" se decide en la aplicación comparando ultima_actividad
-- contra un umbral (algunos minutos) — no hace falta una columna de estado.
create table if not exists presencia (
    usuario_id uuid primary key references profiles(id) on delete cascade,
    comision_id uuid not null references comisiones(id),
    conectado_desde timestamptz not null default now(),
    ultima_actividad timestamptz not null default now()
);

alter table presencia enable row level security;

-- Solo el administrador ve el panel de presencia completo (así lo pide el
-- requisito: "panel donde el Administrador pueda visualizar...").
drop policy if exists presencia_select_admin on presencia;
create policy presencia_select_admin on presencia for select
    using (public.rol_actual() = 'admin');

-- Cada usuario mantiene su propia fila (upsert de su latido).
drop policy if exists presencia_upsert_propio on presencia;
create policy presencia_upsert_propio on presencia for insert
    with check (usuario_id = auth.uid());

drop policy if exists presencia_update_propio on presencia;
create policy presencia_update_propio on presencia for update
    using (usuario_id = auth.uid())
    with check (usuario_id = auth.uid());

grant select, insert, update on presencia to authenticated;

-- ── Fix: historial_programaciones nunca tuvo política de INSERT ───────────
-- (se me pasó en la Fase 3 — solo dejé la de lectura). Sin esto, cualquier
-- intento de guardar una versión en el historial fallaría con "permission
-- denied", igual que el problema de grants que ya vimos antes.
drop policy if exists historial_insert on historial_programaciones;
create policy historial_insert on historial_programaciones for insert
    with check (
        exists (
            select 1 from programaciones_semanales p where p.id = programacion_id
            and (public.rol_actual() = 'admin'
                or (public.rol_actual() = 'programador' and p.comision_id = public.comision_actual()))
        )
    );
