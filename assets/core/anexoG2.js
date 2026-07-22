// ══ Núcleo compartido — Anexo G2 (datos + constructores de tabla) ══
// Extraído de Sistema_Riego_CUSSHMI_14.html (Fase 0 de la PWA), sin cambiar
// su comportamiento. Cargado tanto por el escritorio como por la futura
// versión móvil.
//
// Único ajuste respecto al original: generarDatosAnexoG2() ya no lee
// document.getElementById('tomaSelect') internamente (esa función vive solo
// en el escritorio). En su lugar recibe `ordenTomasDesktop`, un array con
// los nombres de toma en el mismo orden en que aparecen las <option> del
// desplegable "Seleccionar Toma" — se usa únicamente como respaldo de orden
// para tomas que no estén en ORDEN_FIJO_CANAL_SUR. El escritorio construye
// ese array a partir del DOM antes de llamar a esta función; si se omite
// (p. ej. desde el móvil, que no tiene ese desplegable), el respaldo de
// orden simplemente no aplica — mismo comportamiento que antes cuando el
// elemento no existía en el DOM.
function generarDatosAnexoG2(ordenTomasDesktop) {
    if (consolidadoDemandas.length === 0) {
        alert('No hay datos en el consolidado para generar el Anexo G2');
        return null;
    }

    datosAnexoG2 = [];
    let item = 1;

    // Mapeo de tomas a canales de derivación
    const mapeoCanales = {
        'SD3': 'SD3', 'SI3': 'SI3', 'SD4': 'SD4', 'SI4': 'SI4',
        'SD5': 'SD5', 'SI5': 'SI5', 'SD6': 'SD6', 'SD7': 'SD7',
        'SD8': 'SD8', 'SD8.1': 'SD8.1', 'SI6': 'SI.6', 'SD9': 'SD9',
        'SD10': 'SD10', 'SD11': 'SD11', 'SI7': 'SI 7', 'SD12': 'SD12',
        'SD12.1': 'SD12.1', 'SD13': 'SD13', 'SD14': 'SD14', 'SD14.1': 'SD14.I',
        'AGROAURORA': 'AGROAURORA', 'EL LOBO': 'EL LOBO',
        'SIFON TAPIA 13+652': 'SIFON TAPIA 13+652',
        'SIFON PALOMINO SD10': 'SIFON PALOMINO SD10',
        'SIFON HERRERA SI7': 'SIFON HERRERA SI7'
    };

    // Procesar cada toma del consolidado
    consolidadoDemandas.forEach(toma => {
        const nombreToma = toma.toma;
        const canalDerivacion = mapeoCanales[nombreToma] || nombreToma;

        // ✅ N° DE USUARIOS: debe ser exactamente la cantidad de usuarios PROGRAMADOS para riego
        // esta semana (los que efectivamente aparecen en el Anexo G-3), no el padrón completo de
        // usuarios registrados en la toma. Se cuenta desde la MISMA fuente que usa el Anexo G-3
        // para generar sus filas: la selección guardada por cultivo (window.usuariosG3).
        // window.usuariosG3[toma|cultivo] es la fuente que se sincroniza con Supabase (ver
        // agregarNoAptoProgramadoAUsuariosG3 y guardarEnConsolidadoDemandasIndividualConProgramacion),
        // e incluye tanto aptos seleccionados como no aptos agregados manualmente
        // (programadoNoApto:true) — se separan por esa etiqueta, igual que en el Anexo G-3.
        let numUsuariosAptos = 0;
        let numUsuariosNoAptos = 0;
        const noAptosYaContados = []; // {cultivo, nombre, area} — para no duplicar contra usuariosProgramados
        (toma.cultivos || []).forEach(cultObj => {
            const seleccionados = (typeof obtenerUsuariosG3Seleccionados === 'function')
                ? (obtenerUsuariosG3Seleccionados(toma.toma, cultObj.cultivo) || [])
                : [];
            seleccionados.forEach(u => {
                if (u.programadoNoApto || u.esNoApto) {
                    numUsuariosNoAptos++;
                    noAptosYaContados.push({
                        cultivo: (cultObj.cultivo || '').toUpperCase(),
                        nombre: (u.nombre || '-').toString(),
                        area: parseFloat(u.area) || 0,
                    });
                } else {
                    numUsuariosAptos++;
                }
            });
        });

        // usuariosProgramados es memoria de sesión (no se sincroniza con Supabase) — se
        // suman aquí solo los que no hayan quedado ya contados arriba, por si algún no
        // apto se agregó en esta sesión pero aún no se refleja en window.usuariosG3.
        const programadosGlobal = usuariosProgramados || [];
        programadosGlobal.forEach(u => {
            const tomaUsuario = (u._tomaOrigen || u.toma || '').toString().trim().toUpperCase();
            const tomaActual = nombreToma.toString().trim().toUpperCase();
            const perteneceATomasActual = tomaUsuario === tomaActual ||
                tomaUsuario.includes(tomaActual) || tomaActual.includes(tomaUsuario);
            if (!perteneceATomasActual) return;

            const areaU = parseFloat(u.area1 || u.area || 0);
            const cultivoU = (u.cultivo1 || u.cultivo || '').toUpperCase();
            const yaContado = noAptosYaContados.some(nc =>
                nc.cultivo === cultivoU && nc.nombre === (u.nombre || '-').toString() && Math.abs(nc.area - areaU) < 0.001
            );
            if (!yaContado) numUsuariosNoAptos++;
        });

        console.log(`   Usuarios no aptos programados encontrados: ${numUsuariosNoAptos}`);

        // Total de usuarios beneficiados
        const totalUsuarios = numUsuariosAptos + numUsuariosNoAptos;

        // Debug en consola
        console.log(`Toma ${nombreToma}: Aptos=${numUsuariosAptos}, No Aptos Programados=${numUsuariosNoAptos}, Total=${totalUsuarios}`);

        // Determinar qué volumen usar: programado (si existe) o original
        const tieneProgramacion = toma.programacion && toma.programacion.diasProgramados > 0;

        // turnoToma = lo confirmado en "HORAS DE RIEGO POR DÍA" (caudal × horas × 3600 por
        // día, sumado) — es la MISMA fuente que ya usa el Anexo G-3 para su TOTAL de volumen
        // (ver el escalado por cultivo en mostrarAnexoG3), así que usándola acá el G2 y el G3
        // siempre coinciden en el mismo número.
        const turnoToma = window.turnosDeRiego && window.turnosDeRiego[nombreToma];

        // Calcular totales de la toma
        const volumenOriginal = toma.totalVolCorregido; // Vol. autorizado: derecho de agua de 7 días (área × módulo ÷ eficiencia)
        // ✅ Vol. programado: el que realmente se confirmó en "HORAS DE RIEGO POR DÍA", mismo
        // valor que ya usa el Anexo G-3 como su TOTAL de volumen. Si por alguna razón esa
        // programación no existe todavía (turno no generado), se usa el autorizado como
        // respaldo — mismo comportamiento que antes en ese caso.
        const volumenProgramado = (turnoToma && Number.isFinite(turnoToma.volumenProgramado) && turnoToma.volumenProgramado > 0)
            ? turnoToma.volumenProgramado
            : toma.totalVolCorregido;
        const areaTotal = toma.totalArea;

        // Calcular caudal ajustado según la programación
        let caudalAjustado;
        let diasOperacion = 7;
        let caudalesPorDia = {};

        if (tieneProgramacion) {
            // Usar los caudales programados por día
            diasOperacion = toma.programacion.diasProgramados;
            caudalesPorDia = toma.programacion.caudalesPorDia;

            // Calcular caudal promedio para el G2
            const caudalTotal = Object.values(caudalesPorDia).reduce((sum, c) => sum + c, 0);
            caudalAjustado = parseFloat((caudalTotal / diasOperacion).toFixed(3)); // Promedio ponderado
        } else {
            // Sin programación: distribuir equitativamente en 7 días
            caudalAjustado = toma.totalQTeorico;
            const caudalPorDia = parseFloat((volumenOriginal / (7 * 86400)).toFixed(3));
            caudalesPorDia = {
                lunes: caudalPorDia, martes: caudalPorDia, miercoles: caudalPorDia,
                jueves: caudalPorDia, viernes: caudalPorDia, sabado: caudalPorDia, domingo: caudalPorDia
            };
        }

        // ── Calcular Inicio y Término reales del período (08:00 AM del primer día programado
        //    y término = último día activo + las horas asignadas a ese día; si hay días sin
        //    riego en medio (ej. lunes, miércoles, viernes), esos días NO suman al término,
        //    igual que el salto automático de día en el Anexo G-3) ──
        // (turnoToma ya se calculó arriba, antes de determinar volumenProgramado)
        const diasSemanaClaves = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
        let primerDiaOffset = 0;
        let ultimoDiaOffset = 6;
        let horasUltimoDia = 24;
        // ✅ Tiempo de Operación del Canal = duración real del período operativo (suma de las
        // horas de cada día efectivamente programado), NO la suma de horas de uso por usuario
        // ni días×24 asumiendo jornadas completas.
        let tiempoOperacionReal = diasOperacion * 24; // valor por defecto si no hay programación detallada
        if (turnoToma && turnoToma.distribucionDias) {
            const activos = diasSemanaClaves.map((k, i) => turnoToma.distribucionDias[k] ? i : null).filter(i => i !== null);
            if (activos.length > 0) {
                primerDiaOffset = activos[0];
                ultimoDiaOffset = activos[activos.length - 1];
                const claveUltimo = diasSemanaClaves[ultimoDiaOffset];
                const infoUltimo = turnoToma.caudalesPorDiaDetallado ? turnoToma.caudalesPorDiaDetallado[claveUltimo] : null;
                horasUltimoDia = infoUltimo ? (parseFloat(infoUltimo.horas) || 24) : 24;

                tiempoOperacionReal = activos.reduce((suma, offset) => {
                    const clave = diasSemanaClaves[offset];
                    const info = turnoToma.caudalesPorDiaDetallado ? turnoToma.caudalesPorDiaDetallado[clave] : null;
                    return suma + (info ? (parseFloat(info.horas) || 0) : 24);
                }, 0);
            }
        }
        const fechaInicioDT = toma.semanaInicio ? new Date(toma.semanaInicio + 'T08:00:00') : new Date();
        fechaInicioDT.setDate(fechaInicioDT.getDate() + primerDiaOffset);

        const fechaTerminoDT = toma.semanaInicio ? new Date(toma.semanaInicio + 'T08:00:00') : new Date();
        fechaTerminoDT.setDate(fechaTerminoDT.getDate() + ultimoDiaOffset);
        fechaTerminoDT.setTime(fechaTerminoDT.getTime() + horasUltimoDia * 60 * 60 * 1000);

        const fmtFechaCorta = (d) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
        const fmtHora = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':00';

        // Generar fila para el Anexo G2
        const TOMAS_RIO_CHIRA = ['AGROAURORA', 'EL LOBO'];
        const esRioChira = TOMAS_RIO_CHIRA.includes(nombreToma.toString().trim().toUpperCase());
        const filaG2 = {
            item: item,
            canalPrincipal: esRioChira ? 'RIO CHIRA' : 'CANAL SUR',
            nombreCanalDerivacion: canalDerivacion,
            nombreToma: nombreToma,
            // Las tomas del Río Chira (AGROAURORA, EL LOBO) no tienen canal de distribución
            nombreCanalDistribucion: esRioChira ? '' : ('Canal principal ' + nombreToma),
            numUsuarios: totalUsuarios,
            numUsuariosAptos: numUsuariosAptos,
            numUsuariosNoAptos: numUsuariosNoAptos,
            // VOLÚMENES: Programado (usado) y Original (referencia)
            volumenProgramado: volumenProgramado, // Este es el que se muestra en el G2
            volumenOriginal: volumenOriginal, // Referencia de 7 días
            tieneProgramacion: tieneProgramacion,
            diferenciaVolumen: tieneProgramacion ? (volumenProgramado - volumenOriginal) : 0,
            areaRiego: areaTotal,
            tiempoOperacion: tiempoOperacionReal, // Duración real del período operativo (no suma de tiempos por usuario)
            caudalAjustado: caudalAjustado,
            periodoInicio: fmtFechaCorta(fechaInicioDT),
            periodoInicioHora: fmtHora(fechaInicioDT),
            periodoFin: fmtFechaCorta(fechaTerminoDT),
            periodoFinHora: fmtHora(fechaTerminoDT),
            // CAUDALES POR DÍA INDIVIDUALES desde la programación (0 si no está programado)
            // CAUDALES POR DÍA INDIVIDUALES - VERIFICAR MÚLTIPLES POSIBLES CLAVES
            lunes: caudalesPorDia.lunes || caudalesPorDia.Lunes || 0,
            martes: caudalesPorDia.martes || caudalesPorDia.Martes || 0,
            miercoles: caudalesPorDia.miercoles || caudalesPorDia['miércoles'] || caudalesPorDia['Miércoles'] || 0,
            jueves: caudalesPorDia.jueves || caudalesPorDia.Jueves || 0,
            viernes: caudalesPorDia.viernes || caudalesPorDia.Viernes || 0,
            sabado: caudalesPorDia.sabado || caudalesPorDia['sábado'] || caudalesPorDia['Sábado'] || 0,
            domingo: caudalesPorDia.domingo || caudalesPorDia.Domingo || 0,
            diasOperacion: diasOperacion
        };

        datosAnexoG2.push(filaG2);
        item++;
    });

    // Orden fijo de las tomas del Canal Sur, confirmado por el usuario
    // (coincide con el orden físico de las tomas a lo largo del canal,
    // sifones incluidos en su posición real), sin importar en qué orden
    // se fueron confirmando las programaciones.
    const ORDEN_FIJO_CANAL_SUR = [
        'SD3', 'SI3', 'SD4', 'SI4', 'SD5', 'SI5', 'SD6', 'SD7',
        'SIFON TAPIA 13+652', 'SD8', 'SD8.1', 'SI6', 'SD9', 'SD10',
        'SIFON PALOMINO SD10', 'SD11', 'SI7', 'SD12', 'SIFON HERRERA SI7',
        'SD12.1', 'SD13', 'SD14', 'SD14.1'
    ];
    const ordenFijo = {};
    ORDEN_FIJO_CANAL_SUR.forEach((n, idx) => { ordenFijo[n.toUpperCase()] = idx; });

    // Respaldo: orden del desplegable "Seleccionar Toma" (pasado por el llamador),
    // solo para tomas que no estén en la lista fija de arriba (p. ej. tomas nuevas).
    const ordenTomaSelect = {};
    (ordenTomasDesktop || []).forEach((nombre, idx) => {
        if (nombre && nombre !== 'CONSOLIDADO') {
            ordenTomaSelect[nombre.toString().trim().toUpperCase()] = idx;
        }
    });

    // AGROAURORA y EL LOBO siempre van al final de la relación
    const nombresAlFinal = ['AGROAURORA', 'EL LOBO'];
    datosAnexoG2.sort((a, b) => {
        const aAlFinal = nombresAlFinal.some(n => (a.nombreToma || '').toString().trim().toUpperCase().includes(n));
        const bAlFinal = nombresAlFinal.some(n => (b.nombreToma || '').toString().trim().toUpperCase().includes(n));
        if (aAlFinal && !bAlFinal) return 1;
        if (!aAlFinal && bAlFinal) return -1;
        if (aAlFinal && bAlFinal) return 0;
        const nombreA = (a.nombreToma || '').toString().trim().toUpperCase();
        const nombreB = (b.nombreToma || '').toString().trim().toUpperCase();
        const idxA = ordenFijo[nombreA] !== undefined ? ordenFijo[nombreA] : ordenTomaSelect[nombreA];
        const idxB = ordenFijo[nombreB] !== undefined ? ordenFijo[nombreB] : ordenTomaSelect[nombreB];
        if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
        if (idxA !== undefined) return -1; // tomas conocidas antes que las que no aparecen en ninguna lista
        if (idxB !== undefined) return 1;
        return 0; // conserva el orden relativo original si ninguna está identificada
    });
    // Renumerar el ítem tras el reordenamiento
    datosAnexoG2.forEach((fila, idx) => { fila.item = idx + 1; });

    return datosAnexoG2;
}

