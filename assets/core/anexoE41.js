// ══ Formato E-4.1 — versión HTML/CSS para exportar a PDF ══
// Réplica visual de la hoja Excel que arma construirHojaE41
// (Sistema_Riego_CUSSHMI_14.html) — mismos colores, mismas secciones,
// mismo contenido — pensada para capturarse con html2pdf.js, ya que un
// navegador no puede convertir un workbook ExcelJS a PDF directamente.
//
// El cálculo (curva mensual, demanda, referencia de cultivo) sigue
// viniendo 100% de assets/core/modulosRiego.js — este archivo nunca
// reimplementa esa lógica, solo el ARMADO de las secciones (loop de
// cultivos, suma de la sección 3) se repite en forma de números en vez de
// fórmulas de Excel, ya que un PDF no tiene celdas que recalcular.

const MESES_E41 = ['AGO', 'SET', 'OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL'];

function _tipoRiegoEtiquetaE41(codigo) {
    const mapa = { G: 'GRAVEDAD', A: 'ASPERSIÓN', GT: 'GOTEO', GO: 'GOTEO' };
    const valor = (codigo || '').toString().toUpperCase();
    if (['GRAVEDAD', 'ASPERSIÓN', 'GOTEO', 'OTRO'].includes(valor)) return valor;
    return mapa[valor] || null;
}

// Mismo criterio de sectorista por toma que usa el Excel — SD3 a SD8 va
// Franklin Saúl, el resto Diego Silva.
function _obtenerSectoristaPorTomaE41(tomaNombre) {
    const m = /^SD(\d+(?:\.\d+)?)$/.exec((tomaNombre || '').trim());
    if (m && parseFloat(m[1]) <= 8) return { nombre: 'FRANKLIN SAÚL MORÁN CRUZ', imagenArchivo: 'sello_franklin_saul.jpg' };
    return { nombre: 'DIEGO SILVA', imagenArchivo: 'sello_diego_silva.png' };
}

function _normUCE41Pdf(v) {
    return (v || '').toString().trim().toUpperCase().replace(/\s+/g, '');
}

// Encuentra la fila del padrón A-1 del usuario que se está exportando
// (por unidad catastral, o por nombre si no hay UC) — mismo criterio que
// _emparejarPadronA1E41 en construirHojaE41 (Sistema_Riego_CUSSHMI_14.html).
function _emparejarPadronA1E41Pdf(padronA1Toma, unidadCatastral, nombre) {
    const uc = _normUCE41Pdf(unidadCatastral);
    if (uc) {
        const porUC = padronA1Toma.find((p) => _normUCE41Pdf(p.unidad_catastral) === uc);
        if (porUC) return porUC;
    }
    const nombreNorm = (nombre || '').toString().trim().toUpperCase();
    if (!nombreNorm) return null;
    return padronA1Toma.find((p) => (p.apellidos_nombres || '').toString().trim().toUpperCase() === nombreNorm) || null;
}

