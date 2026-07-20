// ══ Núcleo compartido — Mapa satelital de predios (Fase 4 PWA) ══
// Parser KML → predios planos, cruce con el padrón vivo (Fase 2) y color
// por cultivo. El KML (carpeta mapas/, ya en el repositorio) es una foto
// fija de cuando se exportó el GIS — solo aporta geometría y las claves de
// cruce (unidad catastral, nombre). Los datos que cambian (cultivo
// vigente, deuda) siempre se leen en vivo de padron_usuarios, nunca del
// KML — misma idea de "una sola fuente de información" del resto de la
// PWA. Nada de esto lo usa el escritorio; es código nuevo solo para el
// visor móvil.

// Qué archivo(s) KML contienen los predios de cada toma — confirmado
// escaneando los ~2,245 predios reales de los 3 archivos (no supuesto).
// SD10 aparece en dos bloques (la mayoría en VIVIATE, un puñado en
// PUCUSULA en el límite entre bloques), así que carga ambos.
const KML_POR_TOMA = {
    SI3: ['BLOQUE_MIRAFLORES.kml'],
    SD3: ['BLOQUE_MIRAFLORES.kml'],
    SD5: ['BLOQUE_MIRAFLORES.kml'],
    SI5: ['BLOQUE_MIRAFLORES.kml'],
    SD6: ['BLOQUE_MIRAFLORES.kml'],
    SD4: ['BLOQUE_MIRAFLORES.kml'],
    SI4: ['BLOQUE_MIRAFLORES.kml'],
    SD7: ['BLOQUE_MIRAFLORES.kml'],
    SD8: ['BLOQUE_DE_RIEGO_VIVIATE.kml'],
    'SD8.1': ['BLOQUE_DE_RIEGO_VIVIATE.kml'],
    SD9: ['BLOQUE_DE_RIEGO_VIVIATE.kml'],
    SD10: ['BLOQUE_DE_RIEGO_VIVIATE.kml', 'BLOQUE_DE_RIEGO_PUCUSULA.kml'],
    SD11: ['BLOQUE_DE_RIEGO_PUCUSULA.kml'],
    SD12: ['BLOQUE_DE_RIEGO_PUCUSULA.kml'],
    SI7: ['BLOQUE_DE_RIEGO_PUCUSULA.kml'],
    SD14: ['BLOQUE_DE_RIEGO_PUCUSULA.kml'],
    'SD14.1': ['BLOQUE_DE_RIEGO_PUCUSULA.kml'],
    SD13: ['BLOQUE_DE_RIEGO_PUCUSULA.kml'],
    'SD12.1': ['BLOQUE_DE_RIEGO_PUCUSULA.kml'],
};

// "SD 8.1" / "sd8.1" / " SD6 " -> "SD8.1" / "SD6" — para que el nombre de
// toma del KML (con inconsistencias de espacio en el texto de origen)
// coincida con la nomenclatura del sistema.
function normalizarNombreToma(valor) {
    return (valor || '').toString().trim().toUpperCase().replace(/\s+/g, '');
}

// Lee un KML y devuelve un predio plano por cada <Placemark> con polígono.
// No asume un esquema de campos fijo (difiere entre los 3 archivos reales:
// MIRAFLORES y PUCUSULA usan el campo TOMA directo; VIVIATE casi siempre
// trae el nombre del LATERAL en TOMA y el código real en TOMA_1) — por eso
// lee todos los <SimpleData> genéricamente y decide con esa prioridad:
// TOMA_1 (código confiable) si existe, si no TOMA.
function parsearKmlATomas(xmlTexto) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlTexto, 'text/xml');
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) return [];

    const placemarks = Array.from(xmlDoc.getElementsByTagName('Placemark'));
    const predios = [];

    placemarks.forEach((pm) => {
        const campos = {};
        const simpleDataEls = pm.getElementsByTagName('SimpleData');
        for (let i = 0; i < simpleDataEls.length; i++) {
            const nombreCampo = simpleDataEls[i].getAttribute('name');
            if (nombreCampo) campos[nombreCampo] = (simpleDataEls[i].textContent || '').trim();
        }

        const coordsEl = pm.getElementsByTagName('coordinates')[0];
        if (!coordsEl || !coordsEl.textContent) return;
        const coordenadas = coordsEl.textContent.trim().split(/\s+/).map((par) => {
            const partes = par.split(',');
            return [parseFloat(partes[0]), parseFloat(partes[1])]; // [lon, lat]
        }).filter((par) => Number.isFinite(par[0]) && Number.isFinite(par[1]));
        if (coordenadas.length < 3) return;

        const tieneToma1 = !!(campos.TOMA_1 && campos.TOMA_1.trim());
        const toma = normalizarNombreToma(tieneToma1 ? campos.TOMA_1 : campos.TOMA);
        const lateral = (tieneToma1 ? campos.TOMA : campos.LATERAL) || '';

        predios.push({
            toma: toma,
            lateral: lateral.toString().trim(),
            catastralKey: (campos.CODCAT || campos.CLAVECAT || '').toString().trim(),
            usuario: (campos.USUARIO || '').toString().trim(),
            areaHa: parseFloat(campos.AREA_HA) || 0,
            coordenadas: coordenadas, // [[lon,lat], ...]
        });
    });

    return predios;
}

