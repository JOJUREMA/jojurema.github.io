// ══ Núcleo compartido — clasificación de usuarios (aptos/no aptos) ══
// Extraído sin cambios de Sistema_Riego_CUSSHMI_14.html (Fase 0 de la PWA).
// Cargado tanto por el escritorio como por la futura versión móvil —
// una sola fuente de verdad para decidir quién puede regar esta semana.

// Evaluar si usuario es apto
function esUsuarioApto(usuario, deudaMax) {
    const tieneDeudaValida = usuario.deudaTotal <= deudaMax;
    const comisionKey = localStorage.getItem('cusshmi_comision') || 'MARGEN_IZQUIERDA';
    const esCieneguillo = comisionKey === 'CIENEGUILLO';

    // MARGEN_IZQUIERDA (clásico): cultivo1/area1 define si hay programación
    if (!esCieneguillo) {
        const tieneCultivo = usuario.cultivo1 && usuario.cultivo1.trim() !== '';
        const tieneArea = usuario.area1 > 0;
        return tieneDeudaValida && tieneCultivo && tieneArea;
    }

    // CIENEGUILLO (flexible): cualquier cultivoN/areaN válido
    let tieneCultivo = false;
    let tieneArea = false;
    for (let i = 1; i <= 10; i++) {
        const c = (usuario[`cultivo${i}`] ?? '').toString().trim();
        const a = parseFloat(usuario[`area${i}`]) || 0;
        if (c) tieneCultivo = true;
        if (a > 0) tieneArea = true;
        if (tieneCultivo && tieneArea) break;
    }

    return tieneDeudaValida && tieneCultivo && tieneArea;
}

function debeExcluirse(usuario) {
    const sinDeuda = usuario.deudaTotal === 0;

    // Considerar todos los cultivos/áreas disponibles (para casos con 2+ cultivos)
    let hayCultivo = false;
    let hayArea = false;
    for (let i = 1; i <= 10; i++) {
        const c = (usuario[`cultivo${i}`] ?? '').toString().trim();
        const a = parseFloat(usuario[`area${i}`]) || 0;
        if (c) hayCultivo = true;
        if (a > 0) hayArea = true;
        if (hayCultivo && hayArea) break;
    }

    // Compatibilidad con formato clásico (cuando no hay cultivoN/areaN en el objeto)
    if (!hayCultivo && (usuario.cultivo1 || usuario.cultivo2)) {
        const c1 = (usuario.cultivo1 ?? '').toString().trim();
        const c2 = (usuario.cultivo2 ?? '').toString().trim();
        if (c1 || c2) hayCultivo = true;
    }
    if (!hayArea && (usuario.area1 || usuario.area2)) {
        const a1 = parseFloat(usuario.area1) || 0;
        const a2 = parseFloat(usuario.area2) || 0;
        if (a1 > 0 || a2 > 0) hayArea = true;
    }

    const sinCultivo = !hayCultivo;
    const sinArea = !hayArea;

    return sinDeuda && sinCultivo && sinArea;
}

function obtenerParesCultivoAreaUsuario(usuario) {
    const pares = [];
    for (let i = 1; i <= 10; i++) {
        const cultivo = (usuario[`cultivo${i}`] ?? '').toString().trim();
        const area = parseFloat(usuario[`area${i}`]) || 0;
        if (!cultivo || area <= 0) continue;
        pares.push({ cultivo, area });
    }

    // Fallback para formato clásico si no se detectó por cultivoN/areaN
    if (pares.length === 0) {
        const c1 = (usuario.cultivo1 ?? '').toString().trim();
        const a1 = parseFloat(usuario.area1) || 0;
        if (c1 && a1 > 0) pares.push({ cultivo: c1, area: a1 });
        const c2 = (usuario.cultivo2 ?? '').toString().trim();
        const a2 = parseFloat(usuario.area2) || 0;
        if (c2 && a2 > 0) pares.push({ cultivo: c2, area: a2 });
    }

    return pares;
}

function expandirUsuarioNoAptoPorCultivos(usuarioBase) {
    const pares = obtenerParesCultivoAreaUsuario(usuarioBase);
    if (pares.length === 0) {
        // Si no tiene cultivos/áreas, mantener un solo registro (para casos extremos)
        return [{
            ...usuarioBase,
            cultivo1: usuarioBase.cultivo1 || '-',
            area1: parseFloat(usuarioBase.area1) || 0,
            _cultivoProgramado: usuarioBase.cultivo1 || '',
            _areaProgramada: parseFloat(usuarioBase.area1) || 0,
        }];
    }

    return pares.map(p => ({
        ...usuarioBase,
        cultivo1: p.cultivo,
        area1: p.area,
        _cultivoProgramado: p.cultivo,
        _areaProgramada: p.area,
    }));
}
