/**
 * Fase 6 — Bloqueo por toma.
 *
 * Reglas (ver requisitos del proyecto):
 *  - El bloqueo es por TOMA, nunca global — el resto de tomas de la
 *    comisión siguen disponibles mientras una está en edición.
 *  - Si nadie actualiza la actividad del bloqueo durante MINUTOS_EXPIRACION,
 *    se considera abandonado y cualquier programador de la misma comisión
 *    puede tomarlo — la regla de vencimiento está reforzada en las
 *    políticas RLS (004_bloqueo_toma.sql), no es solo una convención de
 *    este archivo.
 *  - El administrador siempre puede entrar, incluso a una toma bloqueada
 *    por otro usuario — eso se decide en la UI (no acá), que debe mostrar
 *    el aviso de quién la tiene antes de dejarlo pasar.
 */
(function () {
    'use strict';

    const MINUTOS_EXPIRACION = 20;

    const comisionIdCache = {};
    async function resolverComisionId(comisionKey) {
        if (comisionIdCache[comisionKey]) return comisionIdCache[comisionKey];
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('comisiones').select('id').eq('clave', comisionKey).maybeSingle(),
            'resolver comision_id (bloqueo)'
        );
        if (error || !data) return null;
        comisionIdCache[comisionKey] = data.id;
        return data.id;
    }

    async function obtenerUsuarioActualId() {
        const client = window.CusshmiSupabase.getClient();
        const { data } = await client.auth.getSession();
        return data?.session?.user?.id || null;
    }

    async function obtenerBloqueo(comisionId, tomaNombre) {
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('bloqueos_toma')
                .select('id, usuario_id, iniciado_en, ultima_actividad, profiles(nombre_usuario, primer_nombre, primer_apellido)')
                .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).maybeSingle(),
            'obtener bloqueo de toma'
        );
        if (error) return { error: error.mensaje };
        return { data };
    }

    function estaExpirado(bloqueo) {
        const ultima = new Date(bloqueo.ultima_actividad).getTime();
        return (Date.now() - ultima) > MINUTOS_EXPIRACION * 60 * 1000;
    }

    function nombreDe(bloqueo) {
        const p = bloqueo.profiles;
        return p ? (p.primer_nombre + ' ' + p.primer_apellido) : 'otro usuario';
    }

    /**
     * Intenta tomar el bloqueo de una toma.
     * Devuelve:
     *   { ok:true, tomadoPorInactividad:bool }
     *   { ok:false, bloqueadoPor:{ nombre, desde } }   -> alguien más la tiene, sigue vigente
     *   { ok:false, error }                            -> problema de conexión/permiso
     */
    async function intentarBloquearToma(comisionKey, tomaNombre) {
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'Comisión no encontrada.' };
        const usuarioId = await obtenerUsuarioActualId();
        if (!usuarioId) return { ok: false, error: 'Sesión no válida.' };

        const { data: existente, error: errObtener } = await obtenerBloqueo(comisionId, tomaNombre);
        if (errObtener) return { ok: false, error: errObtener };

        const client = window.CusshmiSupabase.getClient();
        const ahora = new Date().toISOString();

        if (existente && existente.usuario_id === usuarioId) {
            await client.from('bloqueos_toma').update({ ultima_actividad: ahora }).eq('id', existente.id);
            return { ok: true };
        }

        if (existente && !estaExpirado(existente)) {
            return { ok: false, bloqueadoPor: { nombre: nombreDe(existente), desde: existente.iniciado_en } };
        }

        // Sin bloqueo previo, o vencido por inactividad: se toma (upsert).
        const { error } = await client.from('bloqueos_toma').upsert({
            comision_id: comisionId,
            toma_nombre: tomaNombre,
            usuario_id: usuarioId,
            iniciado_en: ahora,
            ultima_actividad: ahora,
        }, { onConflict: 'comision_id,toma_nombre' });
        if (error) return { ok: false, error: error.message };
        return { ok: true, tomadoPorInactividad: !!existente };
    }

    /** Suelta el bloqueo, pero solo si es tuyo (uso normal: al terminar de editar). */
    async function liberarBloqueoToma(comisionKey, tomaNombre) {
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false };
        const usuarioId = await obtenerUsuarioActualId();
        const client = window.CusshmiSupabase.getClient();
        const { error } = await client.from('bloqueos_toma').delete()
            .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).eq('usuario_id', usuarioId);
        return { ok: !error };
    }

    /** Libera el bloqueo sin importar el dueño — RLS exige rol admin para esto. */
    async function liberarBloqueoComoAdmin(comisionKey, tomaNombre) {
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false };
        const client = window.CusshmiSupabase.getClient();
        const { error } = await client.from('bloqueos_toma').delete()
            .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre);
        return { ok: !error, error: error?.message };
    }

    /** Late de actividad — llamar cada pocos minutos mientras la toma sigue abierta. */
    async function latidoBloqueoToma(comisionKey, tomaNombre) {
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return;
        const usuarioId = await obtenerUsuarioActualId();
        if (!usuarioId) return;
        const client = window.CusshmiSupabase.getClient();
        await client.from('bloqueos_toma').update({ ultima_actividad: new Date().toISOString() })
            .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).eq('usuario_id', usuarioId);
    }

    /** Todos los bloqueos activos de una comisión — para el panel de administrador. */
    async function listarBloqueosComision(comisionKey) {
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return [];
        const { data } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('bloqueos_toma')
                .select('toma_nombre, usuario_id, iniciado_en, ultima_actividad, profiles(nombre_usuario, primer_nombre, primer_apellido, rol)')
                .eq('comision_id', comisionId),
            'listar bloqueos de la comision'
        );
        return data || [];
    }

    window.CusshmiBloqueo = {
        MINUTOS_EXPIRACION,
        intentarBloquearToma,
        liberarBloqueoToma,
        liberarBloqueoComoAdmin,
        latidoBloqueoToma,
        listarBloqueosComision,
    };
})();
