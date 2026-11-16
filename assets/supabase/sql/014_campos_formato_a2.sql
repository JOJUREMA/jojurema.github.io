-- ============================================================================
-- CUSSHMI · Campos que faltaban para los Formatos A-1/A-2 oficiales
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Al comparar contra las plantillas oficiales en blanco (R.J. N° 0155-2022-
-- ANA) se confirmó que faltaban 3 campos que ambos formatos piden y que
-- "Identificación y registro" (012) y el padrón oficial A-1 (013) todavía
-- no capturaban:
-- - Tipo de Uso: lo piden AMBOS formatos (A-1 col. 14, A-2 col. 16) — no
--   condicionado a tener o no derecho formalizado.
-- - Canal de Derivación y Fuente de Agua: EXCLUSIVOS del Formato A-2
--   (columnas 13 y 14) — por eso solo tienen sentido cuando tiene_derecho
--   es 'no'/'no_sabe' (clasificación A-2), igual que cut_expediente.
-- ============================================================================

alter table identificacion_registros add column if not exists tipo_uso text;
alter table identificacion_registros add column if not exists canal_derivacion text;
alter table identificacion_registros add column if not exists fuente_agua text;

alter table padron_oficial_a1 add column if not exists canal_derivacion text;
alter table padron_oficial_a1 add column if not exists fuente_agua text;
-- padron_oficial_a1 ya tenía tipo_uso desde 013 (viene del Formato A-1 oficial).