// Construye el HTML de una tabla del Anexo G2 para un subconjunto de tomas (un solo canal de derivación)
function construirTablaG2Html(datosSeccion, tituloSeccion) {
    if (!datosSeccion || datosSeccion.length === 0) return '';

    let html = `
        <div style="text-align:center; font-weight:700; font-size:12px; margin:14px 0 6px; color:#000000;">
            ${tituloSeccion}
        </div>
        <div style="overflow-x:auto;">
            <table class="report-table" style="font-size: 10px; min-width: 1400px; border-collapse:collapse; font-family:Arial,sans-serif; table-layout:fixed; width:100%;">
                <colgroup>
                    <col style="width:126px"><col style="width:6%"><col style="width:4%">
                    <col style="width:5%"><col style="width:9%"><col style="width:4%">
                    <col style="width:8%">
                    <col style="width:7%"><col style="width:5%">
                    <col style="width:7%"><col style="width:5%">
                    <col style="width:4%"><col style="width:4%"><col style="width:4%">
                    <col style="width:4%"><col style="width:4%"><col style="width:4%"><col style="width:4%">
                    <col style="width:3%">
                </colgroup>
                <thead>
                    <tr style="background:#E6E6E6; color:#000000;">
                        <th rowspan="2" style="border:1px solid #000000; padding: 5px; min-width: 80px; font-weight:700;">NOMBRE DEL CANAL DE DERIVACIÓN</th>
                        <th rowspan="2" style="border:1px solid #000000; padding: 5px; min-width: 60px; font-weight:700; position:sticky; left:126px; z-index:3; background:#E6E6E6;">NOMBRE DE LA TOMA</th>
                        <th rowspan="2" style="border:1px solid #000000; padding: 5px; min-width: 70px; font-weight:700;">NOMBRE DEL CANAL DE DISTRIBUCIÓN</th>
                        <th rowspan="2" style="border:1px solid #000000; padding: 5px; min-width: 50px; font-weight:700;">N° DE USUARIOS</th>
                        <th rowspan="2" style="border:1px solid #000000; padding: 5px; min-width: 100px; font-weight:700; text-align:center; vertical-align:middle; white-space:normal; word-wrap:break-word;">VOLUMEN DE AGUA<br>PROGRAMADO (m³)</th>
                        <th rowspan="2" style="border:1px solid #000000; padding: 5px; min-width: 60px; font-weight:700;">ÁREA BAJO RIEGO<br>(Ha)</th>
                        <th rowspan="2" style="border:1px solid #000000; padding: 5px; min-width: 90px; font-weight:700; text-align:center; vertical-align:middle; white-space:normal; word-wrap:break-word;">TIEMPO DE<br>OPERACIÓN DEL<br>CANAL (Horas)</th>
                        <th colspan="4" style="border:1px solid #000000; padding: 5px; font-weight:700;">PERÍODO</th>
                        <th colspan="7" style="border:1px solid #000000; padding: 5px; font-weight:700;">CAUDAL PROGRAMADO POR DÍAS (m³/seg)</th>
                        <th rowspan="2" style="border:1px solid #000000; padding: 5px; min-width: 130px; font-weight:700; white-space:normal; word-wrap:break-word;">OBSERVACIONES</th>
                    </tr>
                    <tr style="background:#E6E6E6; color:#000000;">
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">INICIO</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">HORA</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">TÉRMINO</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">HORA</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">LUN</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">MAR</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">MIE</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">JUE</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">VIE</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">SAB</th>
                        <th style="border:1px solid #000000; padding: 4px; font-size: 9px; font-weight:700;">DOM</th>
                    </tr>
                </thead>
                <tbody>
    `;

    datosSeccion.forEach((fila) => {
        html += `
            <tr style="background-color: #ffffff;">
                <td style="border: 1px solid #000000; padding: 5px; font-weight: 600; color:#000000;">${fila.canalPrincipal}</td>
                <td style="border: 1px solid #000000; padding: 5px; color:#000000; position:sticky; left:126px; z-index:1; background:#ffffff;"><a href="javascript:void(0)" onclick="abrirG3DesdeTomaG2('${fila.nombreToma.toString().replace(/'/g,"\\'")}')" style="color:#0070c0;text-decoration:underline;cursor:pointer;" title="Ver Anexo G-3 de esta toma">${fila.nombreToma}</a></td>
                <td style="border: 1px solid #000000; padding: 5px; color:#000000;">${fila.nombreCanalDistribucion || ''}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center; color:#000000;" title="Aptos: ${fila.numUsuariosAptos}, No Aptos Programados: ${fila.numUsuariosNoAptos}">
    ${fila.numUsuarios > 0 ? fila.numUsuarios : '-'}
</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">
                    ${fila.volumenProgramado.toFixed(2)}
                </td>

                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">${fila.areaRiego.toFixed(2)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center; color:#000000;">${fila.tiempoOperacion}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center; font-size: 9px; color:#000000;">${fila.periodoInicio}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center; font-size: 9px; color:#000000;">${fila.periodoInicioHora}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center; font-size: 9px; color:#000000;">${fila.periodoFin}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center; font-size: 9px; color:#000000;">${fila.periodoFinHora}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">${fila.lunes > 0 ? fila.lunes.toFixed(3) : '-'}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">${fila.martes > 0 ? fila.martes.toFixed(3) : '-'}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">${fila.miercoles > 0 ? fila.miercoles.toFixed(3) : '-'}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">${fila.jueves > 0 ? fila.jueves.toFixed(3) : '-'}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">${fila.viernes > 0 ? fila.viernes.toFixed(3) : '-'}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">${fila.sabado > 0 ? fila.sabado.toFixed(3) : '-'}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; color:#000000;">${fila.domingo > 0 ? fila.domingo.toFixed(3) : '-'}</td>
                <td style="border: 1px solid #000000; padding: 5px; white-space:normal; word-wrap:break-word; overflow-wrap:break-word; max-width:160px;"></td>
            </tr>
        `;
    });

    const totalGeneralArea = datosSeccion.reduce((sum, t) => sum + t.areaRiego, 0);
    const totalGeneralVol = datosSeccion.reduce((sum, t) => sum + t.volumenProgramado, 0);
    // Tiempo de Operación del Canal = el MAYOR entre las tomas (la infraestructura es una sola;
    // no tiene sentido sumar los tiempos de tomas que comparten el mismo canal/río).
    const totalGeneralTiempo = datosSeccion.reduce((max, t) => Math.max(max, t.tiempoOperacion || 0), 0);
    const totalGeneralUsuarios = datosSeccion.reduce((sum, t) => sum + (t.numUsuarios || 0), 0);
    const totalLunes = datosSeccion.reduce((sum, t) => sum + t.lunes, 0);
    const totalMartes = datosSeccion.reduce((sum, t) => sum + t.martes, 0);
    const totalMiercoles = datosSeccion.reduce((sum, t) => sum + t.miercoles, 0);
    const totalJueves = datosSeccion.reduce((sum, t) => sum + t.jueves, 0);
    const totalViernes = datosSeccion.reduce((sum, t) => sum + t.viernes, 0);
    const totalSabado = datosSeccion.reduce((sum, t) => sum + t.sabado, 0);
    const totalDomingo = datosSeccion.reduce((sum, t) => sum + t.domingo, 0);

    html += `
            <tr style="background: #E6E6E6; color: #000000; font-weight: bold;">
                <td style="border: 1px solid #000000; padding: 5px; text-align: center;">TOTAL</td>
                <td style="border: 1px solid #000000; padding: 5px; position:sticky; left:126px; z-index:1; background:#E6E6E6;"></td>
                <td style="border: 1px solid #000000; padding: 5px;"></td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center;">${totalGeneralUsuarios}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalGeneralVol.toFixed(2)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalGeneralArea.toFixed(2)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center;">${totalGeneralTiempo}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; font-weight: bold;">${totalLunes.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; font-weight: bold;">${totalMartes.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; font-weight: bold;">${totalMiercoles.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; font-weight: bold;">${totalJueves.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; font-weight: bold;">${totalViernes.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; font-weight: bold;">${totalSabado.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: right; font-weight: bold;">${totalDomingo.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
            </tr>
        </tbody>
        </table>
        </div>
    `;

    return html;
}

