// ══ Núcleo Comisión de Regantes de HUARO — PDA por topos + Anexos G-2/G-3/G-4 ══
//
// Huaro NO usa el modelo cultivo → módulo de riego → volumen del resto del
// sistema. Su padrón (PADRON1_3.xlsx) trae, por hoja/bocatoma:
//   N° · APELLIDO Y NOMBRES · apellidos · nombres · ÁREA(ha) · TOPOS · BOCATOMA
// y el riego se programa así:
//   - 1 topo = 0.33 ha. Turno de cada usuario = nº topos × 1.5 h, en un
//     bloque continuo.
//   - Ventana diaria 04:00 → 20:00 (16 h), los 7 días (Lun–Dom).
//   - Cada bocatoma tiene un caudal (l/s) que el usuario ingresa en pantalla.
//     volumen_m³ = caudal_l/s × tiempo_h × 3.6   (l/s → m³/s = /1000 ; ×3600 s/h)
//   - Los usuarios van en el orden del N° de la columna. Si un bloque no cabe
//     en lo que resta del día, pasa al día siguiente a las 04:00. Lo que no
//     entra en los 7 días queda "pendiente" y encabeza la semana siguiente.
//
// Este módulo es autocontenido y con prefijo huaro*/HUARO_* — no toca el
// motor de cultivo (mostrarAnexoG2/G3/G4, recalcularProgramacionG3Desde, etc.).
// Cargado con <script src="assets/core/huaro.js"></script> en el <head>,
// como el resto de assets/core/*.js (funciones globales, sin IIFE).

'use strict';

// ── Constantes del modelo ──
const HUARO_HA_POR_TOPO    = 0.33;
const HUARO_H_POR_TOPO      = 1.5;
const HUARO_MIN_INICIO_DIA  = 4 * 60;   // 04:00
const HUARO_MIN_FIN_DIA     = 20 * 60;  // 20:00
const HUARO_DIAS_SEMANA     = 7;
const HUARO_JUNTA  = 'JUNTA DE USUARIOS DEL SECTOR HIDRÁULICO MENOR MEDIO VILCANOTA MAPACHO';
const HUARO_SUBSECTOR = 'SUB SECTOR HIDRÁULICO LAGUNA PUMACOCHA-HUARO';
const HUARO_COMISION_NOMBRE = 'COMISIÓN DE REGANTES DE HUARO';
const HUARO_FUENTE = 'QUEBRADA HUARO';
const HUARO_AAA = 'AUTORIDAD ADMINISTRATIVA DEL AGUA URUBAMBA - VILCANOTA';
const HUARO_ALA = 'ADMINISTRACIÓN LOCAL DE AGUA CUSCO';
const HUARO_DIAS_NOMBRE = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HUARO_DIAS_ABREV  = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];

const HUARO_MAPA_TOPOS = {
    '1/2 T': 0.5, '1 T': 1, '1 1/2 T': 1.5, '2 T': 2, '2 1/2 T': 2.5,
    '3 T': 3, '3 1/2 T': 3.5, '4 T': 4, '4 1/2 T': 4.5,
    '5 T': 5, '5 1/2 T': 5.5, '6 T': 6, '6 1/2 T': 6.5, '7 T': 7,
};

// ── Masa de agua otorgada por bloque de riego / bocatoma ──
// De las Licencias de Uso de Agua Superficial de la Comisión de Regantes de
// Huaro ("MASA DE AGUA.docx" — una R.D. por bloque, Art. 2°/3°). Es el
// derecho de agua legalmente otorgado: caudal (l/s) y volumen anual (m³).
// Se muestra como referencia en la pantalla del PDA, junto al caudal que el
// sectorista asigna a cada bocatoma para la semana.
// Clave = nombre de la hoja del padrón normalizado (huaroNormNombre).
const HUARO_MASA_AGUA = {
    'PUCRUPAMPA':            { caudalLs: 2.90,  volumenAnualM3: 68907,  bloque: 'Pucrupampa' },
    'ACCOPATA':              { caudalLs: 5.88,  volumenAnualM3: 139704, bloque: 'Accopata' },
    'ACHUMACHINCALLAVEI':    { caudalLs: 6.38,  volumenAnualM3: 151707, bloque: 'Achuma Chincallave 1' },
    'TTIKAPATACARDUNCANCHA': { caudalLs: 6.30,  volumenAnualM3: 149596, bloque: 'Cardoncancha Tticapata' },
    'MANZANAYOC':            { caudalLs: 3.06,  volumenAnualM3: 72686,  bloque: 'Manzanayoc' },
    'AUJIRAY':               { caudalLs: 2.29,  volumenAnualM3: 54348,  bloque: 'Aujiray' },
    'PPUMPU':                { caudalLs: 9.55,  volumenAnualM3: 226950, bloque: 'Ppumpo' },
    'CUNYACQUENKO':          { caudalLs: 16.82, volumenAnualM3: 399551, bloque: 'Cunyac' },
    'LLACTAYARCA':           { caudalLs: 11.96, volumenAnualM3: 284187, bloque: 'Llactayarcca' },
    'BATAN':                 { caudalLs: 15.36, volumenAnualM3: 364987, bloque: 'Batán' },
    'CHINCALLAVEII':         { caudalLs: 1.76,  volumenAnualM3: 41900,  bloque: 'Chincallave 2' },
    'MAYOALCCA':             { caudalLs: 4.23,  volumenAnualM3: 100582, bloque: 'Mayuallcca' },
    'HUAYNACOMUN':           { caudalLs: 9.64,  volumenAnualM3: 229061, bloque: 'Huayna Común', caudalEstimado: true },
};

function huaroNormNombre(s) {
    return String(s == null ? '' : s).toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z0-9]+/g, '');
}
// Devuelve { caudalLs, volumenAnualM3, bloque, caudalEstimado? } o null.
function huaroMasaDeAgua(bocatoma) {
    return HUARO_MASA_AGUA[huaroNormNombre(bocatoma)] || null;
}

