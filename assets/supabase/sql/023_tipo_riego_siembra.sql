-- Ejecutar en Supabase Dashboard → SQL Editor.
-- Agrega el tipo de riego (Gravedad/Aspersión/Goteo/Otro) a la Declaración
-- de Intención de Siembra — hasta ahora el Formato E-4.1 marcaba la casilla
-- "TIPO DE RIEGO (MARCAR CON X)" con el tipo más frecuente en el padrón de
-- toda la toma (padron_usuarios.tipo_riego), no con lo que cada usuario
-- declaró en su propia intención de siembra.

alter table siembra_intenciones
    add column if not exists tipo_riego text check (tipo_riego in ('Gravedad', 'Aspersión', 'Goteo', 'Otro'));
