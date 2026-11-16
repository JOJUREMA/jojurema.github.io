/**
 * Autenticación de CUSSHMI — Fase 2.
 *
 * Login por "usuario" (primer nombre + primer apellido), no por correo.
 * Supabase Auth exige un email único por debajo, así que se genera uno
 * sintético a partir del usuario (nunca se envía correo real ahí).
 *
 * No modifica ninguna variable global del sistema existente. Expone
 * únicamente window.CusshmiAuth, para que el HTML decida qué hacer con
 * cada resultado (eso se conecta en un paso aparte).
 */
(function () {
    'use strict';

    const DOMINIO_SINTETICO = 'cusshmi.local';

    /**
     * "Juan Pérez" → "juan.perez". Minúsculas, sin tildes/ñ especiales,
     * sin espacios ni símbolos. Debe dar el MISMO resultado que se usó
     * al crear la cuenta en Supabase (ver plantilla en 001_auth_roles.sql).
     */
    function normalizarUsuario(nombre, apellido) {
        const limpiar = (s) => (s || '')
            .toString()
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '') // quita tildes
            .replace(/[^a-z0-9]/g, '');       // quita espacios/símbolos
        return limpiar(nombre) + '.' + limpiar(apellido);
    }

    function emailSintetico(nombreUsuario) {
        return nombreUsuario.trim().toLowerCase() + '@' + DOMINIO_SINTETICO;
    }

    /**
     * Trae el perfil (rol, comisión, nombre) del usuario ya autenticado.
     * Un usuario puede existir en auth.users sin fila en `profiles` si
     * alguien olvidó el paso 2 de la plantilla de alta — se distingue
     * ese caso con un mensaje específico, no un error genérico.
     */
    async function cargarPerfil(userId) {
        const { data, error } = await window.CusshmiSupabase.ejecutarConsulta(
            (client) => client
                .from('profiles')
                .select('id, primer_nombre, primer_apellido, nombre_usuario, rol, activo, comision_id, comisiones(clave, nombre)')
                .eq('id', userId)
                .single(),
            'cargar perfil de usuario'
        );

        if (error) {
            return { ok: false, mensaje: 'No se encontró un perfil para este usuario. Falta el INSERT en la tabla profiles (ver 001_auth_roles.sql).' };
        }
        if (!data.activo) {
            return { ok: false, mensaje: 'Esta cuenta está desactivada. Contacta al administrador.' };
        }
        return {
            ok: true,
            perfil: {
                id: data.id,
                nombre: data.primer_nombre + ' ' + data.primer_apellido,
                nombreUsuario: data.nombre_usuario,
                rol: data.rol,
                comisionId: data.comision_id,
                comisionClave: data.comisiones ? data.comisiones.clave : null,
                comisionNombre: data.comisiones ? data.comisiones.nombre : null,
            },
        };
    }

    /**
     * Login. Devuelve { ok, perfil } o { ok:false, mensaje }.
     * Nunca deja una sesión de Auth "a medias": si el login de Auth
     * funciona pero el perfil falla o está inactivo, cierra la sesión
     * antes de devolver el error.
     */
    async function iniciarSesion(nombreUsuario, password) {
        if (!nombreUsuario || !password) {
            return { ok: false, mensaje: 'Ingresa usuario y contraseña.' };
        }

        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false, mensaje: 'No hay conexión con el servidor. Intenta de nuevo en un momento.' };
        }

        const email = emailSintetico(nombreUsuario);
        const { data, error } = await client.auth.signInWithPassword({ email, password });

        if (error) {
            // Supabase no distingue "usuario no existe" de "contraseña incorrecta"
            // (por seguridad, evita que se pueda enumerar usuarios válidos).
            return { ok: false, mensaje: 'Usuario o contraseña incorrectos.' };
        }

        const resultadoPerfil = await cargarPerfil(data.user.id);
        if (!resultadoPerfil.ok) {
            await client.auth.signOut();
            return resultadoPerfil;
        }

        return resultadoPerfil;
    }

    async function cerrarSesion() {
        const client = window.CusshmiSupabase.getClient();
        await client.auth.signOut();
    }

    /**
     * Se llama al cargar la página. Si hay una sesión válida guardada
     * (persistida por el SDK), recupera el perfil sin pedir contraseña
     * de nuevo. Si no hay sesión o el token ya no es válido, devuelve
     * ok:false para que el llamador muestre el modal de login normal.
     */
    async function recuperarSesion() {
        let client;
        try {
            client = window.CusshmiSupabase.getClient();
        } catch (e) {
            return { ok: false };
        }

        const { data, error } = await client.auth.getSession();
        if (error || !data.session) {
            return { ok: false };
        }

        const resultadoPerfil = await cargarPerfil(data.session.user.id);
        if (!resultadoPerfil.ok) {
            await client.auth.signOut();
            return { ok: false, mensaje: resultadoPerfil.mensaje };
        }
        return resultadoPerfil;
    }

    /**
     * Notifica cuando la sesión cambia por causas externas (token
     * revocado, expirado sin poder refrescarse, logout desde otra
     * pestaña). El callback recibe 'SIGNED_OUT' | 'SIGNED_IN' | etc.
     */
    function alCambiarSesion(callback) {
        const client = window.CusshmiSupabase.getClient();
        client.auth.onAuthStateChange((evento, session) => callback(evento, session));
    }

    window.CusshmiAuth = {
        normalizarUsuario,
        iniciarSesion,
        cerrarSesion,
        recuperarSesion,
        alCambiarSesion,
    };
})();
