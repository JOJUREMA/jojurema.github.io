-- ============================================================================
-- CUSSHMI · Fase 6 — Fix: presencia necesita que cada usuario vea su propia
-- fila (no solo el admin), porque el upsert del latido de presencia falla
-- con "new row violates row-level security policy" si Postgres no puede
-- verificar el conflicto contra la fila existente.
-- ============================================================================
drop policy if exists presencia_select_propio on presencia;
create policy presencia_select_propio on presencia for select
    using (usuario_id = auth.uid());
