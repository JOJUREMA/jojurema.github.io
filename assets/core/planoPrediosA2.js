// ══ Núcleo compartido — Plano de Predios (Formato A-2) imprimible ══
// Funciones puras (sin DOM/Supabase/Leaflet) para el generador de planos
// tipo "plano catastral de campo" (grilla de coordenadas, leyenda, relleno
// por categoría de Derecho, canales/drenes con su estilo real), con o sin
// imagen satelital de fondo y con o sin membrete — usado desde el
// escritorio (Formato A-2 → 🗺️ Generar Plano de Predios).

// ── Paleta "Derecho" (relleno de cada predio) ──
// Colores dados de forma EXPLÍCITA por el usuario (no por muestreo de
// pixeles sobre el plano de referencia, que en rondas anteriores llevó a
// más de una corrección): "verde = con licencia/derecho; amarillo = sin
// derecho pero con permiso (A2 dentro del bloque); rojo = en la base
// gráfica pero sin licencia ni permiso (sin registro); morado = observado
// en el Formato A2 como fuera del bloque".
const DERECHO_PLANO_A2 = {
    PERMISO_LICENCIA: { etiqueta: 'PERMISO/LICENCIA', fill: '#a9d18e', stroke: '#4f7942' },
    A2_DENTRO_BLOQUE: { etiqueta: 'A2 - DENTRO BLOQUE', fill: '#fff099', stroke: '#bfa100' },
    SIN_REGISTRO: { etiqueta: 'SIN REGISTRO', fill: '#f5a3a3', stroke: '#c0392b' },
    A2_FUERA_BLOQUE: { etiqueta: 'A2 - FUERA BLOQUE', fill: '#d7a8e0', stroke: '#7d3c98' },
};

// Normaliza un nombre para cruzarlo — mismo criterio ya usado en todo el
// proyecto (mayúsculas, sin comas, sin espacios dobles, sin tildes para
// tolerar variantes de tipeo entre KML/Excel/Supabase).
function _normNombrePlanoA2(v) {
    return (v || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/,/g, ' ').trim().toUpperCase().replace(/\s+/g, ' ');
}
function _normUcPlanoA2(v) {
    return (v || '').toString().trim().toUpperCase().replace(/\s+/g, '').replace(/^0+/, '');
}

function _buscarPorUcPlanoA2(filas, ucPredio) {
    if (!Array.isArray(filas) || filas.length === 0 || !ucPredio) return null;
    return filas.find((f) => _normUcPlanoA2(f.unidad_catastral) === ucPredio) || null;
}
function _buscarPorNombrePlanoA2(filas, nombrePredio) {
    if (!Array.isArray(filas) || filas.length === 0 || !nombrePredio) return null;
    return filas.find((f) => _normNombrePlanoA2(f.apellidos_nombres) === nombrePredio) || null;
}

// El Padrón A-1 incluye TODAS las parcelas catalogadas oficialmente, no
// solo las que tienen licencia — algunas traen `clase_derecho` = "SIN
// DERECHO" en texto plano (viene tal cual de la columna Q del Excel
// oficial de ANA, ver Sistema_Riego_CUSSHMI_14.html), y otras simplemente
// no tienen ese campo completado (en blanco). Que una fila exista en el
// Padrón A-1 (origen='ana_a1') NO basta para asumir licencia: hace falta
// además una `clase_derecho` EXPLÍCITA que no diga "sin derecho" — un
// campo vacío/sin informar NO se interpreta como licencia por omisión
// (criterio conservador: sin una clase de derecho real y positiva, no se
// afirma que la tiene). Corrige un caso real donde casi toda una toma
// aparecía "con licencia" solo por tener fila en el Padrón A-1, sin que
// esa fila realmente confirmara ningún derecho.
function _tieneDerechoFormalPlanoA2(fila) {
    if (!fila || fila.origen !== 'ana_a1') return false;
    const clase = (fila.clase_derecho || '').toString().trim().toUpperCase();
    if (!clase) return false;
    return clase.indexOf('SIN DERECHO') === -1;
}

