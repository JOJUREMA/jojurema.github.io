/**
 * Fase 6 — Auditoría.
 *
 * Registro de acciones: usuario, fecha/hora (automática, la pone Postgres),
 * acción, módulo, y opcionalmente el registro afectado. Pensado para
 * llamarse "en caliente" desde cualquier punto del código sin await
 * bloqueante — si falla (sin conexión, etc.) solo se avisa por consola,
 * nunca debe impedir que la acción real del usuario se complete.
 */
(function () {
    'use strict';

    async function registrarAuditoria(accion, modulo, registroAfectado, valorAnterior, valorNuevo) {
        if (!window.CusshmiSupabase) return;
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return;
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;
        if (!usuarioId) return; // sin sesión no hay a quién atribuir la acción

        const { error } = await client.from('auditoria').insert({
            usuario_id: usuarioId,
            accion: accion,
            modulo: modulo,
            registro_afectado: registroAfectado || null,
            valor_anterior: (valorAnterior === undefined) ? null : valorAnterior,
            valor_nuevo: (valorNuevo === undefined) ? null : valorNuevo,
        });
        if (error) console.warn('[CusshmiAuditoria] No se pudo registrar la acción "' + accion + '":', error.message);
    }

    /**
     * Historial propio (o de todos, si eres admin — lo decide RLS, no este
     * código). Uso previsto para el panel de administrador.
     */
    async function listarAuditoria(limite) {
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('auditoria')
                .select('id, usuario_id, accion, modulo, registro_afectado, creado_en, profiles(nombre_usuario, primer_nombre, primer_apellido)')
                .order('creado_en', { ascending: false })
                .limit(limite || 100),
            'listar auditoría'
        );
        if (error) return [];
        return data || [];
    }

    window.CusshmiAuditoria = { registrarAuditoria, listarAuditoria };
})();
