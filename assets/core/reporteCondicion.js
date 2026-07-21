// ══ Núcleo compartido — Reporte de Condición del Usuario (móvil) ══
// Plantillas puras (sin DOM, sin Supabase) para el reporte imprimible/
// compartible del módulo "Condición del Usuario" — mismo espíritu que
// assets/core/anexoG4.js: reciben datos ya calculados y devuelven HTML,
// nada de lógica de negocio nueva (la clasificación apto/no-apto sigue
// siendo esUsuarioApto/debeExcluirse de assets/core/clasificacion.js).
//
// "CON DERECHO" / "SIN DERECHO" es la misma terminología que ya usa el
// escritorio (Sistema_Riego_CUSSHMI_14.html, "HOJA 1: USUARIOS CON
// DERECHO..." / "HOJA 2: USUARIOS SIN DERECHO...") para apto/no-apto.

// Deliberadamente sin CSS grid ni flexbox: este HTML lo captura
// html2canvas (vía html2pdf) para generar el PDF en el celular, y esa
// librería tiene limitaciones conocidas con grid/flexbox — el contenido
// puede salir fuera de su recuadro o la captura completa salir en blanco.
// <table> es la maquetación que html2canvas renderiza de forma confiable
// (mismo criterio aplicado en assets/core/anexoG4.js).
function estilosReporteCondicion() {
    return `
        .rc-doc{font-family:Arial,sans-serif;border:2px solid #111;padding:14px 16px;box-sizing:border-box;background:#fff;color:#111;}
        .rc-header-table{width:100%;border-collapse:collapse;margin-bottom:10px;border-bottom:1.5px solid #111;padding-bottom:8px;}
        .rc-header-table td{padding:0 0 8px;vertical-align:middle;}
        .rc-header-table .rc-logo-cell{width:44px;}
        .rc-logo{width:40px;height:40px;object-fit:contain}
        .rc-header-titulo{font-weight:800;font-size:13px;letter-spacing:.4px;}
        .rc-header-sub{font-size:10.5px;color:#333;margin-top:2px;}
        .rc-meta{font-size:10.5px;color:#333;margin:8px 0 12px;line-height:1.5;}
        .rc-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:800;font-size:10.5px;letter-spacing:.4px;}
        .rc-badge.con{background:#1e7e34;color:#fff;}
        .rc-badge.sin{background:#c0392b;color:#fff;}
        .rc-nombre{font-size:15px;font-weight:800;margin:2px 0;}
        .rc-tabla{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:8px;}
        .rc-tabla th{background:#f0f0f0;text-align:left;padding:5px 6px;border:1px solid #ccc;font-size:9.5px;text-transform:uppercase;letter-spacing:.3px;}
        .rc-tabla td{padding:5px 6px;border:1px solid #ddd;}
        .rc-tabla tr{page-break-inside:avoid;}
        .rc-deuda-total{color:#b30000;font-weight:800;}
        .rc-resumen-table{width:100%;border-collapse:collapse;margin:10px 0;font-size:10.5px;}
        .rc-resumen-table td{padding:0 14px 0 0;}
        .rc-resumen-table b{font-size:13px;display:block;}
        .rc-footer{margin-top:12px;font-size:9px;color:#555;text-align:right;}
        .rc-cultivos{font-size:10.5px;margin-top:6px;}
        .rc-cultivos li{margin:2px 0;}
    `;
}

// filtroTexto: 'con' | 'sin' | '' (todos) -> etiqueta en español
function _etiquetaFiltroCondicion(filtroTexto) {
    if (filtroTexto === 'con') return 'CON DERECHO';
    if (filtroTexto === 'sin') return 'SIN DERECHO';
    return 'TODOS';
}

// datos: { nombre, tomaNombre, unidadCatastral, cultivos:[{cultivo,area}],
//          deudaCampana, deudaAtrasada, deudaConvenio, deudaTotal,
//          condicion:{excluido,apto}, deudaMax, comisionNombre,
//          fechaImpresion (Date), logoSrc }
function construirReporteUsuarioHtml(datos) {
    const nombre = (datos.nombre || '-').toString();
    const badgeClase = datos.condicion.excluido || !datos.condicion.apto ? 'sin' : 'con';
    const badgeTexto = datos.condicion.excluido ? 'SIN CULTIVO REGISTRADO' : (datos.condicion.apto ? 'CON DERECHO' : 'SIN DERECHO');
    const logoHtml = datos.logoSrc ? `<img class="rc-logo" src="${datos.logoSrc}" alt="Logo comisión">` : '';
    const cultivos = datos.cultivos || [];
    const cultivosHtml = cultivos.length
        ? `<ul class="rc-cultivos">${cultivos.map((c) => `<li>${(c.cultivo || '-')} — ${(parseFloat(c.area) || 0).toFixed(2)} ha</li>`).join('')}</ul>`
        : `<div class="rc-cultivos">Sin cultivos registrados</div>`;

    return `
        <div class="rc-doc">
            <table class="rc-header-table"><tr>
                <td class="rc-logo-cell">${logoHtml}</td>
                <td>
                    <div class="rc-header-titulo">${datos.comisionNombre || 'COMISIÓN DE USUARIOS'}</div>
                    <div class="rc-header-sub">REPORTE DE CONDICIÓN DEL USUARIO</div>
                </td>
            </tr></table>

            <div class="rc-nombre">${nombre}</div>
            <div class="rc-meta">
                Toma ${datos.tomaNombre || '-'}${datos.unidadCatastral ? ' · U.C. ' + datos.unidadCatastral : ''}<br>
                Deuda máxima permitida considerada: S/ ${(parseFloat(datos.deudaMax) || 0).toFixed(2)}
            </div>
            <span class="rc-badge ${badgeClase}">${badgeTexto}</span>

            <table class="rc-tabla">
                <thead><tr><th>Deuda campaña</th><th>Deuda atrasada</th><th>Deuda convenio</th><th>Deuda total</th></tr></thead>
                <tbody>
                    <tr>
                        <td>S/ ${(parseFloat(datos.deudaCampana) || 0).toFixed(2)}</td>
                        <td>S/ ${(parseFloat(datos.deudaAtrasada) || 0).toFixed(2)}</td>
                        <td>S/ ${(parseFloat(datos.deudaConvenio) || 0).toFixed(2)}</td>
                        <td class="rc-deuda-total">S/ ${(parseFloat(datos.deudaTotal) || 0).toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>

            ${cultivosHtml}

            <div class="rc-footer">Generado el ${_formatearFechaLargaEs(datos.fechaImpresion)}</div>
        </div>
    `;
}