// Clasifica UN predio del bloque de riego (forma {usuario, catastralKey})
// contra el Padrón Oficial A-1 (¿tiene Permiso/Licencia?) y el Formato A-2
// (¿está observado, y dentro o fuera del bloque?). Prioridad, de mayor a
// menor certeza legal:
//   1) Padrón A-1 con UNIDAD CATASTRAL exacta Y `clase_derecho` distinta
//      de "SIN DERECHO" -> PERMISO_LICENCIA
//      — la licencia SOLO cuenta si la propia parcela (por UC, no por
//      nombre) figura en el Padrón A-1 CON un derecho real. Un cruce por
//      nombre no sirve acá: una misma persona puede tener varias
//      parcelas y solo algunas con licencia — si se aceptara el nombre
//      solo, la parcela SIN licencia de esa persona heredaría por error
//      el estatus de licencia de su OTRA parcela. Tampoco basta con que
//      la UC exista en el Padrón A-1: esa misma fila puede traer
//      `clase_derecho`="SIN DERECHO" (bug real, confirmado con casos
//      reales — UC 44548/38770/38771/38722/38717 aparecían como "con
//      licencia" sin tenerla; UC 38771/DIOSES ALCAS EDY, por ejemplo,
//      SÍ está en el Padrón A-1 con esa UC exacta, pero su
//      `clase_derecho` es literalmente "SIN DERECHO").
//   2) Formato A-2 (por UC, o por nombre si ese registro no trae UC) con
//      se_ubica_bloque='Fuera' -> A2_FUERA_BLOQUE — acá sí se acepta el
//      cruce por nombre porque muchos registros observados no traen UC
//      y es la única forma de vincularlos (riesgo ya documentado y
//      aceptado en el resto del proyecto).
//   3) Está en el Padrón A-1 (aunque sin derecho confirmado) O en el
//      Formato A-2 (cualquier otro caso, incl. 'Dentro') -> A2_DENTRO_BLOQUE
//      — el usuario definió "Sin Registro" de forma explícita como
//      AUSENCIA en AMBOS padrones a la vez; por lo tanto, aparecer en
//      cualquiera de los dos (así sea sin derecho confirmado en el
//      Padrón A-1) ya alcanza para esta categoría, nunca
//      para "Sin Registro".
//   4) Sin ningún cruce -> SIN_REGISTRO (hay geometría/KML para el predio,
//      pero no aparece ni en el Padrón A-1 ni en el Formato A-2 — la
//      definición exacta que dio el usuario para esta categoría)
// `padronA1Rows`: filas de padron_oficial_a1 (con unidad_catastral,
// apellidos_nombres, origen, clase_derecho). `formatoA2Rows`: filas de
// formato_a2_levantamiento (con unidad_catastral, apellidos_nombres,
// se_ubica_bloque). Devuelve { categoria, colorInfo, matchInfo }.
function clasificarDerechoPredioA2(predio, padronA1Rows, formatoA2Rows) {
    const ucPredio = _normUcPlanoA2(predio.catastralKey);
    const nombrePredio = _normNombrePlanoA2(predio.usuario);

    const enPadronA1PorUc = _buscarPorUcPlanoA2(padronA1Rows, ucPredio);
    if (_tieneDerechoFormalPlanoA2(enPadronA1PorUc)) {
        return { categoria: 'PERMISO_LICENCIA', colorInfo: DERECHO_PLANO_A2.PERMISO_LICENCIA, matchInfo: enPadronA1PorUc };
    }

    const enFormatoA2 = _buscarPorUcPlanoA2(formatoA2Rows, ucPredio) || _buscarPorNombrePlanoA2(formatoA2Rows, nombrePredio);
    if (enFormatoA2 && (enFormatoA2.se_ubica_bloque || '').toString().trim().toLowerCase() === 'fuera') {
        return { categoria: 'A2_FUERA_BLOQUE', colorInfo: DERECHO_PLANO_A2.A2_FUERA_BLOQUE, matchInfo: enFormatoA2 };
    }

    if (enFormatoA2 || enPadronA1PorUc) {
        return { categoria: 'A2_DENTRO_BLOQUE', colorInfo: DERECHO_PLANO_A2.A2_DENTRO_BLOQUE, matchInfo: enFormatoA2 || enPadronA1PorUc };
    }
    return { categoria: 'SIN_REGISTRO', colorInfo: DERECHO_PLANO_A2.SIN_REGISTRO, matchInfo: null };
}

