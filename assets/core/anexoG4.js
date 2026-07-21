// ══ Núcleo compartido — Anexo G-4 (formato RJ), versión de datos limpios ══
// Adaptación de la plantilla visual de mostrarAnexoG4RJDesdeG3() en
// Sistema_Riego_CUSSHMI_14.html (misma estructura HTML/CSS, ".g4-*"), pero
// sin raspar el DOM: recibe los valores ya calculados (los mismos que hoy
// vienen de usuarios_g3_seleccionados tras la Fase 3) en vez de leer
// inputs. El escritorio NO usa este archivo — su propia función sigue
// intacta y sigue siendo la fuente del formato oficial; esta es una
// implementación paralela para el visor móvil, alimentada por los mismos
// datos ya persistidos.

// _formatearFechaLargaEs: ver assets/core/utilidades.js (movida ahí al
// aparecer un segundo consumidor real, reporteCondicion.js).

function _formatearFechaCortaEs(fecha) {
    const f = (fecha instanceof Date) ? fecha : new Date(fecha);
    if (!(f instanceof Date) || isNaN(f.getTime())) return '';
    const dd = String(f.getDate()).padStart(2,'0');
    const mm = String(f.getMonth()+1).padStart(2,'0');
    const yy = f.getFullYear();
    return `${dd}/${mm}/${yy}`;
}

