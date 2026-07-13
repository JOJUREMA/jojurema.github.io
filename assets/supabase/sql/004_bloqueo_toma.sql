-- ============================================================================
-- CUSSHMI · Fase 6 — Ajustes de RLS para el bloqueo por toma
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
-- ============================================================================

-- ── profiles: ver compañeros de la misma comisión ─────────────────────────
-- Necesario para poder mostrar "bloqueada por Saul Moran desde las 10:15" —
-- con las políticas de la Fase 2 (solo tu propio perfil, o admin ve todo),
-- un programador no podía ver el nombre de OTRO programador de su misma
-- comisión. No es información sensible (nombre + rol), así que se habilita
-- dentro de la misma comisión únicamente.
drop policy if exists profiles_select_misma_comision on profiles;
create policy profiles_select_misma_comision on profiles for select
    using (comision_id = public.comision_actual());

-- ── bloqueos_toma: permitir tomar un bloqueo vencido por inactividad ──────
-- Antes (Fase 3) solo el dueño del bloqueo o un admin podían borrarlo. Para
-- que cualquier programador de la misma comisión pueda "recuperar" una toma
-- cuya última actividad ya superó el tiempo de expiración, la regla de
-- vencimiento se evalúa en el propio Postgres (no solo en el JS del
-- navegador) — así el vencimiento es una regla de seguridad real, no una
-- convención que el cliente podría ignorar.
drop policy if exists bloqueos_delete on bloqueos_toma;
create policy bloqueos_delete on bloqueos_toma for delete
    using (
        public.rol_actual() = 'admin'
        or usuario_id = auth.uid()
        or (comision_id = public.comision_actual() and ultima_actividad < now() - interval '20 minutes')
    );

drop policy if exists bloqueos_update on bloqueos_toma;
create policy bloqueos_update on bloqueos_toma for update
    using (
        public.rol_actual() = 'admin'
        or usuario_id = auth.uid()
        or (comision_id = public.comision_actual() and ultima_actividad < now() - interval '20 minutes')
    )
    with check (
        public.rol_actual() = 'admin' or comision_id = public.comision_actual()
    );
