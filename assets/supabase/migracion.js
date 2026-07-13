/**
 * Migración de localStorage → Supabase — Fase 4.
 *
 * Solo migra (copia). Nunca borra datos locales por su cuenta — eso queda
 * como un paso aparte y explícito (limpiarClaveLocalStorage), para poder
 * verificar antes de eliminar, tal como pide el requisito de la fase.
 *
 * Cubre las llaves que existen hoy en localStorage:
 *   cusshmi_programacion_por_toma__{comision}__{semanaInicio}__{semanaFin}
 *     → { programacionPorToma, consolidadoDemandas, usuariosG3,
 *         turnosDeRiego, g3Programadas, notaAnexoG2 }
 *
 * Fuera de alcance a propósito: `g3Programadas` (índice de fila dentro de
 * la lista de tomas del G3 en pantalla — no es un identificador estable,
 * es solo una marca visual "✔ Programada" en el selector; se queda como
 * estado local, no aporta nada persistir un índice que cambia según el
 * orden de consolidadoDemandas de cada sesión).
 *
 * No modifica ninguna variable global del sistema ni ninguna lógica de
 * cálculo — solo lee localStorage y escribe en Supabase.
 */
(function () {
    'use strict';

    const PREFIJO = 'cusshmi_programacion_por_toma__';

    function listarClavesLocalStorage() {
        const claves = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(PREFIJO)) claves.push(k);
        }
        return claves;
    }

    function parsearClave(key) {
        const resto = key.slice(PREFIJO.length);
        const [comisionKey, semanaInicio, semanaFin] = resto.split('__');
        return { comisionKey, semanaInicio, semanaFin };
    }

    async function resolverComisionId(client, comisionKey) {
        const { data, error } = await client
            .from('comisiones')
            .select('id')
            .eq('clave', comisionKey)
            .maybeSingle();
        if (error || !data) return null;
        return data.id;
    }

    /**
     * Migra una sola llave de localStorage. Devuelve un reporte detallado
     * por toma (para poder mostrarlo o auditar qué pasó exactamente).
     */
    async function migrarClave(key) {
        const client = window.CusshmiSupabase.getClient();
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const { comisionKey, semanaInicio, semanaFin } = parsearClave(key);
        const reporte = { key, comisionKey, semanaInicio, semanaFin, tomas: [], notaG2: null, error: null };

        let payload;
        try {
            payload = JSON.parse(localStorage.getItem(key));
        } catch (e) {
            reporte.error = 'No se pudo leer/parsear la llave: ' + e.message;
            return reporte;
        }
        if (!payload || typeof payload !== 'object') {
            reporte.error = 'Contenido vacío o con formato inesperado.';
            return reporte;
        }

        const consolidado = Array.isArray(payload.consolidadoDemandas) ? payload.consolidadoDemandas : [];
        const turnos = payload.turnosDeRiego || {};
        const usuariosG3 = payload.usuariosG3 || {};
        const notaTexto = payload.notaAnexoG2 || '';

        if (consolidado.length === 0) {
            reporte.error = 'Sin filas en consolidadoDemandas — nada que migrar para esta llave.';
            return reporte;
        }

        const comisionId = await resolverComisionId(client, comisionKey);
        if (!comisionId) {
            reporte.error = `No existe la comisión "${comisionKey}" en la tabla comisiones.`;
            return reporte;
        }

        for (const item of consolidado) {
            const tomaReporte = { toma: item.toma, programacion: 'pendiente', turno: 'pendiente', usuariosG3: [] };
            try {
                const { data: progRow, error: progError } = await client
                    .from('programaciones_semanales')
                    .upsert({
                        comision_id: comisionId,
                        toma_nombre: item.toma,
                        semana_inicio: item.semanaInicio || semanaInicio,
                        semana_fin: item.semanaFin || semanaFin,
                        estado: 'programada',
                        datos: item,
                        actualizado_por: usuarioId,
                        creado_por: usuarioId,
                    }, { onConflict: 'comision_id,toma_nombre,semana_inicio' })
                    .select('id')
                    .single();

                if (progError) {
                    tomaReporte.programacion = 'ERROR: ' + progError.message;
                    reporte.tomas.push(tomaReporte);
                    continue;
                }
                tomaReporte.programacion = 'OK';
                const programacionId = progRow.id;

                const turno = turnos[item.toma];
                if (turno) {
                    const { error: turnoError } = await client
                        .from('turnos_riego')
                        .upsert({
                            programacion_id: programacionId,
                            datos: turno,
                        }, { onConflict: 'programacion_id' });
                    tomaReporte.turno = turnoError ? ('ERROR: ' + turnoError.message) : 'OK';
                } else {
                    tomaReporte.turno = 'sin datos (no había turno guardado para esta toma)';
                }

                const cultivosDeLaToma = Array.isArray(item.cultivos) ? item.cultivos : [];
                for (const c of cultivosDeLaToma) {
                    const claveUsuarios = item.toma + '|' + c.cultivo;
                    const usuarios = usuariosG3[claveUsuarios];
                    if (!usuarios) continue;
                    const { error: usrError } = await client
                        .from('usuarios_g3_seleccionados')
                        .upsert({
                            programacion_id: programacionId,
                            cultivo: c.cultivo,
                            usuarios: usuarios,
                        }, { onConflict: 'programacion_id,cultivo' });
                    tomaReporte.usuariosG3.push({ cultivo: c.cultivo, resultado: usrError ? ('ERROR: ' + usrError.message) : 'OK' });
                }
            } catch (e) {
                tomaReporte.programacion = 'EXCEPCIÓN: ' + e.message;
            }
            reporte.tomas.push(tomaReporte);
        }

        if (notaTexto.trim()) {
            const { error: notaError } = await client
                .from('notas_anexo_g2')
                .upsert({
                    comision_id: comisionId,
                    semana_inicio: semanaInicio,
                    semana_fin: semanaFin,
                    texto: notaTexto,
                    actualizado_por: usuarioId,
                }, { onConflict: 'comision_id,semana_inicio' });
            reporte.notaG2 = notaError ? ('ERROR: ' + notaError.message) : 'OK';
        } else {
            reporte.notaG2 = 'sin nota';
        }

        return reporte;
    }

    /**
     * Punto de entrada: migra TODAS las llaves de programación que haya en
     * este navegador (puede haber más de una semana guardada). Uso manual
     * desde la consola, o desde un botón que se agregue más adelante:
     *
     *   const reportes = await CusshmiMigracion.migrarTodoLocalStorage();
     *   console.table(reportes.map(r => ({ key: r.key, tomas: r.tomas.length, error: r.error })));
     */
    async function migrarTodoLocalStorage() {
        const claves = listarClavesLocalStorage();
        const reportes = [];
        for (const key of claves) {
            reportes.push(await migrarClave(key));
        }
        return reportes;
    }

    /**
     * Borra UNA llave de localStorage ya migrada. Se llama a propósito,
     * nunca automáticamente — solo después de revisar el reporte de
     * migrarTodoLocalStorage() y confirmar que todo quedó bien.
     */
    function limpiarClaveLocalStorage(key) {
        localStorage.removeItem(key);
    }

    window.CusshmiMigracion = {
        listarClavesLocalStorage,
        migrarTodoLocalStorage,
        limpiarClaveLocalStorage,
    };
})();
