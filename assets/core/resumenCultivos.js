// ══ Núcleo compartido — Resumen de hectáreas/usuarios por cultivo ══
// Funciones puras sobre `tomasData` (el padrón COMPLETO cargado desde el
// Excel TOMAS.xlsx) — el "ámbito de la comisión" tal cual está en el
// padrón, sin depender de qué semana esté activa en "Programar PDA".
// Reutiliza obtenerParesCultivoAreaUsuario (assets/core/clasificacion.js,
// debe cargarse antes) — la misma lógica de pares cultivo/área ya usada
// en el resto del sistema (Avance de Siembra, Anexo G-3, etc.), así que
// un predio cuenta como "sin cultivo" con el MISMO criterio que ya usa
// esUsuarioApto/debeExcluirse, no uno inventado aparte.

const ETIQUETA_SIN_CULTIVO_RESUMEN = 'SIN CULTIVO';

// Suma el área declarada en cualquier ranura cultivoN/areaN de un
// usuario que NO tiene ningún cultivo válido en ninguna ranura — un
// predio puede tener un área registrada (area1=2.5) sin que se haya
// llenado el cultivo correspondiente (cultivo1 vacío); esa área cuenta
// como "sin cultivo declarado", no se pierde en silencio. Solo se llama
// para usuarios donde obtenerParesCultivoAreaUsuario ya devolvió []
// (ningún par válido) — nunca resta ni duplica área ya contada en un
// cultivo real.
function _areaDeclaradaSinCultivoResumen(usuario) {
    let total = 0;
    for (let i = 1; i <= 10; i++) {
        const c = (usuario[`cultivo${i}`] ?? '').toString().trim();
        const a = parseFloat(usuario[`area${i}`]) || 0;
        if (!c && a > 0) total += a;
    }
    return total;
}

// Resumen por cultivo del padrón — de TODA la comisión (tomaFiltro
// omitido/null) o de una sola toma (tomaFiltro = nombre exacto, tal
// cual la clave de `tomasData`). Devuelve:
//   cultivos: [{ cultivo, areaTotal, usuarios: [{nombre,unidadCatastral,toma,area}] }, ...]
//             ordenados por área descendente.
//   sinCultivo: { areaTotal, usuarios: [...] } — predios sin ningún
//             cultivo válido (ver _areaDeclaradaSinCultivoResumen).
//   areaTotalGeneral / usuariosTotalGeneral: sumas de todo lo de arriba
//             (un predio con 2 cultivos cuenta 2 veces en usuariosTotalGeneral
//             — una por cada cultivo/parcela, mismo criterio ya usado en
//             el resto del sistema para "usuarios por cultivo").
//   totalPrediosPadron: N° de filas del padrón (predios), sin duplicar
//             por cultivo — para diferenciar "cuántos predios" de
//             "cuántas parcela-cultivo".
function calcularResumenCultivosComision(tomasData, tomaFiltro) {
    const porCultivo = {}; // clave normalizada -> { cultivo, areaTotal, usuarios: [] }
    const sinCultivo = { areaTotal: 0, usuarios: [] };
    let totalPrediosPadron = 0;

    const nombresToma = tomaFiltro ? [tomaFiltro] : Object.keys(tomasData || {});
    nombresToma.forEach((toma) => {
        const usuarios = (tomasData || {})[toma] || [];
        usuarios.forEach((u) => {
            totalPrediosPadron++;
            const pares = (typeof obtenerParesCultivoAreaUsuario === 'function')
                ? obtenerParesCultivoAreaUsuario(u)
                : [];
            if (pares.length === 0) {
                const areaSinCultivo = _areaDeclaradaSinCultivoResumen(u);
                sinCultivo.areaTotal += areaSinCultivo;
                sinCultivo.usuarios.push({
                    nombre: (u.nombre || '-').toString(),
                    unidadCatastral: (u.unidadCatastral || '-').toString(),
                    toma,
                    area: areaSinCultivo,
                });
                return;
            }
            pares.forEach((p) => {
                const clave = p.cultivo.toUpperCase();
                if (!porCultivo[clave]) porCultivo[clave] = { cultivo: clave, areaTotal: 0, usuarios: [] };
                porCultivo[clave].areaTotal += p.area;
                porCultivo[clave].usuarios.push({
                    nombre: (u.nombre || '-').toString(),
                    unidadCatastral: (u.unidadCatastral || '-').toString(),
                    toma,
                    area: p.area,
                });
            });
        });
    });

    const cultivos = Object.values(porCultivo).sort((a, b) => b.areaTotal - a.areaTotal);
    const areaTotalGeneral = cultivos.reduce((s, c) => s + c.areaTotal, 0) + sinCultivo.areaTotal;
    const usuariosTotalGeneral = cultivos.reduce((s, c) => s + c.usuarios.length, 0) + sinCultivo.usuarios.length;

    return {
        cultivos,
        sinCultivo,
        areaTotalGeneral,
        usuariosTotalGeneral,
        totalPrediosPadron,
        tomaFiltro: tomaFiltro || null,
    };
}

// Aplana el resumen (cultivos + sinCultivo) a una sola lista de filas
// usuario-cultivo, para exportar/mostrar el "detalle por usuario" — cada
// fila trae también el nombre del cultivo (ETIQUETA_SIN_CULTIVO_RESUMEN
// para las de sinCultivo), ordenada por toma y luego por nombre.
function aplanarDetalleUsuariosResumenCultivos(resumen, filtroCultivo) {
    const filas = [];
    (resumen.cultivos || []).forEach((c) => {
        if (filtroCultivo && c.cultivo !== filtroCultivo) return;
        c.usuarios.forEach((u) => filas.push({ ...u, cultivo: c.cultivo }));
    });
    if (!filtroCultivo || filtroCultivo === ETIQUETA_SIN_CULTIVO_RESUMEN) {
        (resumen.sinCultivo?.usuarios || []).forEach((u) => filas.push({ ...u, cultivo: ETIQUETA_SIN_CULTIVO_RESUMEN }));
    }
    filas.sort((a, b) => {
        const t = (a.toma || '').localeCompare(b.toma || '', 'es', { sensitivity: 'base' });
        if (t !== 0) return t;
        return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
    });
    return filas;
}
