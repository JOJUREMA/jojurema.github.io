/**
 * Fase 5 — módulo 1: lectura/escritura en vivo de la Nota del Anexo G2.
 *
 * Patrón pensado para repetirse en los siguientes módulos de la Fase 5
 * (programación semanal, horas de riego): cargar desde Supabase al abrir
 * la pantalla, guardar con debounce mientras el usuario escribe, y avisar
 * el estado (guardando/guardado/sin conexión) sin bloquear la escritura.
 *
 * Si Supabase no responde, el guardado local (localStorage, ya existente)
 * sigue funcionando igual que antes — esto es una capa adicional, no un
 * reemplazo que pueda dejar al usuario sin poder guardar su nota.
 */
(function () {
    'use strict';

    const comisionIdCache = {};

    async function resolverComisionId(comisionKey) {
        if (comisionIdCache[comisionKey]) return comisionIdCache[comisionKey];
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('comisiones').select('id').eq('clave', comisionKey).maybeSingle(),
            'resolver comision_id'
        );
        if (error || !data) return null;
        comisionIdCache[comisionKey] = data.id;
        return data.id;
    }

    async function cargarNotaAnexoG2(comisionKey, semanaInicio) {
        if (!comisionKey || !semanaInicio) {
            return { ok: false, texto: '', error: 'Falta comisión o semana activa.' };
        }
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) {
            return { ok: false, texto: '', error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        }
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('notas_anexo_g2').select('texto')
                .eq('comision_id', comisionId).eq('semana_inicio', semanaInicio).maybeSingle(),
            'cargar nota anexo G2'
        );
        if (error) return { ok: false, texto: '', error: error.mensaje };
        return { ok: true, texto: (data && data.texto) || '' };
    }

    async function guardarNotaAnexoG2(comisionKey, semanaInicio, semanaFin, texto) {
        if (!comisionKey || !semanaInicio) return { ok: false, error: 'Falta comisión o semana activa.' };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const { error } = await client.from('notas_anexo_g2').upsert({
            comision_id: comisionId,
            semana_inicio: semanaInicio,
            semana_fin: semanaFin,
            texto: texto,
            actualizado_por: usuarioId,
        }, { onConflict: 'comision_id,semana_inicio' });

        if (error) return { ok: false, error: error.message };
        return { ok: true };
    }

    let debounceTimer = null;

    /**
     * Guarda con espera de 800ms desde la última tecla (evita una llamada
     * de red por cada carácter). `onEstado` recibe 'escribiendo' | 'guardando'
     * | 'guardado' | 'error', para mostrar feedback en la interfaz.
     */
    function guardarNotaAnexoG2Debounced(comisionKey, semanaInicio, semanaFin, texto, onEstado) {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (onEstado) onEstado('escribiendo');
        debounceTimer = setTimeout(async () => {
            if (onEstado) onEstado('guardando');
            const resultado = await guardarNotaAnexoG2(comisionKey, semanaInicio, semanaFin, texto);
            if (onEstado) onEstado(resultado.ok ? 'guardado' : 'error');
        }, 800);
    }

    // ── Fase 5 — módulo 2: Programación semanal + Turnos de riego (horas por cultivo) ──
    // `datosProgramacion` espeja el objeto que hoy vive en consolidadoDemandas[i].
    // `datosTurno` espeja el objeto que hoy vive en window.turnosDeRiego[toma]
    // (incluye caudalesPorDiaDetallado con horasPorCultivo). No se reinterpreta
    // ni se recalcula nada acá — se guarda tal cual lo arma el código existente.
    async function guardarProgramacionYTurno(comisionKey, tomaNombre, semanaInicio, semanaFin, datosProgramacion, datosTurno) {
        if (!comisionKey || !tomaNombre || !semanaInicio) {
            return { ok: false, error: 'Falta comisión, toma o semana activa.' };
        }
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        // Fase 6: historial de versiones — se lee la versión actual (si la fila
        // ya existía) para poder guardar la nueva como version+1, nunca se
        // sobrescribe una versión anterior.
        const { data: filaPrevia } = await client
            .from('programaciones_semanales').select('version')
            .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).eq('semana_inicio', semanaInicio)
            .maybeSingle();
        const nuevaVersion = (filaPrevia?.version || 0) + 1;

        const { data: progRow, error: progError } = await client
            .from('programaciones_semanales')
            .upsert({
                comision_id: comisionId,
                toma_nombre: tomaNombre,
                semana_inicio: semanaInicio,
                semana_fin: semanaFin,
                estado: 'programada',
                datos: datosProgramacion,
                version: nuevaVersion,
                creado_por: usuarioId,
                actualizado_por: usuarioId,
            }, { onConflict: 'comision_id,toma_nombre,semana_inicio' })
            .select('id')
            .single();
        if (progError) return { ok: false, error: progError.message };

        const { error: turnoError } = await client
            .from('turnos_riego')
            .upsert({ programacion_id: progRow.id, datos: datosTurno }, { onConflict: 'programacion_id' });
        if (turnoError) return { ok: false, error: turnoError.message };

        // No se bloquea el guardado si el historial falla — es un registro
        // adicional, no la fuente de verdad (esa es programaciones_semanales).
        const { error: histError } = await client.from('historial_programaciones').insert({
            programacion_id: progRow.id,
            version: nuevaVersion,
            datos: { programacion: datosProgramacion, turno: datosTurno },
            modificado_por: usuarioId,
        });
        if (histError) console.warn('[CusshmiDatos] No se pudo guardar el historial de versiones:', histError.message);

        return { ok: true, id: progRow.id, version: nuevaVersion };
    }

    /**
     * Trae la programación + turno más reciente de Supabase para esa toma en
     * esa semana. Devuelve ok:false (sin error "ruidoso") si simplemente no
     * hay nada programado todavía — es el caso normal la primera vez.
     */
    async function cargarProgramacionYTurno(comisionKey, tomaNombre, semanaInicio) {
        if (!comisionKey || !tomaNombre || !semanaInicio) return { ok: false };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data: prog, error: progErr } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('programaciones_semanales').select('id, datos')
                .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).eq('semana_inicio', semanaInicio)
                .maybeSingle(),
            'cargar programacion semanal'
        );
        if (progErr) return { ok: false, error: progErr.mensaje };
        if (!prog) return { ok: false }; // sin programación todavía, no es un error

        const { data: turno, error: turnoErr } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('turnos_riego').select('datos').eq('programacion_id', prog.id).maybeSingle(),
            'cargar turno de riego'
        );
        if (turnoErr) return { ok: false, error: turnoErr.mensaje };

        return { ok: true, programacionDatos: prog.datos, turnoDatos: turno ? turno.datos : null };
    }

    // ── Fase 5 — módulo 3: usuarios seleccionados por cultivo para el Anexo G3 ──
    // usuarios_g3_seleccionados.programacion_id no admite null (referencia real
    // a programaciones_semanales). Como la selección de usuarios puede pasar
    // ANTES de confirmar "HORAS DE RIEGO POR DÍA" (que es lo que normalmente
    // crea esa fila), este helper la crea como placeholder ('en_edicion',
    // datos:{}) SOLO si todavía no existe — nunca pisa una fila real que ya
    // tenga datos/estado 'programada'.
    async function asegurarProgramacionId(comisionKey, tomaNombre, semanaInicio, semanaFin) {
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }

        const { data: existente, error: selError } = await client
            .from('programaciones_semanales').select('id')
            .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).eq('semana_inicio', semanaInicio)
            .maybeSingle();
        if (selError) return { ok: false, error: selError.message };
        if (existente) return { ok: true, id: existente.id };

        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;
        const { data: nuevo, error: insError } = await client
            .from('programaciones_semanales')
            .insert({
                comision_id: comisionId, toma_nombre: tomaNombre,
                semana_inicio: semanaInicio, semana_fin: semanaFin,
                estado: 'en_edicion', datos: {},
                creado_por: usuarioId, actualizado_por: usuarioId,
            })
            .select('id').single();
        if (insError) return { ok: false, error: insError.message };
        return { ok: true, id: nuevo.id };
    }

    async function guardarUsuariosG3Seleccionados(comisionKey, tomaNombre, semanaInicio, semanaFin, cultivo, usuarios) {
        if (!comisionKey || !tomaNombre || !semanaInicio || !cultivo) {
            return { ok: false, error: 'Falta comisión, toma, semana o cultivo.' };
        }
        const idResult = await asegurarProgramacionId(comisionKey, tomaNombre, semanaInicio, semanaFin);
        if (!idResult.ok) return idResult;

        const client = window.CusshmiSupabase.getClient();
        const { error } = await client.from('usuarios_g3_seleccionados').upsert({
            programacion_id: idResult.id,
            cultivo: cultivo,
            usuarios: usuarios,
        }, { onConflict: 'programacion_id,cultivo' });
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    }

    async function cargarUsuariosG3Seleccionados(comisionKey, tomaNombre, semanaInicio, cultivo) {
        if (!comisionKey || !tomaNombre || !semanaInicio || !cultivo) return { ok: false };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data: prog, error: progErr } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('programaciones_semanales').select('id')
                .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).eq('semana_inicio', semanaInicio)
                .maybeSingle(),
            'cargar programacion (para usuarios G3)'
        );
        if (progErr || !prog) return { ok: false };

        const { data: sel, error: selErr } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('usuarios_g3_seleccionados').select('usuarios')
                .eq('programacion_id', prog.id).eq('cultivo', cultivo).maybeSingle(),
            'cargar usuarios G3 seleccionados'
        );
        if (selErr || !sel) return { ok: false };
        return { ok: true, usuarios: sel.usuarios };
    }

    // ── Fase 5 — módulo 4: PDA / Demandas (listado completo de la semana) ──
    // A diferencia de cargarProgramacionYTurno (una toma puntual), esto trae
    // TODAS las tomas ya confirmadas ('programada') para la comisión+semana
    // activa de una sola vez — es lo que necesita el Consolidado/PDA para
    // mostrar el trabajo de todos los programadores, no solo el propio.
    // Las filas 'en_edicion' (placeholders de usuarios_g3_seleccionados sin
    // horas confirmadas todavía) se excluyen a propósito: no son una
    // demanda real todavía.
    async function cargarTodasLasProgramaciones(comisionKey, semanaInicio) {
        if (!comisionKey || !semanaInicio) return { ok: false, programaciones: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, programaciones: [] };

        const { data: progs, error: progErr } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('programaciones_semanales')
                .select('id, toma_nombre, datos')
                .eq('comision_id', comisionId).eq('semana_inicio', semanaInicio).eq('estado', 'programada'),
            'cargar todas las programaciones de la semana'
        );
        if (progErr || !progs) return { ok: false, programaciones: [] };
        if (progs.length === 0) return { ok: true, programaciones: [] };

        const ids = progs.map((p) => p.id);
        const { data: turnos } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('turnos_riego').select('programacion_id, datos').in('programacion_id', ids),
            'cargar turnos de todas las tomas de la semana'
        );
        const turnoPorProgId = {};
        (turnos || []).forEach((t) => { turnoPorProgId[t.programacion_id] = t.datos; });

        return {
            ok: true,
            programaciones: progs.map((p) => ({
                toma: p.toma_nombre,
                datos: p.datos,
                turno: turnoPorProgId[p.id] || null,
            })),
        };
    }

    window.CusshmiDatos = {
        cargarNotaAnexoG2,
        guardarNotaAnexoG2,
        guardarNotaAnexoG2Debounced,
        guardarProgramacionYTurno,
        cargarProgramacionYTurno,
        cargarTodasLasProgramaciones,
        guardarUsuariosG3Seleccionados,
        cargarUsuariosG3Seleccionados,
    };
})();