// Construye una hoja del Anexo G2 con formato oficial completo (fusión de celdas, bordes, relleno gris, alineación)
function construirHojaG2ExcelJS(wb, datosSeccion, nombreHoja, tituloSeccion, mesNombre, semanaTexto, notaTexto) {
    const NUM_COLS = 19;
    const GRIS_ENCABEZADO = 'FFE6E6E6';
    const NEGRO = 'FF000000';
    const bordeFino = { style: 'thin', color: { argb: NEGRO } };
    const bordeCompleto = { top: bordeFino, left: bordeFino, bottom: bordeFino, right: bordeFino };

    function estiloEncabezado(celda) {
        celda.font = { bold: true, size: 9, color: { argb: NEGRO } };
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_ENCABEZADO } };
        celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        celda.border = bordeCompleto;
    }

    const ws = wb.addWorksheet(nombreHoja.substring(0, 31), {
        views: [{ showGridLines: false }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    ws.columns = [
        { width: 20 }, { width: 14 }, { width: 20 }, { width: 11 }, { width: 18 },
        { width: 12 }, { width: 14 }, { width: 11 }, { width: 8 }, { width: 11 }, { width: 8 },
        { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 },
        { width: 22 }
    ];

    let r = 1;

    ws.mergeCells(r, 1, r, NUM_COLS);
    const cTitulo = ws.getCell(r, 1);
    cTitulo.value = 'ANEXO G2: Programación de Distribución del Agua a nivel de canales de distribución';
    cTitulo.font = { bold: true, size: 12, color: { argb: NEGRO } };
    cTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 20;
    r++;
    r++; // blanco

    const camposInfo = [
        ['AAA', 'Jequetepeque Zarumilla', 'Mes', mesNombre],
        ['ALA', 'Chira', 'Semana', semanaTexto],
    ];
    camposInfo.forEach(([et1, val1, et2, val2]) => {
        const cEt1 = ws.getCell(r, 1); cEt1.value = et1 + ':'; cEt1.font = { bold: true, size: 10 };
        ws.mergeCells(r, 2, r, 6);
        const cVal1 = ws.getCell(r, 2); cVal1.value = val1; cVal1.font = { size: 10 };
        const cEt2 = ws.getCell(r, 8); cEt2.value = et2 + ':'; cEt2.font = { bold: true, size: 10 };
        ws.mergeCells(r, 9, r, NUM_COLS);
        const cVal2 = ws.getCell(r, 9); cVal2.value = val2; cVal2.font = { size: 10 };
        ws.getRow(r).height = 15;
        r++;
    });
    const cEtSec = ws.getCell(r, 1); cEtSec.value = 'Sector Hidráulico:'; cEtSec.font = { bold: true, size: 10 };
    ws.mergeCells(r, 2, r, NUM_COLS);
    const cValSec = ws.getCell(r, 2); cValSec.value = 'JUNTA DE USUARIOS DEL SECTOR HIDRÁULICO MENOR CHIRA - CLASE A'; cValSec.font = { size: 10 };
    ws.getRow(r).height = 15;
    r++;
    r++; // blanco

    ws.mergeCells(r, 1, r, NUM_COLS);
    const cSubtitulo = ws.getCell(r, 1);
    cSubtitulo.value = tituloSeccion;
    cSubtitulo.font = { bold: true, size: 11, color: { argb: NEGRO } };
    cSubtitulo.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 18;
    r++;

    // ── Encabezado de tabla (2 niveles) ──
    const filaH1 = r, filaH2 = r + 1;

    const colsSimples = [
        [1, 'NOMBRE DEL CANAL DE DERIVACIÓN'], [2, 'NOMBRE DE LA TOMA'], [3, 'NOMBRE DEL CANAL DE DISTRIBUCIÓN'],
        [4, 'N° DE USUARIOS'], [5, 'VOLUMEN DE AGUA PROGRAMADO (m³)'], [6, 'ÁREA BAJO RIEGO (Ha)'],
        [7, 'TIEMPO DE OPERACIÓN DEL CANAL (Horas)'],
    ];
    colsSimples.forEach(([col, texto]) => {
        ws.mergeCells(filaH1, col, filaH2, col);
        const c = ws.getCell(filaH1, col);
        c.value = texto;
        estiloEncabezado(c);
    });

    ws.mergeCells(filaH1, 8, filaH1, 11);
    const cPeriodo = ws.getCell(filaH1, 8); cPeriodo.value = 'PERÍODO'; estiloEncabezado(cPeriodo);

    ws.mergeCells(filaH1, 12, filaH1, 18);
    const cCaudal = ws.getCell(filaH1, 12); cCaudal.value = 'CAUDAL PROGRAMADO POR DÍAS (m³/seg)'; estiloEncabezado(cCaudal);

    ws.mergeCells(filaH1, 19, filaH2, 19);
    const cObs = ws.getCell(filaH1, 19); cObs.value = 'OBSERVACIONES'; estiloEncabezado(cObs);

    [[8, 'INICIO'], [9, 'HORA'], [10, 'TÉRMINO'], [11, 'HORA'],
     [12, 'LUN'], [13, 'MAR'], [14, 'MIE'], [15, 'JUE'], [16, 'VIE'], [17, 'SAB'], [18, 'DOM']].forEach(([col, texto]) => {
        const c = ws.getCell(filaH2, col);
        c.value = texto;
        estiloEncabezado(c);
    });

    [filaH1, filaH2].forEach(rr => ws.getRow(rr).height = 22);
    r = filaH2 + 1;

    // ── Filas de datos ──
    let totalVol = 0, totalArea = 0, totalTiempo = 0, totalUsuarios = 0;
    let totalLun = 0, totalMar = 0, totalMie = 0, totalJue = 0, totalVie = 0, totalSab = 0, totalDom = 0;

    datosSeccion.forEach(fila => {
        const valores = [
            fila.canalPrincipal, fila.nombreToma, fila.nombreCanalDistribucion || '',
            fila.numUsuarios, fila.volumenProgramado, fila.areaRiego, fila.tiempoOperacion,
            fila.periodoInicio, fila.periodoInicioHora, fila.periodoFin, fila.periodoFinHora,
            parseFloat(fila.lunes.toFixed(3)), parseFloat(fila.martes.toFixed(3)), parseFloat(fila.miercoles.toFixed(3)),
            parseFloat(fila.jueves.toFixed(3)), parseFloat(fila.viernes.toFixed(3)), parseFloat(fila.sabado.toFixed(3)), parseFloat(fila.domingo.toFixed(3)),
            ''
        ];
        const filaRow = ws.getRow(r);
        valores.forEach((val, i) => {
            const c = filaRow.getCell(i + 1);
            c.value = val;
            c.border = bordeCompleto;
            c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            c.font = { size: 9, color: { argb: NEGRO } };
            if (i === 4 || i === 5) c.numFmt = '#,##0.00';
            if (i >= 11 && i <= 17) c.numFmt = '0.000';
        });
        filaRow.height = 14;
        r++;

        totalVol += fila.volumenProgramado; totalArea += fila.areaRiego;
        totalTiempo = Math.max(totalTiempo, fila.tiempoOperacion || 0); // Tiempo de Operación del Canal = el MAYOR entre las tomas, no la suma
        totalUsuarios += (fila.numUsuarios || 0);
        totalLun += fila.lunes; totalMar += fila.martes; totalMie += fila.miercoles;
        totalJue += fila.jueves; totalVie += fila.viernes; totalSab += fila.sabado; totalDom += fila.domingo;
    });

    // ── Fila TOTAL ──
    ws.mergeCells(r, 1, r, 3);
    const filaTotal = ws.getRow(r);
    filaTotal.getCell(1).value = 'TOTAL';
    filaTotal.getCell(4).value = totalUsuarios;
    filaTotal.getCell(5).value = parseFloat(totalVol.toFixed(2));
    filaTotal.getCell(6).value = parseFloat(totalArea.toFixed(2));
    filaTotal.getCell(7).value = totalTiempo;
    filaTotal.getCell(8).value = '-'; filaTotal.getCell(9).value = '-';
    filaTotal.getCell(10).value = '-'; filaTotal.getCell(11).value = '-';
    filaTotal.getCell(12).value = parseFloat(totalLun.toFixed(3));
    filaTotal.getCell(13).value = parseFloat(totalMar.toFixed(3));
    filaTotal.getCell(14).value = parseFloat(totalMie.toFixed(3));
    filaTotal.getCell(15).value = parseFloat(totalJue.toFixed(3));
    filaTotal.getCell(16).value = parseFloat(totalVie.toFixed(3));
    filaTotal.getCell(17).value = parseFloat(totalSab.toFixed(3));
    filaTotal.getCell(18).value = parseFloat(totalDom.toFixed(3));
    filaTotal.getCell(19).value = '-';
    for (let c = 1; c <= NUM_COLS; c++) {
        const cell = filaTotal.getCell(c);
        cell.font = { bold: true, size: 9, color: { argb: NEGRO } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_ENCABEZADO } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = bordeCompleto;
    }
    filaTotal.height = 16;

    // ✅ Nota general del reporte: solo se agrega si tiene contenido (sin filas vacías innecesarias)
    if (notaTexto && notaTexto.trim()) {
        r++;
        r++; // fila en blanco de separación
        const cEtNota = ws.getCell(r, 1);
        cEtNota.value = 'NOTA:';
        cEtNota.font = { bold: true, size: 10, color: { argb: NEGRO } };
        r++;
        ws.mergeCells(r, 1, r, NUM_COLS);
        const cValNota = ws.getCell(r, 1);
        cValNota.value = notaTexto;
        cValNota.font = { size: 10, color: { argb: NEGRO } };
        cValNota.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
        ws.getRow(r).height = Math.max(16, Math.ceil(notaTexto.length / 120) * 14);
    }

    return ws;
}

// Construye la tabla HTML (colgroup+thead+tbody+total) para imprimir un solo canal de derivación
function construirTablaG2PrintHtml(datosSeccion, tituloSeccion) {
    if (!datosSeccion || datosSeccion.length === 0) return '';

    let filasHtml = '';
    datosSeccion.forEach((fila) => {
        filasHtml += `
            <tr style="background-color: #ffffff; font-size: 9px;">
                <td style="border: 1px solid #000000; padding: 4px; font-weight: 600;">${fila.canalPrincipal}</td>
                <td style="border: 1px solid #000000; padding: 4px;">${fila.nombreToma}</td>
                <td style="border: 1px solid #000000; padding: 4px;">${fila.nombreCanalDistribucion || ''}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: center; font-weight: 600;">${fila.numUsuarios > 0 ? fila.numUsuarios : '-'}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.volumenProgramado.toFixed(2)}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.areaRiego.toFixed(2)}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: center;">${fila.tiempoOperacion}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: center; font-size: 8px;">${fila.periodoInicio}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: center; font-size: 8px;">${fila.periodoInicioHora}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: center; font-size: 8px;">${fila.periodoFin}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: center; font-size: 8px;">${fila.periodoFinHora}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.lunes.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.martes.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.miercoles.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.jueves.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.viernes.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.sabado.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 4px; text-align: right;">${fila.domingo.toFixed(3)}</td>
                <td style="border: 1px solid #000000; padding: 4px;"></td>
            </tr>
        `;
    });

    const totalVolumen = datosSeccion.reduce((s, t) => s + t.volumenProgramado, 0);
    const totalArea = datosSeccion.reduce((s, t) => s + t.areaRiego, 0);
    // Tiempo de Operación del Canal = el MAYOR entre las tomas (no la suma).
    const totalTiempoOperacion = datosSeccion.reduce((max, t) => Math.max(max, t.tiempoOperacion || 0), 0);
    const totalUsuariosImp = datosSeccion.reduce((s, t) => s + (t.numUsuarios || 0), 0);
    const totalLunes = datosSeccion.reduce((s, t) => s + t.lunes, 0);
    const totalMartes = datosSeccion.reduce((s, t) => s + t.martes, 0);
    const totalMiercoles = datosSeccion.reduce((s, t) => s + t.miercoles, 0);
    const totalJueves = datosSeccion.reduce((s, t) => s + t.jueves, 0);
    const totalViernes = datosSeccion.reduce((s, t) => s + t.viernes, 0);
    const totalSabado = datosSeccion.reduce((s, t) => s + t.sabado, 0);
    const totalDomingo = datosSeccion.reduce((s, t) => s + t.domingo, 0);

    filasHtml += `
        <tr style="background-color: #E6E6E6; color: #000000; font-weight: bold; font-size: 10px;">
            <td style="border: 1px solid #000000; padding: 5px; text-align: center;">TOTAL</td>
            <td style="border: 1px solid #000000; padding: 5px;"></td>
            <td style="border: 1px solid #000000; padding: 5px;"></td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: center;">${totalUsuariosImp}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalVolumen.toFixed(2)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalArea.toFixed(2)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: center;">${totalTiempoOperacion}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalLunes.toFixed(3)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalMartes.toFixed(3)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalMiercoles.toFixed(3)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalJueves.toFixed(3)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalViernes.toFixed(3)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalSabado.toFixed(3)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: right;">${totalDomingo.toFixed(3)}</td>
            <td style="border: 1px solid #000000; padding: 5px; text-align: center;">-</td>
        </tr>
    `;

    return `
        <div class="titulo-seccion" style="text-align:center; font-weight:700; font-size:12px; margin:10px 0 6px;">${tituloSeccion}</div>
        <table style="table-layout:fixed; width:100%;">
            <colgroup>
                <col style="width:9%"><col style="width:6%"><col style="width:4%">
                <col style="width:5%"><col style="width:9%"><col style="width:4%">
                <col style="width:8%">
                <col style="width:7%"><col style="width:5%">
                <col style="width:7%"><col style="width:5%">
                <col style="width:4%"><col style="width:4%"><col style="width:4%">
                <col style="width:4%"><col style="width:4%"><col style="width:4%"><col style="width:4%">
                <col style="width:3%">
            </colgroup>
            <thead>
                <tr>
                    <th rowspan="2">NOMBRE DEL CANAL DE DERIVACIÓN</th>
                    <th rowspan="2">NOMBRE DE LA TOMA</th>
                    <th rowspan="2">NOMBRE DEL CANAL DE DISTRIBUCIÓN</th>
                    <th rowspan="2">N° DE USUARIOS</th>
                    <th rowspan="2">VOLUMEN DE AGUA PROGRAMADO (m³)</th>
                    <th rowspan="2">ÁREA BAJO RIEGO (Ha)</th>
                    <th rowspan="2">TIEMPO DE OPERACIÓN DEL CANAL (Horas)</th>
                    <th colspan="4">PERÍODO</th>
                    <th colspan="7">CAUDAL PROGRAMADO POR DÍAS (m³/seg)</th>
                    <th rowspan="2">OBSERVACIONES</th>
                </tr>
                <tr>
                    <th>INICIO</th>
                    <th>HORA</th>
                    <th>TÉRMINO</th>
                    <th>HORA</th>
                    <th>LUN</th>
                    <th>MAR</th>
                    <th>MIE</th>
                    <th>JUE</th>
                    <th>VIE</th>
                    <th>SAB</th>
                    <th>DOM</th>
                </tr>
            </thead>
            <tbody>
                ${filasHtml}
            </tbody>
        </table>
    `;
}
