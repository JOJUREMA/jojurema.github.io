-- Migración: polígono propio por usuario del Padrón A-1 (independiente
-- del KML del bloque de riego y de formato_a2_levantamiento).
-- Ejecutar en el SQL Editor del proyecto real de Supabase de CUSSHMI
-- (hhjrkoyvtrwdrshkibds.supabase.co) — 100% aditiva, no toca datos ni
-- filas existentes, no requiere downtime.

alter table public.padron_oficial_a1
  add column if not exists vertices_utm jsonb,
  add column if not exists poligono_actualizado_en timestamptz;

comment on column public.padron_oficial_a1.vertices_utm is
  'Polígono del predio editado/creado a mano desde "Padrón CUSSHMI" (arreglo de {orden,easting,northing,lat,lon}), independiente del KML del bloque de riego y de formato_a2_levantamiento. NULL = sin polígono propio (se usa como respaldo el predio del KML del bloque, si hay coincidencia por nombre/UC).';

comment on column public.padron_oficial_a1.poligono_actualizado_en is
  'Fecha/hora de la última edición de vertices_utm. NULL si nunca se editó.';