// ── Canal de conducción / derivación por bocatoma ──
// Nombres tal cual el inventario GIS de la comisión (COMISIÓN DE REGANTES
// HUARO.kmz — capas <LineString>). Es el canal que conduce el agua desde la
// captación en la Quebrada Huaro hasta el bloque de riego. Clave = nombre de
// la hoja del padrón normalizado (huaroNormNombre).
const HUARO_CANAL_BOCATOMA = {
    'PUCRUPAMPA':            'CANAL PUCRUPAMPA',
    'ACCOPATA':              'CANAL DE CONDUCCIÓN ACCOPATA',
    'ACHUMACHINCALLAVEI':    'CANAL DE CONDUCCIÓN ACHUMA',
    'TTIKAPATACARDUNCANCHA': 'CANAL DE CONDUCCIÓN CARDONCANCHA TTICAPATA',
    'MANZANAYOC':            'CANAL DE CONDUCCIÓN MANZANAYOC',
    'AUJIRAY':               'CANAL DE CONDUCCIÓN AUJIRAY 1 Y 3',
    'PPUMPU':                'CANAL DE CONDUCCIÓN DE PPUMPO',
    'CUNYACQUENKO':          'CANAL DERIVADOR CUNYAC',
    'LLACTAYARCA':           'CANAL DE LLACTAYARCCA',
    'BATAN':                 'CANAL DE CONDUCCIÓN BATAN',
    'CHINCALLAVEII':         'CANAL DE CONDUCCIÓN CHINCALLAVE 2',
    'MAYOALCCA':             'CANAL DE CONDUCCIÓN MAYUALLCCA',
    'HUAYNACOMUN':           'CANAL DE CONDUCCIÓN HUAYNA COMUN',
};
function huaroCanalBocatoma(bocatoma) {
    return HUARO_CANAL_BOCATOMA[huaroNormNombre(bocatoma)] || String(bocatoma || '');
}

// ── Días y horas de riego por bocatoma ──
// 7 entradas (0 = lunes … 6 = domingo): { activo, inicioMin, finMin }.
function huaroDiasRiegoDefault() {
    return HUARO_DIAS_NOMBRE.map(() => ({ activo: true, inicioMin: HUARO_MIN_INICIO_DIA, finMin: HUARO_MIN_FIN_DIA }));
}
// Normaliza lo que venga (array parcial, o los antiguos inicioDiaOffset/
// inicioHoraMin) a 7 entradas válidas y coherentes.
function huaroNormalizarDiasRiego(diasRiego, inicioDiaOffsetLegacy, inicioHoraMinLegacy) {
    const out = huaroDiasRiegoDefault();
    if (Array.isArray(diasRiego) && diasRiego.length) {
        for (let i = 0; i < 7; i++) {
            const d = diasRiego[i] || {};
            let ini = parseInt(d.inicioMin, 10);
            let fin = parseInt(d.finMin, 10);
            if (!Number.isFinite(ini)) ini = HUARO_MIN_INICIO_DIA;
            if (!Number.isFinite(fin)) fin = HUARO_MIN_FIN_DIA;
            ini = Math.max(0, Math.min(ini, 24 * 60 - 15));
            fin = Math.max(ini + 15, Math.min(fin, 24 * 60));
            out[i] = { activo: !!d.activo, inicioMin: ini, finMin: fin };
        }
        return out;
    }
    // Compatibilidad: si vienen los parámetros viejos, arma "desde ese día/hora
    // hasta el domingo, ventana 04:00–20:00".
    let off = parseInt(inicioDiaOffsetLegacy, 10);
    if (Number.isFinite(off) && off >= 0 && off <= 6) {
        let h = parseInt(inicioHoraMinLegacy, 10);
        if (!Number.isFinite(h) || h < HUARO_MIN_INICIO_DIA || h >= HUARO_MIN_FIN_DIA) h = HUARO_MIN_INICIO_DIA;
        for (let i = 0; i < 7; i++) {
            out[i].activo = i >= off;
            out[i].inicioMin = (i === off) ? h : HUARO_MIN_INICIO_DIA;
        }
    }
    return out;
}
// Texto compacto de un horario para mostrar en la tabla del PDA. Si se pasa el
// lunes de la semana, cada día lleva su fecha del mes (LUN 7, MAR 8, …).
function huaroResumenDiasRiego(diasRiego, semanaInicioISO) {
    const dr = huaroNormalizarDiasRiego(diasRiego);
    const activos = dr.map((d, i) => ({ d, i })).filter(x => x.d.activo);
    if (!activos.length) return 'sin días';
    const totalH = activos.reduce((s, x) => s + (x.d.finMin - x.d.inicioMin) / 60, 0);
    const mismaVentana = activos.every(x =>
        x.d.inicioMin === activos[0].d.inicioMin && x.d.finMin === activos[0].d.finMin);
    const etq = x => semanaInicioISO
        ? `${HUARO_DIAS_ABREV[x.i]} ${_huaroDiaDelMes(semanaInicioISO, x.i)}`
        : HUARO_DIAS_ABREV[x.i];
    const dias = activos.map(etq).join(' · ');
    if (mismaVentana) {
        return `${dias} · ${_huaroHHMM(activos[0].d.inicioMin)}–${_huaroHHMM(activos[0].d.finMin)} (${totalH.toFixed(0)} h)`;
    }
    return activos.map(x => `${etq(x)} ${_huaroHHMM(x.d.inicioMin)}–${_huaroHHMM(x.d.finMin)}`).join(' · ');
}

