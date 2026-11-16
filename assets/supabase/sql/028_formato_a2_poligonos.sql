-- ============================================================================
-- CUSSHMI · Formato A-2 (Levantamiento) — polígono medido en campo
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- La opción "Medir área" del editor de mapa (movil/identificacion-registro.html)
-- hasta ahora solo calculaba hectáreas y las descartaba al cerrar el editor —
-- esta columna guarda el polígono en sí, para poder exportarlo a KML con toda
-- la información del Formato A-2 de ese usuario (ver
-- exportarPoligonosFormatoA2Levantamiento, Sistema_Riego_CUSSHMI_14.html).
-- Mismo nombre de columna que ya usa sinceramiento_areas.vertices_utm para el
-- mismo concepto (lista de vértices en UTM) — se reutiliza por consistencia.
-- ============================================================================

alter table formato_a2_levantamiento
    add column if not exists vertices_utm jsonb not null default '[]'::jsonb;
-- [{orden, easting, northing, lat, lon, origen:'manual'|'gps'}, ...] — el
-- último polígono medido/cerrado para este usuario (se sobreescribe cada vez
-- que se cierra uno nuevo). Vacío = nunca se midió un área para este registro.
