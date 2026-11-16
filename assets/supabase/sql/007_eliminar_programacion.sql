-- ============================================================================
-- CUSSHMI · Fase 6+ — Permitir eliminar una programación completa
-- Al borrar una fila de programaciones_semanales, el ON DELETE CASCADE
-- necesita borrar también sus filas de historial_programaciones — pero esa
-- tabla nunca tuvo política de DELETE (a propósito, solo se podía leer e
-- insertar). Sin este permiso, el cascade fallaría con "permission denied"
-- y la eliminación completa no funcionaría.
-- Solo admin puede llegar hasta acá de todas formas, porque
-- prog_sem_delete (la política de la fila padre) ya es admin-only.
-- ============================================================================
drop policy if exists historial_delete on historial_programaciones;
create policy historial_delete on historial_programaciones for delete
    using (public.rol_actual() = 'admin');
