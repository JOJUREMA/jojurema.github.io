-- ============================================================================
-- CUSSHMI · Fase 2 — Grants faltantes
-- Necesario porque el proyecto se creó con "Automatically expose new tables"
-- desactivado (decisión deliberada, defensa en profundidad): las tablas
-- nuevas no reciben privilegios por defecto para los roles de la Data API,
-- aunque tengan RLS y políticas correctas. Sin este GRANT, Postgres corta
-- el acceso ANTES de evaluar RLS ("permission denied for table profiles").
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- Idempotente.
-- ============================================================================

grant usage on schema public to authenticated;

grant select on public.comisiones to authenticated;
grant select on public.profiles to authenticated;

-- Los policies de RLS invocan estas funciones; el rol que ejecuta la
-- consulta (authenticated) necesita permiso para llamarlas.
grant execute on function public.rol_actual() to authenticated;
grant execute on function public.comision_actual() to authenticated;

-- anon (sin sesión) NO recibe ningún grant: coincide con el requisito de
-- "no permitir acceso al sistema sin autenticación".