// Toma los mismos datos de entrada que construirHojaE41 y devuelve un
// objeto plano con todo lo que necesita el render HTML — números ya
// sumados, sin fórmulas (un PDF no recalcula nada).
function calcularDatosE41(tomaNombre, filasSiembraToma, filasPadronA1Toma, tipoRiegoDominante, usuarioNombre, numeroCorrelativo) {
    const usuarioA1 = (filasSiembraToma.length === 1)
        ? _emparejarPadronA1E41Pdf(filasPadronA1Toma, filasSiembraToma[0].unidad_catastral, filasSiembraToma[0].apellidos_nombres)
        : null;

    // "Área bajo riego" es la de la LICENCIA del usuario que se está
    // exportando (padrón A-1), no un agregado de toda la toma — confirmado
    // explícitamente por el usuario del sistema. Solo cuando el documento
    // junta a más de un usuario se usa el total sumado de la toma.
    const areaBajoRiegoToma = usuarioA1
        ? (parseFloat(usuarioA1.area_bajo_riego_ha) || 0)
        : filasPadronA1Toma.reduce((s, f) => s + (parseFloat(f.area_bajo_riego_ha) || 0), 0);
    const volumenHm3 = filasPadronA1Toma.reduce((s, f) => s + (parseFloat(f.volumen_m3) || 0), 0) / 1e6;
    const claseDerecho = (usuarioA1 && usuarioA1.clase_derecho) || (filasPadronA1Toma.find((f) => f.clase_derecho) || {}).clase_derecho || '-';
    const numeroResolucion = (usuarioA1 && usuarioA1.numero_resolucion) || (filasPadronA1Toma.find((f) => f.numero_resolucion) || {}).numero_resolucion || '';
    const unidadCatastral = usuarioA1 ? (usuarioA1.unidad_catastral || '') : '';
    // Si el padrón no trae el canal de derivación real, se usa "PRINCIPAL
    // TOMA <nombre>" como texto por defecto (pedido explícito) en vez de
    // dejarlo en blanco.
    const canalSecundario = (usuarioA1 && usuarioA1.canal_derivacion) || ('PRINCIPAL TOMA ' + tomaNombre);
    const tipoRiegoEtiqueta = _tipoRiegoEtiquetaE41(tipoRiegoDominante);

    const areaPorCultivo = new Map();
    filasSiembraToma.forEach((reg) => {
        (Array.isArray(reg.cultivos) ? reg.cultivos : []).forEach((c) => {
            const nombre = (c.cultivo || '').toString().trim();
            const area = parseFloat(c.area) || 0;
            if (!nombre || area <= 0) return;
            areaPorCultivo.set(nombre, (areaPorCultivo.get(nombre) || 0) + area);
        });
    });

    let areaTotalCultivos = 0;
    let demandaTotalHm3 = 0;
    let hayCultivosSinReferencia = false;
    const anioSiembra = 2026;
    const filasDIS = [];
    const filasCultivoAprobado = [];
    Array.from(areaPorCultivo.entries()).forEach(([cultivo, area]) => {
        const ref = obtenerReferenciaCultivo(cultivo);
        areaTotalCultivos += area;
        if (ref) {
            const cosecha = calcularFechaCosecha(ref.siembraDia, ref.siembraMes, anioSiembra, ref.periodoMeses);
            const demanda = calcularDemandaHm3(ref, area);
            demandaTotalHm3 += demanda;
            filasDIS.push({
                cultivo, area,
                fechaSiembra: { d: ref.siembraDia, m: ref.siembraMes, a: anioSiembra },
                periodoMeses: ref.periodoMeses,
                fechaCosecha: cosecha,
            });
            filasCultivoAprobado.push({ cultivo, area, moduloM3Ha: ref.moduloM3Ha, demanda, ref });
        } else {
            hayCultivosSinReferencia = true;
            filasDIS.push({ cultivo, area, fechaSiembra: null, periodoMeses: null, fechaCosecha: null });
            filasCultivoAprobado.push({ cultivo, area, moduloM3Ha: null, demanda: 0, ref: null });
        }
    });

    // Sección 3 — mismo reparto por coeficiente de curva mensual que usa
    // construirHojaE41 (ver ese archivo para la nota de verificación
    // contra la hoja SD3 real), acá como números ya sumados.
    const superficiePorMes = new Array(12).fill(0);
    const filasSinCurva = [];
    filasCultivoAprobado.forEach((f) => {
        if (!f.ref) return;
        const curva = obtenerCurvaMensual(f.cultivo);
        if (!curva) { filasSinCurva.push(f); return; }
        const total = curva.reduce((s, v) => s + v, 0);
        if (total <= 0) { filasSinCurva.push(f); return; }
        curva.forEach((v, m) => {
            if (v <= 0) return;
            superficiePorMes[m] += (v / total) * f.demanda;
        });
    });
    if (filasSinCurva.length) {
        const sumaFlat = filasSinCurva.reduce((s, f) => s + f.demanda, 0) / 12;
        for (let m = 0; m < 12; m++) superficiePorMes[m] += sumaFlat;
    }
    const subterraneaPorMes = new Array(12).fill(0);
    const demandaNetaPorMes = superficiePorMes.map((v, m) => v + subterraneaPorMes[m]);
    const m3segPorMes = demandaNetaPorMes.map((v) => (v * 1e6) / (7 * 24 * 3600));
    const demandaBrutaPorMes = demandaNetaPorMes.map((v) => v / 0.7);
    const sum = (arr) => arr.reduce((s, v) => s + v, 0);

    return {
        tomaNombre, usuarioNombre, numeroCorrelativo,
        areaBajoRiegoToma, volumenHm3, claseDerecho, numeroResolucion, unidadCatastral, canalSecundario, tipoRiegoEtiqueta,
        bloque: (typeof obtenerBloqueDeToma === 'function' ? obtenerBloqueDeToma(tomaNombre) : null) || '—',
        filasDIS, filasCultivoAprobado, areaTotalCultivos, demandaTotalHm3, hayCultivosSinReferencia,
        seccion3: {
            diasPorMes: [31, 30, 31, 30, 31, 31, 28, 31, 30, 31, 30, 31],
            superficiePorMes, subterraneaPorMes, demandaNetaPorMes, m3segPorMes, demandaBrutaPorMes,
            totalSuperficie: sum(superficiePorMes), totalSubterranea: sum(subterraneaPorMes),
            totalDemandaNeta: sum(demandaNetaPorMes), totalDemandaBruta: sum(demandaBrutaPorMes),
        },
        sectorista: _obtenerSectoristaPorTomaE41(tomaNombre),
    };
}

