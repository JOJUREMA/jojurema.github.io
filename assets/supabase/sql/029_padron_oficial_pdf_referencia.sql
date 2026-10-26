-- ============================================================================
-- CUSSHMI · Padrón oficial de referencia (PDF) por comisión — límite del Padrón A-1 / A-2
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente.
--
-- Guarda, por comisión y grupo ('a1' = con licencia, 'a2' = sin licencia: permiso + sin derecho), la lista de
-- predios que figura en los PDF oficiales de la Junta (Anexo A-1 / Anexo A-2). La app (Padrón CUSSHMI,
-- Formato A-1/A-2) la usa SOLO para limitar lo que se muestra y exporta del padrón_oficial_a1: cada fila oficial
-- se empareja con a lo sumo una fila de la base. No modifica ni borra padron_oficial_a1.
--
-- filas: arreglo JSON de predios [nombre, nroDocumento, unidadCatastral, areaTotalHa, areaRiegoHa, clase].
-- resumen: {usuarios, predios, areaTotal, areaRiego} tal como lo declara el PDF oficial.
-- Contiene datos personales: queda en tabla privada con RLS (lectura solo admin o la propia comisión;
-- escritura solo admin), igual que padron_oficial_a1.
-- ============================================================================

create table if not exists padron_oficial_pdf_referencia (
    comision_id uuid not null references comisiones(id),
    grupo text not null check (grupo in ('a1','a2')),
    fecha text,
    resumen jsonb,
    filas jsonb not null,
    actualizado_en timestamptz not null default now(),
    primary key (comision_id, grupo)
);

alter table padron_oficial_pdf_referencia enable row level security;

drop policy if exists padronPdfRef_select on padron_oficial_pdf_referencia;
create policy padronPdfRef_select on padron_oficial_pdf_referencia for select
    using (public.rol_actual() = 'admin' or comision_id = public.comision_actual());

drop policy if exists padronPdfRef_insert on padron_oficial_pdf_referencia;
create policy padronPdfRef_insert on padron_oficial_pdf_referencia for insert
    with check (public.rol_actual() = 'admin');

drop policy if exists padronPdfRef_update on padron_oficial_pdf_referencia;
create policy padronPdfRef_update on padron_oficial_pdf_referencia for update
    using (public.rol_actual() = 'admin');

drop policy if exists padronPdfRef_delete on padron_oficial_pdf_referencia;
create policy padronPdfRef_delete on padron_oficial_pdf_referencia for delete
    using (public.rol_actual() = 'admin');

grant select, insert, update, delete on padron_oficial_pdf_referencia to authenticated;
