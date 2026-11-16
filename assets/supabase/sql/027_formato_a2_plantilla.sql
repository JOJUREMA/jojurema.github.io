-- ============================================================================
-- CUSSHMI · Plantilla del Excel de Formato A-2 (Levantamiento de Observaciones)
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Guarda el archivo Excel original tal cual se sube desde escritorio (mismo
-- criterio de bucket privado por comisión que "inventario-fotos",
-- 022_inventario_fotos.sql) — un solo archivo por comisión, sobreescrito
-- cada vez que se vuelve a sincronizar. El exportador
-- (exportarFormatoA2LevantamientoActualizado, Sistema_Riego_CUSSHMI_14.html)
-- vuelve a abrir ESTE mismo archivo con ExcelJS y solo reescribe las filas de
-- datos (16 en adelante) de cada hoja con el estado actual de
-- formato_a2_levantamiento — las filas 1-15 (encabezado institucional +
-- encabezado de columnas fusionado) nunca se tocan, así que el formato del
-- Excel exportado queda garantizado idéntico al oficial.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('formato-a2-plantillas', 'formato-a2-plantillas', false)
on conflict (id) do nothing;

drop policy if exists formatoa2_plantilla_select on storage.objects;
create policy formatoa2_plantilla_select on storage.objects for select
    using (bucket_id = 'formato-a2-plantillas' and (
        public.rol_actual() = 'admin' or (storage.foldername(name))[1] = public.comision_actual()::text
    ));

drop policy if exists formatoa2_plantilla_insert on storage.objects;
create policy formatoa2_plantilla_insert on storage.objects for insert
    with check (bucket_id = 'formato-a2-plantillas' and (
        public.rol_actual() = 'admin' or
        (public.rol_actual() = 'programador' and (storage.foldername(name))[1] = public.comision_actual()::text)
    ));

drop policy if exists formatoa2_plantilla_delete on storage.objects;
create policy formatoa2_plantilla_delete on storage.objects for delete
    using (bucket_id = 'formato-a2-plantillas' and public.rol_actual() = 'admin');
