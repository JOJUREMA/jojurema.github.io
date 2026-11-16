-- Ejecutar en Supabase Dashboard → SQL Editor.
--
-- Anexo G-3 con reparto por islas de días no consecutivos (ver
-- assets/core/utilidades.js, agruparDiasEnIslas): una misma área puede ahora
-- tener 2+ entradas en toma.usuarios (una por isla, ej. "Miércoles" y
-- "Sábado" para el mismo cultivo). El enlace público de confirmación del
-- G-4 (g4_confirmaciones) se buscaba/creaba por
-- (programacion_id, cultivo, usuario_nombre, unidad_catastral) — sin
-- distinguir día — así que generar el enlace de la isla del sábado
-- encontraba la fila ya creada para la isla del miércoles y devolvía el
-- mismo token con los datos del miércoles. Se agrega clave_dia a la clave
-- única para que cada isla tenga su propio enlace/token.

alter table g4_confirmaciones add column if not exists clave_dia text not null default '';

-- Nombre de restricción autogenerado por Postgres al crear la tabla
-- (010_confirmacion_g4.sql, unique inline sobre 4 columnas) — si el DROP
-- falla porque el nombre real es distinto, revisar con:
--   select conname from pg_constraint where conrelid = 'g4_confirmaciones'::regclass and contype='u';
-- y reemplazar el nombre abajo antes de reintentar.
alter table g4_confirmaciones
    drop constraint if exists g4_confirmaciones_programacion_id_cultivo_usuario_nombre_unidad_catastral_key;

alter table g4_confirmaciones
    add constraint g4_confirmaciones_clave_unica
    unique (programacion_id, cultivo, usuario_nombre, unidad_catastral, clave_dia);
