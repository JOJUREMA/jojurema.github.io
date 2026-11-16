-- ============================================================================
-- CUSSHMI · Falta el CUT de expediente en padron_oficial_a1
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- "Identificación y registro" ya captura cut_expediente (identificacion_registros,
-- Sección C, usuarios sin derecho formalizado) pero incorporarUsuarioNuevoAPadronOficialA1
-- nunca lo pasaba a padron_oficial_a1 — columna 15 del Formato A-2 oficial
-- ("CUT de expediente proceso formalización o regularización"), necesaria
-- para la exportación.
-- ============================================================================

alter table padron_oficial_a1 add column if not exists cut_expediente text;