// ── Estilo de línea de Canal Lateral (color ya real, por orden L1-L5) ──
// Sin distinción por MATERIAL (concreto/tierra/PVC) a pedido explícito
// del usuario — un canal se identifica solo por su orden (L1, L2...),
// igual que en su plano de referencia real; un único patrón de guiones
// para todos. Pesos subidos (y con halo oscuro detrás, ver
// dibujarLineaConHaloPlanoA2 en el llamador) para que la red de riego se
// note claramente sobre el fondo, sea satelital o la maraña de predios/
// etiquetas del plano sin imagen.
const COLOR_POR_ORDEN_CANAL_PLANO_A2 = { L1: '#a83800', L2: '#005ce6', L3: '#4ce600', L4: '#ffff00', L5: '#000000' };
function estiloCanalPlanoA2(orden) {
    const color = COLOR_POR_ORDEN_CANAL_PLANO_A2[orden] || '#666666';
    const pesosPorOrden = { L1: 6, L2: 5.5, L3: 5, L4: 4.5, L5: 4 };
    return { color, dash: [12, 5], weight: pesosPorOrden[orden] || 4.5 };
}

// ── Estilo de línea de Dren, por TIPO (PRINCIPAL/D1/D2) — el KMZ de
// Drenes no trae color propio (a diferencia de Canal Lateral), así que
// esta es una convención propia (documentada), no un dato extraído. ──
const ESTILO_DREN_POR_TIPO_PLANO_A2 = {
    PRINCIPAL: { color: '#c0392b', dash: [2, 8], weight: 5.5 },
    D1: { color: '#e74c3c', dash: [2, 7], weight: 4.5 },
    D2: { color: '#cb4335', dash: [2, 7], weight: 4 },
};

// Dibuja una polilínea con un "halo" oscuro semitransparente detrás — hace
// que la línea (de cualquier color, incluido el amarillo de L4, que casi
// no se ve sobre blanco) resalte tanto sobre fondo satelital como sobre
// el blanco/predios del plano sin imagen. Usado para canales y drenes —
// la red de riego es la que menos se notaba en el plano sin este halo.
function dibujarLineaConHaloPlanoA2(ctx, puntosPx, estilo) {
    if (!puntosPx || puntosPx.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    puntosPx.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1])));
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = estilo.weight + 3.5;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.beginPath();
    puntosPx.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt[0], pt[1]) : ctx.lineTo(pt[0], pt[1])));
    ctx.strokeStyle = estilo.color;
    ctx.lineWidth = estilo.weight;
    ctx.setLineDash(estilo.dash);
    ctx.stroke();
    ctx.restore();
}

// ── Proyección UTM (metros) -> píxeles del lienzo del plano ──
// North-up (norte hacia arriba, este hacia la derecha), con relleno
// (margenPx) y preservando la relación de aspecto real del terreno —
// nunca deforma el plano para llenar el lienzo. Devuelve un objeto con
// la función de proyección más los datos de escala, para poder dibujar
// la grilla de coordenadas con el mismo criterio.
function crearProyectorUtmPlanoA2(bbox, anchoPx, altoPx, margenPx) {
    const anchoUtil = anchoPx - margenPx * 2;
    const altoUtil = altoPx - margenPx * 2;
    const anchoMundo = Math.max(bbox.maxEasting - bbox.minEasting, 1);
    const altoMundo = Math.max(bbox.maxNorthing - bbox.minNorthing, 1);
    const escala = Math.min(anchoUtil / anchoMundo, altoUtil / altoMundo);
    // Centrado dentro del área útil (si una dimensión sobra respecto a la otra).
    const anchoProyectado = anchoMundo * escala;
    const altoProyectado = altoMundo * escala;
    const offsetX = margenPx + (anchoUtil - anchoProyectado) / 2;
    const offsetY = margenPx + (altoUtil - altoProyectado) / 2;
    function proyectar(easting, northing) {
        const x = offsetX + (easting - bbox.minEasting) * escala;
        const y = offsetY + (bbox.maxNorthing - northing) * escala; // northing crece hacia arriba
        return [x, y];
    }
    return { proyectar, escala, offsetX, offsetY, anchoProyectado, altoProyectado };
}

