// ══ Núcleo compartido — Inventario de Infraestructura (Fase 1: Tomas y
// Compuertas) ══
// Basado en el Formato oficial de ANA "Inventario de Obras de Arte"
// (archivo real "1.Formatos de Inventario CUSSHMI.xlsx", hojas "Formato de
// TOMAS" y "Formato de COMPUERTAS "). Lo usan tanto el sincronizador de
// escritorio (lee el Excel) como, en fases futuras, cualquier otro tipo de
// estructura que se agregue con el mismo patrón.

// Diccionarios de abreviaturas — extraídos literalmente de las filas de
// leyenda al pie de cada hoja del Excel real, no inventados. Se usan para
// mostrar la etiqueta completa junto al código ("B — Bueno") tanto en el
// formulario móvil (como opciones de <select>, restringidas a estos
// valores) como al exportar.
const ESTADO_INVENTARIO = { B: 'Bueno', R: 'Regular', M: 'Malo' };
const MARGEN_INVENTARIO = { D: 'Derecha', C: 'Centro', I: 'Izquierda' };
const MATERIAL_TOMA = { FE: 'Fierro', PVC: 'PVC', RU: 'Rústico', C: 'Concreto', O: 'Otros' };
const TIPO_CAPTACION_TOMA = { RT: 'Retención', TD: 'Toma Directa', TP: 'Toma Predial', O: 'Otros' };
const OPERACION_COMPUERTA = { MA: 'Manual', ME: 'Mecánico', MI: 'Mixto', O: 'Otros' };
const MATERIAL_COMPUERTA = { FE: 'Fierro', MD: 'Madera', O: 'Otros' };

// "Nombre del Canal Fuente"/"Nombre del Canal" del Excel forman una cadena
// canal→canal (ej. fila con canalFuente="Canal Sur", nombreCanal="Principal
// SD3"; más abajo, otra fila con canalFuente="Canal Manuel Emilio",
// nombreCanal="Canal Marcos" — un lateral de un lateral). Solo el 36-44% de
// las filas están directamente sobre un canal "Principal SDx/SIx" — el
// resto hay que resolverlo subiendo la cadena. Verificado contra el archivo
// real: resolviendo de forma iterativa (sembrar con las que matchean
// directo, repetir buscando el canalFuente de las que quedan en el mapa ya
// construido, hasta que no haya más cambios) la cobertura sube a 99.6% en
// Tomas y 97.0% en Compuertas — el resto (canales sin raíz Principal SDx
// conocida, ej. "Canal Norte", "Dren Nomara") queda con toma null a
// propósito, nunca se descarta la fila por no poder resolverla.
const RE_CANAL_PRINCIPAL = /^PRINCIPAL\s*(S[DI]\d+(\.\d+)?)$/i;

