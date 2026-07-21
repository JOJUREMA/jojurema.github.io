-- ============================================================================
-- CUSSHMI · Fase 5 PWA (móvil) — Realtime para el Seguimiento PDA
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query (pestaña limpia)
-- Idempotente (usa un bloque condicional para no fallar si ya está agregada).
--
-- El módulo móvil "Seguimiento PDA" muestra en vivo qué usuario está
-- regando ahora mismo, comparando el horario ya guardado en
-- usuarios_g3_seleccionados (Fase 3: inicioTexto/terminoTexto/caudalLs/...)
-- contra la hora actual. Para que la pantalla se actualice sola cuando el
-- personal cambia algo en escritorio (sin que el usuario del celular tenga
-- que refrescar), la tabla necesita estar agregada a la publicación
-- `supabase_realtime` — no lo está por defecto en un proyecto nuevo de
-- Supabase.
-- ============================================================================

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'usuarios_g3_seleccionados'
    ) then
        alter publication supabase_realtime add table usuarios_g3_seleccionados;
    end if;
end $$;
