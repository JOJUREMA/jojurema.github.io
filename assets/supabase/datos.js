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
                programacionId: p.id, // Fase 5: lo necesita suscribirseATomaEnVivo
            })),
        };
    }

    // Lista las semanas (semana_inicio/semana_fin) que tienen al menos una
    // toma con estado 'programada' para la comisión — para el selector de
    // semana del móvil (PDA Programado / Seguimiento), que antes solo podía
    // mostrar la semana calendario actual. Una fila por toma en la tabla,
    // así que se deduplica por semana_inicio antes de devolver.
    async function listarSemanasConProgramacion(comisionKey) {
        if (!comisionKey) return { ok: false, semanas: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, semanas: [] };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('programaciones_semanales')
                .select('semana_inicio, semana_fin')
                .eq('comision_id', comisionId)
                .eq('estado', 'programada')
                .order('semana_inicio', { ascending: false }),
            'listar semanas con programación'
        );
        if (error || !data) return { ok: false, semanas: [] };

        const vistas = new Set();
        const semanas = [];
        data.forEach((fila) => {
            if (vistas.has(fila.semana_inicio)) return;
            vistas.add(fila.semana_inicio);
            semanas.push({ semanaInicio: fila.semana_inicio, semanaFin: fila.semana_fin });
        });
        return { ok: true, semanas };
    }

    // ── Eliminar una programación completa ──────────────────────────────────
    // Borra la fila de programaciones_semanales de esa toma+semana; por
    // ON DELETE CASCADE se lleva también su turno de riego, la selección de
    // usuarios del G3 y su historial de versiones. Protegido a nivel de base
    // de datos por la política prog_sem_delete (solo rol admin) — aunque
    // alguien evadiera el botón, Supabase igual rechazaría el borrado.
    async function eliminarProgramacionToma(comisionKey, tomaNombre, semanaInicio) {
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

        const { error, count } = await client.from('programaciones_semanales')
            .delete({ count: 'exact' })
            .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).eq('semana_inicio', semanaInicio);
        if (error) return { ok: false, error: error.message };
        if (!count) return { ok: false, error: 'No se encontró una programación para esa toma en esta semana.' };
        return { ok: true };
    }

    // ── Fase 2 PWA (móvil) — Padrón de usuarios ─────────────────────────────
    // El padrón completo (nombre, deuda desglosada, cultivos, unidad
    // catastral) hasta ahora solo vivía en memoria del navegador de
    // escritorio tras cada carga de Excel. guardarPadronToma() lo sincroniza
    // a la tabla padron_usuarios (ver 008_padron_usuarios.sql) para que el
    // módulo móvil "Condición del Usuario" pueda consultarlo con
    // buscarEnPadron(). `usuarios` es el arreglo tal cual vive en
    // tomasData[toma] en el escritorio — cada elemento ya trae `cultivos`
    // (via obtenerParesCultivoAreaUsuario) además de los campos crudos.
    async function guardarPadronToma(comisionKey, tomaNombre, usuarios) {
        if (!comisionKey || !tomaNombre) {
            return { ok: false, error: 'Falta comisión o toma.' };
        }
        if (!Array.isArray(usuarios) || usuarios.length === 0) {
            return { ok: true, guardados: 0 };
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

        const filas = usuarios.map((u) => ({
            comision_id: comisionId,
            toma_nombre: tomaNombre,
            nombre: (u.nombre || '-').toString(),
            unidad_catastral: u.unidadCatastral != null ? u.unidadCatastral.toString() : null,
            tipo_riego: u.tipoRiego != null ? u.tipoRiego.toString() : null,
            cultivos: u.cultivos || [],
            deuda_campana: parseFloat(u.deudaCampana) || 0,
            deuda_atrasada: parseFloat(u.deudaAtrasada) || 0,
            deuda_convenio: parseFloat(u.deudaConvenio) || 0,
            deuda_total: parseFloat(u.deudaTotal) || 0,
            al_dia: typeof u.alDia === 'boolean' ? u.alDia : null,
            debito: u.debito != null && u.debito !== '' ? parseFloat(u.debito) : null,
            celular: u.celular != null ? u.celular.toString() : null,
            actualizado_por: usuarioId,
        }));

        // Postgres rechaza el upsert completo si DOS filas del mismo arreglo
        // coinciden en la clave de conflicto (comision_id, toma_nombre,
        // nombre, unidad_catastral) — "ON CONFLICT DO UPDATE command cannot
        // affect row a second time". Pasa con usuarios repetidos en el Excel
        // de origen (mismo nombre + misma unidad catastral, o ambos sin
        // unidad catastral). Se deduplica quedándose con la última aparición
        // de cada clave antes de enviar, en vez de que falle toda la toma.
        const filasPorClave = new Map();
        filas.forEach((fila) => {
            const clave = fila.nombre.toUpperCase() + '|' + (fila.unidad_catastral || '');
            filasPorClave.set(clave, fila);
        });
        const filasSinDuplicados = Array.from(filasPorClave.values());

        const { error } = await client.from('padron_usuarios').upsert(filasSinDuplicados, {
            onConflict: 'comision_id,toma_nombre,nombre,unidad_catastral',
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, guardados: filasSinDuplicados.length };
    }

    // Búsqueda por nombre para el módulo móvil "Condición del Usuario" —
    // no busca por DNI (no existe ese campo en el Excel de origen), y no
    // filtra por toma: el personal de campo suele conocer el nombre pero no
    // necesariamente a qué toma pertenece.
    async function buscarEnPadron(comisionKey, texto) {
        if (!comisionKey || !texto || texto.trim().length < 2) return { ok: true, resultados: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('padron_usuarios')
                .select('id, toma_nombre, nombre, unidad_catastral, tipo_riego, cultivos, deuda_campana, deuda_atrasada, deuda_convenio, deuda_total, al_dia, debito, celular')
                .eq('comision_id', comisionId)
                .ilike('nombre', '%' + texto.trim() + '%')
                .order('nombre', { ascending: true })
                .limit(30),
            'buscar en el padrón'
        );
        if (error) return { ok: false, error: error.message || 'No se pudo buscar en el padrón.' };
        return { ok: true, resultados: data || [] };
    }

    // Todos los usuarios del padrón de una toma — para el módulo móvil del
    // Mapa satelital (Fase 4): a diferencia de buscarEnPadron, no filtra por
    // texto, trae todo el padrón de esa toma para cruzarlo con los predios
    // del KML.
    async function cargarPadronToma(comisionKey, tomaNombre) {
        if (!comisionKey || !tomaNombre) return { ok: true, resultados: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('padron_usuarios')
                .select('id, toma_nombre, nombre, unidad_catastral, tipo_riego, cultivos, deuda_campana, deuda_atrasada, deuda_convenio, deuda_total, al_dia, debito, celular')
                .eq('comision_id', comisionId)
                .eq('toma_nombre', tomaNombre),
            'cargar padrón de la toma'
        );
        if (error) return { ok: false, error: error.message || 'No se pudo cargar el padrón de la toma.' };
        return { ok: true, resultados: data || [] };
    }

    // Lista de tomas distintas que ya tienen padrón sincronizado — para que
    // "Condición del Usuario" pueda ofrecer un selector de toma como punto
    // de entrada principal (reporte por toma), en vez de solo buscar por
    // nombre en todo el padrón.
    async function listarTomasConPadron(comisionKey) {
        if (!comisionKey) return { ok: true, tomas: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, tomas: [] };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('padron_usuarios')
                .select('toma_nombre')
                .eq('comision_id', comisionId),
            'listar tomas con padrón'
        );
        if (error || !data) return { ok: false, tomas: [] };

        const vistas = new Set();
        data.forEach((fila) => { if (fila.toma_nombre) vistas.add(fila.toma_nombre); });
        const tomas = Array.from(vistas).sort(function (a, b) { return a.localeCompare(b, 'es', { numeric: true }); });
        return { ok: true, tomas: tomas };
    }

    // ── Fase 5 PWA (móvil) — Seguimiento PDA en vivo ────────────────────────
    // Suscribe un canal Realtime a los cambios de usuarios_g3_seleccionados
    // de UNA programación (una toma+semana) — requiere que la tabla esté
    // agregada a la publicación `supabase_realtime` (ver
    // 009_realtime_seguimiento.sql). callback() se llama en cualquier
    // cambio (inserción/actualización), sin pasarle el payload — quien la
    // use vuelve a consultar con cargarUsuariosG3Seleccionados, así el
    // móvil nunca confía en datos parciales de Realtime, solo usa el evento
    // como aviso de "algo cambió, recarga".
    function suscribirseATomaEnVivo(programacionId, callback) {
        if (!programacionId || typeof callback !== 'function') return null;
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return null;
        }
        const canal = client
            .channel('seguimiento-' + programacionId)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'usuarios_g3_seleccionados', filter: 'programacion_id=eq.' + programacionId },
                () => callback()
            )
            .subscribe();
        return canal;
    }

    // Cierra un canal abierto con suscribirseATomaEnVivo — llamar siempre
    // al salir de la pantalla que lo abrió, para no dejar suscripciones
    // huérfanas en segundo plano.
    function cancelarSuscripcion(canal) {
        if (!canal) return;
        try {
            window.CusshmiSupabase.getClient().removeChannel(canal);
        } catch (e) {
            // sin conexión o canal ya cerrado — no es un error que deba
            // interrumpir la salida de la pantalla
        }
    }

    window.CusshmiDatos = {
        cargarNotaAnexoG2,
        guardarNotaAnexoG2,
        guardarNotaAnexoG2Debounced,
        guardarProgramacionYTurno,
        cargarProgramacionYTurno,
        cargarTodasLasProgramaciones,
        listarSemanasConProgramacion,
        guardarUsuariosG3Seleccionados,
        cargarUsuariosG3Seleccionados,
        eliminarProgramacionToma,
        guardarPadronToma,
        buscarEnPadron,
        cargarPadronToma,
        listarTomasConPadron,
        suscribirseATomaEnVivo,
        cancelarSuscripcion,
    };
})();