// ── Helpers puros ──
function _huaroEsc(v) {
    return (v == null ? '' : String(v))
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _huaroHHMM(min) {
    const m = Math.round(min);
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}
function _huaroHorasTexto(h) {
    // 2.25 -> "2:15"
    const total = Math.round(h * 60);
    const hh = Math.floor(total / 60);
    const mm = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}`;
}
function _huaroFechaISO(d) {
    const dt = (d instanceof Date) ? d : new Date(d + 'T00:00:00');
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function _huaroFechaCorta(iso) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}
function _huaroSumarDias(iso, n) {
    const dt = new Date(iso + 'T00:00:00');
    dt.setDate(dt.getDate() + n);
    return _huaroFechaISO(dt);
}
// Lunes de la semana que contiene `iso` (o hoy si no se pasa nada)
function huaroLunesDeLaSemana(iso) {
    const dt = iso ? new Date(iso + 'T00:00:00') : new Date();
    const dow = (dt.getDay() + 6) % 7; // 0 = lunes
    dt.setDate(dt.getDate() - dow);
    return _huaroFechaISO(dt);
}
function _huaroFechaLargaEs(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
        'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${dt.getDate()} de ${meses[dt.getMonth()]} de ${dt.getFullYear()}`;
}
function _huaroNum(v, dec) {
    const n = parseFloat(v);
    return (isFinite(n) ? n : 0).toFixed(dec == null ? 2 : dec);
}

// ── Parser de TOPOS ──
function huaroParsearTopos(textoTopos, areaHa) {
    const t = (textoTopos == null ? '' : String(textoTopos))
        .replace(/\s+/g, ' ').trim().toUpperCase();
    if (t && HUARO_MAPA_TOPOS[t] != null) return HUARO_MAPA_TOPOS[t];
    // "1 1/2" sin "T", "1.5", "1,5", etc.
    if (t) {
        const frac = t.match(/^(\d+)\s+(\d)\/(\d)/);
        if (frac) return Number(frac[1]) + Number(frac[2]) / Number(frac[3]);
        const half = t.match(/^(\d)\/(\d)/);
        if (half) return Number(half[1]) / Number(half[2]);
        const dec = parseFloat(t.replace(',', '.'));
        if (isFinite(dec) && dec > 0) return dec;
    }
    const a = parseFloat(areaHa) || 0;
    return Math.max(0.5, Math.round((a / HUARO_HA_POR_TOPO) * 2) / 2);
}

// ── Parser de una hoja del padrón Huaro ──
// filas2D: matriz (SheetJS sheet_to_json {header:1}); sheetName: nombre de la hoja.
// Nota: SheetJS descarta la columna A cuando está vacía en todo el rango, así
// que la columna del "N°" no está en un índice fijo — se detecta y el resto
// se toma como desplazamiento relativo (nombre = N°+1, apellidos = N°+2,
// nombres = N°+3, área = N°+4, topos = N°+5, bocatoma = N°+6).
function _huaroNormHdr(v) {
    return String(v == null ? '' : v).toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z0-9]+/g, ' ').trim();
}
function huaroParsearPadronHoja(filas2D, sheetName) {
    const filas = Array.isArray(filas2D) ? filas2D : [];
    let hdr = -1, colNum = -1;
    for (let i = 0; i < Math.min(filas.length, 8) && hdr < 0; i++) {
        const fila = filas[i] || [];
        for (let c = 0; c < fila.length; c++) {
            const n = _huaroNormHdr(fila[c]);
            if (n === 'N' || n === 'N °' || n === 'N°' || n === 'NRO' || n === 'ITEM') { hdr = i; colNum = c; break; }
        }
    }
    if (hdr < 0) { hdr = 1; colNum = 0; } // fallback (SheetJS: N° en col 0, fila 2)

    // Ajuste fino de columnas por encabezado, si se reconocen
    const hSrc = filas[hdr] || [];
    const hRow = [];
    for (let c = 0; c < hSrc.length; c++) hRow[c] = _huaroNormHdr(hSrc[c]);
    const buscar = (...alts) => {
        for (let c = colNum; c < hRow.length; c++) {
            const h = hRow[c] || '';
            if (alts.some(a => h === a || h.indexOf(a) === 0)) return c;
        }
        return -1;
    };
    const cNombre = colNum + 1;
    const cApellidos = colNum + 2;
    const cNombres = colNum + 3;
    let cArea = buscar('AREA'); if (cArea < 0) cArea = colNum + 4;
    let cTopos = buscar('TOPOS', 'TOPO'); if (cTopos < 0) cTopos = colNum + 5;
    let cBoc = buscar('BOCATOMA', 'TOMA', 'CAPTACION'); if (cBoc < 0) cBoc = colNum + 6;

    const usuarios = [];
    let bocatomaDetectada = '';
    for (let i = hdr + 1; i < filas.length; i++) {
        const fila = filas[i] || [];
        const nOrden = Number(fila[colNum]);
        if (!isFinite(nOrden)) continue;

        const apellidos = String(fila[cApellidos] == null ? '' : fila[cApellidos]).replace(/\s+/g, ' ').trim();
        const nombres = String(fila[cNombres] == null ? '' : fila[cNombres]).replace(/\s+/g, ' ').trim();
        const nombreCol = String(fila[cNombre] == null ? '' : fila[cNombre]).replace(/\s+/g, ' ').trim();
        const nombre = nombreCol || (apellidos + ' ' + nombres).replace(/\s+/g, ' ').trim();
        if (!nombre) continue;

        const areaHa = parseFloat(fila[cArea]) || 0;
        const toposTexto = String(fila[cTopos] == null ? '' : fila[cTopos]).replace(/\s+/g, ' ').trim();
        const topos = huaroParsearTopos(toposTexto, areaHa);
        const boc = String(fila[cBoc] == null ? '' : fila[cBoc]).replace(/\s+/g, ' ').trim();
        if (boc && !bocatomaDetectada) bocatomaDetectada = boc;

        usuarios.push({ nOrden, nombre, apellidos, nombres, areaHa, topos, toposTexto });
    }

    const bocatoma = (bocatomaDetectada || String(sheetName || '').replace(/_+$/, '').replace(/\s+/g, ' ').trim() || 'SIN NOMBRE');
    return { bocatoma, usuarios };
}

// clave estable de un usuario dentro de un padrón cargado
function huaroClaveUsuario(u) {
    return u.nOrden + '|' + (u.nombre || '');
}