// Metros representados por un pixel del lienzo — para dimensionar
// fuentes de etiquetas de forma proporcional al plano (mismo espíritu que
// metrosPorPixel en mapa.js, pero derivado directo de la escala del
// proyector en vez del zoom de un mapa interactivo).
function metrosPorPixelPlanoA2(proyector) {
    return proyector.escala > 0 ? 1 / proyector.escala : 0;
}

// Ángulo (reutiliza medirLadoMasLargo de mapa.js, ya cargado), longitud EN
// PÍXELES DEL LIENZO (no en metros) y punto medio (en píxeles) del
// lado/tramo más largo de un predio o canal. La longitud en píxeles es lo
// que hace falta para calcular el tamaño de fuente de su etiqueta en el
// plano impreso (ver calcularFuenteParaAncho, reutilizable pasando
// metrosPorPx=1 y esta longitud como si fuera "metros"). El punto medio
// se devuelve para que, en líneas (canal/dren, sin un centroide propio
// como sí tiene un polígono), el rótulo se ubique EXACTAMENTE en el mismo
// tramo cuyo ángulo se está usando — así el nombre siempre queda paralelo
// a la dirección real de la línea justo donde se decide ponerlo, en vez de
// heredar el ángulo del tramo más largo pero dibujarse en otra posición
// (ej. el punto medio del arreglo de vértices) que puede apuntar para otro
// lado si la línea curvea. No se reutiliza el cálculo interno de mapa.js
// para la longitud porque acá además hace falta saber qué 2 vértices
// proyectar. `puntosLatLon`: [[lat,lon],...]; `proyectarFn`:
// (easting,northing)=>[x,y] del proyector del plano actual.
function medirEtiquetaPlanoA2(puntosLatLon, cerrado, proyectarFn) {
    if (!Array.isArray(puntosLatLon) || puntosLatLon.length < 2 || typeof latLonAUtm17S !== 'function') {
        return { anguloCss: 0, longitudPx: 0, centroPx: null };
    }
    const puntosUtm = puntosLatLon.map((par) => latLonAUtm17S(par[0], par[1]));
    const n = puntosUtm.length;
    const tramos = cerrado ? n : n - 1;
    let mejorLongitudM = -1, mejorI = 0, mejorJ = 1;
    for (let i = 0; i < tramos; i++) {
        const j = (i + 1) % n;
        const de = puntosUtm[j].easting - puntosUtm[i].easting;
        const dn = puntosUtm[j].northing - puntosUtm[i].northing;
        const longitud = Math.sqrt(de * de + dn * dn);
        if (longitud > mejorLongitudM) { mejorLongitudM = longitud; mejorI = i; mejorJ = j; }
    }
    if (mejorLongitudM <= 0) return { anguloCss: 0, longitudPx: 0, centroPx: null };
    const anguloCss = (typeof medirLadoMasLargo === 'function') ? medirLadoMasLargo(puntosLatLon, cerrado).anguloCss : 0;
    const pA = proyectarFn(puntosUtm[mejorI].easting, puntosUtm[mejorI].northing);
    const pB = proyectarFn(puntosUtm[mejorJ].easting, puntosUtm[mejorJ].northing);
    const longitudPx = Math.sqrt(Math.pow(pB[0] - pA[0], 2) + Math.pow(pB[1] - pA[1], 2));
    const centroPx = [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2];
    return { anguloCss, longitudPx, centroPx };
}

