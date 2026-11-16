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
    // Bloques que faltaban en la red (confirmado contra PARCELAS.shp.kmz —
    // el shapefile oficial de predios de Margen Izquierda: 9 bloques reales,
    // solo 3 estaban cargados). JIBITO, LAS CAPILLAS y SOJO Y LAS MARIPOSAS
    // son zonas de riego por bomba (no tienen código SI/SD de canal por
    // gravedad) — se usa el nombre del bloque como código de toma. LA HUACA,
    // MAPLE y CAÑA BRAVA II sí tienen código de toma (confirmado con el
    // usuario): SI6, AGROAURORA y EL LOBO respectivamente.
    JIBITO: ['BLOQUE_JIBITO.kml'],
    'LAS CAPILLAS': ['BLOQUE_LAS_CAPILLAS.kml'],
    'SOJO Y LAS MARIPOSAS': ['BLOQUE_SOJO_Y_LAS_MARIPOSAS.kml'],
    SI6: ['BLOQUE_LA_HUACA.kml'],
    AGROAURORA: ['BLOQUE_MAPLE.kml'],
    'EL LOBO': ['BLOQUE_CANA_BRAVA_II.kml'],
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

// Nombre de bloque a mostrar para una toma (Pantalla 2 de "Identificación y
// registro") — se deriva del nombre de archivo KML ya mapeado en
// KML_POR_TOMA, no es un dato nuevo. Una toma en dos bloques (caso SD10)
// muestra ambos separados por "/"; una toma aún no mapeada en el GIS
// muestra "—" en vez de fallar.
function obtenerBloqueDeToma(tomaNombre) {
    const archivos = KML_POR_TOMA[normalizarNombreToma(tomaNombre)];
    if (!archivos || archivos.length === 0) return '—';
    return archivos
        .map((archivo) => archivo.replace(/^BLOQUE_(DE_RIEGO_)?/, '').replace(/\.kml$/i, ''))
        .join('/');
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

// Encuentra el lado/tramo MÁS LARGO de un polígono o polilínea, medido en
// UTM (metros reales, sin la distorsión de comparar directamente grados de
// latitud/longitud) — helper interno compartido por anguloLadoMasLargo y
// medirLadoMasLargo (abajo). `puntosLatLon`: [[lat,lon], ...]; `cerrado`:
// true incluye el tramo de vuelta del último vértice al primero (polígono),
// false no lo incluye (polilínea abierta, un canal). Devuelve
// `{ longitudM, dEasting, dNorthing }` o `null` si no hay suficientes puntos.
function _tramoMasLargoUtm(puntosLatLon, cerrado) {
    if (!Array.isArray(puntosLatLon) || puntosLatLon.length < 2) return null;
    if (typeof latLonAUtm17S !== 'function') return null; // assets/core/coordenadasUtm.js no cargado
    const puntosUtm = puntosLatLon.map((par) => latLonAUtm17S(par[0], par[1]));
    const n = puntosUtm.length;
    const tramos = cerrado ? n : n - 1;
    let mejorLongitud = -1, mejorEasting = 0, mejorNorthing = 0, mejorA = null, mejorB = null;
    for (let i = 0; i < tramos; i++) {
        const a = puntosUtm[i], b = puntosUtm[(i + 1) % n];
        const de = b.easting - a.easting, dn = b.northing - a.northing;
        const longitud = Math.sqrt(de * de + dn * dn);
        if (longitud > mejorLongitud) { mejorLongitud = longitud; mejorEasting = de; mejorNorthing = dn; mejorA = a; mejorB = b; }
    }
    if (mejorLongitud <= 0) return null;
    return { longitudM: mejorLongitud, dEasting: mejorEasting, dNorthing: mejorNorthing, utmA: mejorA, utmB: mejorB };
}

// Ángulo CSS (listo para `transform:rotate()`) de un vector este/norte —
// normalizado a (-90°,90°] para que el texto nunca quede "de cabeza" (una
// línea no tiene un único sentido de lectura, así que ambos extremos del
// mismo lado dan el mismo resultado).
function _anguloCssDesdeVector(dEasting, dNorthing) {
    const anguloMatematico = Math.atan2(dNorthing, dEasting) * 180 / Math.PI; // sistema "y=norte arriba"
    let anguloCss = -anguloMatematico; // la pantalla es "y hacia abajo" — se invierte para CSS rotate()
    anguloCss = ((anguloCss % 180) + 180) % 180; // normaliza a [0,180)
    if (anguloCss > 90) anguloCss -= 180; // normaliza a (-90,90] — nunca de cabeza
    return anguloCss;
}

// Ángulo (grados CSS) del lado/tramo MÁS LARGO de un polígono o polilínea —
// para que una etiqueta (nombre de titular, unidad catastral, nombre de
// canal) se dibuje paralela al predio o al canal en vez de siempre
// horizontal, igual que un plano catastral real. Ver `_tramoMasLargoUtm`
// para el significado de `puntosLatLon`/`cerrado`. Devuelve 0 si no hay
// suficientes puntos.
function anguloLadoMasLargo(puntosLatLon, cerrado) {
    const tramo = _tramoMasLargoUtm(puntosLatLon, cerrado);
    return tramo ? _anguloCssDesdeVector(tramo.dEasting, tramo.dNorthing) : 0;
}

// Igual que anguloLadoMasLargo, pero además devuelve la longitud real (en
// metros) de ese lado/tramo — necesaria para calcular cuántos píxeles de
// ancho tiene en pantalla a un zoom dado, y de ahí el tamaño de fuente que
// cabe adentro sin salirse de la figura (ver calcularFuenteParaAncho).
// Devuelve `{ anguloCss: 0, longitudM: 0 }` si no hay suficientes puntos.
function medirLadoMasLargo(puntosLatLon, cerrado) {
    const tramo = _tramoMasLargoUtm(puntosLatLon, cerrado);
    if (!tramo) return { anguloCss: 0, longitudM: 0 };
    return { anguloCss: _anguloCssDesdeVector(tramo.dEasting, tramo.dNorthing), longitudM: tramo.longitudM };
}

// Igual que medirLadoMasLargo, pero ADEMÁS devuelve el punto medio (lat,lon)
// del propio tramo más largo — para canales/drenes en el mapa Leaflet en
// vivo (editor de ubicación), donde el rótulo NO puede ir en un tooltip
// atado a toda la polilínea (Leaflet lo posiciona en el centro de sus
// bounds, que no necesariamente coincide con el tramo cuyo ángulo se está
// usando — un canal que zigzaguea puede terminar con el texto en un punto
// cuya dirección real no es la del ángulo aplicado). Con el marcador
// dedicado en `centro`, posición y ángulo siempre corresponden al MISMO
// tramo. Devuelve `centro: null` si no hay suficientes puntos.
function medirLadoMasLargoConCentro(puntosLatLon, cerrado) {
    const tramo = _tramoMasLargoUtm(puntosLatLon, cerrado);
    if (!tramo || typeof utm17SALatLon !== 'function') return { anguloCss: 0, longitudM: 0, centro: null };
    const centroEasting = (tramo.utmA.easting + tramo.utmB.easting) / 2;
    const centroNorthing = (tramo.utmA.northing + tramo.utmB.northing) / 2;
    const centroLatLon = utm17SALatLon(centroEasting, centroNorthing);
    return {
        anguloCss: _anguloCssDesdeVector(tramo.dEasting, tramo.dNorthing),
        longitudM: tramo.longitudM,
        centro: [centroLatLon.lat, centroLatLon.lon],
    };
}

// Metros representados por un pixel de pantalla en la proyección Web
// Mercator (la misma que usa Leaflet/Google/OSM) a una latitud y zoom
// dados — fórmula estándar de resolución de terreno (156543.03392 =
// circunferencia ecuatorial ÷ 256px, el tamaño de un tile). Se usa para
// convertir la longitud real (metros) del lado más largo de un predio o
// canal a píxeles de pantalla en el zoom actual.
function metrosPorPixel(latGrados, zoom) {
    return 156543.03392 * Math.cos(latGrados * Math.PI / 180) / Math.pow(2, zoom);
}

// Tamaño de fuente (px) tal que `numCaracteres` a lo largo de una etiqueta
// quepan dentro de `longitudM` metros reales, vistos a `metrosPorPx`
// metros/píxel (ver metrosPorPixel) — la base de que las etiquetas del
// bloque de riego escalen de forma continua y proporcional al zoom, en vez
// de un tamaño fijo por nivel, y de que el texto siempre quede dentro del
// predio/canal que describe. `factorAnchoCaracter` (por defecto 0.58) es el
// ancho promedio de un carácter relativo al tamaño de fuente en una
// tipografía de palo seco común; `margenSeguridad` (por defecto 0.85) deja
// un poco de aire para no tocar los bordes de la figura. Devuelve 0 si
// falta algún dato (el llamador decide entonces ocultar la etiqueta).
function calcularFuenteParaAncho(longitudM, metrosPorPx, numCaracteres, factorAnchoCaracter, margenSeguridad) {
    if (!longitudM || !metrosPorPx || !numCaracteres) return 0;
    const factor = factorAnchoCaracter || 0.58;
    const margen = margenSeguridad || 0.85;
    const disponiblePx = (longitudM / metrosPorPx) * margen;
    return disponiblePx / (numCaracteres * factor);
}