// ── Programación de una bocatoma para una semana ──
// opts: { usuarios:[...], caudalLs:Number, semanaInicioISO:'YYYY-MM-DD',
//         servidosPrevios:[key], pendientesPrevios:[key], excluidos:[key] }
// Devuelve { programados:[...], pendientes:[...], agregado:{...} }
function huaroProgramarBocatoma(opts) {
    const usuarios = Array.isArray(opts.usuarios) ? opts.usuarios.slice() : [];
    const caudalLs = parseFloat(opts.caudalLs) || 0;
    const semanaInicioISO = opts.semanaInicioISO || huaroLunesDeLaSemana();
    const servidos = new Set(opts.servidosPrevios || []);
    const pendientesPrevios = (opts.pendientesPrevios || []).slice();
    const excluidos = new Set(opts.excluidos || []);

    // Días y horas de riego de la bocatoma esta semana: 7 entradas (0 = lunes …
    // 6 = domingo), cada una { activo, inicioMin, finMin } (minuto del día). El
    // motor coloca los turnos SOLO en los días activos, dentro de su ventana
    // [inicioMin, finMin], en secuencia. Sin `diasRiego` → los 7 días 04:00–20:00
    // (o, por compatibilidad, arranca en inicioDiaOffset/inicioHoraMin).
    const diasRiego = huaroNormalizarDiasRiego(opts.diasRiego, opts.inicioDiaOffset, opts.inicioHoraMin);

    const porClave = {};
    usuarios.forEach(u => { porClave[huaroClaveUsuario(u)] = u; });

    // Cola: pendientes de la semana anterior primero (en su orden), luego el
    // resto en orden de N°, sin repetir y saltando servidos/excluidos.
    const vistos = new Set();
    const cola = [];
    pendientesPrevios.forEach(k => {
        if (excluidos.has(k) || vistos.has(k)) return;
        const u = porClave[k];
        if (u) { cola.push(u); vistos.add(k); }
    });
    usuarios.slice().sort((a, b) => a.nOrden - b.nOrden).forEach(u => {
        const k = huaroClaveUsuario(u);
        if (vistos.has(k) || servidos.has(k) || excluidos.has(k)) return;
        cola.push(u); vistos.add(k);
    });

    const programados = [];
    const pendientes = [];

    // Puntero a la ventana (día) actual: primer día activo.
    let vIdx = 0;
    while (vIdx < 7 && !diasRiego[vIdx].activo) vIdx++;
    let cursorMin = vIdx < 7 ? diasRiego[vIdx].inicioMin : Infinity;

    for (let i = 0; i < cola.length; i++) {
        const u = cola[i];
        const bloqueMin = u.topos * HUARO_H_POR_TOPO * 60;

        // Avanzar a la primera ventana activa donde el turno completo entre.
        while (vIdx < 7) {
            if (!diasRiego[vIdx].activo) {
                vIdx++;
                if (vIdx < 7 && diasRiego[vIdx].activo) cursorMin = diasRiego[vIdx].inicioMin;
                continue;
            }
            if (cursorMin + bloqueMin <= diasRiego[vIdx].finMin) break; // cabe aquí
            vIdx++;
            while (vIdx < 7 && !diasRiego[vIdx].activo) vIdx++;
            if (vIdx < 7) cursorMin = diasRiego[vIdx].inicioMin;
        }

        if (vIdx >= 7) { // no hay más ventanas esta semana
            pendientes.push(huaroClaveUsuario(u));
            continue;
        }

        const dia = vIdx + 1;
        const inicioMin = cursorMin;
        const terminoMin = cursorMin + bloqueMin;
        cursorMin = terminoMin;

        const fechaISO = _huaroSumarDias(semanaInicioISO, dia - 1);
        const tiempoH = u.topos * HUARO_H_POR_TOPO;
        programados.push({
            nOrden: u.nOrden, nombre: u.nombre, apellidos: u.apellidos, nombres: u.nombres,
            areaHa: u.areaHa, topos: u.topos, toposTexto: u.toposTexto,
            dia, fechaISO, nombreDia: HUARO_DIAS_NOMBRE[dia - 1],
            inicioMin, terminoMin,
            inicioTexto: _huaroHHMM(inicioMin), terminoTexto: _huaroHHMM(terminoMin),
            tiempoH,
            volumenM3: caudalLs * tiempoH * 3.6,
        });
    }

    // Renumerar orden de suministro dentro de la semana
    programados.forEach((p, idx) => { p.ordenSuministro = idx + 1; });

    const diasUsados = programados.reduce((mx, p) => Math.max(mx, p.dia), 0);
    const caudalPorDia = new Array(HUARO_DIAS_SEMANA).fill(0);
    programados.forEach(p => { caudalPorDia[p.dia - 1] = caudalLs; });

    const areaProgramadaHa = programados.reduce((s, p) => s + (p.areaHa || 0), 0);
    const toposTotal = programados.reduce((s, p) => s + (p.topos || 0), 0);
    const tiempoTotalH = programados.reduce((s, p) => s + (p.tiempoH || 0), 0);
    const volumenTotalM3 = programados.reduce((s, p) => s + (p.volumenM3 || 0), 0);
    const areaPendienteHa = pendientes.reduce((s, k) => s + ((porClave[k] && porClave[k].areaHa) || 0), 0);

    // Período REAL de operación del canal = del primer turno al último turno
    // programado (lo que también se ve en el G-3). Si no hay nadie programado,
    // cae al primer día/hora activo de diasRiego.
    const primerActivo = diasRiego.findIndex(d => d.activo);
    const pIni = programados[0];
    const pFin = programados[programados.length - 1];
    const periodoInicioISO = pIni ? pIni.fechaISO
        : _huaroSumarDias(semanaInicioISO, primerActivo >= 0 ? primerActivo : 0);
    const periodoInicioHora = pIni ? pIni.inicioTexto
        : _huaroHHMM(primerActivo >= 0 ? diasRiego[primerActivo].inicioMin : HUARO_MIN_INICIO_DIA);
    const periodoFinISO = pFin ? pFin.fechaISO : periodoInicioISO;
    const periodoFinHora = pFin ? pFin.terminoTexto : periodoInicioHora;

    return {
        programados, pendientes,
        agregado: {
            bocatoma: opts.bocatoma || '',
            caudalLs, semanaInicioISO,
            semanaFinISO: _huaroSumarDias(semanaInicioISO, HUARO_DIAS_SEMANA - 1),
            diasRiego,
            periodoInicioISO, periodoInicioHora, periodoFinISO, periodoFinHora,
            nUsuarios: programados.length,
            areaProgramadaHa, toposTotal, tiempoTotalH, volumenTotalM3,
            diasUsados, caudalPorDia,
            nPendientes: pendientes.length, areaPendienteHa,
        },
    };
}

