-- ============================================================================
-- CUSSHMI · Registrar las comisiones por topos (Huaro, Patacancha, Tiaparo) en Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- El acceso de la aplicación es con usuario y contraseña de Supabase Auth; la comisión de cada usuario sale de
-- profiles.comision_id. Estas tres comisiones no estaban en la tabla `comisiones`, así que solo un admin podía
-- entrar a ellas (eligiéndolas en el modal). Con estas filas se puede asignar un usuario (programador / consulta)
-- directamente a una de ellas.
-- ============================================================================

insert into comisiones (clave, nombre) values
    ('HUARO',      'Comisión de Regantes de Huaro'),
    ('PATACANCHA', 'Comisión de Usuarios del Sub Sector Hidráulico Quebrada Patacancha - Yuracmayu - Ollantaytambo'),
    ('TIAPARO',    'Comité de Usuarios Tiaparo - Comisión de Usuarios de Agua de las Microcuencas Huaytampo y Runtumayo')
on conflict (clave) do nothing;

-- Verificación: deben aparecer HUARO, PATACANCHA y TIAPARO junto a las demás comisiones.
select clave, nombre from comisiones order by clave;

-- ── REVISIÓN DE USUARIOS (solo lectura) ─────────────────────────────────────
-- Quién puede entrar, con qué rol y a qué comisión. Revisa que no haya usuarios que ya no deban tener acceso
-- (si hay, desactívalos con:  update profiles set activo = false where nombre_usuario = 'nombre.apellido';).
select p.nombre_usuario, p.rol, p.activo, c.clave as comision
from profiles p left join comisiones c on c.id = p.comision_id
order by p.rol, c.clave, p.nombre_usuario;

-- ── ALTA DE UN USUARIO PARA TIAPARO (plantilla) ─────────────────────────────
-- 1) Dashboard → Authentication → Users → "Add user":  Email  nombre.apellido@cusshmi.local  (minúsculas, sin tildes),
--    Password: una contraseña NUEVA y larga (no reutilices las antiguas), "Auto Confirm User" activado.
-- 2) Copia el UUID del usuario y corre (cambia los datos):
--
--   insert into profiles (id, primer_nombre, primer_apellido, nombre_usuario, rol, comision_id)
--   values (
--       'UUID-DEL-USUARIO-DE-AUTH', 'Nombre', 'Apellido', 'nombre.apellido',
--       'programador',
--       (select id from comisiones where clave = 'TIAPARO')
--   );
