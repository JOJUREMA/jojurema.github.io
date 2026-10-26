// Limita el Padrón A-1 de la base (Supabase) a lo que figura en los PDF oficiales de la comisión
// (Anexo A-1 con licencia y Anexo A-2 sin derecho + con permiso).
//
// Cada fila oficial es un PREDIO: [nombre, nroDocumento, unidadCatastral, areaTotalHa, areaRiegoHa, clase].
// Cada fila oficial se empareja con COMO MÁXIMO una fila de la base, y cada fila de la base se usa UNA sola
// vez, así que el resultado nunca tiene más filas que el PDF. Una fila se acepta si coinciden suficientes
// datos (puntaje >= UMBRAL): unidad catastral (4), documento (3), nombre (3), área bajo riego (2), área total (1).
// Funciones puras, sin acceso a red ni al DOM (se prueban con node).
(function (root) {
    'use strict';

    const UMBRAL = 5;

    function normNombre(s) {
        return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    function normDoc(s) {
        const t = String(s == null ? '' : s).replace(/\D/g, '').replace(/^0+/, '');
        return t.length >= 6 ? t : '';
    }
    function normUC(s) {
        const t = String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
        if (!t || /^0+$/.test(t)) return ''; // "000000" = sin unidad catastral
        return t.replace(/^0+/, '');
    }
    function num(v) {
        if (v == null || v === '') return null;
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    function igual(a, b) { return a != null && b != null && Math.abs(a - b) < 0.006; }

    // filasDb: filas de padron_oficial_a1 (apellidos_nombres, numero_documento, unidad_catastral, area_total_ha,
    // area_bajo_riego_ha). oficiales: arreglo de predios del PDF. Devuelve { filas, sinCoincidencia, stats }.
    function limitar(filasDb, oficiales) {
        const db = (filasDb || []).map((f, i) => ({
            f, i, nom: normNombre(f.apellidos_nombres), doc: normDoc(f.numero_documento), uc: normUC(f.unidad_catastral),
            at: num(f.area_total_ha), ar: num(f.area_bajo_riego_ha), usada: false,
        }));
        const idx = (clave) => {
            const m = new Map();
            db.forEach((r) => { const k = r[clave]; if (!k) return; (m.get(k) || m.set(k, []).get(k)).push(r); });
            return m;
        };
        const porUC = idx('uc'), porDoc = idx('doc'), porNom = idx('nom');

        const puntaje = (r, o) => {
            let p = 0;
            if (o.uc && r.uc === o.uc) p += 4;
            if (o.doc && r.doc === o.doc) p += 3;
            if (o.nom && r.nom === o.nom) p += 3;
            if (igual(r.ar, o.ar)) p += 2;
            if (igual(r.at, o.at)) p += 1;
            return p;
        };
        const ofi = (oficiales || []).map((a, k) => ({
            k, a, nom: normNombre(a[0]), doc: normDoc(a[1]), uc: normUC(a[2]), at: num(a[3]), ar: num(a[4]),
        }));

        const elegidas = new Array(ofi.length).fill(null);
        // Dos pasadas: primero lo más seguro (puntaje alto), luego el resto, para que un predio con datos
        // parecidos no "robe" la fila de otro.
        const candidatos = (o) => {
            const set = new Set();
            [o.uc && porUC.get(o.uc), o.doc && porDoc.get(o.doc), o.nom && porNom.get(o.nom)].forEach((l) => { if (l) l.forEach((r) => set.add(r)); });
            return set;
        };
        const pares = [];
        ofi.forEach((o) => {
            candidatos(o).forEach((r) => { const p = puntaje(r, o); if (p >= UMBRAL) pares.push({ o, r, p }); });
        });
        pares.sort((x, y) => (y.p - x.p) || (x.o.k - y.o.k) || (x.r.i - y.r.i));
        pares.forEach(({ o, r }) => {
            if (elegidas[o.k] || r.usada) return;
            elegidas[o.k] = r; r.usada = true;
        });

        const filas = [], sinCoincidencia = [];
        elegidas.forEach((r, k) => { if (r) filas.push(r.f); else sinCoincidencia.push(ofi[k].a); });
        return {
            filas, sinCoincidencia,
            stats: { oficiales: ofi.length, coincidencias: filas.length, sinCoincidencia: sinCoincidencia.length, baseTotal: db.length },
        };
    }

    const api = { limitar, normNombre, normDoc, normUC, UMBRAL };
    if (typeof window !== 'undefined') window.PadronOficialPdf = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this));