// ════════════════════════ ANEXOS G-2 y G-3 (Huaro) ════════════════════════
// Misma estructura visual que los Anexos G-2 y G-3 oficiales que ya emite el
// sistema para las otras comisiones (formato de la Junta / R.J. 0155-2022-ANA):
//   G-2: agregado por bocatoma — NOMBRE DEL CANAL DE DERIVACIÓN · NOMBRE DE LA
//        TOMA · NOMBRE DEL CANAL DE DISTRIBUCIÓN · N° DE USUARIOS · VOLUMEN DE
//        AGUA PROGRAMADO (m³) · ÁREA BAJO RIEGO (Ha) · TIEMPO DE OPERACIÓN DEL
//        CANAL (HORAS) · PERÍODO (Inicio/Hora/Término/Hora) · CAUDAL PROGRAMADO
//        POR DÍAS (m³/seg) LUN..DOM · OBSERVACIONES · fila TOTAL (con la suma
//        del caudal por día).
//   G-3: detalle POR USUARIO, por bocatoma — N° Orden de suministro · Usuario ·
//        Área (has) · Volumen de Agua Programado (m³) · Programación de la
//        Distribución del agua [Tiempo de Uso (hr) · Caudal a Entregar (m³/s) ·
//        Inicio (Día/Hora) · Término (Día/Hora)] · Observaciones.
// Mapeo Huaro: Canal de Derivación = QUEBRADA HUARO · Nombre de la Toma =
// bocatoma · Canal de Distribución = bocatoma (el canal lleva el nombre del
// bloque de riego). Identidad = Comisión de Regantes de Huaro.