function _normCanal(valor) {
    return (valor || '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
}

// Recibe las filas crudas de una hoja (canalFuente/nombreCanal tal cual el
// Excel) y devuelve una función que, dado un nombreCanal, contesta con la
// toma (SD3, SI4...) a la que pertenece, o null si no se pudo resolver.
function resolverTomaPorCanal(filas) {
    const canalATomaMap = {};

    // Semilla tanto por nombreCanal como por canalFuente — necesario para
    // hojas pequeñas y aisladas (ej. Caídas, con apenas 7 filas) donde
    // NINGUNA fila tiene su propio nombreCanal="Principal SDx" (todas son
    // ya laterales de un lateral), pero sí tienen canalFuente="Principal
    // SDx" directo — sin esto, esas hojas nunca resuelven nada porque el
    // patrón nunca aparece como nombreCanal dentro de la propia hoja.
    // Es puramente aditivo: nunca reduce la cobertura ya verificada en
    // Tomas/Compuertas, solo puede sumar más semillas al mapa.
    (filas || []).forEach((f) => {
        const canal = _normCanal(f.nombreCanal);
        const m = canal.match(RE_CANAL_PRINCIPAL);
        if (m) canalATomaMap[canal] = m[1].toUpperCase();

        const fuente = _normCanal(f.canalFuente);
        const mFuente = fuente.match(RE_CANAL_PRINCIPAL);
        if (mFuente) canalATomaMap[fuente] = mFuente[1].toUpperCase();
    });

    let cambiosHechos = true;
    let iteraciones = 0;
    while (cambiosHechos && iteraciones < 20) {
        cambiosHechos = false;
        iteraciones += 1;
        (filas || []).forEach((f) => {
            const canal = _normCanal(f.nombreCanal);
            const fuente = _normCanal(f.canalFuente);
            if (canalATomaMap[canal]) return;
            if (canalATomaMap[fuente]) {
                canalATomaMap[canal] = canalATomaMap[fuente];
                cambiosHechos = true;
            }
        });
    }

    return function obtenerTomaDeCanal(nombreCanal) {
        return canalATomaMap[_normCanal(nombreCanal)] || null;
    };
}

// ══ Fase 2 — los 12 tipos de obra restantes (Acueductos, Sifón Invertido,
// Caídas, Rápidas, Repartidor, Pase Vehicular, Pase Peatonal, Alcantarilla,
// Medidores, Canales Laterales, Dren Principal, Drenes Secundarios) ══
//
// A diferencia de Tomas/Compuertas (una tabla por tipo), estos 12 comparten
// una sola tabla genérica `inventario_estructuras` (columna `campos` jsonb
// con lo propio de cada tipo) — sus columnas cambian demasiado entre sí
// (17 a 40, con distintos sub-grupos de dimensiones) para justificar 12
// tablas/formularios casi idénticos. `TIPOS_ESTRUCTURA_GENERICOS` describe,
// por tipo: dónde está cada columna en el Excel (para el parser de
// escritorio) y cómo mostrarla en el móvil (etiqueta + diccionario, si
// tiene) — de solo lectura salvo Estado/Observación, que sí edita el
// sectorista en campo.

const MATERIAL_PASE = { C: 'Concreto', M: 'Mampostería', Ma: 'Madera', O: 'Otros' };
const TIPO_PASE = { Pe: 'Permanente', Sr: 'Semi-Rústico', R: 'Rústico' };
const MATERIAL_CAIDA = { C: 'Concreto', R: 'Rústico', O: 'Otros' };
const MATERIAL_RAPIDA = { C: 'Concreto', M: 'Mampostería', O: 'Otros' };
const TIPO_MEDIDOR = { P: 'Parshall', RBC: 'RBC', AL: 'Aforador Limnímetro', O: 'Otros' };
const MATERIAL_MEDIDOR = { C: 'Concreto', Ma: 'Mampostería', Me: 'Metal', O: 'Otros' };
const MATERIAL_REGLA_MEDIDOR = { Ce: 'Cerámica', Me: 'Metal', PVC: 'Polivinilo', O: 'Otros' };
const TIPO_ACUEDUCTO = { Pe: 'Permanente (concreto armado)', Sr: 'Semi-Rústico (mampostería de piedras)', R: 'Rústico (piedra y tierra)' };
const MATERIAL_ACUEDUCTO = { C: 'Concreto', M: 'Metálico', HDPE: 'Polietileno (HDPE)', PVC: 'PVC', O: 'Otros' };
const MATERIAL_REPARTIDOR = { C: 'Concreto', M: 'Mampostería', R: 'Rústico', O: 'Otros' };
// La leyenda real dice "HDPE (Polipropileno)" — se transcribe tal cual el
// Excel, aunque HDPE técnicamente sea polietileno; no se corrige el
// documento oficial.
const MATERIAL_SIFON = { C: 'Concreto', M: 'Metálico', HDPE: 'Polipropileno', O: 'Otros' };
const TIPO_USO_LATERAL = { A: 'Agrario', M: 'Multisectorial', P: 'Poblacional' };
const TIPO_CANAL_LATERAL = { R: 'Revestido', T: 'Tierra', O: 'Otros' };
const MATERIAL_CANAL_LATERAL = { C: 'Concreto', M: 'Mampostería', O: 'Otros' };
// La leyenda real dice "Fe (Concreto)" para el material de la compuerta —
// se transcribe tal cual el Excel, aunque Fe normalmente sea Fierro.
const MATERIAL_COMPUERTA_LATERAL = { Fe: 'Concreto', M: 'Mampostería', O: 'Otros' };
const TIPO_MEDIDOR_LATERAL = { P: 'Parshall', SC: 'Sin cuello', RBC: 'RBC', O: 'Otros' };

const TIPOS_ESTRUCTURA_GENERICOS = {
    pase_vehicular: {
        etiqueta: 'Pase Vehicular', etiquetaPlural: 'Pases Vehiculares',
        hojaExcel: 'Formato B.2.10-PASE VEHICULAR',
        filaInicioDatos: 13,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 5,
            zonaUtm: 6, este: 7, norte: 8, bloqueRiego: 16, observacion: 17,
        },
        colEstado: 12,
        camposReferencia: [
            { indice: 9, clave: 'elevacion', etiqueta: 'Elevación (m)' },
            { indice: 10, clave: 'tipo', etiqueta: 'Tipo', diccionario: TIPO_PASE },
            { indice: 11, clave: 'material', etiqueta: 'Material', diccionario: MATERIAL_PASE },
            { indice: 13, clave: 'longitud', etiqueta: 'Longitud (m)' },
            { indice: 14, clave: 'ancho', etiqueta: 'Ancho (m)' },
            { indice: 15, clave: 'altura', etiqueta: 'Altura (m)' },
        ],
    },
    // Mismas 17 columnas y misma leyenda que Pase Vehicular (verificado
    // contra la hoja real: Tipo Pe/Sr/R, Material C/M/Ma/O, Estado B/R/M).
    pase_peatonal: {
        etiqueta: 'Pase Peatonal', etiquetaPlural: 'Pases Peatonales',
        hojaExcel: 'Formato B.2.11-PASE PEATONAL',
        filaInicioDatos: 13,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 5,
            zonaUtm: 6, este: 7, norte: 8, bloqueRiego: 16, observacion: 17,
        },
        colEstado: 12,
        camposReferencia: [
            { indice: 9, clave: 'elevacion', etiqueta: 'Elevación (m)' },
            { indice: 10, clave: 'tipo', etiqueta: 'Tipo', diccionario: TIPO_PASE },
            { indice: 11, clave: 'material', etiqueta: 'Material', diccionario: MATERIAL_PASE },
            { indice: 13, clave: 'longitud', etiqueta: 'Longitud (m)' },
            { indice: 14, clave: 'ancho', etiqueta: 'Ancho (m)' },
            { indice: 15, clave: 'altura', etiqueta: 'Altura (m)' },
        ],
    },
    // "Estado" acá tiene 3 sub-componentes en el Excel (Características de
    // la Caída / Canal de Transición / Colchón Disipador) — se usa el de
    // "Características de la Caída" (col. 11) como el Estado editable de la
    // tabla (la condición general de la obra); los otros dos quedan como
    // referencia de solo lectura junto a sus materiales.
    caida: {
        etiqueta: 'Caída', etiquetaPlural: 'Caídas',
        hojaExcel: 'Formato B-2.3-CAÍDAS',
        filaInicioDatos: 15,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 5,
            zonaUtm: 6, este: 7, norte: 8, bloqueRiego: 19, observacion: 20,
        },
        colEstado: 11,
        camposReferencia: [
            { indice: 9, clave: 'elevacion', etiqueta: 'Elevación (m)' },
            { indice: 10, clave: 'material', etiqueta: 'Material', diccionario: MATERIAL_CAIDA },
            { indice: 12, clave: 'materialTransicion', etiqueta: 'Material (Canal de Transición)', diccionario: MATERIAL_CAIDA },
            { indice: 13, clave: 'estadoTransicion', etiqueta: 'Estado (Canal de Transición)', diccionario: ESTADO_INVENTARIO },
            { indice: 14, clave: 'materialColchon', etiqueta: 'Material (Colchón Disipador)', diccionario: MATERIAL_CAIDA },
            { indice: 15, clave: 'estadoColchon', etiqueta: 'Estado (Colchón Disipador)', diccionario: ESTADO_INVENTARIO },
            { indice: 16, clave: 'longitudColchon', etiqueta: 'Longitud — Colchón Disipador (m)' },
            { indice: 17, clave: 'anchoColchon', etiqueta: 'Ancho — Colchón Disipador (m)' },
            { indice: 18, clave: 'altoColchon', etiqueta: 'Alto — Colchón Disipador (m)' },
        ],
    },
    // 3 sub-componentes con su propio Material/Estado (Canal / Colchón
    // Disipador / Escalones — este último solo aplica a rápidas
    // escalonadas, casi siempre "-" en el Excel real). Se usa el Estado
    // del Canal (col. 14) como el editable de la tabla.
    rapida: {
        etiqueta: 'Rápida', etiquetaPlural: 'Rápidas',
        hojaExcel: 'Formato B-2.4-RAPIDAS',
        filaInicioDatos: 15,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 5,
            zonaUtm: 6, este: 7, norte: 8, bloqueRiego: 29, observacion: 30,
        },
        colEstado: 14,
        camposReferencia: [
            { indice: 7, clave: 'esteInicio', etiqueta: 'Este inicio' },
            { indice: 8, clave: 'norteInicio', etiqueta: 'Norte inicio' },
            { indice: 9, clave: 'elevacionInicio', etiqueta: 'Elevación inicio (m)' },
            { indice: 10, clave: 'esteFinal', etiqueta: 'Este final' },
            { indice: 11, clave: 'norteFinal', etiqueta: 'Norte final' },
            { indice: 12, clave: 'elevacionFinal', etiqueta: 'Elevación final (m)' },
            { indice: 13, clave: 'material', etiqueta: 'Material (Canal)', diccionario: MATERIAL_RAPIDA },
            { indice: 15, clave: 'longitud', etiqueta: 'Longitud — Canal (m)' },
            { indice: 16, clave: 'ancho', etiqueta: 'Ancho — Canal (m)' },
            { indice: 17, clave: 'tirante', etiqueta: 'Tirante Y — Canal (m)' },
            { indice: 18, clave: 'pendiente', etiqueta: 'Pendiente S — Canal' },
            { indice: 19, clave: 'materialColchon', etiqueta: 'Material (Colchón Disipador)', diccionario: MATERIAL_RAPIDA },
            { indice: 20, clave: 'estadoColchon', etiqueta: 'Estado (Colchón Disipador)', diccionario: ESTADO_INVENTARIO },
            { indice: 21, clave: 'longitudColchon', etiqueta: 'Longitud — Colchón Disipador (m)' },
            { indice: 22, clave: 'anchoColchon', etiqueta: 'Ancho — Colchón Disipador (m)' },
            { indice: 23, clave: 'altoColchon', etiqueta: 'Alto — Colchón Disipador (m)' },
            { indice: 24, clave: 'materialEscalones', etiqueta: 'Material (Escalones)', diccionario: MATERIAL_RAPIDA },
            { indice: 25, clave: 'estadoEscalones', etiqueta: 'Estado (Escalones)', diccionario: ESTADO_INVENTARIO },
            { indice: 26, clave: 'paso', etiqueta: 'Paso — Escalones (m)' },
            { indice: 27, clave: 'contrapaso', etiqueta: 'Contrapaso — Escalones (m)' },
            { indice: 28, clave: 'numeroEscalones', etiqueta: 'N° Escalones' },
        ],
    },
    // Mismo Tipo (Pe/Sr/R) y Material (C/M/Ma/O) que Pase Vehicular/Peatonal
    // — reutiliza los mismos diccionarios. La hoja real también trae 'Fe' y
    // 'PVC' como material en algunas filas, códigos que no están en la
    // leyenda de ESTA hoja (solo documenta C/M/Ma/O) — se muestran tal
    // cual, sin traducir, para no inventar un significado no confirmado
    // acá (aunque coincidan con MATERIAL_TOMA, esa leyenda es de otra hoja).
    alcantarilla: {
        etiqueta: 'Alcantarilla', etiquetaPlural: 'Alcantarillas',
        hojaExcel: 'Formato B-2.12-ALCANTARILLA ',
        filaInicioDatos: 14,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 5,
            zonaUtm: 6, este: 7, norte: 8, bloqueRiego: 21, observacion: 22,
        },
        colEstado: 12,
        camposReferencia: [
            { indice: 9, clave: 'elevacion', etiqueta: 'Elevación (m)' },
            { indice: 10, clave: 'tipo', etiqueta: 'Tipo', diccionario: TIPO_PASE },
            { indice: 11, clave: 'material', etiqueta: 'Material', diccionario: MATERIAL_PASE },
            { indice: 13, clave: 'longitud', etiqueta: 'Longitud (m)' },
            { indice: 14, clave: 'ancho', etiqueta: 'Ancho (m)' },
            { indice: 19, clave: 'diametro', etiqueta: 'Diámetro (m)' },
            { indice: 20, clave: 'altura', etiqueta: 'Altura (m)' },
        ],
    },
    // Sin columna "Nombre" propia (a diferencia de los demás tipos) — se
    // identifica solo por canal + progresiva; el móvil cae al Nombre del
    // Canal como título de la fila (mismo comportamiento ya usado cuando
    // nombreObra no existe).
    medidor: {
        etiqueta: 'Medidor', etiquetaPlural: 'Medidores',
        hojaExcel: 'Formato de MEDIDORES',
        filaInicioDatos: 15,
        colIndice: {
            numeroOrden: 1, canalFuente: 2, nombreCanal: 3, progresivaKm: 4,
            zonaUtm: 5, este: 6, norte: 7, bloqueRiego: 23, observacion: 24,
        },
        colEstado: 10,
        camposReferencia: [
            { indice: 8, clave: 'tipo', etiqueta: 'Tipo', diccionario: TIPO_MEDIDOR },
            { indice: 9, clave: 'material', etiqueta: 'Material', diccionario: MATERIAL_MEDIDOR },
            { indice: 11, clave: 'longitud', etiqueta: 'Longitud (m)' },
            { indice: 12, clave: 'anchoGarganta', etiqueta: 'Ancho de Garganta (m)' },
            { indice: 13, clave: 'anchoInicial', etiqueta: 'Ancho Inicial (m)' },
            { indice: 14, clave: 'anchoFinal', etiqueta: 'Ancho Final (m)' },
            { indice: 15, clave: 'alturaMuro', etiqueta: 'Altura de Muro (m)' },
            { indice: 16, clave: 'alturaCresta', etiqueta: 'Altura de Cresta (m)' },
            { indice: 17, clave: 'reglaAlto', etiqueta: 'Regla Graduada — Alto (m)' },
            { indice: 18, clave: 'reglaAncho', etiqueta: 'Regla Graduada — Ancho (m)' },
            { indice: 19, clave: 'reglaMaterial', etiqueta: 'Regla Graduada — Material', diccionario: MATERIAL_REGLA_MEDIDOR },
            { indice: 20, clave: 'pozaLargo', etiqueta: 'Poza de Medición — Largo (m)' },
            { indice: 21, clave: 'pozaAncho', etiqueta: 'Poza de Medición — Ancho (m)' },
            { indice: 22, clave: 'pozaAlto', etiqueta: 'Poza de Medición — Alto (m)' },
        ],
    },
    // Las columnas 23-25 no tienen leyenda numerada (la leyenda real llega
    // solo hasta -20), pero los encabezados de fila 12 ("Estribos" x2 +
    // "Pilar" x1) y fila 13 ("Ingreso"/"Salida"/"Estado") sí son texto
    // real del Excel — se etiquetan como el estado de cada componente
    // (estribo de ingreso, estribo de salida, pilar), sin inventar más
    // que eso. El Estado editable de la tabla es el general (col. 12).
    acueducto: {
        etiqueta: 'Acueducto', etiquetaPlural: 'Acueductos',
        hojaExcel: 'Formato B-2.1-ACUEDUCTOS',
        filaInicioDatos: 15,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 5,
            zonaUtm: 6, este: 7, norte: 8, bloqueRiego: 26, observacion: 27,
        },
        colEstado: 12,
        camposReferencia: [
            { indice: 9, clave: 'elevacion', etiqueta: 'Elevación (m)' },
            { indice: 10, clave: 'tipo', etiqueta: 'Tipo', diccionario: TIPO_ACUEDUCTO },
            { indice: 11, clave: 'material', etiqueta: 'Material', diccionario: MATERIAL_ACUEDUCTO },
            { indice: 13, clave: 'anchoTransicion1', etiqueta: 'Ancho 1 — Canal de Transición (m)' },
            { indice: 14, clave: 'anchoTransicion2', etiqueta: 'Ancho 2 — Canal de Transición (m)' },
            { indice: 15, clave: 'alturaTransicion', etiqueta: 'Altura — Canal de Transición (m)' },
            { indice: 16, clave: 'tiranteTransicion', etiqueta: 'Tirante — Canal de Transición (m)' },
            { indice: 17, clave: 'anchoAcueducto', etiqueta: 'Ancho Total — Acueducto (m)' },
            { indice: 18, clave: 'anchoInternoAcueducto', etiqueta: 'Ancho Interno — Acueducto (m)' },
            { indice: 19, clave: 'alturaAcueducto', etiqueta: 'Altura — Acueducto (m)' },
            { indice: 20, clave: 'tiranteAcueducto', etiqueta: 'Tirante — Acueducto (m)' },
            { indice: 21, clave: 'diametro', etiqueta: 'Diámetro (m)' },
            { indice: 22, clave: 'longitud', etiqueta: 'Longitud (m)' },
            { indice: 23, clave: 'estadoIngreso', etiqueta: 'Estado — Estribo de Ingreso', diccionario: ESTADO_INVENTARIO },
            { indice: 24, clave: 'estadoSalida', etiqueta: 'Estado — Estribo de Salida', diccionario: ESTADO_INVENTARIO },
            { indice: 25, clave: 'estadoPilar', etiqueta: 'Estado — Pilar', diccionario: ESTADO_INVENTARIO },
        ],
    },
    // Divide el flujo en hasta 2 canales de derivación + una "estructura de
    // control" (vertedero o compuerta, casi siempre vacía en el Excel real
    // — se deja igual como referencia). El código de "Tipo" de cada
    // compuerta ('G' en los datos reales) no tiene leyenda propia en esta
    // hoja — se muestra tal cual, sin inventar significado.
    repartidor: {
        etiqueta: 'Repartidor', etiquetaPlural: 'Repartidores',
        hojaExcel: 'Formato B-2.8-REPARTIDOR',
        filaInicioDatos: 15,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 5,
            zonaUtm: 6, este: 7, norte: 8, bloqueRiego: 32, observacion: 33,
        },
        colEstado: 12,
        camposReferencia: [
            { indice: 9, clave: 'elevacion', etiqueta: 'Elevación (m)' },
            { indice: 10, clave: 'tipo', etiqueta: 'Tipo', diccionario: TIPO_PASE },
            { indice: 11, clave: 'material', etiqueta: 'Material', diccionario: MATERIAL_REPARTIDOR },
            { indice: 13, clave: 'anchoEntrada', etiqueta: 'Ancho — Canal de Entrada (m)' },
            { indice: 14, clave: 'alturaEntrada', etiqueta: 'Altura — Canal de Entrada (m)' },
            { indice: 15, clave: 'tiranteEntrada', etiqueta: 'Tirante — Canal de Entrada (m)' },
            { indice: 16, clave: 'anchoSalida', etiqueta: 'Ancho — Canal de Salida (m)' },
            { indice: 17, clave: 'alturaSalida', etiqueta: 'Altura — Canal de Salida (m)' },
            { indice: 18, clave: 'tiranteSalida', etiqueta: 'Tirante — Canal de Salida (m)' },
            { indice: 19, clave: 'anchoDerivacion1', etiqueta: 'Ancho — Canal de Derivación 1 (m)' },
            { indice: 20, clave: 'alturaDerivacion1', etiqueta: 'Altura — Canal de Derivación 1 (m)' },
            { indice: 21, clave: 'tiranteDerivacion1', etiqueta: 'Tirante — Canal de Derivación 1 (m)' },
            { indice: 22, clave: 'estadoDerivacion1', etiqueta: 'Estado — Compuerta Derivación 1', diccionario: ESTADO_INVENTARIO },
            { indice: 23, clave: 'tipoDerivacion1', etiqueta: 'Tipo — Compuerta Derivación 1' },
            { indice: 24, clave: 'anchoDerivacion2', etiqueta: 'Ancho — Canal de Derivación 2 (m)' },
            { indice: 25, clave: 'alturaDerivacion2', etiqueta: 'Altura — Canal de Derivación 2 (m)' },
            { indice: 26, clave: 'tiranteDerivacion2', etiqueta: 'Tirante — Canal de Derivación 2 (m)' },
            { indice: 27, clave: 'estadoDerivacion2', etiqueta: 'Estado — Compuerta Derivación 2', diccionario: ESTADO_INVENTARIO },
            { indice: 28, clave: 'tipoDerivacion2', etiqueta: 'Tipo — Compuerta Derivación 2' },
            { indice: 29, clave: 'estadoVertedero', etiqueta: 'Estado — Vertedero (Estructura de Control)', diccionario: ESTADO_INVENTARIO },
            { indice: 30, clave: 'estadoCompuertaControl', etiqueta: 'Estado — Compuerta (Estructura de Control)', diccionario: ESTADO_INVENTARIO },
            { indice: 31, clave: 'tipoCompuertaControl', etiqueta: 'Tipo — Compuerta (Estructura de Control)' },
        ],
    },
    // 4 sub-componentes: Ducto, Desarenador, Sistema de Protección (Rejas)
    // y Cámara de Carga. En el Excel real solo el Ducto viene lleno para
    // los 4 sifones registrados — los otros 3 quedan como referencia para
    // cuando el levantamiento los complete. El Estado editable de la tabla
    // es el del Ducto (col. 15), el componente siempre presente.
    sifon_invertido: {
        etiqueta: 'Sifón Invertido', etiquetaPlural: 'Sifones Invertidos',
        hojaExcel: 'Formato B-2.2-SIFON INVERTIDO',
        filaInicioDatos: 16,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 5,
            zonaUtm: 6, este: 7, norte: 8, bloqueRiego: 34, observacion: 35,
        },
        colEstado: 15,
        camposReferencia: [
            { indice: 7, clave: 'esteInicio', etiqueta: 'Este inicio' },
            { indice: 8, clave: 'norteInicio', etiqueta: 'Norte inicio' },
            { indice: 9, clave: 'elevacionInicio', etiqueta: 'Elevación inicio (m)' },
            { indice: 10, clave: 'esteFinal', etiqueta: 'Este final' },
            { indice: 11, clave: 'norteFinal', etiqueta: 'Norte final' },
            { indice: 12, clave: 'elevacionFinal', etiqueta: 'Elevación final (m)' },
            { indice: 13, clave: 'tipo', etiqueta: 'Tipo — Ducto', diccionario: TIPO_PASE },
            { indice: 14, clave: 'materialDucto', etiqueta: 'Material — Ducto', diccionario: MATERIAL_SIFON },
            { indice: 16, clave: 'anchoDucto', etiqueta: 'Ancho — Ducto (m)' },
            { indice: 17, clave: 'altoDucto', etiqueta: 'Alto — Ducto (m)' },
            { indice: 18, clave: 'diametroDucto', etiqueta: 'Diámetro — Ducto (m)' },
            { indice: 19, clave: 'longitudDucto', etiqueta: 'Longitud — Ducto (m)' },
            { indice: 20, clave: 'materialDesarenador', etiqueta: 'Material — Desarenador', diccionario: MATERIAL_SIFON },
            { indice: 21, clave: 'estadoDesarenador', etiqueta: 'Estado — Desarenador', diccionario: ESTADO_INVENTARIO },
            { indice: 22, clave: 'longitudDesarenador', etiqueta: 'Longitud — Desarenador (m)' },
            { indice: 23, clave: 'anchoDesarenador', etiqueta: 'Ancho — Desarenador (m)' },
            { indice: 24, clave: 'altoDesarenador', etiqueta: 'Alto — Desarenador (m)' },
            { indice: 25, clave: 'materialRejas', etiqueta: 'Material — Sistema de Protección (Rejas)', diccionario: MATERIAL_SIFON },
            { indice: 26, clave: 'estadoRejas', etiqueta: 'Estado — Sistema de Protección (Rejas)', diccionario: ESTADO_INVENTARIO },
            { indice: 27, clave: 'longitudRejas', etiqueta: 'Longitud — Rejas (m)' },
            { indice: 28, clave: 'altoRejas', etiqueta: 'Alto — Rejas (m)' },
            { indice: 29, clave: 'materialCamara', etiqueta: 'Material — Cámara de Carga', diccionario: MATERIAL_SIFON },
            { indice: 30, clave: 'estadoCamara', etiqueta: 'Estado — Cámara de Carga', diccionario: ESTADO_INVENTARIO },
            { indice: 31, clave: 'longitudCamara', etiqueta: 'Longitud — Cámara de Carga (m)' },
            { indice: 32, clave: 'anchoCamara', etiqueta: 'Ancho — Cámara de Carga (m)' },
            { indice: 33, clave: 'altoCamara', etiqueta: 'Alto — Cámara de Carga (m)' },
        ],
    },
    // A diferencia de los demás tipos, un dren no está "sobre" un canal —
    // descarga hacia un río u otro dren. Se reutiliza igual el mismo par
    // canalFuente/nombreCanal (canalFuente = adónde vierte, ej. "Rio
    // Chira"; nombreCanal = el nombre propio del dren) — resolverTomaPorCanal
    // nunca encuentra un "Principal SDx" ahí, así que estos registros
    // quedan correctamente agrupados como "Sin toma asignada" (no
    // pertenecen a ninguna toma, es lo esperado, no un error). Sin columna
    // Zona ni Bloque de Riego en esta hoja. Margen (D/I respecto al río)
    // va como referencia (no en la columna dedicada `margen` de la tabla,
    // para no tocar el parser/sync compartido por los 12 tipos).
    dren_principal: {
        etiqueta: 'Dren Principal', etiquetaPlural: 'Drenes Principales',
        hojaExcel: 'Formato B-7. DRENE PRINC. ',
        filaInicioDatos: 14,
        colIndice: {
            numeroOrden: 1, canalFuente: 2, nombreCanal: 5, progresivaKm: 3,
            este: 6, norte: 7, observacion: 30,
        },
        colEstado: 10,
        camposReferencia: [
            { indice: 4, clave: 'margen', etiqueta: 'Margen (respecto al río)', diccionario: MARGEN_INVENTARIO },
            { indice: 6, clave: 'esteInicio', etiqueta: 'Este inicio' },
            { indice: 7, clave: 'norteInicio', etiqueta: 'Norte inicio' },
            { indice: 8, clave: 'esteFinal', etiqueta: 'Este final' },
            { indice: 9, clave: 'norteFinal', etiqueta: 'Norte final' },
            { indice: 11, clave: 'caudalM3s', etiqueta: 'Caudal Q (m³/s)' },
            { indice: 12, clave: 'caudalLs', etiqueta: 'Caudal Q (l/s)' },
            { indice: 13, clave: 'baseMayor', etiqueta: 'Base Mayor B (m)' },
            { indice: 14, clave: 'baseMenor', etiqueta: 'Base Menor b (m)' },
            { indice: 15, clave: 'altura', etiqueta: 'Altura H (m)' },
            { indice: 16, clave: 'talud', etiqueta: 'Talud Z' },
            { indice: 17, clave: 'pendiente', etiqueta: 'Pendiente S (%)' },
            { indice: 18, clave: 'longitudM', etiqueta: 'Longitud (m)' },
            { indice: 19, clave: 'longitudKm', etiqueta: 'Longitud (km)' },
            { indice: 20, clave: 'tirante', etiqueta: 'Tirante y (m)' },
            { indice: 21, clave: 'perimetroMojado', etiqueta: 'Perímetro Mojado P (m)' },
            { indice: 22, clave: 'areaHidraulica', etiqueta: 'Área Hidráulica A (m²)' },
            { indice: 23, clave: 'radioHidraulico', etiqueta: 'Radio Hidráulico R (m)' },
            { indice: 24, clave: 'longitudCaminoVigilancia', etiqueta: 'Longitud — Camino de Vigilancia (m)' },
            { indice: 25, clave: 'anchoCaminoVigilancia', etiqueta: 'Ancho — Camino de Vigilancia (m)' },
            { indice: 26, clave: 'caminoVigilanciaDerecha', etiqueta: 'Camino de Vigilancia — Margen Derecha' },
            { indice: 27, clave: 'caminoVigilanciaIzquierda', etiqueta: 'Camino de Vigilancia — Margen Izquierda' },
            { indice: 28, clave: 'areaBeneficiada', etiqueta: 'Área Beneficiada (ha)' },
            { indice: 29, clave: 'numeroUsuarios', etiqueta: 'Número de Usuarios' },
        ],
    },
    // Mismo patrón que Dren Principal (canalFuente = adónde vierte —
    // puede ser un Dren Principal u otro Dren Secundario; nombreCanal =
    // nombre propio de este dren), con una columna extra "D (M)" (col. 24)
    // que en esta hoja no tiene número de leyenda ni descripción — se
    // muestra tal cual el encabezado real, sin inventar qué significa;
    // eso corre el resto de columnas +1 respecto a Dren Principal.
    dren_secundario: {
        etiqueta: 'Dren Secundario', etiquetaPlural: 'Drenes Secundarios',
        hojaExcel: 'Formato B-8. DRENES SECUND.',
        filaInicioDatos: 14,
        colIndice: {
            numeroOrden: 1, canalFuente: 2, nombreCanal: 5, progresivaKm: 3,
            este: 6, norte: 7, observacion: 31,
        },
        colEstado: 10,
        camposReferencia: [
            { indice: 4, clave: 'margen', etiqueta: 'Margen (respecto al dren/fuente)', diccionario: MARGEN_INVENTARIO },
            { indice: 6, clave: 'esteInicio', etiqueta: 'Este inicio' },
            { indice: 7, clave: 'norteInicio', etiqueta: 'Norte inicio' },
            { indice: 8, clave: 'esteFinal', etiqueta: 'Este final' },
            { indice: 9, clave: 'norteFinal', etiqueta: 'Norte final' },
            { indice: 11, clave: 'caudalM3s', etiqueta: 'Caudal Q (m³/s)' },
            { indice: 12, clave: 'caudalLs', etiqueta: 'Caudal Q (l/s)' },
            { indice: 13, clave: 'baseMayor', etiqueta: 'Base Mayor B (m)' },
            { indice: 14, clave: 'baseMenor', etiqueta: 'Base Menor b (m)' },
            { indice: 15, clave: 'altura', etiqueta: 'Altura H (m)' },
            { indice: 16, clave: 'talud', etiqueta: 'Talud Z' },
            { indice: 17, clave: 'pendiente', etiqueta: 'Pendiente S (%)' },
            { indice: 18, clave: 'longitudM', etiqueta: 'Longitud (m)' },
            { indice: 19, clave: 'longitudKm', etiqueta: 'Longitud (km)' },
            { indice: 20, clave: 'tirante', etiqueta: 'Tirante y (m)' },
            { indice: 21, clave: 'perimetroMojado', etiqueta: 'Perímetro Mojado P (m)' },
            { indice: 22, clave: 'areaHidraulica', etiqueta: 'Área Hidráulica A (m²)' },
            { indice: 23, clave: 'radioHidraulico', etiqueta: 'Radio Hidráulico R (m)' },
            { indice: 24, clave: 'dSinDescripcion', etiqueta: 'D (M) — sin leyenda en el Excel' },
            { indice: 25, clave: 'longitudCaminoVigilancia', etiqueta: 'Longitud — Camino de Vigilancia (m)' },
            { indice: 26, clave: 'anchoCaminoVigilancia', etiqueta: 'Ancho — Camino de Vigilancia (m)' },
            { indice: 27, clave: 'caminoVigilanciaDerecha', etiqueta: 'Camino de Vigilancia — Margen Derecha' },
            { indice: 28, clave: 'caminoVigilanciaIzquierda', etiqueta: 'Camino de Vigilancia — Margen Izquierda' },
            { indice: 29, clave: 'areaBeneficiada', etiqueta: 'Área Beneficiada (ha)' },
            { indice: 30, clave: 'numeroUsuarios', etiqueta: 'Número de Usuarios' },
        ],
    },
    // La hoja más ancha (47 columnas reales, no las 1191 que reporta
    // ExcelJS por celdas con formato heredado sin datos) pero sigue siendo
    // una fila por lateral, igual que los demás tipos. canalFuente/
    // nombreCanal son el mismo par canal→canal ya usado en todo el
    // sistema (acá con nombres propios: "Nombre del canal de derivación o
    // lateral fuente" / "Nombre del Lateral"). Se omiten las columnas de
    // longitud duplicadas en km (40-42, redundantes con 37-39 en metros).
    canal_lateral: {
        etiqueta: 'Canal Lateral', etiquetaPlural: 'Canales Laterales',
        hojaExcel: 'Formato B-5. CANALES LATERALES',
        filaInicioDatos: 15,
        colIndice: {
            numeroOrden: 1, nombreObra: 2, canalFuente: 3, nombreCanal: 4, progresivaKm: 6,
            este: 7, norte: 8, bloqueRiego: 46, observacion: 47,
        },
        colEstado: 18,
        camposReferencia: [
            // Orden y coordenadas de inicio/final se marcan `editable` a
            // pedido explícito del usuario (el mapa GIS ya trae la
            // geometría real — este/norte inicio/final son lo que el
            // sectorista puede corregir en campo si difiere).
            { indice: 5, clave: 'ordenLateral', etiqueta: 'Orden del Lateral', editable: true },
            { indice: 7, clave: 'esteInicio', etiqueta: 'Este inicio', editable: true },
            { indice: 8, clave: 'norteInicio', etiqueta: 'Norte inicio', editable: true },
            { indice: 9, clave: 'esteFinal', etiqueta: 'Este final', editable: true },
            { indice: 10, clave: 'norteFinal', etiqueta: 'Norte final', editable: true },
            { indice: 11, clave: 'margen', etiqueta: 'Margen', diccionario: MARGEN_INVENTARIO, editable: true },
            { indice: 12, clave: 'tipoUso', etiqueta: 'Tipo de Uso', diccionario: TIPO_USO_LATERAL },
            { indice: 13, clave: 'numeroUsuarios', etiqueta: 'Número Total de Usuarios' },
            { indice: 14, clave: 'areaBajoRiego', etiqueta: 'Área Total Bajo Riego (ha)' },
            { indice: 15, clave: 'volumenOtorgado', etiqueta: 'Volumen Otorgado (Hm³)' },
            // Editables: cuando se revierte/reviste un tramo de canal, el
            // sectorista corrige acá el Tipo y las longitudes — la
            // corrección queda guardada en el inventario (no solo
            // Estado/Observación como el resto de tipos genéricos).
            { indice: 16, clave: 'tipo', etiqueta: 'Tipo de Canal', diccionario: TIPO_CANAL_LATERAL, editable: true },
            { indice: 17, clave: 'material', etiqueta: 'Material', diccionario: MATERIAL_CANAL_LATERAL },
            { indice: 19, clave: 'caudalDiseno', etiqueta: 'Caudal de Diseño (m³/s)' },
            { indice: 20, clave: 'caudalOperacionM3s', etiqueta: 'Caudal de Operación (m³/s)' },
            { indice: 21, clave: 'caudalOperacionLs', etiqueta: 'Caudal de Operación (l/s)' },
            { indice: 22, clave: 'numeroCompuertas', etiqueta: 'N° de Compuertas' },
            { indice: 23, clave: 'anchoCompuerta', etiqueta: 'Ancho — Compuerta (m)' },
            { indice: 24, clave: 'altoCompuerta', etiqueta: 'Alto — Compuerta (m)' },
            { indice: 25, clave: 'materialCompuerta', etiqueta: 'Material — Compuerta', diccionario: MATERIAL_COMPUERTA_LATERAL },
            { indice: 26, clave: 'estadoCompuerta', etiqueta: 'Estado — Compuerta', diccionario: ESTADO_INVENTARIO },
            { indice: 27, clave: 'baseMayor', etiqueta: 'Base Mayor B (m)' },
            { indice: 28, clave: 'baseMenor', etiqueta: 'Base Menor b (m)' },
            { indice: 29, clave: 'altura', etiqueta: 'Altura H (m)' },
            { indice: 30, clave: 'talud', etiqueta: 'Talud Z' },
            { indice: 31, clave: 'tirante', etiqueta: 'Tirante y (m)' },
            { indice: 32, clave: 'desnivel', etiqueta: 'Desnivel ΔH' },
            { indice: 33, clave: 'pendiente', etiqueta: 'Pendiente S (%)' },
            { indice: 34, clave: 'perimetroMojado', etiqueta: 'Perímetro Mojado P (m)' },
            { indice: 35, clave: 'areaHidraulica', etiqueta: 'Área Hidráulica A (m²)' },
            { indice: 36, clave: 'radioHidraulico', etiqueta: 'Radio Hidráulico R (m)' },
            { indice: 37, clave: 'longitudRevestida', etiqueta: 'Longitud Revestida (m)', editable: true },
            { indice: 38, clave: 'longitudSinRevestir', etiqueta: 'Longitud Sin Revestir (m)', editable: true },
            { indice: 39, clave: 'longitudTotal', etiqueta: 'Longitud Total (m)', editable: true },
            { indice: 43, clave: 'numeroMedidores', etiqueta: 'N° Total de Medidores' },
            { indice: 44, clave: 'tipoMedidor', etiqueta: 'Tipo — Medidor', diccionario: TIPO_MEDIDOR_LATERAL },
            { indice: 45, clave: 'estadoMedidor', etiqueta: 'Estado — Medidor', diccionario: ESTADO_INVENTARIO },
        ],
    },
};

