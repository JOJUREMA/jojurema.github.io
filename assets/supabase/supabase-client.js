/**
 * Cliente Supabase reutilizable para CUSSHMI — Fase 1 (Conexión).
 *
 * Responsabilidad única de este archivo: crear y exponer un cliente
 * Supabase, con manejo de errores consistente, para que las fases
 * siguientes lo consuman sin tener que repetir esta lógica.
 *
 * Este archivo NO lee ni escribe ninguna tabla todavía (eso empieza en
 * fases posteriores, una vez creado el modelo de datos en la Fase 3).
 * No modifica ninguna variable global del sistema existente
 * (tomasData, consolidadoDemandas, window.turnosDeRiego, etc.).
 *
 * Expone un único objeto global: window.CusshmiSupabase
 */
(function () {
    'use strict';

    const NOMBRE_SDK_GLOBAL = 'supabase'; // window.supabase, provisto por el <script> del CDN

    let clienteSingleton = null;
    let errorInicializacion = null;

    /**
     * Valida que la configuración (supabase-config.js) y el SDK
     * (CDN) estén disponibles antes de intentar crear el cliente.
     * Devuelve un mensaje de error específico para cada causa posible,
     * en vez de un error genérico difícil de diagnosticar.
     */
    function validarPrerrequisitos() {
        const config = window.CUSSHMI_SUPABASE_CONFIG;

        if (!config) {
            return 'No se encontró window.CUSSHMI_SUPABASE_CONFIG. ' +
                'Verifica que supabase-config.js se cargue ANTES que supabase-client.js.';
        }
        if (!config.url || config.url === 'REEMPLAZAR_CON_SUPABASE_URL') {
            return 'Falta configurar SUPABASE_URL en assets/supabase/supabase-config.js.';
        }
        if (!config.anonKey || config.anonKey === 'REEMPLAZAR_CON_SUPABASE_ANON_KEY') {
            return 'Falta configurar SUPABASE_ANON_KEY en assets/supabase/supabase-config.js.';
        }
        if (typeof window[NOMBRE_SDK_GLOBAL] === 'undefined' ||
            typeof window[NOMBRE_SDK_GLOBAL].createClient !== 'function') {
            return 'El SDK de Supabase (@supabase/supabase-js) no está disponible. ' +
                'Verifica que el <script> del CDN se haya cargado correctamente ' +
                '(revisa la pestaña Network si estás sin conexión a internet).';
        }
        return null; // sin errores
    }

    /**
     * Crea (una sola vez) y devuelve el cliente Supabase.
     * Lanza un error descriptivo si algo falta, en vez de devolver
     * silenciosamente `null` y provocar errores confusos más adelante.
     */
    function getClient() {
        if (clienteSingleton) return clienteSingleton;

        const problema = validarPrerrequisitos();
        if (problema) {
            errorInicializacion = problema;
            console.error('[CusshmiSupabase] ' + problema);
            throw new Error('[CusshmiSupabase] ' + problema);
        }

        const config = window.CUSSHMI_SUPABASE_CONFIG;
        try {
            clienteSingleton = window[NOMBRE_SDK_GLOBAL].createClient(config.url, config.anonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                },
            });
            errorInicializacion = null;
            return clienteSingleton;
        } catch (e) {
            errorInicializacion = 'No se pudo crear el cliente Supabase: ' + e.message;
            console.error('[CusshmiSupabase] ' + errorInicializacion, e);
            throw e;
        }
    }

    /**
     * Wrapper genérico y reutilizable para futuras consultas.
     * Uso previsto en fases siguientes:
     *
     *   const { data, error } = await CusshmiSupabase.ejecutarConsulta(
     *       (client) => client.from('tomas').select('*'),
     *       'cargar catálogo de tomas'
     *   );
     *
     * Centraliza el try/catch y el formato de log de errores para que
     * cada módulo nuevo no tenga que reimplementarlo.
     */
    async function ejecutarConsulta(fnConsulta, descripcion) {
        let client;
        try {
            client = getClient();
        } catch (e) {
            return { data: null, error: { mensaje: e.message, tipo: 'configuracion' } };
        }

        try {
            const resultado = await fnConsulta(client);
            if (resultado && resultado.error) {
                console.error(
                    '[CusshmiSupabase] Error en consulta "' + (descripcion || 'sin descripción') + '":',
                    resultado.error
                );
                return {
                    data: null,
                    error: { mensaje: resultado.error.message || 'Error desconocido de Supabase', tipo: 'consulta', original: resultado.error },
                };
            }
            return { data: resultado ? resultado.data : null, error: null };
        } catch (e) {
            console.error(
                '[CusshmiSupabase] Excepción de red/ejecución en "' + (descripcion || 'sin descripción') + '":',
                e
            );
            return { data: null, error: { mensaje: e.message || 'Error de red desconocido', tipo: 'red' } };
        }
    }

    /**
     * Diagnóstico de conexión para la Fase 1. No depende de ninguna
     * tabla (que todavía no existen) — usa auth.getSession(), que
     * siempre responde si la URL/clave son válidas y hay red.
     *
     * Uso manual desde la consola del navegador:
     *   await CusshmiSupabase.probarConexion()
     */
    async function probarConexion() {
        const inicio = performance.now();
        let client;
        try {
            client = getClient();
        } catch (e) {
            return { ok: false, mensaje: e.message, tipo: 'configuracion', tiempoMs: 0 };
        }

        try {
            const { error } = await client.auth.getSession();
            const tiempoMs = Math.round(performance.now() - inicio);
            if (error) {
                return { ok: false, mensaje: error.message, tipo: 'consulta', tiempoMs };
            }
            return {
                ok: true,
                mensaje: 'Conexión con Supabase establecida correctamente.',
                url: window.CUSSHMI_SUPABASE_CONFIG.url,
                tiempoMs,
            };
        } catch (e) {
            const tiempoMs = Math.round(performance.now() - inicio);
            return {
                ok: false,
                mensaje: 'No se pudo contactar a Supabase: ' + (e.message || e),
                tipo: 'red',
                tiempoMs,
            };
        }
    }

    function estado() {
        return {
            clienteCreado: !!clienteSingleton,
            error: errorInicializacion,
            urlConfigurada: !!(window.CUSSHMI_SUPABASE_CONFIG &&
                window.CUSSHMI_SUPABASE_CONFIG.url &&
                window.CUSSHMI_SUPABASE_CONFIG.url !== 'REEMPLAZAR_CON_SUPABASE_URL'),
        };
    }

    window.CusshmiSupabase = {
        getClient,
        ejecutarConsulta,
        probarConexion,
        estado,
    };
})();
