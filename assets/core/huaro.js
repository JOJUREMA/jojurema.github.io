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
    let dia = 1;
    let cursorMin = HUARO_MIN_INICIO_DIA;
    let sobrepasoSemana = false;

    for (let i = 0; i < cola.length; i++) {
        const u = cola[i];
        const bloqueMin = u.topos * HUARO_H_POR_TOPO * 60;

        if (!sobrepasoSemana && cursorMin + bloqueMin > HUARO_MIN_FIN_DIA) {
            dia++;
            cursorMin = HUARO_MIN_INICIO_DIA;
        }
        if (sobrepasoSemana || dia > HUARO_DIAS_SEMANA || bloqueMin > (HUARO_MIN_FIN_DIA - HUARO_MIN_INICIO_DIA)) {
            // no cabe esta semana (o un bloque imposible de encajar en un día)
            sobrepasoSemana = sobrepasoSemana || dia > HUARO_DIAS_SEMANA;
            pendientes.push(huaroClaveUsuario(u));
            continue;
        }

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

    return {
        programados, pendientes,
        agregado: {
            bocatoma: opts.bocatoma || '',
            caudalLs, semanaInicioISO,
            semanaFinISO: _huaroSumarDias(semanaInicioISO, HUARO_DIAS_SEMANA - 1),
            nUsuarios: programados.length,
            areaProgramadaHa, toposTotal, tiempoTotalH, volumenTotalM3,
            diasUsados, caudalPorDia,
            nPendientes: pendientes.length, areaPendienteHa,
        },
    };
}

// ════════════════════════ ANEXO G-2 / G-3 (Huaro) ════════════════════════
// Fiel a los formatos oficiales del Anexo G de la R.J. N° 0155-2022-ANA
// (Formato G-2, pág. 95 / Formato G-3, pág. 96). AMBOS comparten exactamente
// las mismas 19 columnas — no se agrega ninguna que no esté en el documento
// oficial. Diferencia entre G-2 y G-3: el título y el bloque de encabezado.
//
// Columnas oficiales (en este orden):
//   1 Nombre del Canal de Derivación
//   2 Nombre de la Toma
//   3 Nombre del Canal de Distribución
//   4 N° de Usuarios
//   5 Volumen de Agua Programado (m³)
//   6 Área Bajo Riego a atender (Ha)
//   7 Tiempo de Operación del canal (horas)
//   8-11 Periodo: Inicio | Hora | Término | Hora
//   12-18 Caudal programado por días (l/seg): 1..7
//   19 Observaciones
//   + fila TOTAL
//
// Mapeo Huaro → columnas oficiales:
//   Canal de Derivación = QUEBRADA HUARO (única fuente, por gravedad)
//   Nombre de la Toma    = bocatoma
//   Canal de Distribución = (vacío — Huaro no tiene canal de distribución)
//   El resto son agregados por bocatoma calculados por huaroProgramarBocatoma.
//   El caudal asignado (l/s) de la bocatoma va en las 7 columnas de "Caudal
//   programado por días" (l/seg) en los días que riega, tal cual el formato.

function _huaroTablaGOficialHtml(filas) {
    const th = 'border:1px solid #000;padding:4px 5px;font-weight:700;';
    const td = 'border:1px solid #000;padding:4px 5px;color:#000;';
    let body = '';
    let tU = 0, tVol = 0, tArea = 0, tTiempo = 0, tPend = 0, tAreaPend = 0;

    (filas || []).forEach(f => {
        tU += f.nUsuarios; tVol += f.volumenTotalM3; tArea += f.areaProgramadaHa;
        tTiempo += f.tiempoTotalH; tPend += f.nPendientes; tAreaPend += f.areaPendienteHa;

        const dias = (f.caudalPorDia || []).map(c =>
            `<td style="${td}text-align:right;">${c > 0 ? c.toFixed(2) : '-'}</td>`).join('');
        const obs = f.nPendientes > 0
            ? `Pendientes: ${f.nPendientes} usuario(s) / ${f.areaPendienteHa.toFixed(2)} ha`
            : '';
        body += `
        <tr>
            <td style="${td}">${_huaroEsc(HUARO_FUENTE)}</td>
            <td style="${td}">${_huaroEsc(f.bocatoma)}</td>
            <td style="${td}"></td>
            <td style="${td}text-align:center;">${f.nUsuarios > 0 ? f.nUsuarios : '-'}</td>
            <td style="${td}text-align:right;">${f.volumenTotalM3.toFixed(2)}</td>
            <td style="${td}text-align:right;">${f.areaProgramadaHa.toFixed(2)}</td>
            <td style="${td}text-align:center;">${f.tiempoTotalH.toFixed(1)}</td>
            <td style="${td}text-align:center;font-size:9px;white-space:nowrap;">${_huaroFechaCorta(f.semanaInicioISO)}</td>
            <td style="${td}text-align:center;">04:00</td>
            <td style="${td}text-align:center;font-size:9px;white-space:nowrap;">${_huaroFechaCorta(f.semanaFinISO)}</td>
            <td style="${td}text-align:center;">20:00</td>
            ${dias}
            <td style="${td}">${_huaroEsc(obs)}</td>
        </tr>`;
    });

    return `
    <div style="overflow-x:auto;">
    <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:10px;min-width:1150px;width:100%;">
        <thead>
            <tr style="background:#E6E6E6;color:#000;">
                <th rowspan="2" style="${th}">Nombre del Canal<br>de Derivación</th>
                <th rowspan="2" style="${th}">Nombre de<br>la Toma</th>
                <th rowspan="2" style="${th}">Nombre del Canal<br>de Distribución</th>
                <th rowspan="2" style="${th}">N° de<br>Usuarios</th>
                <th rowspan="2" style="${th}">Volumen de Agua<br>Programado (m³)</th>
                <th rowspan="2" style="${th}">Área Bajo Riego<br>a atender (Ha)</th>
                <th rowspan="2" style="${th}">Tiempo de Operación<br>del canal (horas)</th>
                <th colspan="4" style="${th}">Periodo</th>
                <th colspan="7" style="${th}">Caudal programado por días (l/seg)</th>
                <th rowspan="2" style="${th}">Observaciones</th>
            </tr>
            <tr style="background:#E6E6E6;color:#000;">
                <th style="${th}font-size:9px;">Inicio</th>
                <th style="${th}font-size:9px;">Hora</th>
                <th style="${th}font-size:9px;">Término</th>
                <th style="${th}font-size:9px;">Hora</th>
                <th style="${th}font-size:9px;">1</th><th style="${th}font-size:9px;">2</th>
                <th style="${th}font-size:9px;">3</th><th style="${th}font-size:9px;">4</th>
                <th style="${th}font-size:9px;">5</th><th style="${th}font-size:9px;">6</th>
                <th style="${th}font-size:9px;">7</th>
            </tr>
        </thead>
        <tbody>
            ${body}
            <tr style="background:#E6E6E6;color:#000;font-weight:bold;">
                <td style="${td}text-align:center;" colspan="3">TOTAL</td>
                <td style="${td}text-align:center;">${tU}</td>
                <td style="${td}text-align:right;">${tVol.toFixed(2)}</td>
                <td style="${td}text-align:right;">${tArea.toFixed(2)}</td>
                <td style="${td}text-align:center;">${tTiempo.toFixed(1)}</td>
                <td style="${td}text-align:center;" colspan="4">-</td>
                <td style="${td}text-align:center;" colspan="7">-</td>
                <td style="${td}">${tPend > 0 ? 'Pendientes totales: ' + tPend + ' / ' + tAreaPend.toFixed(2) + ' ha' : ''}</td>
            </tr>
        </tbody>
    </table>
    </div>`;
}

