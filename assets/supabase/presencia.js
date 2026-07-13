/**
 * Fase 6 — Panel de usuarios conectados (solo administrador).
 *
 * Una fila de presencia por usuario, que se refresca con cada latido. No
 * hay una columna de "estado": "conectado" se decide comparando
 * ultima_actividad contra MINUTOS_CONECTADO en el momento de listar, para
 * no tener que sincronizar un estado que cambia solo con el paso del tiempo.
 */
(function () {
    'use strict';

    const MINUTOS_CONECTADO = 5;

    const comisionIdCache = {};
    async function resolverComisionId(comisionKey) {
        if (comisionIdCache[comisionKey]) return comisionIdCache[comisionKey];
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('comisiones').select('id').eq('clave', comisionKey).maybeSingle(),
            'resolver comision_id (presencia)'
        );
        if (error || !data) return null;
        comisionIdCache[comisionKey] = data.id;
        return data.id;
    }

    async function latidoPresencia(comisionKey) {
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return;
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return;
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;
        if (!usuarioId) return;

        await client.from('presencia').upsert({
            usuario_id: usuarioId,
            comision_id: comisionId,
            ultima_actividad: new Date().toISOString(),
        }, { onConflict: 'usuario_id' });
    }

    /**
     * Solo funciona para administradores (RLS lo exige, devuelve vacío para
     * cualquier otro rol). Cruza presencia con bloqueos_toma para mostrar
     * qué toma tiene abierta cada usuario, si alguna.
     */
    async function listarUsuariosConectados(comisionKey) {
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return [];

        const { data: presencias } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('presencia')
                .select('usuario_id, conectado_desde, ultima_actividad, profiles(nombre_usuario, primer_nombre, primer_apellido, rol)')
                .eq('comision_id', comisionId),
            'listar presencia'
        );
        const { data: bloqueos } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('bloqueos_toma').select('usuario_id, toma_nombre').eq('comision_id', comisionId),
            'listar bloqueos (para presencia)'
        );
        const tomaPorUsuario = {};
        (bloqueos || []).forEach((b) => { tomaPorUsuario[b.usuario_id] = b.toma_nombre; });

        const ahora = Date.now();
        return (presencias || []).map((p) => {
            const minutosInactivo = (ahora - new Date(p.ultima_actividad).getTime()) / 60000;
            return {
                nombre: p.profiles ? (p.profiles.primer_nombre + ' ' + p.profiles.primer_apellido) : p.usuario_id,
                nombreUsuario: p.profiles ? p.profiles.nombre_usuario : null,
                rol: p.profiles ? p.profiles.rol : null,
                conectado: minutosInactivo <= MINUTOS_CONECTADO,
                tomaAbierta: tomaPorUsuario[p.usuario_id] || null,
                conectadoDesde: p.conectado_desde,
                ultimaActividad: p.ultima_actividad,
            };
        }).sort((a, b) => (b.conectado - a.conectado) || (new Date(b.ultimaActividad) - new Date(a.ultimaActividad)));
    }

    window.CusshmiPresencia = { latidoPresencia, listarUsuariosConectados, MINUTOS_CONECTADO };
})();