function filtrarPorToma(predios, tomaNombre) {
    const clave = normalizarNombreToma(tomaNombre);
    return (predios || []).filter((p) => p.toma === clave);
}

// Enriquece un predio del KML con datos vigentes de padron_usuarios (Fase
// 2) cuando hay coincidencia — primero por unidad catastral (clave más
// confiable), si no por nombre normalizado. Nunca oculta el predio si no
// hay coincidencia: solo devuelve los datos crudos del KML en ese caso.
function cruzarPredioConPadron(predio, filasPadron) {
    if (!Array.isArray(filasPadron) || filasPadron.length === 0) return predio;

    let fila = null;
    if (predio.catastralKey) {
        fila = filasPadron.find((f) => (f.unidad_catastral || '').toString().trim() === predio.catastralKey) || null;
    }
    if (!fila && predio.usuario) {
        const nombreNorm = predio.usuario.toString().trim().toUpperCase();
        fila = filasPadron.find((f) => (f.nombre || '').toString().trim().toUpperCase() === nombreNorm) || null;
    }
    if (!fila) return predio;

    return Object.assign({}, predio, {
        cultivos: fila.cultivos || [],
        deudaTotal: parseFloat(fila.deuda_total) || 0,
        alDia: fila.al_dia,
        cruzado: true,
    });
}

// Copiada tal cual de _colorPorCultivo() en Sistema_Riego_CUSSHMI_14.html
// (línea ~12588) — función pura, sin cambios, para que el mapa use la
// misma asignación de color por cultivo que ya conoce el escritorio.
function _colorPorCultivo(cultivo) {
    const c = (cultivo || '').toString().trim().toUpperCase();
    const base = [
        { bg: 'rgba(37, 99, 235, 0.22)',  border: '#2563eb' },
        { bg: 'rgba(220, 38, 38, 0.22)',  border: '#dc2626' },
        { bg: 'rgba(22, 163, 74, 0.22)',  border: '#16a34a' },
        { bg: 'rgba(234, 88, 12, 0.22)',  border: '#ea580c' },
        { bg: 'rgba(124, 58, 237, 0.22)', border: '#7c3aed' },
        { bg: 'rgba(14, 116, 144, 0.22)', border: '#0e7490' },
        { bg: 'rgba(190, 24, 93, 0.22)',  border: '#be185d' },
        { bg: 'rgba(133, 77, 14, 0.22)',  border: '#854d0e' },
        { bg: 'rgba(15, 118, 110, 0.22)', border: '#0f766e' },
        { bg: 'rgba(51, 65, 85, 0.18)',   border: '#334155' },
    ];

    if (c.includes('ARROZ')) return { bg: 'rgba(220, 38, 38, 0.25)', border: '#dc2626' };
    if (c.includes('PLAT')) return { bg: 'rgba(37, 99, 235, 0.25)', border: '#2563eb' };
    if (c.includes('CEBOL')) return { bg: 'rgba(124, 58, 237, 0.25)', border: '#7c3aed' };
    if (c.includes('FRUT')) return { bg: 'rgba(22, 163, 74, 0.25)', border: '#16a34a' };
    if (c.includes('MAIZ')) return { bg: 'rgba(234, 179, 8, 0.28)', border: '#eab308' };
    if (c.includes('ALGOD')) return { bg: 'rgba(14, 116, 144, 0.25)', border: '#0e7490' };

    let h = 0;
    for (let i = 0; i < c.length; i++) h = ((h << 5) - h) + c.charCodeAt(i);
    const idx = Math.abs(h) % base.length;
    return base[idx];
}

// Gris neutro para predios sin cultivo cruzado (KML sin coincidencia en
// padron_usuarios, o coincidencia sin cultivos registrados).
const COLOR_SIN_CRUZAR = { bg: 'rgba(148, 163, 184, 0.20)', border: '#94a3b8' };