function _estilosAnexoE41() {
    return `
    <style>
        .e41-pagina { width: 780px; font-family: Arial, sans-serif; color: #000; background: #fff; padding: 14px; box-sizing: border-box; }
        .e41-pagina table { border-collapse: collapse; width: 100%; }
        .e41-pagina td, .e41-pagina th { border: 1px solid #000; padding: 3px 5px; font-size: 10px; vertical-align: middle; }
        .e41-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .e41-header img { height: 36px; }
        .e41-header .e41-titulo { text-align: center; flex: 1; }
        .e41-titulo h1 { font-size: 14px; margin: 0; }
        .e41-titulo h2 { font-size: 14px; margin: 2px 0; }
        .e41-titulo h3 { font-size: 13px; margin: 0; font-weight: bold; }
        .e41-info { display: flex; justify-content: space-between; font-size: 11px; margin: 3px 0; }
        .e41-info span:first-child { width: 49%; }
        .e41-fila-op { display: flex; align-items: center; gap: 14px; font-size: 11px; margin: 8px 0 2px; }
        .e41-fila-op b { font-size: 11px; }
        .e41-casilla { display: inline-block; width: 16px; height: 16px; border: 1px solid #000; text-align: center; line-height: 16px; margin-left: 4px; }
        .e41-nota-marcar { font-size: 10px; font-style: italic; margin: 0 0 8px; }
        .e41-recepcion { display: flex; gap: 20px; align-items: center; font-size: 11px; font-weight: bold; margin: 8px 0; }
        .e41-nombre { border: 1px solid #000; padding: 4px 6px; font-size: 11px; font-weight: bold; margin: 8px 0; }
        .e41-barra { display: flex; background: #9DC3E6; font-weight: bold; font-size: 12px; margin: 8px 0 4px; }
        .e41-barra div { padding: 3px 6px; }
        .e41-barra div:first-child { width: 40%; }
        .e41-linea2 { display: flex; font-size: 11px; margin-bottom: 8px; gap: 14px; }
        .e41-linea2 span { flex: 1; }
        .e41-gris th { background: #D9D9D9; font-size: 10px; }
        .e41-centrado { text-align: center; }
        .e41-izq { text-align: left; }
        .e41-total-fila td { background: #FFF2CC; font-weight: bold; text-align: center; }
        .e41-titulo-seccion { text-align: center; font-weight: bold; font-size: 12px; margin: 10px 0 4px; }
        .e41-aviso { font-style: italic; font-size: 11px; color: #C00000; margin: 6px 0; }
        .e41-tabla-3 td { font-size: 9px; text-align: center; padding: 2px 3px; }
        .e41-tabla-3 td.e41-izq { text-align: left; }
        .e41-tabla-3 .e41-bruta { color: #C00000; }
        .e41-firma-wrap { text-align: center; margin: 26px 0 4px; position: relative; }
        .e41-firma-wrap img { max-height: 110px; }
        .e41-linea-firma { border-top: 1px solid #000; width: 220px; margin: 4px auto 0; }
        .e41-nota { font-style: italic; font-size: 10px; color: #666; margin-top: 8px; }
        .e41-sello { float: right; max-height: 75px; margin-top: -6px; }
    </style>`;
}

