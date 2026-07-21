// ══ Núcleo compartido — utilidades (cultivos, fechas, números, texto) ══
// Extraído sin cambios de Sistema_Riego_CUSSHMI_14.html (Fase 0 de la PWA).
// Cargado tanto por el escritorio como por la futura versión móvil.

function normalizarCultivoNombre(cultivo) {
    return (cultivo || '')
        .toString()
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

function claveUsuariosG3(toma, cultivo) {
    return (toma || '').toString().trim() + '|' + normalizarCultivoNombre(cultivo);
}

function obtenerUsuariosG3Seleccionados(toma, cultivo) {
    if (!toma || !cultivo) return [];
    const exact = (toma || '').toString().trim() + '|' + (cultivo || '').toString().trim();
    const norm = claveUsuariosG3(toma, cultivo);
    const v1 = window.usuariosG3?.[exact];
    if (Array.isArray(v1) && v1.length > 0) return v1;
    const v2 = window.usuariosG3?.[norm];
    if (Array.isArray(v2) && v2.length > 0) return v2;

    // Búsqueda defensiva: comparar por clave normalizada
    try {
        const target = norm;
        const keys = Object.keys(window.usuariosG3 || {});
        for (const k of keys) {
            if (claveUsuariosG3(k.split('|')[0], k.split('|').slice(1).join('|')) === target) {
                const v = window.usuariosG3[k];
                if (Array.isArray(v) && v.length > 0) return v;
            }
        }
    } catch {}

    return Array.isArray(v2) ? v2 : (Array.isArray(v1) ? v1 : []);
}

// Normaliza nombres de cultivo para comparación (mayúsculas, sin espacios extra),
// así "Arroz", " ARROZ ", "arroz" se reconocen como el mismo cultivo entre pantallas.
function _normCultivo(valor) {
    return (valor || '').toString().trim().toUpperCase();
}

function parseNumeroSeguro(valor) {
    if (valor === null || valor === undefined) return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    const texto = String(valor)
        .replace(/\s/g, '')
        .replace(/,/g, '')
        .replace(/[^\d.\-]/g, '');
    const num = parseFloat(texto);
    return Number.isFinite(num) ? num : 0;
}

// Procesar datos de una toma específica
function escapeHtml(value) {
    return (value ?? '').toString().replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch] || ch));
}

function obtenerNombreMes(fechaISO) {
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
                   'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const fecha = new Date(fechaISO + 'T00:00:00');
    return meses[fecha.getMonth()];
}

function obtenerTextoMesSemana(fechaInicioISO, fechaFinISO) {
    if (!fechaInicioISO) return 'NO ESPECIFICADO';
    const fechaInicio = new Date(fechaInicioISO + 'T00:00:00');
    const fechaFin = fechaFinISO ? new Date(fechaFinISO + 'T00:00:00') : fechaInicio;

    const nombreMesInicio = obtenerNombreMes(fechaInicioISO);
    const nombreMesFin = obtenerNombreMes(fechaFinISO || fechaInicioISO);
    const anioInicio = fechaInicio.getFullYear();
    const anioFin = fechaFin.getFullYear();

    if (fechaInicio.getMonth() === fechaFin.getMonth() && anioInicio === anioFin) {
        return `${nombreMesInicio} ${anioInicio}`;
    }

    if (anioInicio === anioFin) {
        return `${nombreMesInicio} / ${nombreMesFin} ${anioInicio}`;
    }

    return `${nombreMesInicio} ${anioInicio} / ${nombreMesFin} ${anioFin}`;
}

// Función formatearFecha existente
function formatearFecha(fechaStr) {
    if (!fechaStr) return '-';
    const partes = fechaStr.split('-');
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// Devuelve "LUNES 06/07/2026" (día de la semana + fecha completa)
function formatearFechaConDia(fechaStr) {
    if (!fechaStr) return '-';
    const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
    const fecha = new Date(fechaStr + 'T00:00:00');
    const nombreDia = dias[fecha.getDay()];
    return `${nombreDia} ${formatearFecha(fechaStr)}`;
}

// "21 de julio del 2026" — fecha larga en español, para pies de página de
// reportes imprimibles. Compartida entre movil/assets/core/anexoG4.js
// (visor G-4) y movil/assets/core/reporteCondicion.js (Condición del
// Usuario) — antes vivía duplicada solo en la primera, se movió aquí al
// aparecer un segundo consumidor real.
function _formatearFechaLargaEs(fecha) {
    const f = (fecha instanceof Date) ? fecha : new Date(fecha);
    if (!(f instanceof Date) || isNaN(f.getTime())) return '';
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const d = f.getDate();
    const m = meses[f.getMonth()] || '';
    const y = f.getFullYear();
    return `${d} de ${m} del ${y}`;
}

// "DD/MM/YYYY HH:MM" (formato guardado por guardarHorarioG3EnSupabase,
// Fase 3, ej. en usuarios_g3_seleccionados.usuarios[].inicioTexto) -> Date.
// Compartida entre movil/pda-programado.html (visor G-4) y
// movil/seguimiento.html (Fase 5) — antes vivía duplicada solo en la
// primera, se movió aquí al aparecer un segundo consumidor real.
function parsearFechaHoraTexto(texto) {
    if (!texto) return new Date();
    const partes = texto.trim().split(' ');
    const dmy = (partes[0] || '').split('/');
    const hm = (partes[1] || '00:00').split(':');
    if (dmy.length < 3) return new Date();
    return new Date(
        parseInt(dmy[2], 10), parseInt(dmy[1], 10) - 1, parseInt(dmy[0], 10),
        parseInt(hm[0], 10) || 0, parseInt(hm[1], 10) || 0
    );
}