// Nombres reales de columna de cada KMZ del levantamiento GIS (ver
// mapas/inventario_gis/*.json) — permite normalizar cada figura del mapa
// y emparejarla contra su fila real de Supabase por la misma clave
// natural que ya usa la sincronización (canal_fuente + nombre_canal +
// progresiva_km). Los 11 tipos puntuales comparten el mismo esquema de
// columnas (CANAL FUENTE/CANAL LATERAL/PROGRESIVA + COORDENADA ESTE/
// NORTE); Canales Laterales y Drenes usan sus propios nombres de columna
// (verificados contra el KMZ real, no supuestos) y traen inicio/final en
// vez de un solo punto.
const CLAVES_KMZ_POR_TIPO = {
    toma: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    compuerta: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    acueducto: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    alcantarilla: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    caida: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    medidor: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERALES', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    pase_peatonal: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    pase_vehicular: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    rapida: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    repartidor: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    sifon_invertido: { canalFuenteKey: 'CANAL FUENTE', nombreCanalKey: 'CANAL LATERAL', progresivaKey: 'PROGRESIVA', esteKey: 'COORDENADA ESTE', norteKey: 'COORDENADA NORTE' },
    canal_lateral: { canalFuenteKey: 'CANAL_FUEN', nombreCanalKey: 'NOMBRE', progresivaKey: 'PROGRESIVA', esteIniKey: 'ESTE_INI', norteIniKey: 'NORTE_INI', esteFinKey: 'ESTE_FIN', norteFinKey: 'NORTE_FIN' },
    dren_principal: { canalFuenteKey: null, nombreCanalKey: 'NOMBRE DE DREN COLECTOR', progresivaKey: 'PROGRESIVA (Km)', esteIniKey: 'ESTE INICIO', norteIniKey: 'NORTE INICIO', esteFinKey: 'ESTE FINAL', norteFinKey: 'NORTE FINAL' },
    dren_secundario: { canalFuenteKey: null, nombreCanalKey: 'NOMBRE DE DREN SECUNDARIO', progresivaKey: 'PROGRESIVA (Km)', esteIniKey: 'ESTE INICIO', norteIniKey: 'NORTE INICIO', esteFinKey: 'ESTE FINAL', norteFinKey: 'NORTE FINAL' },
};

