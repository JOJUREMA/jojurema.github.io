-- ============================================================================
-- CUSSHMI · Mapas de los bloques de riego (BLOQUE_*.kml) en almacenamiento PRIVADO
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Esos .kml traen el nombre y el número de documento de cada usuario (datos personales), por eso ya no se
-- publican como archivos del sitio: se guardan en el bucket privado 'mapas-bloques' y la aplicación los lee con
-- la sesión iniciada (CusshmiDatos.descargarKmlBloque, assets/supabase/datos.js).
--
-- Lectura: cualquier usuario autenticado con un rol de CUSSHMI (admin, programador, etc.).
-- Escritura (subir / reemplazar / borrar): solo admin.
-- Después de ejecutar este SQL: Storage → mapas-bloques → Upload → subir los 9 archivos BLOQUE_*.kml
-- (carpeta "1_mapas_bloques_PARA_SUBIR_a_supabase"), directamente en la raíz del bucket, sin subcarpetas.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('mapas-bloques', 'mapas-bloques', false)
on conflict (id) do update set public = false;

drop policy if exists mapasbloques_select on storage.objects;
create policy mapasbloques_select on storage.objects for select
    using (bucket_id = 'mapas-bloques' and public.rol_actual() is not null);

drop policy if exists mapasbloques_insert on storage.objects;
create policy mapasbloques_insert on storage.objects for insert
    with check (bucket_id = 'mapas-bloques' and public.rol_actual() = 'admin');

drop policy if exists mapasbloques_update on storage.objects;
create policy mapasbloques_update on storage.objects for update
    using (bucket_id = 'mapas-bloques' and public.rol_actual() = 'admin');

drop policy if exists mapasbloques_delete on storage.objects;
create policy mapasbloques_delete on storage.objects for delete
    using (bucket_id = 'mapas-bloques' and public.rol_actual() = 'admin');