// Divide el nombre de un titular en 2 líneas lo más balanceadas posible
// (por cantidad de caracteres), cortando siempre entre palabras completas
// — nunca a mitad de una palabra. Se usa cuando el nombre completo no cabe
// en una sola línea a lo largo del lado más largo del predio. Si el
// nombre trae una sola palabra (no se puede partir), devuelve ['', '']
// para que el llamador sepa que esta estrategia no aplica.
function partirNombreEnDosLineas(nombre) {
    const palabras = (nombre || '').toString().trim().split(/\s+/).filter(Boolean);
    if (palabras.length < 2) return ['', ''];
    let mejorCorte = 1, mejorDif = Infinity;
    for (let i = 1; i < palabras.length; i++) {
        const linea1 = palabras.slice(0, i).join(' ');
        const linea2 = palabras.slice(i).join(' ');
        const dif = Math.abs(linea1.length - linea2.length);
        if (dif < mejorDif) { mejorDif = dif; mejorCorte = i; }
    }
    return [palabras.slice(0, mejorCorte).join(' '), palabras.slice(mejorCorte).join(' ')];
}

// Mayor número "redondo" (1, 2 o 5 × una potencia de 10, en metros) que
// cabe dentro de `anchoDeseadoPx * metrosPorPx` sin excederlo — para que
// la barra de escala gráfica del plano represente una distancia legible
// (100 m, 200 m, 500 m...) en vez de un número arbitrario.
function elegirLongitudEscalaBarraM(anchoDeseadoPx, metrosPorPx) {
    if (!(metrosPorPx > 0)) return 100;
    const bruto = anchoDeseadoPx * metrosPorPx;
    if (bruto <= 0) return 100;
    const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
    const pasos = [1, 2, 5, 10];
    let mejor = potencia;
    for (let i = 0; i < pasos.length; i++) {
        const candidato = potencia * pasos[i];
        if (candidato <= bruto) mejor = candidato; else break;
    }
    return mejor;
}

// Dibuja la escala gráfica (barra segmentada blanco/azul + etiquetas en
// metros) del plano, anclada por su esquina inferior DERECHA en
// (xDerecha, yInferior) — mismo criterio de anclaje que
// _dibujarLeyendaPlanoA2 (que ancla por su esquina inferior izquierda),
// para que ambos cuadros queden simétricos dentro del marco sin chocar.
function dibujarEscalaGraficaPlanoA2(ctx, xDerecha, yInferior, metrosPorPx) {
    if (!(metrosPorPx > 0)) return;
    const ANCHO_OBJETIVO_PX = 260;
    const N_SEGMENTOS = 4;
    const ALTO_BARRA = 9;
    const longitudTotalM = elegirLongitudEscalaBarraM(ANCHO_OBJETIVO_PX, metrosPorPx);
    const anchoBarraPx = longitudTotalM / metrosPorPx;
    const segPx = anchoBarraPx / N_SEGMENTOS;
    const segM = longitudTotalM / N_SEGMENTOS;
    const xIzq = xDerecha - anchoBarraPx;
    const yBarra = yInferior - 24;
    const padding = 10;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.fillRect(xIzq - padding, yBarra - 15, anchoBarraPx + padding * 2, 15 + ALTO_BARRA + 22);
    ctx.strokeRect(xIzq - padding, yBarra - 15, anchoBarraPx + padding * 2, 15 + ALTO_BARRA + 22);

    ctx.font = '600 10px Arial, sans-serif';
    ctx.fillStyle = '#002b52';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ESCALA GRÁFICA (metros)', xIzq + anchoBarraPx / 2, yBarra - 3);

    for (let i = 0; i < N_SEGMENTOS; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#002b52' : '#ffffff';
        ctx.fillRect(xIzq + i * segPx, yBarra, segPx, ALTO_BARRA);
        ctx.strokeStyle = '#002b52';
        ctx.strokeRect(xIzq + i * segPx, yBarra, segPx, ALTO_BARRA);
    }

    ctx.font = '500 9px Arial, sans-serif';
    ctx.fillStyle = '#002b52';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= N_SEGMENTOS; i++) {
        const etiqueta = i === 0 ? '0' : (i === N_SEGMENTOS ? (longitudTotalM + ' m') : String(Math.round(segM * i)));
        ctx.textAlign = i === 0 ? 'left' : (i === N_SEGMENTOS ? 'right' : 'center');
        const xTexto = i === 0 ? xIzq : (i === N_SEGMENTOS ? xIzq + anchoBarraPx : xIzq + i * segPx);
        ctx.fillText(etiqueta, xTexto, yBarra + ALTO_BARRA + 3);
    }
    ctx.restore();
}