// `rutaImagenes`: prefijo relativo a assets/img/e41/ desde donde se llama
// (ej. 'assets/img/e41/' en escritorio). Devuelve solo el HTML de UNA
// página (sin el bloque <style>) — para exportar varias tomas en un solo
// PDF, se llama una vez por toma y se antepone _estilosAnexoE41() una
// sola vez (ver exportarFormatoE41PDF).
function _construirAnexoE41Pagina(datos, rutaImagenes) {
    const d = datos;
    const fmt2 = (n) => (Number(n) || 0).toFixed(2);
    const fmt3 = (n) => (Number(n) || 0).toFixed(3);
    const fecha = new Date().toLocaleDateString('es-PE');

    const filasDisHtml = d.filasDIS.map((f) => {
        const fs = f.fechaSiembra ? (f.fechaSiembra.d + '/' + f.fechaSiembra.m + '/' + f.fechaSiembra.a) : '—';
        const per = f.periodoMeses != null ? f.periodoMeses : '—';
        const fc = f.fechaCosecha ? (f.fechaCosecha.dia + '/' + f.fechaCosecha.mes + '/' + f.fechaCosecha.anio) : '—';
        return '<tr>' +
            '<td class="e41-izq">' + escapeHtml(f.cultivo) + '</td>' +
            '<td class="e41-centrado">' + fmt2(f.area) + '</td>' +
            '<td class="e41-centrado">' + fs + '</td>' +
            '<td class="e41-centrado">' + per + '</td>' +
            '<td class="e41-centrado">' + fmt2(f.area) + '</td>' +
            '<td class="e41-centrado">' + fs + '</td>' +
            '<td class="e41-centrado">' + per + '</td>' +
            '<td class="e41-centrado">' + fc + '</td>' +
            '</tr>';
    }).join('');

    const filasAprobadoHtml = d.filasCultivoAprobado.map((f) => (
        '<tr><td class="e41-izq">' + escapeHtml(f.cultivo) + '</td><td class="e41-centrado">' + fmt2(f.area) +
        '</td><td class="e41-centrado">' + (f.moduloM3Ha || 'SIN REFERENCIA') + '</td><td class="e41-centrado">' + fmt2(f.demanda) + '</td></tr>'
    )).join('');

    const s3 = d.seccion3;
    const filaSeccion3 = (etiqueta, valores, total, resaltado, esBruta) => (
        '<tr' + (resaltado ? ' style="font-weight:bold;"' : '') + '>' +
        '<td class="e41-izq">' + etiqueta + '</td>' +
        valores.map((v) => '<td class="' + (esBruta ? 'e41-bruta' : '') + '">' + fmt2(v) + '</td>').join('') +
        '<td class="' + (esBruta ? 'e41-bruta' : '') + '">' + (total === null ? '-' : fmt2(total)) + '</td>' +
        '</tr>'
    );

    return `
    <div class="e41-pagina">
        <div class="e41-header">
            <img src="${rutaImagenes}logo_midagri.jpg" alt="MIDAGRI">
            <div class="e41-titulo">
                <h1>AUTORIDAD NACIONAL DEL AGUA</h1>
                <h2>Formato E-4.1. Demanda de Agua del Usuario</h2>
                <h3>PERIODO AÑO 2026 - 2027</h3>
            </div>
            <img src="${rutaImagenes}logo_ana.jpg" alt="ANA">
        </div>

        <div class="e41-info">
            <span>Autoridad Administrativa del Agua: Jequetepeque Zarumilla V</span>
            <span>Operador de Infraestructura Hidráulica: Junta de Usuarios Chira</span>
        </div>
        <div class="e41-info">
            <span>Administración Local de Agua: Chira</span>
            <span>Sector Hidráulico: Menor - Chira</span>
        </div>
        <div class="e41-info">
            <span>Unidad Hidrográfica: 138</span>
            <span>Subsector Hidráulico: Margen Izquierda</span>
        </div>

        <div class="e41-fila-op">
            <b>Operador:</b><span class="e41-casilla">X</span>
            <b style="margin-left:20px;">Usuario con sistema de abastecimiento de agua propio:</b><span class="e41-casilla"></span>
        </div>
        <div class="e41-nota-marcar">() Marcar con una X según corresponda.</div>

        <div class="e41-recepcion">
            <span>FECHA DE RECEPCIÓN &nbsp; ${fecha}</span>
            <span>N° &nbsp; ${String(d.numeroCorrelativo).padStart(3, '0')}</span>
        </div>

        <div class="e41-nombre">NOMBRE - RAZÓN SOCIAL DEL USUARIO DE AGUA: ${escapeHtml(d.usuarioNombre)}</div>

        <div class="e41-barra">
            <div>1) USUARIO: AGRARIO</div>
            <div>TOMA - SECTOR: ${escapeHtml(d.tomaNombre)}</div>
        </div>
        <div class="e41-linea2">
            <span>Unidad catastral: ${escapeHtml(d.unidadCatastral || '—')}</span>
            <span>Área bajo riego (ha): ${fmt2(d.areaBajoRiegoToma)}</span>
            <span>Canal Secundario: ${escapeHtml(d.canalSecundario || '—')}</span>
            <span>Nombre del bloque de riego: ${escapeHtml(d.bloque)}</span>
        </div>

        <table class="e41-gris">
            <tr>
                <th colspan="2">FUENTE DE AGUA</th>
                <th colspan="3">ASIGNACIÓN</th>
                <th colspan="9">TIPO DE RIEGO (MARCAR CON X)</th>
            </tr>
            <tr>
                <th>TIPO</th><th>NOMBRE</th><th>CLASE DE DERECHO<br>DE USO DE AGUA</th><th>RESOLUCIÓN<br>ADMINISTRATIVA</th><th>VOLUMEN<br>(Hm³)</th>
                <th colspan="9"></th>
            </tr>
            <tr>
                <td>SUPERFICIAL</td><td>Rio Chira</td><td class="e41-centrado">${escapeHtml(d.claseDerecho)}</td><td class="e41-centrado">${escapeHtml(d.numeroResolucion || '—')}</td><td class="e41-centrado">${fmt3(d.volumenHm3)}</td>
                <td colspan="7">GRAVEDAD</td><td colspan="2" class="e41-centrado">${(d.tipoRiegoEtiqueta === 'GRAVEDAD') ? 'X' : ''}</td>
            </tr>
            <tr>
                <td>SUBTERRÁNEA</td><td></td><td></td><td></td><td></td>
                <td colspan="7">ASPERSIÓN</td><td colspan="2" class="e41-centrado">${(d.tipoRiegoEtiqueta === 'ASPERSIÓN') ? 'X' : ''}</td>
            </tr>
            <tr>
                <td class="e41-centrado">TOTAL</td><td></td><td></td><td></td><td class="e41-centrado" style="background:#FFF2CC; font-weight:bold;">${fmt3(d.volumenHm3)}</td>
                <td colspan="7">GOTEO</td><td colspan="2" class="e41-centrado">${(d.tipoRiegoEtiqueta === 'GOTEO') ? 'X' : ''}</td>
            </tr>
            <tr>
                <td colspan="5"></td>
                <td colspan="7">OTRO:</td><td colspan="2" class="e41-centrado">${(d.tipoRiegoEtiqueta === 'OTRO') ? 'X' : ''}</td>
            </tr>
        </table>

        <div class="e41-titulo-seccion">DECLARACIÓN DE INTENCIÓN DE SIEMBRA</div>
        <table class="e41-gris">
            <tr><th colspan="4">PARA SER LLENADO POR EL USUARIO DECLARANTE</th><th colspan="4">PARA SER LLENADO POR EL OPERADOR HIDRÁULICO</th></tr>
            <tr><th colspan="4">DECLARACIÓN DE INTENCIÓN DE SIEMBRA [DIS]</th><th colspan="4">PLAN DE CULTIVO APROBADO [PC]</th></tr>
            <tr>
                <th>CULTIVO / VARIEDAD</th><th>ÁREA [ha]</th><th>FECHA SIEMBRA (d/m/a)</th><th>PERÍODO<br>VEGETATIVO<br>(MES)</th>
                <th>ÁREA [ha]</th><th>FECHA SIEMBRA (d/m/a)</th><th>PERÍODO<br>VEGETATIVO<br>(MES)</th><th>FECHA COSECHA (d/m/a)</th>
            </tr>
            ${filasDisHtml}
            <tr class="e41-total-fila"><td>TOTAL</td><td>${fmt2(d.areaTotalCultivos)}</td><td colspan="2"></td><td>${fmt2(d.areaTotalCultivos)}</td><td colspan="3"></td></tr>
        </table>

        <table style="margin-top:8px;">
            <tr>
                <td style="width:60%; vertical-align:top; padding:0; border:none;">
                    <table class="e41-gris">
                        <tr><th>CULTIVO APROBADO</th><th>ÁREA [ha]</th><th>MÓDULO RIEGO [m³/ha]</th><th>DEMANDA DE AGUA [hm³]</th></tr>
                        ${filasAprobadoHtml}
                        <tr class="e41-total-fila"><td>TOTAL</td><td>${fmt2(d.areaTotalCultivos)}</td><td></td><td>${fmt2(d.demandaTotalHm3)}</td></tr>
                    </table>
                </td>
                <td style="width:40%; border:none; text-align:center; vertical-align:middle;">
                    <img class="e41-sello" src="${rutaImagenes}${d.sectorista.imagenArchivo}" alt="Sello sectorista">
                </td>
            </tr>
        </table>

        ${d.hayCultivosSinReferencia ? '<div class="e41-aviso">⚠️ Hay cultivos declarados sin módulo de riego de referencia — revisar y completar manualmente.</div>' : ''}

        <div class="e41-titulo-seccion">3) VOLUMEN DE AGUA TOTAL AUTORIZADO (Hm³) / USUARIO AGRARIO O USUARIO NO AGRARIO</div>
        <table class="e41-tabla-3">
            <tr class="e41-gris"><th>TIPO DE FUENTE</th>${MESES_E41.map((m) => '<th>' + m + '</th>').join('')}<th>VOLUMEN TOTAL<br>AUTORIZADO (hm³)</th></tr>
            ${filaSeccion3('SUPERFICIAL (Hm³)', s3.superficiePorMes, s3.totalSuperficie, false, false)}
            ${filaSeccion3('SUBTERRÁNEA (Hm³)', s3.subterraneaPorMes, s3.totalSubterranea, false, false)}
            ${filaSeccion3('TOTAL (Hm³) Demanda neta', s3.demandaNetaPorMes, s3.totalDemandaNeta, true, false)}
            ${filaSeccion3('TOTAL (m³/seg/sem)', s3.m3segPorMes, null, false, false)}
            ${filaSeccion3('TOTAL (Hm³) Demanda Bruta', s3.demandaBrutaPorMes, s3.totalDemandaBruta, true, true)}
        </table>

        <div class="e41-firma-wrap">
            <img src="${rutaImagenes}firma_joseph_reyes.jpg" alt="Firma">
            <div class="e41-linea-firma"></div>
            <div style="font-size:10px; margin-top:2px;">Aprobado por Jefe de Sub Sector de la CUSSHMI</div>
            <div style="font-size:11px; font-weight:bold;">Ing. Joseph Junior Reyes Mauricio</div>
        </div>
    </div>`;
}