// datos: { tomaNombre, filtroTexto ('con'|'sin'|''), deudaMax,
//          comisionNombre, fechaImpresion (Date), logoSrc,
//          filas:[{nombre, unidadCatastral, cultivos, deudaTotal, condicion:{excluido,apto}}] }
function construirReporteTomaHtml(datos) {
    const filas = datos.filas || [];
    const etiquetaFiltro = _etiquetaFiltroCondicion(datos.filtroTexto);
    const logoHtml = datos.logoSrc ? `<img class="rc-logo" src="${datos.logoSrc}" alt="Logo comisión">` : '';
    const deudaTotalSuma = filas.reduce((acc, f) => acc + (parseFloat(f.deudaTotal) || 0), 0);

    const filasHtml = filas.map((f) => {
        const badgeClase = f.condicion.excluido || !f.condicion.apto ? 'sin' : 'con';
        const badgeTexto = f.condicion.excluido ? 'SIN CULTIVO' : (f.condicion.apto ? 'CON DERECHO' : 'SIN DERECHO');
        const cultivosTexto = (f.cultivos || []).map((c) => c.cultivo).filter(Boolean).join(', ') || '-';
        return `
            <tr>
                <td>${f.nombre || '-'}</td>
                <td>${f.unidadCatastral || '-'}</td>
                <td>${cultivosTexto}</td>
                <td>S/ ${(parseFloat(f.deudaTotal) || 0).toFixed(2)}</td>
                <td><span class="rc-badge ${badgeClase}">${badgeTexto}</span></td>
            </tr>
        `;
    }).join('');

    return `
        <div class="rc-doc">
            <table class="rc-header-table"><tr>
                <td class="rc-logo-cell">${logoHtml}</td>
                <td>
                    <div class="rc-header-titulo">${datos.comisionNombre || 'COMISIÓN DE USUARIOS'}</div>
                    <div class="rc-header-sub">REPORTE DE CONDICIÓN DEL USUARIO — TOMA ${datos.tomaNombre || '-'} — ${etiquetaFiltro}</div>
                </td>
            </tr></table>

            <table class="rc-resumen-table"><tr>
                <td><b>${filas.length}</b>usuarios</td>
                <td><b class="rc-deuda-total">S/ ${deudaTotalSuma.toFixed(2)}</b>deuda total</td>
                <td><b>S/ ${(parseFloat(datos.deudaMax) || 0).toFixed(2)}</b>deuda máxima considerada</td>
            </tr></table>

            <table class="rc-tabla">
                <thead><tr><th>Nombre</th><th>U. Catastral</th><th>Cultivos</th><th>Deuda total</th><th>Condición</th></tr></thead>
                <tbody>${filasHtml || '<tr><td colspan="5">Sin usuarios en este filtro.</td></tr>'}</tbody>
            </table>

            <div class="rc-footer">Generado el ${_formatearFechaLargaEs(datos.fechaImpresion)}</div>
        </div>
    `;
}

// datos: { nombre, tomaNombre, condicionTexto, deudaTotal }
function _textoWhatsAppReporteUsuario(datos) {
    const nombre = datos.nombre || '-';
    const toma = datos.tomaNombre || '';
    const condicion = datos.condicionTexto || '';
    const deuda = (typeof datos.deudaTotal === 'number' && isFinite(datos.deudaTotal)) ? datos.deudaTotal.toFixed(2) : '';
    return `REPORTE DE CONDICIÓN DEL USUARIO\n` +
        `Usuario: ${nombre}\n` +
        (toma ? `Toma: ${toma}\n` : '') +
        (condicion ? `Condición: ${condicion}\n` : '') +
        (deuda ? `Deuda total: S/ ${deuda}\n` : '') +
        `\nNota: Adjuntar el PDF del reporte. De recepcionar el mensaje debe escribir el mensaje recepcionado.`;
}

// datos: { tomaNombre, filtroTexto, cantidad }
function _textoWhatsAppReporteToma(datos) {
    const toma = datos.tomaNombre || '-';
    const etiqueta = _etiquetaFiltroCondicion(datos.filtroTexto);
    const cantidad = Number.isFinite(datos.cantidad) ? datos.cantidad : 0;
    return `REPORTE DE CONDICIÓN DEL USUARIO\n` +
        `Toma: ${toma}\n` +
        `Filtro: ${etiqueta}\n` +
        `Usuarios: ${cantidad}\n` +
        `\nNota: Adjuntar el PDF del reporte.`;
}

// Mismo saneo de nombre de archivo que _nombreArchivoG4() en
// assets/core/anexoG4.js — evita caracteres inválidos en el sistema de
// archivos del celular.
function _nombreArchivoReporteCondicion(base) {
    const safe = (base ?? '').toString().trim()
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return 'Condicion - ' + (safe || 'REPORTE');
}