// Elige un intervalo de grilla "redondo" (1, 2 o 5 × una potencia de 10)
// que produzca entre ~4 y ~10 líneas dentro del rango dado — mismo
// criterio que cualquier software GIS al dibujar una grilla de
// coordenadas automática.
function elegirIntervaloGrillaPlanoA2(rangoUtilM) {
    const crudo = rangoUtilM / 6; // apuntar a ~6 líneas
    const potencia = Math.pow(10, Math.floor(Math.log10(crudo)));
    const pasos = [1, 2, 5, 10];
    let mejor = potencia * 10;
    for (let i = 0; i < pasos.length; i++) {
        const candidato = potencia * pasos[i];
        if (candidato >= crudo) { mejor = candidato; break; }
    }
    return mejor;
}

// Cálculo de la caja UTM (metros) que envuelve un conjunto de anillos de
// vértices en [lat,lon] o [lon,lat] — `ordenLonLat` indica el orden de
// cada par (true = [lon,lat], como el KML de bloques de riego; false =
// [lat,lon], como canal_lateral.json/dren_*.json).
function calcularBboxUtmPlanoA2(listasDeAnillos, ordenLonLat) {
    let minEasting = Infinity, maxEasting = -Infinity, minNorthing = Infinity, maxNorthing = -Infinity;
    listasDeAnillos.forEach((anillo) => {
        (anillo || []).forEach((par) => {
            const lat = ordenLonLat ? par[1] : par[0];
            const lon = ordenLonLat ? par[0] : par[1];
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            const utm = latLonAUtm17S(lat, lon);
            if (utm.easting < minEasting) minEasting = utm.easting;
            if (utm.easting > maxEasting) maxEasting = utm.easting;
            if (utm.northing < minNorthing) minNorthing = utm.northing;
            if (utm.northing > maxNorthing) maxNorthing = utm.northing;
        });
    });
    return { minEasting, maxEasting, minNorthing, maxNorthing };
}

// ── Compositor de imagen satelital (Esri World Imagery, con CORS —
// verificado explícitamente antes de construir esto: el servidor de
// Google usado en el editor interactivo NO sirve para "quemar" la imagen
// en un <canvas> y exportarla a PDF sin bloqueo del navegador) ──