const HUARO_DIAS_ABREV3 = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function _huaroDiaEtiqueta(fechaISO) {
    if (!fechaISO) return '';
    const dt = new Date(fechaISO + 'T00:00:00');
    const dow = (dt.getDay() + 6) % 7; // 0 = lunes
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${HUARO_DIAS_ABREV3[dow]} ${dd}/${mm}`;
}
// Día del calendario (1..31) del día `idx` (0 = lunes … 6 = domingo) de la
// semana que arranca el lunes `semanaInicioISO`. P. ej. semana del 07/09:
// idx 0 → 7, idx 1 → 8 … idx 6 → 13.
function _huaroDiaDelMes(semanaInicioISO, idx) {
    if (!semanaInicioISO) return '';
    const d = new Date(semanaInicioISO + 'T00:00:00');
    d.setDate(d.getDate() + (parseInt(idx, 10) || 0));
    return d.getDate();
}

// ── ANEXO G-2 ──
// datos: { semanaInicioISO, semanaFinISO, mesTexto, filas: [agregado por bocatoma] }
function huaroConstruirG2Html(datos) {
    const th = 'border:1px solid #000;padding:5px;font-weight:700;';
    const th2 = 'border:1px solid #000;padding:4px;font-weight:700;font-size:9px;';
    const td = 'border:1px solid #000;padding:5px;color:#000;';
    const semTxt = 'DEL ' + _huaroFechaCorta(datos.semanaInicioISO) + ' AL ' + _huaroFechaCorta(datos.semanaFinISO);

    let body = '';
    let tU = 0, tVol = 0, tArea = 0, tTiempoMax = 0;
    const tDia = new Array(HUARO_DIAS_SEMANA).fill(0);

    (datos.filas || []).forEach(f => {
        tU += f.nUsuarios; tVol += f.volumenTotalM3; tArea += f.areaProgramadaHa;
        tTiempoMax = Math.max(tTiempoMax, f.tiempoTotalH);
        (f.caudalPorDia || []).forEach((c, i) => { tDia[i] += c; });

        const dias = (f.caudalPorDia || []).map(c =>
            `<td style="${td}text-align:right;">${(c / 1000).toFixed(3)}</td>`).join('');
        const obs = f.nPendientes > 0
            ? `Pendientes: ${f.nPendientes} usuario(s) / ${f.areaPendienteHa.toFixed(2)} ha` : '';
        body += `
        <tr>
            <td style="${td}font-weight:600;">${_huaroEsc(HUARO_FUENTE)}</td>
            <td style="${td}">${_huaroEsc(f.bocatoma)}</td>
            <td style="${td}">${_huaroEsc(huaroCanalBocatoma(f.bocatoma))}</td>
            <td style="${td}text-align:center;">${f.nUsuarios > 0 ? f.nUsuarios : '-'}</td>
            <td style="${td}text-align:right;">${f.volumenTotalM3.toFixed(2)}</td>
            <td style="${td}text-align:right;">${f.areaProgramadaHa.toFixed(2)}</td>
            <td style="${td}text-align:center;">${f.tiempoTotalH.toFixed(1)}</td>
            <td style="${td}text-align:center;font-size:9px;white-space:nowrap;">${_huaroFechaCorta(f.periodoInicioISO || f.semanaInicioISO)}</td>
            <td style="${td}text-align:center;">${f.periodoInicioHora || '04:00'}</td>
            <td style="${td}text-align:center;font-size:9px;white-space:nowrap;">${_huaroFechaCorta(f.periodoFinISO || f.semanaFinISO)}</td>
            <td style="${td}text-align:center;">${f.periodoFinHora || '20:00'}</td>
            ${dias}
            <td style="${td}">${_huaroEsc(obs)}</td>
        </tr>`;
    });
    const totDias = tDia.map(c => `<td style="${td}text-align:right;font-weight:700;">${(c / 1000).toFixed(3)}</td>`).join('');

    return `
    <div style="text-align:center;font-family:Arial,sans-serif;color:#000;font-weight:700;font-size:13px;margin-bottom:8px;">
        ANEXO G2: Programación de Distribución del Agua a nivel de canales de distribución
    </div>
    <div style="font-family:Arial,sans-serif;color:#000;font-size:10px;display:flex;justify-content:space-between;gap:20px;margin:6px 0;">
        <div style="line-height:1.6;">
            <div><strong>AAA:</strong> ${HUARO_AAA}</div>
            <div><strong>ALA:</strong> ${HUARO_ALA}</div>
            <div><strong>Sector Hidráulico:</strong> ${HUARO_JUNTA}</div>
            <div><strong>Subsector Hidráulico:</strong> ${HUARO_COMISION_NOMBRE}</div>
        </div>
        <div style="line-height:1.6;white-space:nowrap;">
            <div><strong>Mes:</strong> ${_huaroEsc(datos.mesTexto || '')}</div>
            <div><strong>Semana:</strong> ${semTxt}</div>
        </div>
    </div>
    <div style="text-align:center;font-family:Arial,sans-serif;color:#000;font-weight:700;font-size:12px;margin:10px 0 4px;">
        ANEXO G2 — BOCATOMAS QUE RIEGAN DE LA ${_huaroEsc(HUARO_FUENTE)}
    </div>
    <div style="overflow-x:auto;">
    <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10px;min-width:1150px;width:100%;">
        <thead>
            <tr style="background:#E6E6E6;color:#000;">
                <th rowspan="2" style="${th}">NOMBRE DEL<br>CANAL DE<br>DERIVACIÓN</th>
                <th rowspan="2" style="${th}">NOMBRE DE<br>LA TOMA</th>
                <th rowspan="2" style="${th}">NOMBRE DEL<br>CANAL DE<br>DISTRIBUCIÓN</th>
                <th rowspan="2" style="${th}">N° DE<br>USUARIOS</th>
                <th rowspan="2" style="${th}">VOLUMEN<br>DE AGUA<br>PROGRAMADO<br>(m³)</th>
                <th rowspan="2" style="${th}">ÁREA<br>BAJO<br>RIEGO<br>(Ha)</th>
                <th rowspan="2" style="${th}">TIEMPO DE<br>OPERACIÓN<br>DEL CANAL<br>(HORAS)</th>
                <th colspan="4" style="${th}">PERÍODO</th>
                <th colspan="7" style="${th}">CAUDAL PROGRAMADO POR DÍAS (m³/seg)</th>
                <th rowspan="2" style="${th}">OBSERVACIONES</th>
            </tr>
            <tr style="background:#E6E6E6;color:#000;">
                <th style="${th2}">INICIO</th><th style="${th2}">HORA</th>
                <th style="${th2}">TÉRMINO</th><th style="${th2}">HORA</th>
                ${HUARO_DIAS_ABREV.map((ab, i) => `<th style="${th2}">${ab}<br>${_huaroDiaDelMes(datos.semanaInicioISO, i)}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${body}
            <tr style="background:#E6E6E6;color:#000;font-weight:bold;">
                <td style="${td}text-align:center;" colspan="3">TOTAL</td>
                <td style="${td}text-align:center;">${tU}</td>
                <td style="${td}text-align:right;">${tVol.toFixed(2)}</td>
                <td style="${td}text-align:right;">${tArea.toFixed(2)}</td>
                <td style="${td}text-align:center;">${tTiempoMax.toFixed(1)}</td>
                <td style="${td}text-align:center;">-</td><td style="${td}text-align:center;">-</td>
                <td style="${td}text-align:center;">-</td><td style="${td}text-align:center;">-</td>
                ${totDias}
                <td style="${td}text-align:center;">-</td>
            </tr>
        </tbody>
    </table>
    </div>`;
}

// ── ANEXO G-3 ──
// datos: { semanaInicioISO, semanaFinISO, mesTexto,
//          bloques: [ { bocatoma, caudalLs, programados:[...], pendientesUsuarios:[...] } ] }
function huaroConstruirG3Html(datos) {
    const th = 'border:1px solid #000;padding:4px 5px;font-weight:700;text-align:center;vertical-align:middle;';
    const td = 'border:1px solid #000;padding:4px 5px;color:#000;';
    const semTxt = 'LUNES ' + _huaroFechaCorta(datos.semanaInicioISO) + ' al DOMINGO ' + _huaroFechaCorta(datos.semanaFinISO);
    const hoy = _huaroFechaCorta(_huaroFechaISO(new Date()));

    const bloquesHtml = (datos.bloques || []).map(bl => {
        const prog = (bl.programados || []).slice().sort((a, b) => (a.dia - b.dia) || (a.inicioMin - b.inicioMin));
        const caudalM3s = (bl.caudalLs || 0) / 1000;
        const pIni = prog[0], pFin = prog[prog.length - 1];
        const periodoTxt = pIni
            ? `${_huaroDiaEtiqueta(pIni.fechaISO)} ${pIni.inicioTexto}  →  ${_huaroDiaEtiqueta(pFin.fechaISO)} ${pFin.terminoTexto}`
            : '—';

        let filas = prog.map((p, i) => `
            <tr>
                <td style="${td}text-align:center;">${i + 1}</td>
                <td style="${td}">${_huaroEsc(p.nombre)}</td>
                <td style="${td}text-align:right;">${(p.areaHa || 0).toFixed(2)}</td>
                <td style="${td}text-align:right;">${(p.volumenM3 || 0).toFixed(2)}</td>
                <td style="${td}text-align:center;">${(p.tiempoH || 0).toFixed(2)}</td>
                <td style="${td}text-align:right;">${caudalM3s.toFixed(4)}</td>
                <td style="${td}text-align:center;white-space:nowrap;">${_huaroDiaEtiqueta(p.fechaISO)}</td>
                <td style="${td}text-align:center;">${p.inicioTexto}</td>
                <td style="${td}text-align:center;white-space:nowrap;">${_huaroDiaEtiqueta(p.fechaISO)}</td>
                <td style="${td}text-align:center;">${p.terminoTexto}</td>
                <td style="${td}"></td>
            </tr>`).join('');
        if (!filas) filas = `<tr><td style="${td}text-align:center;" colspan="11">Sin usuarios programados.</td></tr>`;

        const tArea = prog.reduce((s, p) => s + (p.areaHa || 0), 0);
        const tVol = prog.reduce((s, p) => s + (p.volumenM3 || 0), 0);
        const tTiempo = prog.reduce((s, p) => s + (p.tiempoH || 0), 0);

        const pend = bl.pendientesUsuarios || [];
        const pendHtml = pend.length ? `
            <div style="font-size:9.5px;color:#000;margin:4px 0 16px;">
                <strong>Pendientes para la próxima semana (${pend.length} · ${pend.reduce((s, u) => s + (u.areaHa || 0), 0).toFixed(2)} ha):</strong>
                ${pend.map(u => 'N°' + u.nOrden + ' ' + _huaroEsc(u.nombre)).join(' · ')}
            </div>` : '<div style="margin-bottom:16px;"></div>';

        return `
        <div style="font-family:Arial,sans-serif;color:#000;font-size:10px;margin:12px 0 4px;line-height:1.5;">
            <div><strong>Canal de abastecimiento de agua:</strong> ${_huaroEsc(huaroCanalBocatoma(bl.bocatoma))}</div>
            <div><strong>Caudal:</strong> ${caudalM3s.toFixed(4)} (m³/seg.)</div>
            <div><strong>Período de operación:</strong> ${periodoTxt} &nbsp;·&nbsp; <strong>Tiempo de operación:</strong> ${tTiempo.toFixed(1)} h</div>
        </div>
        <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10px;width:100%;">
            <thead>
                <tr style="background:#E6E6E6;color:#000;">
                    <th rowspan="3" style="${th}">N° Orden<br>de suministro</th>
                    <th rowspan="3" style="${th}">Usuario<br>(nombres y apellidos)</th>
                    <th rowspan="3" style="${th}">Área<br>(has)</th>
                    <th rowspan="3" style="${th}">Volumen de Agua<br>Programado (m³)</th>
                    <th colspan="6" style="${th}">Programación de la Distribución del agua</th>
                    <th rowspan="3" style="${th}">Observaciones</th>
                </tr>
                <tr style="background:#E6E6E6;color:#000;">
                    <th rowspan="2" style="${th}">Tiempo de Uso<br>del Agua (hr)</th>
                    <th rowspan="2" style="${th}">Caudal a<br>Entregar (m³/s)</th>
                    <th colspan="2" style="${th}">Inicio</th>
                    <th colspan="2" style="${th}">Término</th>
                </tr>
                <tr style="background:#E6E6E6;color:#000;">
                    <th style="${th}">Día</th><th style="${th}">Hora</th>
                    <th style="${th}">Día</th><th style="${th}">Hora</th>
                </tr>
            </thead>
            <tbody>
                ${filas}
                <tr style="background:#E6E6E6;color:#000;font-weight:bold;">
                    <td style="${td}text-align:center;" colspan="2">TOTAL</td>
                    <td style="${td}text-align:right;">${tArea.toFixed(2)}</td>
                    <td style="${td}text-align:right;">${tVol.toFixed(2)}</td>
                    <td style="${td}text-align:center;">${tTiempo.toFixed(2)}</td>
                    <td style="${td}text-align:center;" colspan="5">-</td>
                </tr>
            </tbody>
        </table>
        </div>
        ${pendHtml}`;
    }).join('');

    return `
    <div style="text-align:center;font-family:Arial,sans-serif;color:#000;font-weight:700;font-size:13px;margin-bottom:8px;">
        ANEXO G-3: Parte Diario de Distribución de Agua a los Usuarios
    </div>
    <div style="font-family:Arial,sans-serif;color:#000;font-size:10px;margin:6px 0;line-height:1.6;">
        <div><strong>Sector hidráulico:</strong> ${HUARO_JUNTA}</div>
        <div><strong>Subsector hidráulico:</strong> ${HUARO_COMISION_NOMBRE}</div>
        <div><strong>Mes:</strong> ${_huaroEsc(datos.mesTexto || '')}</div>
        <div><strong>Semana:</strong> ${semTxt}</div>
        <div><strong>Fecha:</strong> ${hoy}</div>
    </div>
    ${bloquesHtml}`;
}

// ════════════════════════ ANEXO G-4 (Huaro) — orden individual ════════════════════════
// Fiel al Formato G-4 oficial (R.J. N° 0155-2022-ANA, Anexo G, pág. 97):
// N° · "El Usuario Sr.(a)..." · Nombre del canal · Caudal (l/s) · A partir del
// día/hora hasta el día/hora · Horas total del uso del agua · Volumen de agua a
// entregar (m³) · fecha · firmas (Tomero / Usuario) · Observaciones.
// p: usuario programado (de huaroProgramarBocatoma); ctx: { bocatoma, caudalLs, fechaImpresionISO }
function huaroConstruirG4Html(p, ctx) {
    const caudalLs = parseFloat(ctx.caudalLs) || 0;
    const line = 'border-bottom:1.6px solid #111;display:inline-block;min-width:150px;padding:0 6px;';
    const box = 'display:inline-block;width:11px;height:11px;border:1.5px solid #111;margin-right:8px;vertical-align:middle;';
    return `
    <div style="font-family:Arial,sans-serif;border:2px solid #111;padding:12px 14px;background:#fff;color:#111;page-break-after:always;">
        <div style="text-align:center;">
            <div style="font-weight:800;font-size:13px;letter-spacing:.6px;">ANEXO G</div>
            <div style="font-weight:800;font-size:12px;margin-top:2px;">Formato G-4. Orden de Suministro de Agua</div>
            <div style="font-size:10px;margin-top:2px;">${HUARO_JUNTA} — ${HUARO_COMISION_NOMBRE}</div>
        </div>
        <div style="margin:12px 0 6px;font-size:11px;">N° <span style="${line}min-width:120px;">${p.ordenSuministro != null ? p.ordenSuministro : ''}</span></div>
        <div style="margin:8px 0;font-size:11px;line-height:1.4;">
            El Usuario Sr.(a): <span style="${line}min-width:260px;">${_huaroEsc(p.nombre)}</span>,
            según el Plan de Aprovechamiento de la Disponibilidad Hídrica aprobado, utilizará el agua según el detalle siguiente:
        </div>
        <div style="margin:7px 0;font-size:11px;"><span style="${box}"></span> Nombre del canal: <span style="${line}">${_huaroEsc(ctx.bocatoma)}</span></div>
        <div style="margin:7px 0;font-size:11px;"><span style="${box}"></span> Caudal: <span style="${line}">${caudalLs.toFixed(2)}</span> l/s.</div>
        <div style="margin:7px 0;font-size:11px;">
            <span style="${box}"></span> A partir del día:
            <span style="${line}">${_huaroFechaCorta(p.fechaISO)}</span> hora: <span style="${line}min-width:70px;">${p.inicioTexto}</span>
            hasta el día: <span style="${line}">${_huaroFechaCorta(p.fechaISO)}</span> hora: <span style="${line}min-width:70px;">${p.terminoTexto}</span>
        </div>
        <div style="margin:7px 0;font-size:11px;"><span style="${box}"></span> Horas total del uso del agua: <span style="${line}">${(p.tiempoH || 0).toFixed(2)}</span></div>
        <div style="margin:7px 0;font-size:11px;"><span style="${box}"></span> Volumen de agua a entregar (m³): <span style="${line}">${(p.volumenM3 || 0).toFixed(2)}</span></div>
        <div style="text-align:right;margin-top:24px;font-size:11px;">
            <span style="${line}min-width:220px;">${_huaroFechaLargaEs(ctx.fechaImpresionISO ? new Date(ctx.fechaImpresionISO + 'T00:00:00') : new Date())}</span>
            <div style="margin-top:6px;">Jefe de Subsector Hidráulico</div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:30px;font-size:11px;"><tr>
            <td style="text-align:center;width:50%;padding:0 8px;">
                <div style="border-bottom:1.6px solid #111;width:92%;margin:0 auto;height:22px;"></div>
                <div style="margin-top:8px;font-size:10px;">Entregué conforme — Tomero (firma)</div>
            </td>
            <td style="text-align:center;width:50%;padding:0 8px;">
                <div style="border-bottom:1.6px solid #111;width:92%;margin:0 auto;height:22px;"></div>
                <div style="margin-top:8px;font-size:10px;">Recibí conforme — Usuario (firma)</div>
            </td>
        </tr></table>
        <div style="margin-top:16px;font-size:11px;"><strong>Observaciones:</strong>
            <span style="border-bottom:1.6px solid #111;display:inline-block;min-width:280px;"></span>
            <div style="font-size:9px;color:#444;margin-top:2px;">(Anotar cuando el tiempo y caudal asignados fueron diferentes a lo autorizado, así como el cambio de cultivo)</div>
        </div>
    </div>`;
}

// Envuelve un fragmento en un documento imprimible autónomo (window.open + document.write)
function huaroDocumentoImprimible(titulo, fragmentoHtml, orientacion) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>${_huaroEsc(titulo)}</title>
    <style>
        @page { size: A4 ${orientacion || 'landscape'}; margin: 12mm; }
        body { font-family: Arial, sans-serif; color:#000; margin:0; padding:14px; }
        table { border-collapse: collapse; }
        .barra-print { position:sticky; top:0; background:#003876; padding:8px 12px; margin:-14px -14px 14px; text-align:right; }
        .btn-print { background:#c8a84b; color:#1a1a1a; border:none; padding:8px 18px; border-radius:4px; font-weight:700; cursor:pointer; font-size:13px; }
        @media print { .barra-print { display:none; } }
    </style></head><body>
        <div class="barra-print"><button class="btn-print" onclick="window.print()">🖨️ Imprimir</button></div>
        ${fragmentoHtml}
    </body></html>`;
}

// ── Exponer en window (para pruebas y para el HTML del escritorio) ──
if (typeof window !== 'undefined') {
    window.HuaroCore = {
        HUARO_HA_POR_TOPO, HUARO_H_POR_TOPO, HUARO_DIAS_SEMANA,
        HUARO_JUNTA, HUARO_SUBSECTOR, HUARO_COMISION_NOMBRE, HUARO_FUENTE, HUARO_AAA, HUARO_ALA,
        huaroParsearTopos, huaroParsearPadronHoja, huaroClaveUsuario, huaroMasaDeAgua, huaroNormNombre, HUARO_MASA_AGUA, huaroCanalBocatoma, HUARO_CANAL_BOCATOMA,
        huaroDiasRiegoDefault, huaroNormalizarDiasRiego, huaroResumenDiasRiego, HUARO_MIN_INICIO_DIA, HUARO_MIN_FIN_DIA,
        HUARO_DIAS_NOMBRE, HUARO_DIAS_ABREV,
        huaroProgramarBocatoma, huaroLunesDeLaSemana,
        huaroConstruirG2Html, huaroConstruirG3Html, huaroConstruirG4Html,
        _huaroDiaDelMes,
        huaroDocumentoImprimible,
    };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HUARO_HA_POR_TOPO, HUARO_H_POR_TOPO, HUARO_DIAS_SEMANA,
        HUARO_JUNTA, HUARO_SUBSECTOR, HUARO_COMISION_NOMBRE, HUARO_FUENTE, HUARO_AAA, HUARO_ALA,
        huaroParsearTopos, huaroParsearPadronHoja, huaroClaveUsuario, huaroMasaDeAgua, huaroNormNombre, HUARO_MASA_AGUA, huaroCanalBocatoma, HUARO_CANAL_BOCATOMA,
        huaroDiasRiegoDefault, huaroNormalizarDiasRiego, huaroResumenDiasRiego, HUARO_MIN_INICIO_DIA, HUARO_MIN_FIN_DIA,
        HUARO_DIAS_NOMBRE, HUARO_DIAS_ABREV,
        huaroProgramarBocatoma, huaroLunesDeLaSemana,
        huaroConstruirG2Html, huaroConstruirG3Html, huaroConstruirG4Html,
        _huaroDiaDelMes,
        huaroDocumentoImprimible,
    };
}