// datos: { semanaInicioISO, semanaFinISO, mesTexto, filas: [agregado por bocatoma] }
function huaroConstruirG2Html(datos) {
    const per = _huaroFechaCorta(datos.semanaInicioISO) + ' al ' + _huaroFechaCorta(datos.semanaFinISO);
    return `
    <div style="text-align:center;font-family:Arial,sans-serif;color:#000;">
        <div style="font-weight:800;font-size:14px;letter-spacing:.5px;">ANEXO G</div>
        <div style="font-weight:700;font-size:11px;margin-top:2px;">Formato G-2: Programación de Distribución del Agua a Nivel de Canales de Distribución</div>
    </div>
    <div style="font-family:Arial,sans-serif;color:#000;font-size:10px;margin:8px 0;line-height:1.5;">
        <div><strong>AAA:</strong> ${HUARO_AAA}</div>
        <div><strong>ALA:</strong> ${HUARO_ALA}</div>
        <div><strong>Sub Sector Hidráulico:</strong> ${HUARO_SUBSECTOR}</div>
        <div><strong>Periodo:</strong> ${per}</div>
    </div>
    ${_huaroTablaGOficialHtml(datos.filas)}`;
}

// datos: { semanaInicioISO, semanaFinISO, mesTexto, filas: [agregado por bocatoma] }
function huaroConstruirG3Html(datos) {
    const per = _huaroFechaCorta(datos.semanaInicioISO) + ' al ' + _huaroFechaCorta(datos.semanaFinISO);
    return `
    <div style="text-align:center;font-family:Arial,sans-serif;color:#000;">
        <div style="font-weight:800;font-size:14px;letter-spacing:.5px;">ANEXO G</div>
        <div style="font-weight:700;font-size:11px;margin-top:2px;">Formato G-3: Parte diario de Distribución de Agua a los Usuarios</div>
    </div>
    <div style="font-family:Arial,sans-serif;color:#000;font-size:10px;margin:8px 0;line-height:1.5;">
        <div><strong>Sector hidráulico:</strong> ${HUARO_JUNTA}</div>
        <div><strong>Subsector hidráulico:</strong> ${HUARO_SUBSECTOR}</div>
        <div><strong>Canal de abastecimiento de agua:</strong> ${HUARO_FUENTE}</div>
        <div><strong>Mes:</strong> ${_huaroEsc(datos.mesTexto || '')}</div>
        <div><strong>PERIODO:</strong> ${per}</div>
        <div><strong>Caudal (l/seg.):</strong> _______</div>
    </div>
    ${_huaroTablaGOficialHtml(datos.filas)}`;
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
        huaroParsearTopos, huaroParsearPadronHoja, huaroClaveUsuario,
        huaroProgramarBocatoma, huaroLunesDeLaSemana,
        huaroConstruirG2Html, huaroConstruirG3Html, huaroConstruirG4Html,
        huaroDocumentoImprimible,
    };
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HUARO_HA_POR_TOPO, HUARO_H_POR_TOPO, HUARO_DIAS_SEMANA,
        HUARO_JUNTA, HUARO_SUBSECTOR, HUARO_COMISION_NOMBRE, HUARO_FUENTE, HUARO_AAA, HUARO_ALA,
        huaroParsearTopos, huaroParsearPadronHoja, huaroClaveUsuario,
        huaroProgramarBocatoma, huaroLunesDeLaSemana,
        huaroConstruirG2Html, huaroConstruirG3Html, huaroConstruirG4Html,
        huaroDocumentoImprimible,
    };
}