// Tipos cuya geometría real en el KMZ es una línea (LineString), no un
// punto — determina si la ficha muestra Este/Norte único o las 4
// coordenadas de inicio/final, y si el mapa dibuja L.polyline o
// L.circleMarker.
const TIPOS_LINEALES_GIS = ['canal_lateral', 'dren_principal', 'dren_secundario'];

// Los 9 tipos puntuales que reciben el mismo tratamiento que Toma: ícono
// real del KMZ (mapas/inventario_gis/iconos/<tipo>.png), ubicación GPS en
// tiempo real, sin polígono de predios, sin dibujo esquemático ni
// hipervínculo de usuarios (a pedido explícito del usuario — ninguno de
// estos formatos oficiales trae una lista de usuarios propia). Alcantarilla
// y Rápida sí tienen ícono real en mapas/inventario_gis/iconos/
// (confirmado por el usuario) — incluidos.
const TIPOS_PUNTUALES_GIS = ['toma', 'compuerta', 'pase_vehicular', 'pase_peatonal', 'caida', 'medidor', 'acueducto', 'repartidor', 'sifon_invertido', 'alcantarilla', 'rapida'];

// Qué tan completa está una estructura respecto al Formato oficial de ANA
// — "requerido" = Estado + todo campo de referencia NO editable (los
// `editable:true` son correcciones de campo, no datos que el Excel deba
// traer de entrada). No evalúa fotos acá (requeriría una consulta a
// Storage por fila — se hace aparte, solo en la ficha, ver
// movil/inventario-infraestructura.html).
function calcularCompletitudEstructura(tipo, registro) {
    var checks = [{ etiqueta: 'Estado', valor: registro.estado }];
    if (tipo === 'toma') {
        checks.push({ etiqueta: 'Material', valor: registro.material });
        checks.push({ etiqueta: 'Tipo de captación', valor: registro.tipo });
        checks.push({ etiqueta: 'Dimensión A', valor: registro.dimension_a });
        checks.push({ etiqueta: 'Dimensión H', valor: registro.dimension_h });
    } else if (tipo === 'compuerta') {
        checks.push({ etiqueta: 'Tipo', valor: registro.tipo });
        checks.push({ etiqueta: 'Material', valor: registro.material });
        checks.push({ etiqueta: 'Operación', valor: registro.operacion });
        checks.push({ etiqueta: 'Hoja A', valor: registro.hoja_a });
        checks.push({ etiqueta: 'Hoja H', valor: registro.hoja_h });
    } else {
        var def = TIPOS_ESTRUCTURA_GENERICOS[tipo];
        var campos = registro.campos || {};
        (def && def.camposReferencia ? def.camposReferencia : []).forEach(function (c) {
            if (c.editable) return;
            checks.push({ etiqueta: c.etiqueta, valor: campos[c.clave] });
        });
    }
    var faltantes = checks
        .filter(function (c) { return c.valor === undefined || c.valor === null || c.valor === ''; })
        .map(function (c) { return c.etiqueta; });
    var porcentaje = checks.length ? Math.round(100 * (checks.length - faltantes.length) / checks.length) : 100;
    return { porcentaje: porcentaje, faltantes: faltantes };
}
