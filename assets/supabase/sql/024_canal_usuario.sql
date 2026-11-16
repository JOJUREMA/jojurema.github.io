-- ============================================================================
-- CUSSHMI · Canal en padron_oficial_a1 (para reasignar usuarios entre
-- Canales Laterales desde la ficha del Mapa de Inventario)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Hoy padron_oficial_a1 solo sabe a qué TOMA pertenece cada usuario
-- (toma_nombre, ver 016_toma_padron_oficial_a1.sql) — no hay ningún dato
-- de a qué Canal Lateral específico está asignado dentro de esa toma. Se
-- agrega acá para que la ficha de un Canal Lateral (movil/
-- inventario-infraestructura.html) pueda listar "sus" usuarios y permitir
-- reasignar uno a otro canal de la misma toma. Sin valor por defecto: un
-- usuario sin canal_nombre asignado simplemente no aparece bajo ningún
-- canal todavía (no se inventa una asignación).
-- ============================================================================

alter table padron_oficial_a1 add column if not exists canal_nombre text;
create index if not exists idx_padronA1_canal on padron_oficial_a1 (comision_id, toma_nombre, canal_nombre);