// Pixel "de mundo" en Web Mercator (EPSG:3857) para un lon/lat a un zoom
// dado — misma familia de fórmulas que metrosPorPixel, pero para ubicar
// un punto dentro de la cuadrícula global de teselas de 256px.
function _lonLatAPixelMundoWebMercator(lon, lat, zoom) {
    const n = Math.pow(2, zoom) * 256;
    const x = (lon + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { x, y };
}

// Resuelve una transformación afín 2D (a,b,c,d,e,f) tal que, para cada uno
// de los 3 puntos de referencia, (cx,cy) = (a·wx + c·wy + e, b·wx + d·wy + f).
// 3 correspondencias determinan exactamente una afín (6 incógnitas, 6
// ecuaciones) — suficiente para mapear "pixel de mundo" de las teselas al
// pixel del lienzo del plano sin distorsión perceptible en un área de
// pocos km (a esa escala, UTM y Web Mercator son ambas, en la práctica,
// transformaciones afines de lon/lat).
function _resolverAfinTeselasPlanoA2(puntosRef) {
    function det3(m) {
        return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    }
    const M = puntosRef.map((p) => [p.wx, p.wy, 1]);
    const D = det3(M);
    function resolver(vecObjetivo) {
        function conCol(col) {
            const m2 = M.map((fila) => fila.slice());
            for (let i = 0; i < 3; i++) m2[i][col] = vecObjetivo[i];
            return det3(m2);
        }
        return [conCol(0) / D, conCol(1) / D, conCol(2) / D];
    }
    const [a, c, e] = resolver(puntosRef.map((p) => p.cx));
    const [b, d, f] = resolver(puntosRef.map((p) => p.cy));
    return { a, b, c, d, e, f };
}

// Elige el zoom de teselas más BAJO (menos teselas a descargar) que igual
// o supere la resolución del lienzo — para no verse borroso al imprimir,
// sin pedir más detalle del necesario. Este es solo el punto de PARTIDA:
// _elegirZoomConCoberturaPlanoA2 (abajo) todavía puede bajarlo si a ese
// zoom no hay imagen real disponible para la zona (común en zonas rurales
// a zoom alto — Esri sirve una tesela plana de "no disponible" en vez de
// fallar, así que hay que detectarlo por contenido, no por error de red).
function elegirZoomSatelitePlanoA2(latCentral, metrosPorPxLienzo) {
    for (let z = 12; z <= 19; z++) {
        if (typeof metrosPorPixel === 'function' && metrosPorPixel(latCentral, z) <= metrosPorPxLienzo * 1.15) return z;
    }
    return 19;
}

function _cargarImagen(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la tesela: ' + url));
        img.src = url;
    });
}

// Desviación estándar del canal rojo de una imagen ya cargada — una
// tesela real de satélite (vegetación/suelo/agua) tiene bastante textura
// (~20-35 en la práctica, verificado empíricamente); la tesela de
// "imagen no disponible" que sirve Esri en zonas rurales a zoom alto es
// casi plana (~5, con un poco de variación solo por el texto de aviso).
// Umbral elegido con margen amplio entre ambos casos reales medidos.
const UMBRAL_DESVIACION_TESELA_SIN_DATOS = 12;
function _desviacionEstandarImagen(img) {
    const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(img.width, img.height) : document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let suma = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { suma += d[i]; n++; }
    const media = suma / n;
    let sumaCuad = 0;
    for (let i = 0; i < d.length; i += 4) sumaCuad += (d[i] - media) * (d[i] - media);
    return Math.sqrt(sumaCuad / n);
}

// Prueba de cobertura real: descarga las 4 esquinas + el centro del bbox a
// un zoom candidato y cuenta cuántas parecen tener imagen real (ver
// _desviacionEstandarImagen). Si la mayoría no la tiene, se prueba un
// zoom más bajo (más probable que sí tenga cobertura, a costa de menos
// detalle) — hasta un piso razonable, nunca deja el plano sin intentarlo.
async function _elegirZoomConCoberturaPlanoA2(zoomIdeal, esquinasLatLon, centroLatLon) {
    const puntosPrueba = esquinasLatLon.concat([centroLatLon]);
    for (let zoom = zoomIdeal; zoom >= 12; zoom--) {
        let conDatos = 0;
        const resultados = await Promise.all(puntosPrueba.map(async (ll) => {
            try {
                const wp = _lonLatAPixelMundoWebMercator(ll.lon, ll.lat, zoom);
                const tx = Math.floor(wp.x / 256), ty = Math.floor(wp.y / 256);
                const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
                const img = await _cargarImagen(url);
                return _desviacionEstandarImagen(img) >= UMBRAL_DESVIACION_TESELA_SIN_DATOS;
            } catch (e) { return false; }
        }));
        conDatos = resultados.filter(Boolean).length;
        if (conDatos >= Math.ceil(puntosPrueba.length / 2)) return zoom; // mayoría con imagen real
    }
    return 12; // ni siquiera el piso tiene mayoría — se devuelve igual, mejor esfuerzo
}