function _formatearHoraHHMM(fecha) {
    const f = (fecha instanceof Date) ? fecha : new Date(fecha);
    if (!(f instanceof Date) || isNaN(f.getTime())) return '';
    const hh = String(f.getHours()).padStart(2,'0');
    const mm = String(f.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
}

// CSS del formulario oficial — idéntico al bloque ".g4-*" que ya usa el
// escritorio (Sistema_Riego_CUSSHMI_14.html, dentro de mostrarAnexoG4RJDesdeG3),
// menos las reglas de impresión en hoja A4 con 2 formularios por página
// (@page/.g4-sheet) que no aplican al visor de un solo usuario en el móvil.
function estilosAnexoG4RJ() {
    return `
        .g4-form{font-family:Arial,sans-serif;border:2px solid #111;padding:10px 12px;box-sizing:border-box;background:#fff;color:#111;}
        .g4-title{display:grid;grid-template-columns:44px 1fr;align-items:center;gap:10px;margin-bottom:8px}
        .g4-title-left{display:flex;align-items:flex-start;justify-content:flex-start}
        .g4-title-center{text-align:center}
        .g4-logo{width:40px;height:40px;object-fit:contain}
        .g4-row{margin:6px 0;font-size:11px}
        .g4-parrafo{margin:10px 0 10px 0;font-size:11px;line-height:1.35}
        .g4-item{margin:7px 0;font-size:11px;line-height:1.35}
        .g4-box{display:inline-block;width:11px;height:11px;border:1.5px solid #111;margin-right:8px;vertical-align:middle}
        .g4-line{border-bottom:1.6px solid #111;display:inline-block;min-width:140px;height:14px;vertical-align:baseline}
        .g4-fill{padding:0 6px;min-width:160px}
        .g4-firma-fecha{display:flex;justify-content:flex-end;margin-top:10px;font-size:11px}
        .g4-firmas{display:flex;justify-content:space-between;gap:18px;margin-top:14px;font-size:11px}
        .g4-firma{flex:1;text-align:center}
        .g4-firma-label{margin-top:6px;font-size:10px}
        .g4-obs{margin-top:14px;font-size:11px}
        .g4-obs-note{margin-top:6px;font-size:10px;color:#333}
    `;
}

// datos: { usuario, canal, caudalLs, horasTotal, volumenEntregar,
//          dtIni, dtTer (Date), fechaImpresion (Date), logoSrc }
// Devuelve el HTML de un solo formulario ".g4-form" — mismo contenido y
// estructura que un formulario individual del escritorio.
function construirAnexoG4RJHtml(datos) {
    const usuario = (datos.usuario || '').toString();
    const canal = (datos.canal || '').toString();
    const caudalLs = Number.isFinite(datos.caudalLs) ? datos.caudalLs : 0;
    const horasTotal = Number.isFinite(datos.horasTotal) ? datos.horasTotal : 0;
    const volumenEntregar = Number.isFinite(datos.volumenEntregar) ? datos.volumenEntregar : 0;
    const logoHtml = datos.logoSrc ? `<img class="g4-logo" src="${datos.logoSrc}" alt="Logo comisión">` : '';

    return `
        <div class="g4-form">
            <div class="g4-title">
                <div class="g4-title-left">${logoHtml}</div>
                <div class="g4-title-center">
                    <div style="font-weight:800;font-size:13px;letter-spacing:.6px;">ANEXO G-4</div>
                    <div style="font-weight:800;font-size:12px;margin-top:2px;">ORDEN DE SUMINISTRO DE AGUA</div>
                </div>
            </div>

            <div class="g4-parrafo">
                El usuario Sr.(a): <span class="g4-line g4-fill">${usuario}</span>
                según el Plan de Aprovechamiento de la Disponibilidad Hídrica aprobado, utilizará el agua según el detalle siguiente:
            </div>

            <div class="g4-item"><span class="g4-box"></span> Nombre del canal: <span class="g4-line g4-fill">${canal}</span></div>
            <div class="g4-item"><span class="g4-box"></span> Caudal: <span class="g4-line g4-fill">${caudalLs.toFixed(2)}</span> l/s</div>
            <div class="g4-item">
                <span class="g4-box"></span> A partir del día:
                <span class="g4-line g4-fill">${_formatearFechaCortaEs(datos.dtIni)}</span>
                hora: <span class="g4-line g4-fill">${_formatearHoraHHMM(datos.dtIni)}</span>
                hasta el día: <span class="g4-line g4-fill">${_formatearFechaCortaEs(datos.dtTer)}</span>
                Hora: <span class="g4-line g4-fill">${_formatearHoraHHMM(datos.dtTer)}</span>
            </div>
            <div class="g4-item"><span class="g4-box"></span> Horas total de uso del agua: <span class="g4-line g4-fill">${horasTotal.toFixed(2)}</span></div>
            <div class="g4-item"><span class="g4-box"></span> Volumen de agua a entregar (m³): <span class="g4-line g4-fill">${volumenEntregar.toFixed(2)}</span></div>

            <div class="g4-firma-fecha">
                <div class="g4-line" style="min-width:220px;">${_formatearFechaLargaEs(datos.fechaImpresion)}</div>
            </div>

            <div class="g4-firmas">
                <div class="g4-firma">
                    <div class="g4-line" style="min-width:220px;"></div>
                    <div class="g4-firma-label">Jefe de Subsector Hidráulico</div>
                </div>
            </div>

            <div class="g4-firmas">
                <div class="g4-firma">
                    <div class="g4-line" style="min-width:220px;"></div>
                    <div class="g4-firma-label">Entregué conforme — Tomero (firma)</div>
                </div>
                <div class="g4-firma">
                    <div class="g4-line" style="min-width:220px;"></div>
                    <div class="g4-firma-label">Recibí conforme — Usuario (firma)</div>
                </div>
            </div>

            <div class="g4-obs">
                <div><strong>Observaciones:</strong> <span class="g4-line" style="display:inline-block;min-width:260px;"></span></div>
                <div class="g4-obs-note">
                    (Anotar cuando, tiempo y caudal asignados fueron diferentes a lo autorizado, así como el cambio de cultivo)
                </div>
            </div>
        </div>
    `;
}

// item: { usuario, canal, caudalLs, inicioTxt, terminoTxt, horasTotal, volumenM3 }
// Copiado tal cual de _textoWhatsAppG4() en el escritorio — función pura,
// sin cambios.
function _textoWhatsAppG4(item) {
    const usuario = item?.usuario || '-';
    const canal = item?.canal || '';
    const codigo = item?.codigo || '';
    const caudal = (typeof item?.caudalLs === 'number' && isFinite(item.caudalLs)) ? item.caudalLs.toFixed(2) : '';
    const ini = item?.inicioTxt || '';
    const ter = item?.terminoTxt || '';
    const horas = (typeof item?.horasTotal === 'number' && isFinite(item.horasTotal)) ? item.horasTotal.toFixed(2) : '';
    const vol = (typeof item?.volumenM3 === 'number' && isFinite(item.volumenM3)) ? item.volumenM3.toFixed(2) : '';

    return `ANEXO G-4 (Orden de Suministro de Agua)\n` +
        `N°: ${codigo}\n` +
        `Usuario: ${usuario}\n` +
        (canal ? `Canal: ${canal}\n` : '') +
        (caudal ? `Caudal: ${caudal} lts/s\n` : '') +
        (ini ? `Inicio: ${ini}\n` : '') +
        (ter ? `Término: ${ter}\n` : '') +
        (horas ? `Horas: ${horas} hr\n` : '') +
        (vol ? `Volumen: ${vol} m³\n` : '') +
        `\nNota: Adjuntar el PDF del Anexo G-4. De recepcionar el mensaje debe escribir el mensaje recepcionado.`;
}

// Copiado tal cual de _nombreArchivoG4() en el escritorio — función pura,
// sin cambios.
function _nombreArchivoG4(codigo, usuario) {
    const base = (usuario ?? '').toString().trim() || 'USUARIO';
    const safe = base
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const cod = (codigo ?? '').toString().trim();
    return cod ? `G4 - ${cod} - ${safe}` : `G4 - ${safe}`;
}
