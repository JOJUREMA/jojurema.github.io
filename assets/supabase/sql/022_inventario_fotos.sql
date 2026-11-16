-- ============================================================================
-- CUSSHMI · Fotos por estructura del Inventario de Infraestructura
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Segundo bucket de este proyecto (el primero fue "sinceramiento-fotos" en
-- 019_sinceramiento_areas.sql) — mismo criterio de aislamiento por comisión,
-- mismo patrón de 3 policies (select/insert/delete).
--
-- A diferencia de Sinceramiento, aquí NO se agrega ninguna columna
-- fotos_urls a inventario_tomas/inventario_compuertas/inventario_estructuras:
-- la sincronización desde Excel hace upsert completo de cada fila y podría
-- borrar esa referencia en el próximo resync. En vez de eso, las fotos se
-- listan directamente desde Storage por carpeta — el resync nunca puede
-- afectarlas porque nunca las toca.
--
-- Ruta de cada archivo: {comision_id}/{tabla}/{registro_id}/{archivo} — el
-- segmento "tabla" adicional (inventario_tomas | inventario_compuertas |
-- inventario_estructuras) evita mezclar fotos de registros con el mismo id
-- entre las 3 tablas. Las políticas de abajo solo verifican el primer
-- segmento (comision_id), igual que sinceramiento-fotos.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('inventario-fotos', 'inventario-fotos', false)
on conflict (id) do nothing;

drop policy if exists inventario_fotos_select on storage.objects;
create policy inventario_fotos_select on storage.objects for select
    using (bucket_id = 'inventario-fotos' and (
        public.rol_actual() = 'admin' or (storage.foldername(name))[1] = public.comision_actual()::text
    ));

drop policy if exists inventario_fotos_insert on storage.objects;
create policy inventario_fotos_insert on storage.objects for insert
    with check (bucket_id = 'inventario-fotos' and (
        public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and (storage.foldername(name))[1] = public.comision_actual()::text)
    ));

drop policy if exists inventario_fotos_delete on storage.objects;
create policy inventario_fotos_delete on storage.objects for delete
    using (bucket_id = 'inventario-fotos' and public.rol_actual() = 'admin');