// Descarga y "quema" en el contexto de canvas dado las teselas de Esri
// World Imagery que cubren el bbox UTM indicado, ya transformadas para
// calzar exactamente con la proyección del plano (proyector). Antes de
// pedir la grilla completa, verifica que el zoom elegido en verdad tenga
// imagen (no la tesela plana de "no disponible" que Esri sirve en zonas
// rurales a zoom alto) y baja de zoom si hace falta — nunca lanza si una
// tesela puntual falla, sigue con las demás.
async function dibujarSateliteEnCanvasPlanoA2(ctx, proyector, bboxUtm) {
    const centro = utm17SALatLon((bboxUtm.minEasting + bboxUtm.maxEasting) / 2, (bboxUtm.minNorthing + bboxUtm.maxNorthing) / 2);
    const zoomIdeal = elegirZoomSatelitePlanoA2(centro.lat, metrosPorPixelPlanoA2(proyector));

    const esquinasUtm = [
        { e: bboxUtm.minEasting, n: bboxUtm.minNorthing },
        { e: bboxUtm.maxEasting, n: bboxUtm.minNorthing },
        { e: bboxUtm.minEasting, n: bboxUtm.maxNorthing },
        { e: bboxUtm.maxEasting, n: bboxUtm.maxNorthing },
    ];
    const esquinasLatLon = esquinasUtm.map((p) => utm17SALatLon(p.e, p.n));
    const zoom = await _elegirZoomConCoberturaPlanoA2(zoomIdeal, esquinasLatLon, centro);

    const puntosRef = esquinasUtm.slice(0, 3).map((p, idx) => {
        const ll = esquinasLatLon[idx];
        const wp = _lonLatAPixelMundoWebMercator(ll.lon, ll.lat, zoom);
        const cv = proyector.proyectar(p.e, p.n);
        return { wx: wp.x, wy: wp.y, cx: cv[0], cy: cv[1] };
    });
    const afin = _resolverAfinTeselasPlanoA2(puntosRef);

    let minTileX = Infinity, maxTileX = -Infinity, minTileY = Infinity, maxTileY = -Infinity;
    esquinasLatLon.forEach((ll) => {
        const wp = _lonLatAPixelMundoWebMercator(ll.lon, ll.lat, zoom);
        const tx = Math.floor(wp.x / 256), ty = Math.floor(wp.y / 256);
        if (tx < minTileX) minTileX = tx; if (tx > maxTileX) maxTileX = tx;
        if (ty < minTileY) minTileY = ty; if (ty > maxTileY) maxTileY = ty;
    });
    minTileX -= 1; minTileY -= 1; maxTileX += 1; maxTileY += 1; // colchón contra bordes

    const tareas = [];
    for (let tx = minTileX; tx <= maxTileX; tx++) {
        for (let ty = minTileY; ty <= maxTileY; ty++) {
            if (tx < 0 || ty < 0 || tx >= Math.pow(2, zoom) || ty >= Math.pow(2, zoom)) continue;
            const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
            tareas.push(
                _cargarImagen(url).then((img) => ({ img, tx, ty })).catch(() => null)
            );
        }
    }
    const cargadas = (await Promise.all(tareas)).filter(Boolean);
    // Ya se validó cobertura por muestreo arriba, pero una tesela puntual
    // suelta SÍ puede seguir siendo "no disponible" (cobertura desigual) —
    // se descarta cada una individualmente en vez de asumir todo el lote.
    const teselas = cargadas.filter(({ img }) => _desviacionEstandarImagen(img) >= UMBRAL_DESVIACION_TESELA_SIN_DATOS);

    ctx.save();
    // OJO: ctx.transform() COMPONE con la transformación actual (el
    // translate(0, HEADER_H) del membrete, si lo hay) — a diferencia de
    // ctx.setTransform(), que la REEMPLAZA por completo y haría que la
    // imagen satelital se dibujara corrida hacia arriba, tapando el
    // membrete en vez de empezar debajo de él.
    ctx.transform(afin.a, afin.b, afin.c, afin.d, afin.e, afin.f);
    teselas.forEach(({ img, tx, ty }) => {
        ctx.drawImage(img, tx * 256, ty * 256, 256, 256);
    });
    ctx.restore();
    return { zoom, teselas: teselas.length, teselasDescartadasPorSinDatos: cargadas.length - teselas.length };
}
