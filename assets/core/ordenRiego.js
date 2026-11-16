// ══ Núcleo compartido — módulo "Orden de Riego" (móvil y escritorio) ══
// Cruza los usuarios ya programados (usuarios_g3_seleccionados, vía
// CusshmiDatos.cargarUsuariosG3Seleccionados) con sus confirmaciones de
// recepción del Anexo G-4 (g4_confirmaciones, vía
// CusshmiDatos.listarConfirmacionesG4) — funciones puras, sin DOM ni
// Supabase, para que la pantalla móvil y el panel de escritorio no
// dupliquen esta lógica.

// Empareja por unidad catastral primero (más confiable) y por nombre si no
// hay unidad catastral — mismo criterio que ya usa
// _obtenerCultivosAreasUsuarioParaG4 en el escritorio.
function _buscarConfirmacionG4(confirmaciones, cultivo, nombre, unidadCatastral) {
    const uc = (unidadCatastral || '').toString().trim();
    const nom = (nombre || '').toString().trim().toUpperCase();
    return (confirmaciones || []).find((c) => {
        if ((c.cultivo || '') !== cultivo) return false;
        const cUc = (c.unidad_catastral || '').toString().trim();
        if (uc && cUc) return cUc === uc;
        return (c.usuario_nombre || '').toString().trim().toUpperCase() === nom;
    }) || null;
}

// usuariosPorCultivo: [{ cultivo, usuarios: [...] }] — cada `usuarios[]` es
// lo que ya devuelve cargarUsuariosG3Seleccionados (nombre, unidadCatastral,
// area, caudalLs, tiempoHoras, volumenM3, inicioTexto, terminoTexto,
// esNoApto). confirmaciones: lo que devuelve listarConfirmacionesG4.
// Devuelve un arreglo plano, uno por usuario, con el estado de
// confirmación ya cruzado — sin fila de confirmación (enlace nunca
// generado) cuenta como "pendiente", igual que si no hubiera confirmado.
function cruzarConfirmacionesG4(usuariosPorCultivo, confirmaciones) {
    const filas = [];
    (usuariosPorCultivo || []).forEach((grupo) => {
        (grupo.usuarios || []).forEach((u) => {
            const confirmacion = _buscarConfirmacionG4(confirmaciones, grupo.cultivo, u.nombre, u.unidadCatastral);
            filas.push({
                cultivo: grupo.cultivo,
                nombre: u.nombre || '-',
                unidadCatastral: u.unidadCatastral || '',
                area: parseFloat(u.area) || 0,
                caudalLs: parseFloat(u.caudalLs) || 0,
                horasTotal: parseFloat(u.tiempoHoras) || 0,
                volumenM3: parseFloat(u.volumenM3) || 0,
                inicioTexto: u.inicioTexto || '',
                terminoTexto: u.terminoTexto || '',
                esNoApto: !!u.esNoApto,
                estadoConfirmacion: confirmacion && confirmacion.estado === 'confirmado' ? 'confirmado' : 'pendiente',
                confirmadoEn: confirmacion ? confirmacion.confirmado_en : null,
                dispositivo: confirmacion ? confirmacion.dispositivo : null,
            });
        });
    });
    return filas;
}

// { total, confirmados, pendientes, porcentaje } — porcentaje 0-100,
// redondeado a un decimal, 0 si no hay usuarios (evita división por cero).
function calcularIndicadoresOrdenRiego(filas) {
    const total = (filas || []).length;
    const confirmados = (filas || []).filter((f) => f.estadoConfirmacion === 'confirmado').length;
    const pendientes = total - confirmados;
    const porcentaje = total > 0 ? Math.round((confirmados / total) * 1000) / 10 : 0;
    return { total, confirmados, pendientes, porcentaje };
}

// filtros: { cultivo: ''|nombre, estado: ''|'confirmado'|'pendiente', texto: '' }
function aplicarFiltrosOrdenRiego(filas, filtros) {
    const f = filtros || {};
    const texto = (f.texto || '').trim().toLowerCase();
    return (filas || []).filter((fila) => {
        if (f.cultivo && fila.cultivo !== f.cultivo) return false;
        if (f.estado && fila.estadoConfirmacion !== f.estado) return false;
        if (texto && fila.nombre.toLowerCase().indexOf(texto) === -1) return false;
        return true;
    });
}

// true si la fila sigue pendiente y falta menos de `horasAlerta` para su
// hora de inicio (o esa hora ya pasó) — no cambia la programación, es solo
// una marca visual para que el administrador la revise primero. `ahora` se
// recibe como parámetro (no se usa new Date() adentro) para que la función
// sea reproducible en pruebas.
function estaPorVencerConfirmacionG4(fila, horasAlerta, ahora) {
    if (!fila || fila.estadoConfirmacion !== 'pendiente' || !fila.inicioTexto) return false;
    const msRestantes = parsearFechaHoraTexto(fila.inicioTexto).getTime() - ahora.getTime();
    return msRestantes <= horasAlerta * 3600000;
}
