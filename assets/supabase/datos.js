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
        if (error) return { ok: false, error: error.mensaje || 'No se pudo buscar en el padrón.' };
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
        if (error) return { ok: false, error: error.mensaje || 'No se pudo cargar el padrón de la toma.' };
        return { ok: true, resultados: data || [] };
    }

    // Lista de tomas distintas que ya tienen padrón sincronizado — para que
    // "Condición del Usuario" pueda ofrecer un selector de toma como punto
    // de entrada principal (reporte por toma), en vez de solo buscar por
    // nombre en todo el padrón.
    async function listarTomasConPadron(comisionKey) {
        if (!comisionKey) return { ok: true, tomas: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, tomas: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        // Supabase/PostgREST solo devuelve 1000 filas por consulta si no se
        // pagina explícitamente. padron_usuarios tiene una fila por usuario
        // (no por toma) — una comisión con ~2000+ usuarios en total supera
        // ese límite fácilmente, y las tomas cuyas filas caían después de
        // la fila 1000 simplemente no aparecían en el selector, sin ningún
        // error visible. Se pagina con .range() hasta que una página vuelva
        // con menos filas que el tamaño pedido (fin de los datos).
        const TAMANO_PAGINA = 1000;
        const vistas = new Set();
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('padron_usuarios')
                    .select('toma_nombre')
                    .eq('comision_id', comisionId)
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'listar tomas con padrón'
            );
            if (error || !data) return { ok: false, tomas: [], error: error ? error.mensaje : 'No se pudo listar las tomas.' };

            data.forEach((fila) => { if (fila.toma_nombre) vistas.add(fila.toma_nombre); });
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }

        const tomas = Array.from(vistas).sort(function (a, b) { return a.localeCompare(b, 'es', { numeric: true }); });
        return { ok: true, tomas: tomas };
    }

    // Todo el padrón operativo de la comisión (todas las tomas, no una sola)
    // — solo lo necesario para cruzar por unidad catastral/nombre y resolver
    // a qué toma pertenece un usuario. Se usa al sincronizar el padrón
    // oficial A-1 desde escritorio (ese Excel no trae toma) para fijarla una
    // sola vez por fila, en vez de recalcularla cada vez que se exporta.
    async function cargarTodoPadronUsuariosParaCruce(comisionKey) {
        if (!comisionKey) return { ok: true, resultados: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, resultados: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const TAMANO_PAGINA = 1000;
        const resultados = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('padron_usuarios')
                    .select('toma_nombre, nombre, unidad_catastral')
                    .eq('comision_id', comisionId)
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'cargar padrón operativo completo (cruce de toma)'
            );
            if (error || !data) return { ok: false, resultados: [], error: error ? error.mensaje : 'No se pudo cargar el padrón operativo.' };
            resultados.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return { ok: true, resultados };
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

    // ── Confirmación digital de recepción del Anexo G-4 ─────────────────────
    // "Generar enlace de confirmación" en el visor móvil. El enlace es fijo
    // por G-4: si ya existe una fila para esta clave natural (toma+semana+
    // cultivo+usuario, vía programacion_id), se devuelve su token tal cual
    // en vez de crear uno nuevo — así compartir el mismo link por varios
    // canales (WhatsApp, correo, SMS) no genera enlaces distintos.
    // datos: {programacionId, cultivo, usuarioNombre, unidadCatastral,
    //         comisionNombre, tomaNombre, semanaInicio, canal, caudalLs,
    //         horasTotal, volumenM3, inicioTexto, terminoTexto}
    async function generarEnlaceConfirmacionG4(datos) {
        if (!datos || !datos.programacionId || !datos.cultivo || !datos.usuarioNombre) {
            return { ok: false, error: 'Faltan datos para generar el enlace.' };
        }
        const unidadCatastral = datos.unidadCatastral || null;

        const aplicarClave = (query) => {
            const q = query.eq('programacion_id', datos.programacionId)
                .eq('cultivo', datos.cultivo)
                .eq('usuario_nombre', datos.usuarioNombre)
                .eq('clave_dia', datos.claveDia || '');
            return unidadCatastral ? q.eq('unidad_catastral', unidadCatastral) : q.is('unidad_catastral', null);
        };

        const { data: existente, error: errorBuscar } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => aplicarClave(client.from('g4_confirmaciones').select('token').limit(1)).maybeSingle(),
            'buscar enlace de confirmación existente'
        );
        if (errorBuscar) return { ok: false, error: errorBuscar.mensaje };
        if (existente && existente.token) return { ok: true, token: existente.token };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const { data: creado, error: errorCrear } = await client.from('g4_confirmaciones').insert({
            programacion_id: datos.programacionId,
            cultivo: datos.cultivo,
            usuario_nombre: datos.usuarioNombre,
            unidad_catastral: unidadCatastral,
            clave_dia: datos.claveDia || '',
            comision_nombre: datos.comisionNombre || '',
            toma_nombre: datos.tomaNombre || '',
            semana_inicio: datos.semanaInicio,
            canal: datos.canal || '',
            caudal_ls: parseFloat(datos.caudalLs) || 0,
            horas_total: parseFloat(datos.horasTotal) || 0,
            volumen_m3: parseFloat(datos.volumenM3) || 0,
            inicio_texto: datos.inicioTexto || null,
            termino_texto: datos.terminoTexto || null,
            creado_por: usuarioId,
        }).select('token').single();

        if (errorCrear) {
            // Carrera: alguien más (u otro clic) ya lo creó justo antes de
            // que este insert llegara — se vuelve a buscar en vez de
            // fallar, para que "enlace fijo" se siga cumpliendo.
            const { data: reintento } = await window.CusshmiSupabase.ejecutarConsulta(
                (client2) => aplicarClave(client2.from('g4_confirmaciones').select('token').limit(1)).maybeSingle(),
                'reintentar buscar enlace de confirmación'
            );
            if (reintento && reintento.token) return { ok: true, token: reintento.token };
            return { ok: false, error: errorCrear.message };
        }
        return { ok: true, token: creado.token };
    }

    // Todas las confirmaciones de una toma+semana — para cruzar con
    // usuarios_g3_seleccionados en el panel "Orden de Riego" (móvil y
    // escritorio, ver assets/core/ordenRiego.js).
    async function listarConfirmacionesG4(programacionId) {
        if (!programacionId) return { ok: true, confirmaciones: [] };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('g4_confirmaciones')
                .select('cultivo, usuario_nombre, unidad_catastral, estado, confirmado_en, dispositivo, caudal_ls, horas_total, volumen_m3, inicio_texto, termino_texto')
                .eq('programacion_id', programacionId),
            'listar confirmaciones del G-4'
        );
        if (error || !data) return { ok: false, confirmaciones: [], error: error ? error.mensaje : 'No se pudo listar las confirmaciones.' };
        return { ok: true, confirmaciones: data };
    }

    // Mismo patrón exacto que suscribirseATomaEnVivo (Fase 5) — requiere
    // que g4_confirmaciones esté en la publicación supabase_realtime (ver
    // 010_confirmacion_g4.sql). callback() se llama sin payload; quien la
    // use vuelve a llamar listarConfirmacionesG4() para recargar.
    function suscribirseAConfirmacionesG4Vivo(programacionId, callback) {
        if (!programacionId || typeof callback !== 'function') return null;
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return null;
        }
        const canal = client
            .channel('orden-riego-' + programacionId)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'g4_confirmaciones', filter: 'programacion_id=eq.' + programacionId },
                () => callback()
            )
            .subscribe();
        return canal;
    }

    // ── Módulo móvil "Identificación y registro" (Fase A) ──────────────────
    // Cuenta cuántas filas de `comisionId` hay por toma_nombre en una tabla,
    // paginando de a 1000 (mismo límite/patrón que listarTomasConPadron) para
    // no perder tomas cuando una comisión supera esa cantidad de filas.
    async function _contarPorToma(tabla, comisionId) {
        const TAMANO_PAGINA = 1000;
        const conteos = {};
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from(tabla).select('toma_nombre').eq('comision_id', comisionId).range(desde, desde + TAMANO_PAGINA - 1),
                'contar ' + tabla + ' por toma'
            );
            if (error || !data) return null;
            data.forEach((fila) => {
                if (!fila.toma_nombre) return;
                conteos[fila.toma_nombre] = (conteos[fila.toma_nombre] || 0) + 1;
            });
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return conteos;
    }

    // Para la Pantalla 2 ("Selección de toma"): cuántos usuarios ya tienen
    // registro de campo vs. cuántos hay en el padrón sincronizado, por toma.
    // Si una toma no tiene padrón sincronizado todavía, se devuelve el
    // conteo de registros igual (porcentaje null) — la pantalla decide cómo
    // mostrarlo, para no mostrar un "0/0" confuso.
    async function obtenerAvanceRegistroPorToma(comisionKey) {
        if (!comisionKey) return { ok: true, avance: {} };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, avance: {}, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const [registrosPorToma, padronPorToma] = await Promise.all([
            _contarPorToma('identificacion_registros', comisionId),
            _contarPorToma('padron_usuarios', comisionId),
        ]);
        if (!registrosPorToma || !padronPorToma) {
            return { ok: false, avance: {}, error: 'No se pudo calcular el avance de registro.' };
        }

        const tomas = new Set([...Object.keys(registrosPorToma), ...Object.keys(padronPorToma)]);
        const avance = {};
        tomas.forEach((toma) => {
            const registrados = registrosPorToma[toma] || 0;
            const totalPadron = padronPorToma[toma] || 0;
            avance[toma] = {
                registrados,
                totalPadron,
                porcentaje: totalPadron > 0 ? Math.round((registrados / totalPadron) * 100) : null,
            };
        });
        return { ok: true, avance };
    }

    // Qué usuarios de una toma ya tienen un registro de identificación
    // (confirmado o borrador) — para marcar "✅ ya registrado" en la
    // Pantalla 3 y evitar duplicar registros del mismo usuario.
    async function listarRegistrosDeToma(comisionKey, tomaNombre) {
        if (!comisionKey || !tomaNombre) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('identificacion_registros')
                .select('id, padron_usuario_id, apellidos_nombres, unidad_catastral, confirmado')
                .eq('comision_id', comisionId)
                .eq('toma_nombre', tomaNombre),
            'listar registros de identificación de la toma'
        );
        if (error) return { ok: false, registros: [], error: error.mensaje || 'No se pudo listar los registros.' };
        return { ok: true, registros: data || [] };
    }

    // Todos los registros de identificación de la comisión (todas las
    // tomas), con los campos que NO forman parte de los Formatos A-1/A-2
    // oficiales (tipo de riego, cultivo instalado, estado del predio,
    // observaciones) — para el tercer excel de exportación ("datos
    // adicionales"). identificacion_registros ya trae toma_nombre directo,
    // sin necesidad de cruzar contra nada.
    async function cargarRegistrosIdentificacionParaExportar(comisionKey) {
        if (!comisionKey) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const TAMANO_PAGINA = 1000;
        const registros = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('identificacion_registros')
                    .select('toma_nombre, apellidos_nombres, unidad_catastral, tipo_riego, cultivo_actual, estado_predio, observaciones, clasificacion, confirmado, confirmado_en')
                    .eq('comision_id', comisionId)
                    .order('toma_nombre', { ascending: true })
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'cargar registros de identificación (exportación)'
            );
            if (error || !data) return { ok: false, registros: [], error: error ? error.mensaje : 'No se pudo cargar los registros de identificación.' };
            registros.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return { ok: true, registros };
    }

    // Un registro completo por id — para reabrir un borrador (Pantalla 3→4)
    // o para revisar/desbloquear uno ya confirmado (Pantalla 5).
    async function cargarRegistroIdentificacion(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('identificacion_registros').select('*').eq('id', id).maybeSingle(),
            'cargar registro de identificación'
        );
        if (error) return { ok: false, error: error.mensaje };
        if (!data) return { ok: false, error: 'Registro no encontrado.' };
        return { ok: true, registro: data };
    }

    // Upsert del registro — si `datos.id` viene informado, actualiza; si no,
    // inserta y devuelve el id nuevo. Usada tanto por el autoguardado de
    // borrador (Pantalla 4) como por "Confirmar y guardar" (Pantalla 5, que
    // llama esto una última vez y después confirmarRegistroIdentificacion).
    // `datos`: {id?, comisionKey, tomaNombre, padronUsuarioId?,
    //   apellidosNombres, tipoDocumento, numeroDocumento, unidadCatastral,
    //   areaTotalHa, areaBajoRiegoHa, tipoRiego, cultivoActual, tieneDerecho,
    //   numeroResolucion, claseDerecho, volumenM3Anio, cutExpediente,
    //   clasificacion, estadoPredio, observaciones}.
    async function guardarRegistroIdentificacion(datos) {
        if (!datos || !datos.comisionKey || !datos.tomaNombre || !datos.apellidosNombres) {
            return { ok: false, error: 'Faltan datos obligatorios (comisión, toma o apellidos y nombres).' };
        }
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const fila = {
            comision_id: comisionId,
            toma_nombre: datos.tomaNombre,
            padron_usuario_id: datos.padronUsuarioId || null,
            apellidos_nombres: datos.apellidosNombres,
            tipo_documento: datos.tipoDocumento || null,
            numero_documento: datos.numeroDocumento || null,
            unidad_catastral: datos.unidadCatastral || null,
            area_total_ha: Number.isFinite(parseFloat(datos.areaTotalHa)) ? parseFloat(datos.areaTotalHa) : null,
            area_bajo_riego_ha: Number.isFinite(parseFloat(datos.areaBajoRiegoHa)) ? parseFloat(datos.areaBajoRiegoHa) : null,
            tipo_riego: datos.tipoRiego || null,
            cultivo_actual: datos.cultivoActual || null,
            tiene_derecho: datos.tieneDerecho || null,
            numero_resolucion: datos.numeroResolucion || null,
            clase_derecho: datos.claseDerecho || null,
            volumen_m3_anio: Number.isFinite(parseFloat(datos.volumenM3Anio)) ? parseFloat(datos.volumenM3Anio) : null,
            cut_expediente: datos.cutExpediente || null,
            tipo_uso: datos.tipoUso || null,
            canal_derivacion: datos.canalDerivacion || null,
            fuente_agua: datos.fuenteAgua || null,
            clasificacion: datos.clasificacion || null,
            estado_predio: datos.estadoPredio || null,
            observaciones: datos.observaciones || null,
            creado_por: usuarioId,
            actualizado_en: new Date().toISOString(),
        };

        if (datos.id) {
            const { error } = await client.from('identificacion_registros').update(fila).eq('id', datos.id);
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: datos.id };
        }

        const { data: creado, error } = await client.from('identificacion_registros').insert(fila).select('id').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: creado.id };
    }

    let debounceTimerRegistro = null;

    /**
     * Autoguardado de borrador mientras se completa la Pantalla 4 (espera de
     * 1s desde el último cambio, mismo criterio que guardarNotaAnexoG2Debounced).
     * ⚠️ Muta `datos.id` en sitio tras el primer guardado exitoso — el
     * llamador debe reusar el MISMO objeto `datos` en llamadas sucesivas
     * para que los autoguardados siguientes actualicen en vez de duplicar.
     */
    function guardarRegistroIdentificacionDebounced(datos, onEstado) {
        if (debounceTimerRegistro) clearTimeout(debounceTimerRegistro);
        if (onEstado) onEstado('escribiendo');
        debounceTimerRegistro = setTimeout(async () => {
            if (onEstado) onEstado('guardando');
            const resultado = await guardarRegistroIdentificacion(datos);
            if (resultado.ok && !datos.id) datos.id = resultado.id;
            if (onEstado) onEstado(resultado.ok ? 'guardado' : 'error');
        }, 1000);
    }

    // Confirmar (Pantalla 5): bloquea el registro para edición futura salvo
    // por un administrador. Si la RLS bloquea la actualización (registro ya
    // confirmado por otra vía, o sin permiso) .select().maybeSingle() vuelve
    // null en vez de una fila — se reporta como error explícito en vez de
    // "éxito" silencioso.
    async function confirmarRegistroIdentificacion(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('identificacion_registros')
            .update({ confirmado: true, confirmado_en: new Date().toISOString() })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo confirmar: el registro no existe o ya no se puede editar.' };
        return { ok: true };
    }

    // Desbloquear (solo admin — la interfaz solo debe ofrecer este botón si
    // perfil.rol === 'admin', reforzado igual por identreg_update en
    // 012_identificacion_registro.sql, mismo criterio de doble candado que
    // eliminarProgramacionTomaUI en el escritorio). Al desbloquear se
    // considera resuelta cualquier solicitud de edición pendiente sobre este
    // registro, así que también se limpia — es la "aprobación".
    async function desbloquearRegistroIdentificacion(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('identificacion_registros')
            .update({ confirmado: false, solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo desbloquear: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }

    // Un programador (o admin) pide que se habilite la edición de un
    // registro YA confirmado. No lo desbloquea — solo deja la solicitud
    // guardada para que el administrador la vea y decida (habilitar o
    // rechazar). La política identreg_update bloquea a un programador de
    // tocar un registro confirmado, así que esto pasa por una función RPC
    // con sus propias validaciones (ver 017_solicitud_edicion_identificacion.sql),
    // no por un update() directo del cliente.
    async function solicitarEdicionIdentificacion(id, nombreSolicitante) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.rpc('solicitar_edicion_identificacion', { registro_id: id, nombre_solicitante: nombreSolicitante || null }),
            'solicitar edición de registro de identificación'
        );
        if (error) return { ok: false, error: error.mensaje || 'No se pudo enviar la solicitud.' };
        return { ok: true };
    }

    // Todas las solicitudes de edición pendientes de la comisión (todas las
    // tomas) — para que el administrador las vea juntas en vez de tener que
    // encontrarlas registro por registro.
    async function listarSolicitudesEdicionIdentificacion(comisionKey) {
        if (!comisionKey) return { ok: true, solicitudes: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, solicitudes: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('identificacion_registros')
                .select('id, toma_nombre, apellidos_nombres, unidad_catastral, solicitud_edicion_por_nombre, solicitud_edicion_en')
                .eq('comision_id', comisionId)
                .eq('solicitud_edicion', true)
                .order('solicitud_edicion_en', { ascending: true }),
            'listar solicitudes de edición de identificación'
        );
        if (error) return { ok: false, solicitudes: [], error: error.mensaje || 'No se pudo listar las solicitudes.' };
        return { ok: true, solicitudes: data || [] };
    }

    // Admin rechaza una solicitud sin habilitar la edición — el registro
    // sigue confirmado y bloqueado, solo se limpia la solicitud para que
    // deje de aparecer en la lista de pendientes.
    async function rechazarSolicitudEdicionIdentificacion(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('identificacion_registros')
            .update({ solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo rechazar: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }

    // ── Declaración de Intención de Siembra (Formato E-4.1) ─────────────────
    // Mismo patrón exacto que Identificación y registro (arriba), aplicado a
    // `siembra_intenciones`: candado tras confirmar + solicitud de edición
    // vía RPC para cuando está bloqueado. `cultivos` es un array
    // [{cultivo, area}], precargado en el móvil desde padron_usuarios.cultivos
    // y editable — no se lee en vivo del padrón, es su propio snapshot
    // estable por campaña (ver justificación en el plan).

    async function obtenerAvanceSiembraPorToma(comisionKey) {
        if (!comisionKey) return { ok: true, avance: {} };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, avance: {}, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const [registrosPorToma, padronPorToma] = await Promise.all([
            _contarPorToma('siembra_intenciones', comisionId),
            _contarPorToma('padron_usuarios', comisionId),
        ]);
        if (!registrosPorToma || !padronPorToma) {
            return { ok: false, avance: {}, error: 'No se pudo calcular el avance de siembra.' };
        }

        const tomas = new Set([...Object.keys(registrosPorToma), ...Object.keys(padronPorToma)]);
        const avance = {};
        tomas.forEach((toma) => {
            const registrados = registrosPorToma[toma] || 0;
            const totalPadron = padronPorToma[toma] || 0;
            avance[toma] = {
                registrados,
                totalPadron,
                porcentaje: totalPadron > 0 ? Math.round((registrados / totalPadron) * 100) : null,
            };
        });
        return { ok: true, avance };
    }

    async function listarRegistrosSiembraDeToma(comisionKey, tomaNombre) {
        if (!comisionKey || !tomaNombre) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('siembra_intenciones')
                .select('id, padron_usuario_id, apellidos_nombres, unidad_catastral, confirmado')
                .eq('comision_id', comisionId)
                .eq('toma_nombre', tomaNombre),
            'listar registros de siembra de la toma'
        );
        if (error) return { ok: false, registros: [], error: error.mensaje || 'No se pudo listar los registros.' };
        return { ok: true, registros: data || [] };
    }

    async function cargarRegistroSiembra(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('siembra_intenciones').select('*').eq('id', id).maybeSingle(),
            'cargar registro de siembra'
        );
        if (error) return { ok: false, error: error.mensaje };
        if (!data) return { ok: false, error: 'Registro no encontrado.' };
        return { ok: true, registro: data };
    }

    // `datos`: {id?, comisionKey, tomaNombre, padronUsuarioId?,
    //   apellidosNombres, unidadCatastral, cultivos: [{cultivo, area}]}.
    async function guardarRegistroSiembra(datos) {
        if (!datos || !datos.comisionKey || !datos.tomaNombre || !datos.apellidosNombres) {
            return { ok: false, error: 'Faltan datos obligatorios (comisión, toma o apellidos y nombres).' };
        }
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const fila = {
            comision_id: comisionId,
            toma_nombre: datos.tomaNombre,
            padron_usuario_id: datos.padronUsuarioId || null,
            apellidos_nombres: datos.apellidosNombres,
            unidad_catastral: datos.unidadCatastral || null,
            cultivos: Array.isArray(datos.cultivos) ? datos.cultivos : [],
            tipo_riego: datos.tipoRiego || null,
            creado_por: usuarioId,
            actualizado_en: new Date().toISOString(),
        };

        if (datos.id) {
            const { error } = await client.from('siembra_intenciones').update(fila).eq('id', datos.id);
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: datos.id };
        }

        const { data: creado, error } = await client.from('siembra_intenciones').insert(fila).select('id').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: creado.id };
    }

    let debounceTimerSiembra = null;

    /**
     * Autoguardado de borrador (espera de 1s desde el último cambio, mismo
     * criterio que guardarRegistroIdentificacionDebounced). Muta `datos.id`
     * en sitio tras el primer guardado exitoso — el llamador debe reusar el
     * MISMO objeto `datos` en llamadas sucesivas.
     */
    function guardarRegistroSiembraDebounced(datos, onEstado) {
        if (debounceTimerSiembra) clearTimeout(debounceTimerSiembra);
        if (onEstado) onEstado('escribiendo');
        debounceTimerSiembra = setTimeout(async () => {
            if (onEstado) onEstado('guardando');
            const resultado = await guardarRegistroSiembra(datos);
            if (resultado.ok && !datos.id) datos.id = resultado.id;
            if (onEstado) onEstado(resultado.ok ? 'guardado' : 'error');
        }, 1000);
    }

    async function confirmarRegistroSiembra(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('siembra_intenciones')
            .update({ confirmado: true, confirmado_en: new Date().toISOString() })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo confirmar: el registro no existe o ya no se puede editar.' };
        return { ok: true };
    }

    async function desbloquearRegistroSiembra(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('siembra_intenciones')
            .update({ confirmado: false, solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo desbloquear: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }

    async function solicitarEdicionSiembra(id, nombreSolicitante) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.rpc('solicitar_edicion_siembra', { registro_id: id, nombre_solicitante: nombreSolicitante || null }),
            'solicitar edición de registro de siembra'
        );
        if (error) return { ok: false, error: error.mensaje || 'No se pudo enviar la solicitud.' };
        return { ok: true };
    }

    async function listarSolicitudesEdicionSiembra(comisionKey) {
        if (!comisionKey) return { ok: true, solicitudes: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, solicitudes: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('siembra_intenciones')
                .select('id, toma_nombre, apellidos_nombres, unidad_catastral, solicitud_edicion_por_nombre, solicitud_edicion_en')
                .eq('comision_id', comisionId)
                .eq('solicitud_edicion', true)
                .order('solicitud_edicion_en', { ascending: true }),
            'listar solicitudes de edición de siembra'
        );
        if (error) return { ok: false, solicitudes: [], error: error.mensaje || 'No se pudo listar las solicitudes.' };
        return { ok: true, solicitudes: data || [] };
    }

    async function rechazarSolicitudEdicionSiembra(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('siembra_intenciones')
            .update({ solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo rechazar: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }

    // Todos los registros confirmados de la comisión (todas las tomas), para
    // el exportador del Formato E-4.1 en escritorio.
    async function cargarRegistrosSiembraParaExportar(comisionKey) {
        if (!comisionKey) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const TAMANO_PAGINA = 1000;
        const registros = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('siembra_intenciones')
                    .select('toma_nombre, apellidos_nombres, unidad_catastral, cultivos, tipo_riego, confirmado')
                    .eq('comision_id', comisionId)
                    .eq('confirmado', true)
                    .order('toma_nombre', { ascending: true })
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'cargar registros de siembra (exportación)'
            );
            if (error || !data) return { ok: false, registros: [], error: error ? error.mensaje : 'No se pudo cargar los registros de siembra.' };
            registros.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return { ok: true, registros };
    }

    // ── Sinceramiento de Áreas (vértices GPS→UTM, polígono, fotos) ──────────
    // Mismo patrón exacto que Identificación y registro / Declaración de
    // Intención de Siembra: candado tras confirmar + solicitud de edición
    // vía RPC para cuando está bloqueado. La captura de vértices/fotos en sí
    // pasa por IndexedDB primero (assets/core/capturaOffline.js, funciona
    // sin conexión) — estas funciones son el destino final cuando hay red,
    // no participan en la lógica offline.

    async function obtenerAvanceSinceramientoPorToma(comisionKey) {
        if (!comisionKey) return { ok: true, avance: {} };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, avance: {}, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const [registrosPorToma, padronPorToma] = await Promise.all([
            _contarPorToma('sinceramiento_areas', comisionId),
            _contarPorToma('padron_usuarios', comisionId),
        ]);
        if (!registrosPorToma || !padronPorToma) {
            return { ok: false, avance: {}, error: 'No se pudo calcular el avance de sinceramiento.' };
        }

        const tomas = new Set([...Object.keys(registrosPorToma), ...Object.keys(padronPorToma)]);
        const avance = {};
        tomas.forEach((toma) => {
            const registrados = registrosPorToma[toma] || 0;
            const totalPadron = padronPorToma[toma] || 0;
            avance[toma] = {
                registrados,
                totalPadron,
                porcentaje: totalPadron > 0 ? Math.round((registrados / totalPadron) * 100) : null,
            };
        });
        return { ok: true, avance };
    }

    async function listarRegistrosSinceramientoDeToma(comisionKey, tomaNombre) {
        if (!comisionKey || !tomaNombre) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('sinceramiento_areas')
                .select('id, padron_usuario_id, apellidos_nombres, unidad_catastral, confirmado')
                .eq('comision_id', comisionId)
                .eq('toma_nombre', tomaNombre),
            'listar registros de sinceramiento de la toma'
        );
        if (error) return { ok: false, registros: [], error: error.mensaje || 'No se pudo listar los registros.' };
        return { ok: true, registros: data || [] };
    }

    // Listado completo (con vertices_utm/áreas) de una toma — a diferencia
    // de listarRegistrosSinceramientoDeToma (select angosto, solo para
    // badges de búsqueda), esta trae lo necesario para el panel de
    // escritorio que compara el polígono original del KML contra el
    // guardado en Supabase.
    async function listarRegistrosSinceramientoCompletosDeToma(comisionKey, tomaNombre) {
        if (!comisionKey || !tomaNombre) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('sinceramiento_areas')
                .select('id, toma_nombre, apellidos_nombres, unidad_catastral, vertices_utm, area_medida_ha, area_declarada_ha, confirmado, actualizado_en')
                .eq('comision_id', comisionId)
                .eq('toma_nombre', tomaNombre)
                .order('apellidos_nombres'),
            'listar registros completos de sinceramiento de la toma'
        );
        if (error) return { ok: false, registros: [], error: error.mensaje || 'No se pudo listar los registros.' };
        return { ok: true, registros: data || [] };
    }

    async function cargarRegistroSinceramiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('sinceramiento_areas').select('*').eq('id', id).maybeSingle(),
            'cargar registro de sinceramiento'
        );
        if (error) return { ok: false, error: error.mensaje };
        if (!data) return { ok: false, error: 'Registro no encontrado.' };
        return { ok: true, registro: data };
    }

    // `datos`: {id, comisionKey, tomaNombre, padronUsuarioId?,
    //   apellidosNombres, unidadCatastral, verticesUtm: [...],
    //   areaMedidaHa, areaDeclaradaHa, fotosUrls: [...]}.
    //
    // A diferencia de los demás módulos, acá `id` SIEMPRE lo genera el
    // cliente (`crypto.randomUUID()`, ver movil/sinceramiento-areas.html)
    // desde antes del primer guardado — la captura de vértices tiene que
    // poder guardarse en IndexedDB (assets/core/capturaOffline.js) sin
    // conexión, y para eso necesita una clave estable desde el primer
    // vértice, no una que recién exista cuando el servidor la genere. Por
    // eso este `upsert` (no el patrón insert/update de los otros módulos):
    // la primera llamada CREA la fila con ese id, las siguientes la
    // actualizan — mismo id de punta a punta, local y remoto.
    async function guardarRegistroSinceramiento(datos) {
        if (!datos || !datos.id || !datos.comisionKey || !datos.tomaNombre || !datos.apellidosNombres) {
            return { ok: false, error: 'Faltan datos obligatorios (comisión, toma o apellidos y nombres).' };
        }
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const fila = {
            id: datos.id,
            comision_id: comisionId,
            toma_nombre: datos.tomaNombre,
            padron_usuario_id: datos.padronUsuarioId || null,
            apellidos_nombres: datos.apellidosNombres,
            unidad_catastral: datos.unidadCatastral || null,
            vertices_utm: Array.isArray(datos.verticesUtm) ? datos.verticesUtm : [],
            area_medida_ha: Number.isFinite(parseFloat(datos.areaMedidaHa)) ? parseFloat(datos.areaMedidaHa) : null,
            area_declarada_ha: Number.isFinite(parseFloat(datos.areaDeclaradaHa)) ? parseFloat(datos.areaDeclaradaHa) : null,
            fotos_urls: Array.isArray(datos.fotosUrls) ? datos.fotosUrls : [],
            creado_por: usuarioId,
            actualizado_en: new Date().toISOString(),
        };

        const { data: guardado, error } = await client.from('sinceramiento_areas')
            .upsert(fila, { onConflict: 'id' })
            .select('id').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: guardado.id };
    }

    let debounceTimerSinceramiento = null;

    function guardarRegistroSinceramientoDebounced(datos, onEstado) {
        if (debounceTimerSinceramiento) clearTimeout(debounceTimerSinceramiento);
        if (onEstado) onEstado('escribiendo');
        debounceTimerSinceramiento = setTimeout(async () => {
            if (onEstado) onEstado('guardando');
            const resultado = await guardarRegistroSinceramiento(datos);
            if (resultado.ok && !datos.id) datos.id = resultado.id;
            if (onEstado) onEstado(resultado.ok ? 'guardado' : 'error');
        }, 1000);
    }

    async function confirmarRegistroSinceramiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('sinceramiento_areas')
            .update({ confirmado: true, confirmado_en: new Date().toISOString() })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo confirmar: el registro no existe o ya no se puede editar.' };
        return { ok: true };
    }

    async function desbloquearRegistroSinceramiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('sinceramiento_areas')
            .update({ confirmado: false, solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo desbloquear: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }

    async function solicitarEdicionSinceramiento(id, nombreSolicitante) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.rpc('solicitar_edicion_sinceramiento', { registro_id: id, nombre_solicitante: nombreSolicitante || null }),
            'solicitar edición de registro de sinceramiento'
        );
        if (error) return { ok: false, error: error.mensaje || 'No se pudo enviar la solicitud.' };
        return { ok: true };
    }

    async function listarSolicitudesEdicionSinceramiento(comisionKey) {
        if (!comisionKey) return { ok: true, solicitudes: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, solicitudes: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('sinceramiento_areas')
                .select('id, toma_nombre, apellidos_nombres, unidad_catastral, solicitud_edicion_por_nombre, solicitud_edicion_en')
                .eq('comision_id', comisionId)
                .eq('solicitud_edicion', true)
                .order('solicitud_edicion_en', { ascending: true }),
            'listar solicitudes de edición de sinceramiento'
        );
        if (error) return { ok: false, solicitudes: [], error: error.mensaje || 'No se pudo listar las solicitudes.' };
        return { ok: true, solicitudes: data || [] };
    }

    async function rechazarSolicitudEdicionSinceramiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('sinceramiento_areas')
            .update({ solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo rechazar: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }

    // Sube una foto al bucket privado `sinceramiento-fotos`
    // ({comision_id}/{registro_id}/{archivo}) y la agrega a `fotos_urls`
    // del registro si todavía no está — se llama una vez por foto, después
    // de que `capturaOffline.js` ya la guardó localmente.
    async function subirFotoSinceramiento(comisionKey, registroId, blob, nombreArchivo) {
        if (!comisionKey || !registroId || !blob) return { ok: false, error: 'Faltan datos para subir la foto.' };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }

        const path = comisionId + '/' + registroId + '/' + nombreArchivo;
        const { error: errorSubida } = await client.storage.from('sinceramiento-fotos').upload(path, blob, { upsert: true });
        if (errorSubida) return { ok: false, error: errorSubida.message };

        const actual = await cargarRegistroSinceramiento(registroId);
        if (!actual.ok) return { ok: true, path }; // la foto ya se subió; el registro se actualizará en el próximo guardado

        const fotosActuales = Array.isArray(actual.registro.fotos_urls) ? actual.registro.fotos_urls : [];
        if (!fotosActuales.some((f) => f.path === path)) {
            fotosActuales.push({ path, nombreArchivo, subidoEn: new Date().toISOString() });
            const { error: errorUpdate } = await client.from('sinceramiento_areas')
                .update({ fotos_urls: fotosActuales }).eq('id', registroId);
            if (errorUpdate) return { ok: false, error: errorUpdate.message };
        }
        return { ok: true, path };
    }

    async function obtenerUrlFirmadaFotoSinceramiento(path) {
        if (!path) return { ok: false, error: 'Falta la ruta de la foto.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.storage.from('sinceramiento-fotos').createSignedUrl(path, 3600);
        if (error) return { ok: false, error: error.message };
        return { ok: true, url: data.signedUrl };
    }

    // ── Inventario de Infraestructura — Fase 1: Tomas y Compuertas ──────────
    // Formato oficial de ANA "Inventario de Obras de Arte". A diferencia de
    // los módulos anteriores, el "avance" no se mide contra el padrón de
    // usuarios (no aplica: son estructuras, no personas) sino contra el
    // propio inventario ya sincronizado desde el Excel — cuántas de las
    // filas ya sincronizadas para esa toma fueron revisadas/confirmadas en
    // campo por un sectorista.
    async function _contarInventarioPorToma(tabla, comisionId) {
        const TAMANO_PAGINA = 1000;
        const conteos = {};
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from(tabla).select('toma_nombre, confirmado').eq('comision_id', comisionId).range(desde, desde + TAMANO_PAGINA - 1),
                'contar ' + tabla + ' por toma'
            );
            if (error || !data) return null;
            data.forEach((fila) => {
                const clave = fila.toma_nombre || 'Sin toma asignada';
                if (!conteos[clave]) conteos[clave] = { total: 0, confirmados: 0 };
                conteos[clave].total += 1;
                if (fila.confirmado) conteos[clave].confirmados += 1;
            });
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return conteos;
    }

    async function _obtenerAvanceInventarioPorToma(tabla, comisionKey) {
        if (!comisionKey) return { ok: true, avance: {} };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, avance: {}, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        const conteos = await _contarInventarioPorToma(tabla, comisionId);
        if (!conteos) return { ok: false, avance: {}, error: 'No se pudo calcular el avance del inventario.' };
        const avance = {};
        Object.keys(conteos).forEach((toma) => {
            const c = conteos[toma];
            avance[toma] = { revisados: c.confirmados, total: c.total, porcentaje: c.total > 0 ? Math.round((c.confirmados / c.total) * 100) : null };
        });
        return { ok: true, avance };
    }

    function obtenerAvanceInventarioTomasPorToma(comisionKey) { return _obtenerAvanceInventarioPorToma('inventario_tomas', comisionKey); }
    function obtenerAvanceInventarioCompuertasPorToma(comisionKey) { return _obtenerAvanceInventarioPorToma('inventario_compuertas', comisionKey); }

    async function _listarRegistrosInventarioDeToma(tabla, columnas, comisionKey, tomaNombre) {
        if (!comisionKey || !tomaNombre) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from(tabla).select(columnas).eq('comision_id', comisionId).eq('toma_nombre', tomaNombre),
            'listar registros de ' + tabla + ' de la toma'
        );
        if (error) return { ok: false, registros: [], error: error.mensaje || 'No se pudo listar los registros.' };
        return { ok: true, registros: data || [] };
    }

    // Todas las filas de la comisión, sin filtro de toma — usado por el
    // exportador de escritorio (assets/supabase/datos.js no conoce Excel,
    // solo trae los datos; Sistema_Riego_CUSSHMI_14.html arma el .xlsx).
    // `filtroExtra` opcional: { columna, valor } (ej. tipo_estructura).
    async function _listarTodosRegistrosInventario(tabla, columnas, comisionKey, filtroExtra) {
        if (!comisionKey) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        const TAMANO_PAGINA = 1000;
        const registros = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => {
                    let q = client.from(tabla).select(columnas).eq('comision_id', comisionId);
                    if (filtroExtra) q = q.eq(filtroExtra.columna, filtroExtra.valor);
                    return q.range(desde, desde + TAMANO_PAGINA - 1);
                },
                'listar todos los registros de ' + tabla
            );
            if (error || !data) return { ok: false, registros: [], error: error ? error.mensaje : 'No se pudo listar los registros.' };
            registros.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return { ok: true, registros };
    }
    function listarTodosRegistrosInventarioTomas(comisionKey) {
        return _listarTodosRegistrosInventario('inventario_tomas',
            'id, toma_nombre, canal_fuente, nombre_canal, progresiva_km, estado, confirmado, este, norte, observacion, material, tipo, dimension_a, dimension_h, dimension_d',
            comisionKey);
    }
    function listarTodosRegistrosInventarioCompuertas(comisionKey) {
        return _listarTodosRegistrosInventario('inventario_compuertas',
            'id, toma_nombre, canal_fuente, nombre_canal, orden_compuerta, progresiva_km, estado, confirmado, este, norte, observacion, tipo, material, operacion, hoja_a, hoja_h, marco_a, marco_h, bloque_riego',
            comisionKey);
    }
    function listarTodosRegistrosInventarioEstructuras(comisionKey, tipoEstructura) {
        return _listarTodosRegistrosInventario('inventario_estructuras',
            'id, toma_nombre, nombre_obra, canal_fuente, nombre_canal, progresiva_km, estado, confirmado, este, norte, observacion, campos',
            comisionKey, { columna: 'tipo_estructura', valor: tipoEstructura });
    }

    function listarRegistrosInventarioTomasDeToma(comisionKey, tomaNombre) {
        return _listarRegistrosInventarioDeToma('inventario_tomas',
            'id, canal_fuente, nombre_canal, progresiva_km, estado, confirmado, este, norte, observacion, material, tipo, dimension_a, dimension_h, dimension_d',
            comisionKey, tomaNombre);
    }
    function listarRegistrosInventarioCompuertasDeToma(comisionKey, tomaNombre) {
        return _listarRegistrosInventarioDeToma('inventario_compuertas',
            'id, canal_fuente, nombre_canal, progresiva_km, estado, confirmado, este, norte, observacion, tipo, material, operacion, hoja_a, hoja_h, marco_a, marco_h, bloque_riego',
            comisionKey, tomaNombre);
    }

    async function _cargarRegistroInventario(tabla, id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from(tabla).select('*').eq('id', id).maybeSingle(),
            'cargar registro de ' + tabla
        );
        if (error) return { ok: false, error: error.mensaje };
        if (!data) return { ok: false, error: 'Registro no encontrado.' };
        return { ok: true, registro: data };
    }
    function cargarRegistroInventarioToma(id) { return _cargarRegistroInventario('inventario_tomas', id); }
    function cargarRegistroInventarioCompuerta(id) { return _cargarRegistroInventario('inventario_compuertas', id); }

    // `datos`: {id?, comisionKey, tomaNombre, canalFuente, nombreCanal,
    //   progresivaKm, zonaUtm, este, norte, margen, estado, observacion,
    //   + campos propios de cada tipo (material/tipo/dimensionA/H/D para
    //   tomas; tipo/material/operacion/hojaA/H/marcoA/H/bloqueRiego para
    //   compuertas)}. Mismo patrón insert-si-no-hay-id/update-si-hay-id que
    //   guardarRegistroSiembra — a diferencia de Sinceramiento, acá el id
    //   siempre lo genera el servidor (la fila ya existe desde la
    //   sincronización del Excel; el celular casi siempre actualiza, rara
    //   vez inserta una estructura nueva no presente en el inventario base).
    async function guardarRegistroInventarioToma(datos) {
        if (!datos || !datos.comisionKey || !datos.canalFuente || !datos.nombreCanal) {
            return { ok: false, error: 'Faltan datos obligatorios (comisión, canal fuente o nombre del canal).' };
        }
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const fila = {
            comision_id: comisionId,
            toma_nombre: datos.tomaNombre || null,
            canal_fuente: _normCanalGuardado(datos.canalFuente),
            nombre_canal: _normCanalGuardado(datos.nombreCanal),
            progresiva_km: datos.progresivaKm || null,
            zona_utm: datos.zonaUtm || null,
            este: Number.isFinite(parseFloat(datos.este)) ? parseFloat(datos.este) : null,
            norte: Number.isFinite(parseFloat(datos.norte)) ? parseFloat(datos.norte) : null,
            margen: datos.margen || null,
            material: datos.material || null,
            tipo: datos.tipo || null,
            estado: datos.estado || null,
            dimension_a: Number.isFinite(parseFloat(datos.dimensionA)) ? parseFloat(datos.dimensionA) : null,
            dimension_h: Number.isFinite(parseFloat(datos.dimensionH)) ? parseFloat(datos.dimensionH) : null,
            dimension_d: Number.isFinite(parseFloat(datos.dimensionD)) ? parseFloat(datos.dimensionD) : null,
            observacion: datos.observacion || null,
            creado_por: usuarioId,
            actualizado_en: new Date().toISOString(),
        };
        if (datos.id) {
            const { error } = await client.from('inventario_tomas').update(fila).eq('id', datos.id);
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: datos.id };
        }
        const { data: creado, error } = await client.from('inventario_tomas').insert(fila).select('id').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: creado.id };
    }

    async function guardarRegistroInventarioCompuerta(datos) {
        if (!datos || !datos.comisionKey || !datos.canalFuente || !datos.nombreCanal) {
            return { ok: false, error: 'Faltan datos obligatorios (comisión, canal fuente o nombre del canal).' };
        }
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const fila = {
            comision_id: comisionId,
            toma_nombre: datos.tomaNombre || null,
            canal_fuente: _normCanalGuardado(datos.canalFuente),
            nombre_canal: _normCanalGuardado(datos.nombreCanal),
            orden_compuerta: datos.ordenCompuerta || null,
            progresiva_km: datos.progresivaKm || null,
            zona_utm: datos.zonaUtm || null,
            este: Number.isFinite(parseFloat(datos.este)) ? parseFloat(datos.este) : null,
            norte: Number.isFinite(parseFloat(datos.norte)) ? parseFloat(datos.norte) : null,
            margen: datos.margen || null,
            tipo: datos.tipo || null,
            material: datos.material || null,
            estado: datos.estado || null,
            operacion: datos.operacion || null,
            hoja_a: Number.isFinite(parseFloat(datos.hojaA)) ? parseFloat(datos.hojaA) : null,
            hoja_h: Number.isFinite(parseFloat(datos.hojaH)) ? parseFloat(datos.hojaH) : null,
            marco_a: Number.isFinite(parseFloat(datos.marcoA)) ? parseFloat(datos.marcoA) : null,
            marco_h: Number.isFinite(parseFloat(datos.marcoH)) ? parseFloat(datos.marcoH) : null,
            bloque_riego: datos.bloqueRiego || null,
            observacion: datos.observacion || null,
            creado_por: usuarioId,
            actualizado_en: new Date().toISOString(),
        };
        if (datos.id) {
            const { error } = await client.from('inventario_compuertas').update(fila).eq('id', datos.id);
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: datos.id };
        }
        const { data: creado, error } = await client.from('inventario_compuertas').insert(fila).select('id').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: creado.id };
    }

    async function _confirmarRegistroInventario(tabla, id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }
        const { data, error } = await client.from(tabla)
            .update({ confirmado: true, confirmado_en: new Date().toISOString() })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo confirmar: el registro no existe o ya no se puede editar.' };
        return { ok: true };
    }
    function confirmarRegistroInventarioToma(id) { return _confirmarRegistroInventario('inventario_tomas', id); }
    function confirmarRegistroInventarioCompuerta(id) { return _confirmarRegistroInventario('inventario_compuertas', id); }

    async function _desbloquearRegistroInventario(tabla, id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }
        const { data, error } = await client.from(tabla)
            .update({ confirmado: false, solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo desbloquear: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }
    function desbloquearRegistroInventarioToma(id) { return _desbloquearRegistroInventario('inventario_tomas', id); }
    function desbloquearRegistroInventarioCompuerta(id) { return _desbloquearRegistroInventario('inventario_compuertas', id); }

    async function _solicitarEdicionInventario(rpc, id, nombreSolicitante) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.rpc(rpc, { registro_id: id, nombre_solicitante: nombreSolicitante || null }),
            'solicitar edición de ' + rpc
        );
        if (error) return { ok: false, error: error.mensaje || 'No se pudo enviar la solicitud.' };
        return { ok: true };
    }
    function solicitarEdicionInventarioToma(id, nombreSolicitante) { return _solicitarEdicionInventario('solicitar_edicion_inventario_toma', id, nombreSolicitante); }
    function solicitarEdicionInventarioCompuerta(id, nombreSolicitante) { return _solicitarEdicionInventario('solicitar_edicion_inventario_compuerta', id, nombreSolicitante); }

    async function _listarSolicitudesEdicionInventario(tabla, comisionKey) {
        if (!comisionKey) return { ok: true, solicitudes: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, solicitudes: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from(tabla)
                .select('id, toma_nombre, canal_fuente, nombre_canal, solicitud_edicion_por_nombre, solicitud_edicion_en')
                .eq('comision_id', comisionId)
                .eq('solicitud_edicion', true)
                .order('solicitud_edicion_en', { ascending: true }),
            'listar solicitudes de edición de ' + tabla
        );
        if (error) return { ok: false, solicitudes: [], error: error.mensaje || 'No se pudo listar las solicitudes.' };
        return { ok: true, solicitudes: data || [] };
    }
    function listarSolicitudesEdicionInventarioToma(comisionKey) { return _listarSolicitudesEdicionInventario('inventario_tomas', comisionKey); }
    function listarSolicitudesEdicionInventarioCompuerta(comisionKey) { return _listarSolicitudesEdicionInventario('inventario_compuertas', comisionKey); }

    async function _rechazarSolicitudEdicionInventario(tabla, id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }
        const { data, error } = await client.from(tabla)
            .update({ solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo rechazar: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }
    function rechazarSolicitudEdicionInventarioToma(id) { return _rechazarSolicitudEdicionInventario('inventario_tomas', id); }
    function rechazarSolicitudEdicionInventarioCompuerta(id) { return _rechazarSolicitudEdicionInventario('inventario_compuertas', id); }

    // Normaliza canal_fuente/nombre_canal antes de cualquier escritura a
    // las 3 tablas de inventario (sync masivo Y guardado individual desde
    // el móvil) — evita duplicados por diferencias de mayúsculas/espacios
    // entre corridas sucesivas del Excel o ediciones manuales. Misma
    // lógica que _normCanal (assets/core/inventarioInfraestructura.js),
    // copiada acá en vez de reutilizarla: datos.js lo cargan 9 pantallas
    // del móvil que NO cargan ese archivo (movil/index.html,
    // orden-riego.html, seguimiento.html, notificaciones.html,
    // identificacion-registro.html, siembra-intencion.html,
    // pda-programado.html, sinceramiento-areas.html, condicion-usuario.html)
    // — depender del global rompería con un ReferenceError en esas pantallas.
    function _normCanalGuardado(valor) {
        return (valor || '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
    }

    // Sincronización masiva desde escritorio (parser del Excel de ANA,
    // ver Sistema_Riego_CUSSHMI_14.html). `filasEntrada` ya viene con
    // `tomaNombre` resuelto (assets/core/inventarioInfraestructura.js,
    // resolverTomaPorCanal) — acá solo se traduce a snake_case y se hace
    // upsert por lotes sobre la clave natural (canal_fuente + nombre_canal +
    // progresiva_km), igual que guardarPadronOficialA1. Si dos filas del
    // Excel comparten esa clave (no debería pasar, pero el archivo es
    // enorme y editado a mano durante años) se queda con la última —
    // mismo criterio ya usado para el Padrón A-1.
    async function _sincronizarInventario(tabla, comisionKey, filasEntrada, mapearFila) {
        if (!comisionKey) return { ok: false, error: 'Falta comisión.' };
        if (!Array.isArray(filasEntrada) || filasEntrada.length === 0) return { ok: true, guardados: 0 };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const filas = filasEntrada.map((f) => mapearFila(f, comisionId, usuarioId));
        filas.forEach((fila) => {
            fila.canal_fuente = _normCanalGuardado(fila.canal_fuente);
            fila.nombre_canal = _normCanalGuardado(fila.nombre_canal);
        });
        const filasPorClave = new Map();
        filas.forEach((fila) => {
            filasPorClave.set(fila.canal_fuente + '|' + fila.nombre_canal + '|' + (fila.progresiva_km || ''), fila);
        });
        const filasSinDuplicados = Array.from(filasPorClave.values());

        const TAMANO_LOTE = 500;
        let guardados = 0;
        for (let i = 0; i < filasSinDuplicados.length; i += TAMANO_LOTE) {
            const lote = filasSinDuplicados.slice(i, i + TAMANO_LOTE);
            const { error } = await client.from(tabla).upsert(lote, { onConflict: 'comision_id,canal_fuente,nombre_canal,progresiva_km' });
            if (error) return { ok: false, error: error.message, guardados };
            guardados += lote.length;
        }
        return { ok: true, guardados };
    }

    // `filasEntrada`: [{tomaNombre, canalFuente, nombreCanal, progresivaKm,
    //   zonaUtm, este, norte, margen, material, tipo, estado, dimensionA,
    //   dimensionH, dimensionD}, ...].
    function sincronizarInventarioTomas(comisionKey, filasEntrada) {
        return _sincronizarInventario('inventario_tomas', comisionKey, filasEntrada, (f, comisionId, usuarioId) => ({
            comision_id: comisionId,
            toma_nombre: f.tomaNombre || null,
            canal_fuente: _normCanalGuardado(f.canalFuente),
            nombre_canal: _normCanalGuardado(f.nombreCanal),
            progresiva_km: f.progresivaKm || null,
            zona_utm: f.zonaUtm || null,
            este: Number.isFinite(parseFloat(f.este)) ? parseFloat(f.este) : null,
            norte: Number.isFinite(parseFloat(f.norte)) ? parseFloat(f.norte) : null,
            margen: f.margen || null,
            material: f.material || null,
            tipo: f.tipo || null,
            estado: f.estado || null,
            dimension_a: Number.isFinite(parseFloat(f.dimensionA)) ? parseFloat(f.dimensionA) : null,
            dimension_h: Number.isFinite(parseFloat(f.dimensionH)) ? parseFloat(f.dimensionH) : null,
            dimension_d: Number.isFinite(parseFloat(f.dimensionD)) ? parseFloat(f.dimensionD) : null,
            creado_por: usuarioId,
        }));
    }

    // `filasEntrada`: [{tomaNombre, canalFuente, nombreCanal, ordenCompuerta,
    //   progresivaKm, zonaUtm, este, norte, margen, tipo, material, estado,
    //   operacion, hojaA, hojaH, marcoA, marcoH, bloqueRiego}, ...].
    function sincronizarInventarioCompuertas(comisionKey, filasEntrada) {
        return _sincronizarInventario('inventario_compuertas', comisionKey, filasEntrada, (f, comisionId, usuarioId) => ({
            comision_id: comisionId,
            toma_nombre: f.tomaNombre || null,
            canal_fuente: f.canalFuente,
            nombre_canal: f.nombreCanal,
            orden_compuerta: f.ordenCompuerta || null,
            progresiva_km: f.progresivaKm || null,
            zona_utm: f.zonaUtm || null,
            este: Number.isFinite(parseFloat(f.este)) ? parseFloat(f.este) : null,
            norte: Number.isFinite(parseFloat(f.norte)) ? parseFloat(f.norte) : null,
            margen: f.margen || null,
            tipo: f.tipo || null,
            material: f.material || null,
            estado: f.estado || null,
            operacion: f.operacion || null,
            hoja_a: Number.isFinite(parseFloat(f.hojaA)) ? parseFloat(f.hojaA) : null,
            hoja_h: Number.isFinite(parseFloat(f.hojaH)) ? parseFloat(f.hojaH) : null,
            marco_a: Number.isFinite(parseFloat(f.marcoA)) ? parseFloat(f.marcoA) : null,
            marco_h: Number.isFinite(parseFloat(f.marcoH)) ? parseFloat(f.marcoH) : null,
            bloque_riego: f.bloqueRiego || null,
            creado_por: usuarioId,
        }));
    }

    // ── Inventario de Infraestructura — Fase 2: los 12 tipos restantes ──────
    // A diferencia de Tomas/Compuertas (una tabla por tipo), estos 12 tipos
    // (Acueductos, Sifón Invertido, Caídas, Rápidas, Repartidor, Pase
    // Vehicular, Pase Peatonal, Alcantarilla, Medidores, Canales Laterales,
    // Dren Principal, Drenes Secundarios) comparten UNA sola tabla
    // `inventario_estructuras` (`tipo_estructura` + `campos` jsonb con lo
    // propio de cada tipo — ver assets/core/inventarioInfraestructura.js,
    // TIPOS_ESTRUCTURA_GENERICOS). El móvil solo edita `estado`/
    // `observacion`; el resto de `campos` es de solo lectura (viene del
    // levantamiento de ingeniería, no algo que un sectorista re-mida en
    // cada visita). Se reutilizan los helpers genéricos ya escritos para
    // Tomas/Compuertas (`_confirmarRegistroInventario`,
    // `_desbloquearRegistroInventario`, `_solicitarEdicionInventario`,
    // `_rechazarSolicitudEdicionInventario` — ya parametrizados por tabla/
    // RPC) en vez de duplicarlos.

    async function _contarInventarioEstructurasPorToma(comisionId, tipoEstructura) {
        const TAMANO_PAGINA = 1000;
        const conteos = {};
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('inventario_estructuras').select('toma_nombre, confirmado')
                    .eq('comision_id', comisionId).eq('tipo_estructura', tipoEstructura)
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'contar inventario_estructuras por toma'
            );
            if (error || !data) return null;
            data.forEach((fila) => {
                const clave = fila.toma_nombre || 'Sin toma asignada';
                if (!conteos[clave]) conteos[clave] = { total: 0, confirmados: 0 };
                conteos[clave].total += 1;
                if (fila.confirmado) conteos[clave].confirmados += 1;
            });
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return conteos;
    }

    async function obtenerAvanceInventarioEstructurasPorToma(comisionKey, tipoEstructura) {
        if (!comisionKey || !tipoEstructura) return { ok: true, avance: {} };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, avance: {}, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        const conteos = await _contarInventarioEstructurasPorToma(comisionId, tipoEstructura);
        if (!conteos) return { ok: false, avance: {}, error: 'No se pudo calcular el avance del inventario.' };
        const avance = {};
        Object.keys(conteos).forEach((toma) => {
            const c = conteos[toma];
            avance[toma] = { revisados: c.confirmados, total: c.total, porcentaje: c.total > 0 ? Math.round((c.confirmados / c.total) * 100) : null };
        });
        return { ok: true, avance };
    }

    async function listarRegistrosInventarioEstructurasDeToma(comisionKey, tomaNombre, tipoEstructura) {
        if (!comisionKey || !tomaNombre || !tipoEstructura) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('inventario_estructuras')
                .select('id, nombre_obra, canal_fuente, nombre_canal, progresiva_km, estado, confirmado, este, norte, observacion, campos')
                .eq('comision_id', comisionId).eq('toma_nombre', tomaNombre).eq('tipo_estructura', tipoEstructura),
            'listar registros de inventario_estructuras de la toma'
        );
        if (error) return { ok: false, registros: [], error: error.mensaje || 'No se pudo listar los registros.' };
        return { ok: true, registros: data || [] };
    }

    // Sin filtro de toma — usado para emparejar las figuras del mapa GIS
    // contra su fila real en tipos que cruzan varias tomas (Drenes, que no
    // tienen toma_nombre resuelto) o cuando la toma de la figura no
    // coincide exactamente con la que el usuario tiene seleccionada.
    async function listarRegistrosInventarioEstructurasPorTipo(comisionKey, tipoEstructura) {
        if (!comisionKey || !tipoEstructura) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('inventario_estructuras')
                .select('id, nombre_obra, canal_fuente, nombre_canal, progresiva_km, estado, confirmado, este, norte, toma_nombre, observacion, campos')
                .eq('comision_id', comisionId).eq('tipo_estructura', tipoEstructura),
            'listar registros de inventario_estructuras por tipo'
        );
        if (error) return { ok: false, registros: [], error: error.mensaje || 'No se pudo listar los registros.' };
        return { ok: true, registros: data || [] };
    }

    async function cargarRegistroInventarioEstructura(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('inventario_estructuras').select('*').eq('id', id).maybeSingle(),
            'cargar registro de inventario_estructuras'
        );
        if (error) return { ok: false, error: error.mensaje };
        if (!data) return { ok: false, error: 'Registro no encontrado.' };
        return { ok: true, registro: data };
    }

    // Solo `estado`/`observacion` — el resto de columnas (identidad,
    // ubicación, `campos` de referencia) las pone la sincronización desde
    // el Excel, nunca el celular.
    // `datos.campos`, si viene, reemplaza por completo la columna `campos`
    // (jsonb) — el móvil siempre manda el objeto completo ya cargado del
    // servidor con los campos `editable` corregidos encima (ver
    // TIPOS_ESTRUCTURA_GENERICOS), nunca un parche parcial, así que un
    // reemplazo total es seguro y no pierde el resto de la referencia.
    async function guardarRegistroInventarioEstructura(datos) {
        if (!datos) return { ok: false, error: 'Faltan datos del registro.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }

        if (datos.id) {
            const cambios = { estado: datos.estado || null, observacion: datos.observacion || null, actualizado_en: new Date().toISOString() };
            if (datos.campos && typeof datos.campos === 'object') cambios.campos = datos.campos;
            if (datos.nombreObra !== undefined) cambios.nombre_obra = datos.nombreObra || null;
            if (datos.este !== undefined) cambios.este = Number.isFinite(parseFloat(datos.este)) ? parseFloat(datos.este) : null;
            if (datos.norte !== undefined) cambios.norte = Number.isFinite(parseFloat(datos.norte)) ? parseFloat(datos.norte) : null;
            const { error } = await client.from('inventario_estructuras')
                .update(cambios)
                .eq('id', datos.id);
            if (error) return { ok: false, error: error.message };
            return { ok: true, id: datos.id };
        }

        // Sin id: registro nuevo — hoy solo lo dispara el mapa de Inventario
        // cuando una figura del levantamiento GIS todavía no tiene fila
        // sincronizada desde el Excel (ver abrirFichaDesdeFiguraGis, movil/
        // inventario-infraestructura.html). Los 12 tipos genéricos no
        // ofrecen "+ Agregar estructura nueva" en ningún otro punto del
        // móvil — solo se sincronizan desde escritorio o se crean así.
        if (!datos.comisionKey || !datos.tipoEstructura || !datos.canalFuente || !datos.nombreCanal) {
            return { ok: false, error: 'Faltan datos obligatorios (comisión, tipo, canal fuente o nombre del canal).' };
        }
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;
        const fila = {
            comision_id: comisionId, tipo_estructura: datos.tipoEstructura, toma_nombre: datos.tomaNombre || null,
            canal_fuente: _normCanalGuardado(datos.canalFuente), nombre_canal: _normCanalGuardado(datos.nombreCanal), progresiva_km: datos.progresivaKm || null,
            nombre_obra: datos.nombreObra || null,
            este: Number.isFinite(parseFloat(datos.este)) ? parseFloat(datos.este) : null,
            norte: Number.isFinite(parseFloat(datos.norte)) ? parseFloat(datos.norte) : null,
            estado: datos.estado || null, observacion: datos.observacion || null,
            campos: datos.campos && typeof datos.campos === 'object' ? datos.campos : {},
            creado_por: usuarioId, actualizado_en: new Date().toISOString(),
        };
        const { data: creado, error } = await client.from('inventario_estructuras').insert(fila).select('id').single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: creado.id };
    }

    function confirmarRegistroInventarioEstructura(id) { return _confirmarRegistroInventario('inventario_estructuras', id); }
    function desbloquearRegistroInventarioEstructura(id) { return _desbloquearRegistroInventario('inventario_estructuras', id); }
    function solicitarEdicionInventarioEstructura(id, nombreSolicitante) { return _solicitarEdicionInventario('solicitar_edicion_inventario_estructura', id, nombreSolicitante); }
    function rechazarSolicitudEdicionInventarioEstructura(id) { return _rechazarSolicitudEdicionInventario('inventario_estructuras', id); }

    // `tipoEstructura` opcional — si se omite, trae las solicitudes de los
    // 12 tipos juntas (la pantalla admin del móvil las agrupa por tipo con
    // el campo `tipo_estructura` que se incluye en el select).
    async function listarSolicitudesEdicionInventarioEstructura(comisionKey, tipoEstructura) {
        if (!comisionKey) return { ok: true, solicitudes: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, solicitudes: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => {
                let q = client.from('inventario_estructuras')
                    .select('id, tipo_estructura, toma_nombre, nombre_obra, canal_fuente, nombre_canal, solicitud_edicion_por_nombre, solicitud_edicion_en')
                    .eq('comision_id', comisionId).eq('solicitud_edicion', true);
                if (tipoEstructura) q = q.eq('tipo_estructura', tipoEstructura);
                return q.order('solicitud_edicion_en', { ascending: true });
            },
            'listar solicitudes de edición de inventario_estructuras'
        );
        if (error) return { ok: false, solicitudes: [], error: error.mensaje || 'No se pudo listar las solicitudes.' };
        return { ok: true, solicitudes: data || [] };
    }

    // `filasEntrada`: [{nombreObra, canalFuente, nombreCanal, progresivaKm,
    //   zonaUtm, este, norte, estado, bloqueRiego, observacion, tomaNombre,
    //   campos: {...}}, ...] — ya armadas por
    //   _extraerFilasEstructuraGenerica (Sistema_Riego_CUSSHMI_14.html).
    // Distinto de `_sincronizarInventario` (Tomas/Compuertas) porque la
    // clave de conflicto acá incluye `tipo_estructura` (una sola tabla para
    // los 12 tipos, la clave natural por sí sola no alcanza para distinguir
    // "un Acueducto en el canal X" de "una Alcantarilla en el canal X").
    async function sincronizarInventarioEstructuras(comisionKey, tipoEstructura, filasEntrada) {
        if (!comisionKey) return { ok: false, error: 'Falta comisión.' };
        if (!tipoEstructura) return { ok: false, error: 'Falta el tipo de estructura.' };
        if (!Array.isArray(filasEntrada) || filasEntrada.length === 0) return { ok: true, guardados: 0 };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const filas = filasEntrada.map((f) => ({
            comision_id: comisionId,
            tipo_estructura: tipoEstructura,
            toma_nombre: f.tomaNombre || null,
            canal_fuente: _normCanalGuardado(f.canalFuente),
            nombre_canal: _normCanalGuardado(f.nombreCanal),
            progresiva_km: f.progresivaKm || null,
            nombre_obra: f.nombreObra || null,
            zona_utm: f.zonaUtm || null,
            este: Number.isFinite(parseFloat(f.este)) ? parseFloat(f.este) : null,
            norte: Number.isFinite(parseFloat(f.norte)) ? parseFloat(f.norte) : null,
            estado: f.estado || null,
            bloque_riego: f.bloqueRiego || null,
            observacion: f.observacion || null,
            campos: f.campos || {},
            creado_por: usuarioId,
        }));

        const filasPorClave = new Map();
        filas.forEach((fila) => {
            filasPorClave.set(fila.canal_fuente + '|' + fila.nombre_canal + '|' + (fila.progresiva_km || ''), fila);
        });
        const filasSinDuplicados = Array.from(filasPorClave.values());

        const TAMANO_LOTE = 500;
        let guardados = 0;
        for (let i = 0; i < filasSinDuplicados.length; i += TAMANO_LOTE) {
            const lote = filasSinDuplicados.slice(i, i + TAMANO_LOTE);
            const { error } = await client.from('inventario_estructuras').upsert(lote, { onConflict: 'comision_id,tipo_estructura,canal_fuente,nombre_canal,progresiva_km' });
            if (error) return { ok: false, error: error.message, guardados };
            guardados += lote.length;
        }
        return { ok: true, guardados };
    }

    // ── Fotos del Inventario de Infraestructura ─────────────────────────────
    // A diferencia de sinceramiento-fotos, ninguna de las 3 tablas de
    // inventario tiene una columna fotos_urls: la sincronización desde Excel
    // hace upsert completo de cada fila y podría borrar esa referencia en el
    // próximo resync. Las fotos se suben a Storage y se listan directamente
    // desde ahí (bucket 022_inventario_fotos.sql), sin depender de ninguna
    // columna que el resync pudiera pisar. Ruta: {comision_id}/{tabla}/
    // {registro_id}/{archivo} — "tabla" evita mezclar fotos entre las 3
    // tablas cuando comparten el mismo id (no debería pasar con uuid, pero
    // mantiene la ruta autoexplicativa).
    async function subirFotoInventario(comisionKey, tabla, registroId, blob, nombreArchivo) {
        if (!comisionKey || !tabla || !registroId || !blob) return { ok: false, error: 'Faltan datos para subir la foto.' };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }

        const path = comisionId + '/' + tabla + '/' + registroId + '/' + nombreArchivo;
        const { error } = await client.storage.from('inventario-fotos').upload(path, blob, { upsert: true });
        if (error) return { ok: false, error: error.message };
        return { ok: true, path };
    }

    async function listarFotosInventario(comisionKey, tabla, registroId) {
        if (!comisionKey || !tabla || !registroId) return { ok: false, error: 'Faltan datos para listar las fotos.', fotos: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.', fotos: [] };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message, fotos: [] };
        }

        const carpeta = comisionId + '/' + tabla + '/' + registroId;
        const { data, error } = await client.storage.from('inventario-fotos').list(carpeta);
        if (error) return { ok: false, error: error.message, fotos: [] };
        const fotos = (data || [])
            .filter((f) => f.name && f.id) // Storage devuelve un placeholder ".emptyFolderPlaceholder" en carpetas vacías, sin id
            .map((f) => ({ path: carpeta + '/' + f.name, nombreArchivo: f.name, subidoEn: f.created_at || null }));
        return { ok: true, fotos };
    }

    async function obtenerUrlFirmadaFotoInventario(path) {
        if (!path) return { ok: false, error: 'Falta la ruta de la foto.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.storage.from('inventario-fotos').createSignedUrl(path, 3600);
        if (error) return { ok: false, error: error.message };
        return { ok: true, url: data.signedUrl };
    }

    // ── Padrón oficial A-1 (R.J. N° 0155-2022-ANA) ──────────────────────────
    // Carga masiva desde escritorio (parser del Excel oficial de ANA, formato
    // de encabezados fusionados). `filasEntrada`: [{numeroOrden,
    // apellidosNombres, tipoDocumento, numeroDocumento, departamento,
    // provincia, distrito, localidad, unidadCatastral, areaTotalHa,
    // areaBajoRiegoHa, subSectorHidraulico, numeroResolucion, claseDerecho,
    // tipoUso, volumenM3}, ...].
    async function guardarPadronOficialA1(comisionKey, filasEntrada) {
        if (!comisionKey) return { ok: false, error: 'Falta comisión.' };
        if (!Array.isArray(filasEntrada) || filasEntrada.length === 0) return { ok: true, guardados: 0 };
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

        const filas = filasEntrada.map((f) => ({
            comision_id: comisionId,
            numero_orden: Number.isFinite(parseInt(f.numeroOrden, 10)) ? parseInt(f.numeroOrden, 10) : null,
            apellidos_nombres: (f.apellidosNombres || '-').toString(),
            tipo_documento: f.tipoDocumento || null,
            numero_documento: f.numeroDocumento != null ? f.numeroDocumento.toString() : null,
            departamento: f.departamento || null,
            provincia: f.provincia || null,
            distrito: f.distrito || null,
            localidad: f.localidad || null,
            unidad_catastral: (f.unidadCatastral != null && f.unidadCatastral !== '') ? f.unidadCatastral.toString() : null,
            area_total_ha: Number.isFinite(parseFloat(f.areaTotalHa)) ? parseFloat(f.areaTotalHa) : null,
            area_bajo_riego_ha: Number.isFinite(parseFloat(f.areaBajoRiegoHa)) ? parseFloat(f.areaBajoRiegoHa) : null,
            sub_sector_hidraulico: f.subSectorHidraulico || null,
            numero_resolucion: f.numeroResolucion || null,
            clase_derecho: f.claseDerecho || null,
            tipo_uso: f.tipoUso || null,
            volumen_m3: Number.isFinite(parseFloat(f.volumenM3)) ? parseFloat(f.volumenM3) : null,
            toma_nombre: f.tomaNombre || null,
            origen: 'ana_a1',
            actualizado_por: usuarioId,
        }));

        // Mismo motivo que guardarPadronToma: Postgres rechaza el upsert si
        // dos filas del mismo arreglo comparten la clave de conflicto
        // (comisión + unidad catastral) — se queda con la última aparición.
        // Las filas sin unidad catastral (excepcional en el archivo oficial)
        // no tienen clave de conflicto real: siempre insertan, nunca
        // actualizan — si se repite la carga podrían duplicarse; caso raro,
        // no se resuelve acá.
        const filasPorClave = new Map();
        const sinUC = [];
        filas.forEach((fila) => {
            if (!fila.unidad_catastral) { sinUC.push(fila); return; }
            filasPorClave.set(fila.unidad_catastral, fila);
        });
        const filasSinDuplicados = Array.from(filasPorClave.values()).concat(sinUC);

        const TAMANO_LOTE = 500; // evitar un solo request gigante con miles de filas
        let guardados = 0;
        for (let i = 0; i < filasSinDuplicados.length; i += TAMANO_LOTE) {
            const lote = filasSinDuplicados.slice(i, i + TAMANO_LOTE);
            const { error } = await client.from('padron_oficial_a1').upsert(lote, { onConflict: 'comision_id,unidad_catastral' });
            if (error) return { ok: false, error: error.message, guardados };
            guardados += lote.length;
        }
        return { ok: true, guardados };
    }

    // Todo el padrón oficial A-1 de una comisión — para cruzarlo en el
    // cliente (por unidad catastral o nombre) contra el usuario elegido en
    // "Identificación y registro" y autocompletar las Secciones A y C.
    // Paginado de a 1000 (mismo límite/patrón que listarTomasConPadron).
    async function cargarPadronOficialA1(comisionKey) {
        if (!comisionKey) return { ok: true, resultados: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, resultados: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const TAMANO_PAGINA = 1000;
        const resultados = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('padron_oficial_a1')
                    .select('id, apellidos_nombres, tipo_documento, numero_documento, unidad_catastral, area_total_ha, area_bajo_riego_ha, numero_resolucion, clase_derecho, tipo_uso, volumen_m3, origen, toma_nombre, canal_nombre')
                    .eq('comision_id', comisionId)
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'cargar padrón oficial A-1'
            );
            if (error || !data) return { ok: false, resultados: [], error: error ? error.mensaje : 'No se pudo cargar el padrón oficial A-1.' };
            resultados.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return { ok: true, resultados };
    }

    // Todos los campos del padrón oficial A-1 — para exportar los Formatos
    // A-1/A-2 oficiales (a diferencia de cargarPadronOficialA1, que solo
    // trae lo necesario para el autocompletado del móvil). `origen`
    // distingue qué fila va en cada formato: 'ana_a1' -> Formato A-1
    // (usuarios con derecho vigente en el RADA), 'campo' -> Formato A-2
    // (usuarios que el sectorista registró en campo sin derecho formalizado).
    async function cargarPadronOficialA1CompletoParaExportar(comisionKey) {
        if (!comisionKey) return { ok: true, resultados: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, resultados: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const TAMANO_PAGINA = 1000;
        const resultados = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('padron_oficial_a1')
                    .select('numero_orden, apellidos_nombres, tipo_documento, numero_documento, departamento, provincia, distrito, localidad, unidad_catastral, area_total_ha, area_bajo_riego_ha, sub_sector_hidraulico, numero_resolucion, clase_derecho, tipo_uso, volumen_m3, canal_derivacion, fuente_agua, cut_expediente, toma_nombre, origen, observacion, vertices_utm, poligono_actualizado_en')
                    .eq('comision_id', comisionId)
                    .order('origen', { ascending: true })
                    .order('toma_nombre', { ascending: true, nullsFirst: false })
                    .order('numero_orden', { ascending: true, nullsFirst: false })
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'cargar padrón oficial A-1 completo (exportación)'
            );
            if (error || !data) return { ok: false, resultados: [], error: error ? error.mensaje : 'No se pudo cargar el padrón oficial A-1.' };
            resultados.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return { ok: true, resultados };
    }

    // Mueve un usuario de un Canal Lateral a otro dentro de la misma toma
    // (ficha del Mapa de Inventario) — un simple `update` de la columna
    // nueva `canal_nombre`, sin RPC especial: la fila ya pertenece a esa
    // comisión y las políticas RLS de padron_oficial_a1 ya cubren esto.
    async function reasignarUsuarioCanal(usuarioId, nuevoCanalNombre) {
        if (!usuarioId) return { ok: false, error: 'Falta el usuario a reasignar.' };
        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }
        const { error } = await client.from('padron_oficial_a1')
            .update({ canal_nombre: nuevoCanalNombre || null })
            .eq('id', usuarioId);
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    }

    // Un usuario que el sectorista registró en campo y que NO estaba en el
    // padrón oficial A-1 (Anexo A-2: sin derecho formalizado) se incorpora
    // acá con origen='campo' y la observación fija "Remitir a la Junta" —
    // así queda dentro del mismo padrón para futuras consultas/exportación,
    // marcado para que la Junta lo formalice.
    async function incorporarUsuarioNuevoAPadronOficialA1(datos) {
        if (!datos || !datos.comisionKey || !datos.apellidosNombres) {
            return { ok: false, error: 'Faltan datos obligatorios.' };
        }
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const fila = {
            comision_id: comisionId,
            apellidos_nombres: datos.apellidosNombres,
            tipo_documento: datos.tipoDocumento || null,
            numero_documento: datos.numeroDocumento || null,
            unidad_catastral: datos.unidadCatastral || null,
            area_total_ha: Number.isFinite(parseFloat(datos.areaTotalHa)) ? parseFloat(datos.areaTotalHa) : null,
            area_bajo_riego_ha: Number.isFinite(parseFloat(datos.areaBajoRiegoHa)) ? parseFloat(datos.areaBajoRiegoHa) : null,
            tipo_uso: datos.tipoUso || null,
            canal_derivacion: datos.canalDerivacion || null,
            fuente_agua: datos.fuenteAgua || null,
            cut_expediente: datos.cutExpediente || null,
            toma_nombre: datos.tomaNombre || null,
            origen: 'campo',
            observacion: 'Remitir a la Junta',
            actualizado_por: usuarioId,
        };

        const { error } = datos.unidadCatastral
            ? await client.from('padron_oficial_a1').upsert(fila, { onConflict: 'comision_id,unidad_catastral' })
            : await client.from('padron_oficial_a1').insert(fila);
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    }

    // El padrón A-1 (oficial u ya incorporado) se carga UNA VEZ, pero un
    // usuario que YA estaba ahí puede tener datos desactualizados o mal
    // digitados en el Excel de origen — el sectorista los verifica/corrige
    // en campo. Al confirmar (una sola vez, no en cada autoguardado) esos
    // valores verificados alimentan de vuelta la fila del padrón que ya
    // existía, SIN tocar `origen` ni `observacion` (no cambia si es un
    // usuario del RADA o uno incorporado desde campo — eso no lo decide
    // esta verificación). Requiere unidad_catastral (es la clave con la que
    // se localiza la fila a actualizar); si no hay, no hace nada.
    async function actualizarPadronOficialA1DesdeRegistro(datos) {
        if (!datos || !datos.comisionKey || !datos.unidadCatastral) return { ok: true, actualizado: false };
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const cambios = {
            apellidos_nombres: datos.apellidosNombres,
            tipo_documento: datos.tipoDocumento || null,
            numero_documento: datos.numeroDocumento || null,
            area_total_ha: Number.isFinite(parseFloat(datos.areaTotalHa)) ? parseFloat(datos.areaTotalHa) : null,
            area_bajo_riego_ha: Number.isFinite(parseFloat(datos.areaBajoRiegoHa)) ? parseFloat(datos.areaBajoRiegoHa) : null,
            numero_resolucion: datos.numeroResolucion || null,
            clase_derecho: datos.claseDerecho || null,
            tipo_uso: datos.tipoUso || null,
            volumen_m3: Number.isFinite(parseFloat(datos.volumenM3Anio)) ? parseFloat(datos.volumenM3Anio) : null,
            toma_nombre: datos.tomaNombre || null,
            actualizado_por: usuarioId,
        };
        // `observacion` solo se toca si el llamador la envía explícitamente
        // (móvil, ficha de Padrón CUSSHMI) — así una llamada que no la
        // conoce (ej. la tabla editable de escritorio) nunca la borra sin
        // querer.
        if (datos.observacion !== undefined) cambios.observacion = datos.observacion || null;

        const { data, error } = await client.from('padron_oficial_a1')
            .update(cambios)
            .eq('comision_id', comisionId)
            .eq('unidad_catastral', datos.unidadCatastral)
            .select('id');
        if (error) return { ok: false, error: error.message };
        return { ok: true, actualizado: (data || []).length > 0 };
    }

    // Polígono propio de un usuario del Padrón A-1, editado/creado a mano
    // desde "Padrón CUSSHMI" (Generar Plano) — independiente del predio del
    // KML del bloque de riego (que solo es un respaldo cuando este campo
    // está vacío) y de formato_a2_levantamiento (los 93 observados de ANA,
    // tabla aparte). `verticesUtm`: arreglo de {easting,northing,lat,lon,
    // orden} o null para borrar el polígono guardado y volver a depender
    // del respaldo del KML. Requiere unidad_catastral (clave con la que se
    // ubica la fila, igual que actualizarPadronOficialA1DesdeRegistro).
    async function guardarPoligonoPadronOficialA1(datos) {
        if (!datos || !datos.comisionKey || !datos.unidadCatastral) return { ok: false, error: 'Faltan datos obligatorios (comisión / unidad catastral).' };
        const comisionId = await resolverComisionId(datos.comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + datos.comisionKey + '" no existe en Supabase.' };

        let client;
        try { client = window.CusshmiSupabase.getClient(); } catch (e) { return { ok: false, error: e.message }; }

        const cambios = {
            vertices_utm: Array.isArray(datos.verticesUtm) && datos.verticesUtm.length >= 3 ? datos.verticesUtm : null,
            poligono_actualizado_en: new Date().toISOString(),
        };
        const { data, error } = await client.from('padron_oficial_a1')
            .update(cambios)
            .eq('comision_id', comisionId)
            .eq('unidad_catastral', datos.unidadCatastral)
            .select('id');
        if (error) return { ok: false, error: error.message };
        return { ok: true, actualizado: (data || []).length > 0 };
    }

    // ── Formato A-2 — Levantamiento de Observaciones ANA ────────────────────
    // Distinto de identificacion_registros.clasificacion (A-1/A-2 calculado
    // del formulario existente) — esto es el ejercicio puntual de
    // cumplimiento (Oficio Múltiple N°101-2026-JUSHMCH): usuarios que ANA ya
    // "observó", cargados desde un Excel oficial ya parcialmente cruzado
    // contra el padrón digital SIGA, que el sectorista termina de
    // verificar/completar en campo. Mismo patrón de candado que
    // identificacion_registros (arriba), tabla propia
    // `formato_a2_levantamiento` (ver assets/supabase/sql/026_formato_a2_levantamiento.sql).

    // Guarda el archivo Excel original tal cual se sube (Storage, bucket
    // 'formato-a2-plantillas', ver assets/supabase/sql/027_formato_a2_plantilla.sql)
    // — un solo archivo por comisión, sobreescrito en cada sincronización. El
    // exportador vuelve a abrir ESTE mismo archivo y solo reescribe las filas
    // de datos, para garantizar el mismo formato exacto del oficial.
    async function subirPlantillaFormatoA2Levantamiento(comisionKey, blob) {
        if (!comisionKey || !blob) return { ok: false, error: 'Faltan datos para subir la plantilla.' };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const path = comisionId + '/plantilla.xlsx';
        const { error } = await client.storage.from('formato-a2-plantillas').upload(path, blob, { upsert: true });
        if (error) return { ok: false, error: error.message };
        return { ok: true, path };
    }

    // Descarga la plantilla guardada — el exportador la carga con ExcelJS y
    // solo reescribe las filas de datos, dejando el resto del archivo intacto.
    async function obtenerPlantillaFormatoA2Levantamiento(comisionKey) {
        if (!comisionKey) return { ok: false, error: 'Falta comisión.' };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const path = comisionId + '/plantilla.xlsx';
        const { data, error } = await client.storage.from('formato-a2-plantillas').download(path);
        if (error) return { ok: false, error: 'No se encontró una plantilla guardada — sincroniza primero el Formato A-2 desde el Excel oficial (' + error.message + ').' };
        return { ok: true, blob: data };
    }

    // Todas las columnas de formato_a2_levantamiento (todas las tomas) — para
    // que el exportador reparta en memoria por hoja (Margen Izquierda +
    // cada toma). Paginado de 1000, mismo patrón que
    // cargarPadronOficialA1CompletoParaExportar.
    async function cargarFormatoA2LevantamientoParaExportar(comisionKey) {
        if (!comisionKey) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const TAMANO_PAGINA = 1000;
        const registros = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('formato_a2_levantamiento')
                    .select('*')
                    .eq('comision_id', comisionId)
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'cargar Formato A-2 (Levantamiento) para exportar'
            );
            if (error || !data) return { ok: false, registros: [], error: error ? error.mensaje : 'No se pudo cargar los registros.' };
            registros.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }
        return { ok: true, registros };
    }

    // Upsert masivo desde el importador de escritorio — mismo patrón que
    // guardarPadronOficialA1: deduplica en cliente por la clave de
    // conflicto (acá apellidos_nombres, normalizado por el llamador) porque
    // Postgres rechaza un upsert con claves repetidas en el mismo lote, y
    // envía en lotes de 500.
    async function guardarFormatoA2LevantamientoRegistros(comisionKey, filasEntrada) {
        if (!comisionKey) return { ok: false, error: 'Falta comisión.' };
        if (!Array.isArray(filasEntrada) || filasEntrada.length === 0) return { ok: true, guardados: 0 };
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

        const filas = filasEntrada.map((f) => ({
            comision_id: comisionId,
            toma_nombre: f.tomaNombre || null,
            numero_orden: Number.isFinite(parseInt(f.numeroOrden, 10)) ? parseInt(f.numeroOrden, 10) : null,
            apellidos_nombres: (f.apellidosNombres || '-').toString(),
            tipo_documento: f.tipoDocumento || null,
            numero_documento: f.numeroDocumento != null ? f.numeroDocumento.toString() : null,
            departamento: f.departamento || null,
            provincia: f.provincia || null,
            distrito: f.distrito || null,
            localidad: f.localidad || null,
            unidad_catastral: (f.unidadCatastral != null && f.unidadCatastral !== '') ? f.unidadCatastral.toString() : null,
            area_total_ha: Number.isFinite(parseFloat(f.areaTotalHa)) ? parseFloat(f.areaTotalHa) : null,
            area_bajo_riego_ha: Number.isFinite(parseFloat(f.areaBajoRiegoHa)) ? parseFloat(f.areaBajoRiegoHa) : null,
            sub_sector_hidraulico: f.subSectorHidraulico || null,
            canal_derivacion: f.canalDerivacion || null,
            fuente_agua: f.fuenteAgua || null,
            cut_expediente: f.cutExpediente || null,
            tipo_uso: f.tipoUso || null,
            volumen_m3: Number.isFinite(parseFloat(f.volumenM3)) ? parseFloat(f.volumenM3) : null,
            conductor_actual: f.conductorActual || null,
            conductor_tipo_documento: f.conductorTipoDocumento || null,
            conductor_numero_documento: f.conductorNumeroDocumento || null,
            estado: f.estado || null,
            ultima_fecha_riego: f.ultimaFechaRiego != null ? f.ultimaFechaRiego.toString() : null,
            este: Number.isFinite(parseFloat(f.este)) ? parseFloat(f.este) : null,
            norte: Number.isFinite(parseFloat(f.norte)) ? parseFloat(f.norte) : null,
            zona: f.zona || null,
            uc_ref: f.ucRef != null ? f.ucRef.toString() : null,
            se_ubica_bloque: f.seUbicaBloque || null,
            nombre_bloque_riego: f.nombreBloqueRiego || null,
            sector: f.sector || null,
            observaciones: f.observaciones || null,
            campos_verificacion: f.camposVerificacion || {},
            estado_verificacion: f.estadoVerificacion || null,
            actualizado_por: usuarioId,
        }));

        // Clave de conflicto: (toma_nombre, numero_orden), NO apellidos_nombres — un
        // mismo nombre/asociación puede repetirse varias veces dentro de la MISMA
        // hoja de toma (varios predios, ej. una asociación con 7 filas en SD11);
        // numero_orden (la posición real de la fila en su hoja) sí las distingue
        // siempre. Mismo motivo que guardarPadronOficialA1 para deduplicar en
        // cliente antes del upsert (Postgres rechaza claves repetidas en un lote).
        const filasPorClave = new Map();
        filas.forEach((fila) => {
            filasPorClave.set((fila.toma_nombre || '') + '|' + fila.numero_orden, fila);
        });
        const filasSinDuplicados = Array.from(filasPorClave.values());

        // Cols 18-47 ("datos de verificación/levantamiento") son las que el
        // sectorista completa en el celular — si el Excel se vuelve a
        // sincronizar mientras un registro TODAVÍA no está confirmado (ej.
        // trabajo de campo a medias, autoguardado pero sin tocar "Confirmar"),
        // reenviar estas columnas pisaría ese avance con lo que traiga el
        // Excel (típicamente en blanco). Se excluyen del payload para
        // cualquier fila que YA EXISTE en la base — solo se completan la
        // PRIMERA vez que se importa esa fila (INSERT), nunca en un resync
        // posterior de una fila ya existente.
        const CAMPOS_VERIFICACION_SECTORISTA = [
            'conductor_actual', 'conductor_tipo_documento', 'conductor_numero_documento',
            'estado', 'ultima_fecha_riego', 'este', 'norte', 'zona', 'uc_ref',
            'se_ubica_bloque', 'nombre_bloque_riego', 'sector', 'observaciones', 'campos_verificacion',
        ];

        // Consulta única: qué filas ya existen (para no pisar sus cols 18-47) y
        // cuáles de esas ya están CONFIRMADAS (para excluirlas del todo — mismo
        // candado que identreg_update/formatoA2Lev_update,
        // 026_formato_a2_levantamiento.sql). Sin la exclusión de confirmadas,
        // un solo registro confirmado bloquea el LOTE completo: Postgres
        // rechaza todo el upsert si la política RLS de update no deja tocar esa
        // fila en conflicto ("violates row-level security policy").
        const { data: existentes } = await client.from('formato_a2_levantamiento')
            .select('toma_nombre, numero_orden, confirmado')
            .eq('comision_id', comisionId);
        const clavesConfirmadas = new Set();
        const clavesExistentesNoConfirmadas = new Set();
        (existentes || []).forEach((r) => {
            const clave = (r.toma_nombre || '') + '|' + r.numero_orden;
            if (r.confirmado) clavesConfirmadas.add(clave);
            else clavesExistentesNoConfirmadas.add(clave);
        });

        const filasNuevas = []; // no existen todavía -> payload completo (47 cols)
        const filasActualizarSoloIdentidad = []; // ya existen, sin confirmar -> solo cols 1-17 + color
        let omitidosPorConfirmados = 0;
        filasSinDuplicados.forEach((fila) => {
            const clave = (fila.toma_nombre || '') + '|' + fila.numero_orden;
            if (clavesConfirmadas.has(clave)) { omitidosPorConfirmados++; return; }
            if (clavesExistentesNoConfirmadas.has(clave)) {
                const filaLigera = Object.assign({}, fila);
                CAMPOS_VERIFICACION_SECTORISTA.forEach((campo) => { delete filaLigera[campo]; });
                filasActualizarSoloIdentidad.push(filaLigera);
            } else {
                filasNuevas.push(fila);
            }
        });

        const TAMANO_LOTE = 500;
        let guardados = 0;
        async function subirEnLotes(lista) {
            for (let i = 0; i < lista.length; i += TAMANO_LOTE) {
                const lote = lista.slice(i, i + TAMANO_LOTE);
                const { error } = await client.from('formato_a2_levantamiento').upsert(lote, { onConflict: 'comision_id,toma_nombre,numero_orden' });
                if (error) return error;
                guardados += lote.length;
            }
            return null;
        }
        let error = await subirEnLotes(filasNuevas);
        if (error) return { ok: false, error: error.message, guardados };
        error = await subirEnLotes(filasActualizarSoloIdentidad);
        if (error) return { ok: false, error: error.message, guardados };

        return {
            ok: true, guardados, omitidosPorConfirmados,
            actualizadosSoloIdentidad: filasActualizarSoloIdentidad.length,
            nuevos: filasNuevas.length,
        };
    }

    // Para el selector móvil "por toma / Consolidado": cuántos registros y
    // cuántos ya marcados `verificado_en_campo` hay por toma, más una
    // entrada sintética 'CONSOLIDADO' con la suma de todas — mismo sentinela
    // que ya usa el importador de tomas en escritorio
    // (Sistema_Riego_CUSSHMI_14.html, 'CONSOLIDADO' = todas las tomas).
    async function obtenerAvanceFormatoA2LevantamientoPorToma(comisionKey) {
        if (!comisionKey) return { ok: true, avance: {} };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, avance: {}, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const TAMANO_PAGINA = 1000;
        const filas = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('formato_a2_levantamiento')
                    .select('toma_nombre, verificado_en_campo')
                    .eq('comision_id', comisionId)
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'contar formato A-2 (levantamiento) por toma'
            );
            if (error || !data) return { ok: false, avance: {}, error: error ? error.mensaje : 'No se pudo calcular el avance.' };
            filas.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }

        const avance = {};
        const consolidado = { total: 0, verificados: 0 };
        filas.forEach((f) => {
            const toma = f.toma_nombre || 'SIN TOMA';
            if (!avance[toma]) avance[toma] = { total: 0, verificados: 0 };
            avance[toma].total++;
            if (f.verificado_en_campo) avance[toma].verificados++;
            consolidado.total++;
            if (f.verificado_en_campo) consolidado.verificados++;
        });
        avance.CONSOLIDADO = consolidado;
        return { ok: true, avance };
    }

    // Avance para el panel de escritorio "📊 Avance Levantamiento A-2" — a
    // diferencia de obtenerAvanceFormatoA2LevantamientoPorToma (que solo
    // cuenta verificado_en_campo, para el selector móvil), acá "completado"
    // = confirmado O verificado_en_campo (criterio confirmado con el
    // usuario) — no reemplaza a la otra función, conviven.
    async function obtenerAvanceFormatoA2LevantamientoDetallado(comisionKey) {
        if (!comisionKey) return { ok: true, avance: {} };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, avance: {}, error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const TAMANO_PAGINA = 1000;
        const filas = [];
        let desde = 0;
        while (true) {
            const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
                (client) => client.from('formato_a2_levantamiento')
                    .select('toma_nombre, confirmado, verificado_en_campo')
                    .eq('comision_id', comisionId)
                    .range(desde, desde + TAMANO_PAGINA - 1),
                'contar avance detallado de Formato A-2 (levantamiento) por toma'
            );
            if (error || !data) return { ok: false, avance: {}, error: error ? error.mensaje : 'No se pudo calcular el avance.' };
            filas.push(...data);
            if (data.length < TAMANO_PAGINA) break;
            desde += TAMANO_PAGINA;
        }

        const avance = {};
        const consolidado = { total: 0, completados: 0 };
        filas.forEach((f) => {
            const toma = f.toma_nombre || 'SIN TOMA';
            if (!avance[toma]) avance[toma] = { total: 0, completados: 0 };
            const completado = !!(f.confirmado || f.verificado_en_campo);
            avance[toma].total++;
            if (completado) avance[toma].completados++;
            consolidado.total++;
            if (completado) consolidado.completados++;
        });
        avance.CONSOLIDADO = consolidado;
        return { ok: true, avance };
    }

    // Lista de usuarios observados de una toma (o de todas, si tomaNombre es
    // null/'CONSOLIDADO') — Pantalla de lista del selector A-2.
    async function listarRegistrosFormatoA2Levantamiento(comisionKey, tomaNombre) {
        if (!comisionKey) return { ok: true, registros: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, registros: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const filtrarPorToma = tomaNombre && tomaNombre !== 'CONSOLIDADO';
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => {
                let q = client.from('formato_a2_levantamiento')
                    .select('id, toma_nombre, apellidos_nombres, unidad_catastral, estado_verificacion, verificado_en_campo, confirmado, vertices_utm')
                    .eq('comision_id', comisionId)
                    .order('apellidos_nombres', { ascending: true });
                if (filtrarPorToma) q = q.eq('toma_nombre', tomaNombre);
                return q;
            },
            'listar registros de Formato A-2 (levantamiento)'
        );
        if (error) return { ok: false, registros: [], error: error.mensaje || 'No se pudo listar los registros.' };
        return { ok: true, registros: data || [] };
    }

    // Un registro completo por id — para abrir la ficha de edición.
    async function cargarRegistroFormatoA2Levantamiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('formato_a2_levantamiento').select('*').eq('id', id).maybeSingle(),
            'cargar registro de Formato A-2 (levantamiento)'
        );
        if (error) return { ok: false, error: error.mensaje };
        if (!data) return { ok: false, error: 'Registro no encontrado.' };
        return { ok: true, registro: data };
    }

    // Guarda SOLO los campos editables (cols 18-47 del Excel) — nunca toca
    // los campos de "datos observados" (cols 1-17), que quedan de solo
    // lectura en el móvil por diseño.
    // `datos`: {id, este?, norte?, zona?, estado?, conductorActual?,
    //   conductorTipoDocumento?, conductorNumeroDocumento?,
    //   ultimaFechaRiego?, ucRef?, seUbicaBloque?, nombreBloqueRiego?,
    //   sector?, observaciones?, camposVerificacion?}.
    async function guardarRegistroFormatoA2Levantamiento(datos) {
        if (!datos || !datos.id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;

        const cambios = { actualizado_por: usuarioId, actualizado_en: new Date().toISOString() };
        const CAMPOS_EDITABLES = ['conductorActual', 'conductorTipoDocumento', 'conductorNumeroDocumento',
            'estado', 'ultimaFechaRiego', 'este', 'norte', 'zona', 'ucRef', 'seUbicaBloque',
            'nombreBloqueRiego', 'sector', 'observaciones', 'camposVerificacion', 'verticesUtm'];
        const MAPA_COLUMNA = {
            conductorActual: 'conductor_actual', conductorTipoDocumento: 'conductor_tipo_documento',
            conductorNumeroDocumento: 'conductor_numero_documento', estado: 'estado',
            ultimaFechaRiego: 'ultima_fecha_riego', este: 'este', norte: 'norte', zona: 'zona',
            ucRef: 'uc_ref', seUbicaBloque: 'se_ubica_bloque', nombreBloqueRiego: 'nombre_bloque_riego',
            sector: 'sector', observaciones: 'observaciones', camposVerificacion: 'campos_verificacion',
            verticesUtm: 'vertices_utm',
        };
        CAMPOS_EDITABLES.forEach((clave) => {
            if (Object.prototype.hasOwnProperty.call(datos, clave)) cambios[MAPA_COLUMNA[clave]] = datos[clave];
        });

        const { error } = await client.from('formato_a2_levantamiento').update(cambios).eq('id', datos.id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, id: datos.id };
    }

    let debounceTimerFormatoA2Lev = null;

    // Autoguardado de un campo editado en la ficha — mismo criterio de 1s de
    // espera que guardarRegistroIdentificacionDebounced.
    function guardarRegistroFormatoA2LevantamientoDebounced(datos, onEstado) {
        if (debounceTimerFormatoA2Lev) clearTimeout(debounceTimerFormatoA2Lev);
        if (onEstado) onEstado('escribiendo');
        debounceTimerFormatoA2Lev = setTimeout(async () => {
            if (onEstado) onEstado('guardando');
            const resultado = await guardarRegistroFormatoA2Levantamiento(datos);
            if (onEstado) onEstado(resultado.ok ? 'guardado' : 'error');
        }, 1000);
    }

    async function confirmarRegistroFormatoA2Levantamiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('formato_a2_levantamiento')
            .update({ confirmado: true, confirmado_en: new Date().toISOString() })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo confirmar: el registro no existe o ya no se puede editar.' };
        return { ok: true };
    }

    // Solo admin — mismo doble candado (RLS + gating de interfaz) que
    // desbloquearRegistroIdentificacion.
    async function desbloquearRegistroFormatoA2Levantamiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('formato_a2_levantamiento')
            .update({ confirmado: false, solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo desbloquear: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }

    async function solicitarEdicionFormatoA2Levantamiento(id, nombreSolicitante) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        const { error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.rpc('solicitar_edicion_formato_a2_levantamiento', { registro_id: id, nombre_solicitante: nombreSolicitante || null }),
            'solicitar edición de registro de Formato A-2 (levantamiento)'
        );
        if (error) return { ok: false, error: error.mensaje || 'No se pudo enviar la solicitud.' };
        return { ok: true };
    }

    async function listarSolicitudesEdicionFormatoA2Levantamiento(comisionKey) {
        if (!comisionKey) return { ok: true, solicitudes: [] };
        const comisionId = await resolverComisionId(comisionKey);
        if (!comisionId) return { ok: false, solicitudes: [], error: 'La comisión "' + comisionKey + '" no existe en Supabase.' };

        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client.from('formato_a2_levantamiento')
                .select('id, toma_nombre, apellidos_nombres, unidad_catastral, solicitud_edicion_por_nombre, solicitud_edicion_en')
                .eq('comision_id', comisionId)
                .eq('solicitud_edicion', true)
                .order('solicitud_edicion_en', { ascending: true }),
            'listar solicitudes de edición de Formato A-2 (levantamiento)'
        );
        if (error) return { ok: false, solicitudes: [], error: error.mensaje || 'No se pudo listar las solicitudes.' };
        return { ok: true, solicitudes: data || [] };
    }

    async function rechazarSolicitudEdicionFormatoA2Levantamiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data, error } = await client.from('formato_a2_levantamiento')
            .update({ solicitud_edicion: false, solicitud_edicion_por: null, solicitud_edicion_por_nombre: null, solicitud_edicion_en: null })
            .eq('id', id).select('id').maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) return { ok: false, error: 'No se pudo rechazar: revisa que tengas permiso de administrador.' };
        return { ok: true };
    }

    // Bandera manual separada del color importado (estado_verificacion) — el
    // sectorista confirma "ya lo revisé en campo" sin reinterpretar el color
    // de ANA/SIGA.
    async function marcarVerificadoEnCampoFormatoA2Levantamiento(id) {
        if (!id) return { ok: false, error: 'Falta el identificador del registro.' };
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, error: e.message };
        }
        const { data: sessionData } = await client.auth.getSession();
        const usuarioId = sessionData?.session?.user?.id || null;
        const { error } = await client.from('formato_a2_levantamiento')
            .update({ verificado_en_campo: true, verificado_en_campo_en: new Date().toISOString(), verificado_en_campo_por: usuarioId })
            .eq('id', id);
        if (error) return { ok: false, error: error.message };
        return { ok: true };
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
        cargarTodoPadronUsuariosParaCruce,
        suscribirseATomaEnVivo,
        cancelarSuscripcion,
        generarEnlaceConfirmacionG4,
        listarConfirmacionesG4,
        suscribirseAConfirmacionesG4Vivo,
        obtenerAvanceRegistroPorToma,
        listarRegistrosDeToma,
        cargarRegistroIdentificacion,
        guardarRegistroIdentificacion,
        guardarRegistroIdentificacionDebounced,
        confirmarRegistroIdentificacion,
        desbloquearRegistroIdentificacion,
        solicitarEdicionIdentificacion,
        listarSolicitudesEdicionIdentificacion,
        rechazarSolicitudEdicionIdentificacion,
        obtenerAvanceSiembraPorToma,
        listarRegistrosSiembraDeToma,
        cargarRegistroSiembra,
        guardarRegistroSiembra,
        guardarRegistroSiembraDebounced,
        confirmarRegistroSiembra,
        desbloquearRegistroSiembra,
        solicitarEdicionSiembra,
        listarSolicitudesEdicionSiembra,
        rechazarSolicitudEdicionSiembra,
        cargarRegistrosSiembraParaExportar,
        obtenerAvanceSinceramientoPorToma,
        listarRegistrosSinceramientoDeToma,
        listarRegistrosSinceramientoCompletosDeToma,
        cargarRegistroSinceramiento,
        guardarRegistroSinceramiento,
        guardarRegistroSinceramientoDebounced,
        confirmarRegistroSinceramiento,
        desbloquearRegistroSinceramiento,
        solicitarEdicionSinceramiento,
        listarSolicitudesEdicionSinceramiento,
        rechazarSolicitudEdicionSinceramiento,
        subirFotoSinceramiento,
        obtenerUrlFirmadaFotoSinceramiento,
        obtenerAvanceInventarioTomasPorToma,
        obtenerAvanceInventarioCompuertasPorToma,
        listarRegistrosInventarioTomasDeToma,
        listarRegistrosInventarioCompuertasDeToma,
        listarTodosRegistrosInventarioTomas,
        listarTodosRegistrosInventarioCompuertas,
        listarTodosRegistrosInventarioEstructuras,
        cargarRegistroInventarioToma,
        cargarRegistroInventarioCompuerta,
        guardarRegistroInventarioToma,
        guardarRegistroInventarioCompuerta,
        confirmarRegistroInventarioToma,
        confirmarRegistroInventarioCompuerta,
        desbloquearRegistroInventarioToma,
        desbloquearRegistroInventarioCompuerta,
        solicitarEdicionInventarioToma,
        solicitarEdicionInventarioCompuerta,
        listarSolicitudesEdicionInventarioToma,
        listarSolicitudesEdicionInventarioCompuerta,
        rechazarSolicitudEdicionInventarioToma,
        rechazarSolicitudEdicionInventarioCompuerta,
        sincronizarInventarioTomas,
        sincronizarInventarioCompuertas,
        obtenerAvanceInventarioEstructurasPorToma,
        listarRegistrosInventarioEstructurasDeToma,
        listarRegistrosInventarioEstructurasPorTipo,
        cargarRegistroInventarioEstructura,
        guardarRegistroInventarioEstructura,
        confirmarRegistroInventarioEstructura,
        desbloquearRegistroInventarioEstructura,
        solicitarEdicionInventarioEstructura,
        listarSolicitudesEdicionInventarioEstructura,
        rechazarSolicitudEdicionInventarioEstructura,
        sincronizarInventarioEstructuras,
        subirFotoInventario,
        listarFotosInventario,
        obtenerUrlFirmadaFotoInventario,
        cargarRegistrosIdentificacionParaExportar,
        guardarPadronOficialA1,
        cargarPadronOficialA1,
        cargarPadronOficialA1CompletoParaExportar,
        reasignarUsuarioCanal,
        incorporarUsuarioNuevoAPadronOficialA1,
        actualizarPadronOficialA1DesdeRegistro,
        guardarPoligonoPadronOficialA1,
        guardarFormatoA2LevantamientoRegistros,
        obtenerAvanceFormatoA2LevantamientoPorToma,
        obtenerAvanceFormatoA2LevantamientoDetallado,
        listarRegistrosFormatoA2Levantamiento,
        cargarRegistroFormatoA2Levantamiento,
        guardarRegistroFormatoA2Levantamiento,
        guardarRegistroFormatoA2LevantamientoDebounced,
        confirmarRegistroFormatoA2Levantamiento,
        desbloquearRegistroFormatoA2Levantamiento,
        solicitarEdicionFormatoA2Levantamiento,
        listarSolicitudesEdicionFormatoA2Levantamiento,
        rechazarSolicitudEdicionFormatoA2Levantamiento,
        marcarVerificadoEnCampoFormatoA2Levantamiento,
        subirPlantillaFormatoA2Levantamiento,
        obtenerPlantillaFormatoA2Levantamiento,
        cargarFormatoA2LevantamientoParaExportar,
    };
})();
