// ══ Núcleo compartido — tabla de referencia de módulo de riego por cultivo ══
// Para el Formato E-4.1 (Declaración de Intención de Siembra). El módulo
// (m3/ha), el período vegetativo (meses) y la fecha de siembra NO se le
// piden al agricultor — salen de esta tabla, igual que ya está fijo en el
// Excel real "DIS COMISION MARGEN IZQUIERDA.xlsx": ahí, en las 26 hojas de
// toma, cada cultivo usa siempre el mismo módulo/período/fecha sin importar
// la toma. Estos valores se extrajeron directamente de ese archivo (no son
// una estimación) y se verificaron contra la demanda de agua ya calculada
// en la hoja SD3 (ej. BANANO 40.4ha × 22100 = 0.89284 hm3, exacto).
//
// Claves normalizadas con normalizarCultivoNombre (assets/core/utilidades.js).
// Cultivos que no matcheen ninguna entrada devuelven null — la pantalla
// móvil y el exportador deben avisar "sin referencia", nunca asumir un
// valor por su cuenta.
//
// `moduloM3Ha` es el módulo de UNA campaña (columna "MÓDULO RIEGO" del
// Excel). Para calcular la demanda de agua real, los cultivos de ciclo
// corto (período < 12 meses) se replantan una segunda vez dentro del mismo
// año agrícola (campaña chica + campaña grande) — verificado comparando,
// en las 26 hojas reales, el área y módulo declarados contra la demanda ya
// calculada: los cultivos de 12 meses (BANANO, LIMONERO, PALTO, FRUTALES,
// CAÑA DE AZUCAR) dan demanda = área×módulo exacto (factor 1), mientras que
// ARROZ, SORGO y MAIZ dan exactamente el DOBLE (factor 2) en todos los
// casos verificados — ver `obtenerFactorAnual`. Esto no cambia con la
// actualización de MODULOS_MENSUAL de más abajo: la magnitud (moduloM3Ha)
// sigue viniendo de las 26 hojas de toma; solo la FORMA de la curva
// mensual (cómo se reparte esa demanda mes a mes) viene ahora del Anexo 05
// oficial — los coeficientes de la curva se normalizan a que sumen 1, así
// que reconcilian exacto con esta demanda sin importar la magnitud propia
// de la curva de origen (ver obtenerCurvaMensual).
const REFERENCIA_CULTIVO = {
    'BANANO': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    // "PLATANO" es, con enorme diferencia, el nombre que el padrón real usa
    // para este mismo cultivo (227 apariciones vs 0 de "BANANO" en una
    // muestra de 12 tomas) — alias verificado en campo, no una suposición.
    'PLATANO': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'MANGO': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'PAPAYA': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'LIMON': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'LIMONERO': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'FRUTALES': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'FRUTALES (MANGO, BANANO)': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'PALTO': { moduloM3Ha: 22100, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'FRUTALES TECNIFICADO': { moduloM3Ha: 17000, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'CAÑA DE AZUCAR (GRAVEDAD)': { moduloM3Ha: 22000, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'CAÑA DE AZUCAR (TEC.)': { moduloM3Ha: 10000, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'PASTOS': { moduloM3Ha: 16820, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    // "Pasto Elefante" es la variedad puntual detrás de este módulo,
    // según el Anexo 05 (ver MODULOS_MENSUAL) — mismo cultivo, alias.
    'PASTO ELEFANTE': { moduloM3Ha: 16820, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'ARROZ': { moduloM3Ha: 17000, periodoMeses: 5, siembraDia: 1, siembraMes: 8 },
    // "Arroz Directo" es un cultivo propio en el Anexo 05, distinto de
    // "Arroz Trasplante" (el que ya usa la clave "ARROZ" de arriba).
    'ARROZ DIRECTO': { moduloM3Ha: 15000, periodoMeses: 5, siembraDia: 1, siembraMes: 8 },
    'YUCA': { moduloM3Ha: 13700, periodoMeses: 10, siembraDia: 1, siembraMes: 8 },
    'AJI PAPRIKA': { moduloM3Ha: 12000, periodoMeses: 7, siembraDia: 1, siembraMes: 3 },
    'MAIZ': { moduloM3Ha: 7000, periodoMeses: 4, siembraDia: 1, siembraMes: 3 },
    'MELON/SANDIA': { moduloM3Ha: 9200, periodoMeses: 4, siembraDia: 1, siembraMes: 3 },
    'MELON': { moduloM3Ha: 9200, periodoMeses: 4, siembraDia: 1, siembraMes: 3 },
    'SANDIA': { moduloM3Ha: 9200, periodoMeses: 4, siembraDia: 1, siembraMes: 3 },
    'CEBOLLA': { moduloM3Ha: 10000, periodoMeses: 4, siembraDia: 1, siembraMes: 4 },
    'MENESTRAS/HORTALIZAS': { moduloM3Ha: 6000, periodoMeses: 4, siembraDia: 1, siembraMes: 4 },
    'FRIJOL': { moduloM3Ha: 6000, periodoMeses: 4, siembraDia: 1, siembraMes: 4 },
    'SORGO': { moduloM3Ha: 8400, periodoMeses: 4, siembraDia: 1, siembraMes: 8 },
    'SORGO ESCOBERO': { moduloM3Ha: 8400, periodoMeses: 4, siembraDia: 1, siembraMes: 8 },
    'SORGO - MAIZ': { moduloM3Ha: 8400, periodoMeses: 4, siembraDia: 1, siembraMes: 8 },
    'TUBEROSAS/MANÍ': { moduloM3Ha: 6000, periodoMeses: 4, siembraDia: 1, siembraMes: 8 },
    // Cultivos nuevos del Anexo 05 (campaña 2026-II/2027-I), sin entrada
    // previa en las 26 hojas de toma — moduloM3Ha = total de su curva
    // mensual (chica+grande) del Anexo 05, período/fecha de siembra
    // estimados por analogía con el cultivo de forma de curva más
    // parecida (misma convención ×2 ya usada arriba para ciclo corto).
    // Marcados aquí para que, si el usuario los declara con datos
    // distintos, pueda corregirlos.
    'ALFALFA': { moduloM3Ha: 20700, periodoMeses: 12, siembraDia: 1, siembraMes: 8 },
    'TOMATE': { moduloM3Ha: 9000, periodoMeses: 4, siembraDia: 1, siembraMes: 9 },
    'VERDURAS': { moduloM3Ha: 8000, periodoMeses: 4, siembraDia: 1, siembraMes: 9 },
    'ALGODÓN': { moduloM3Ha: 11200, periodoMeses: 7, siembraDia: 1, siembraMes: 8 },
    'ALGODON': { moduloM3Ha: 11200, periodoMeses: 7, siembraDia: 1, siembraMes: 8 },
    'MARGARITAS': { moduloM3Ha: 7000, periodoMeses: 4, siembraDia: 1, siembraMes: 8 },
};

// Devuelve la referencia de un cultivo, o null si no hay ninguna entrada
// que coincida (nombre exacto tras normalizar) — nunca adivina.
function obtenerReferenciaCultivo(nombreCultivo) {
    const clave = normalizarCultivoNombre(nombreCultivo);
    if (!clave) return null;
    return REFERENCIA_CULTIVO[clave] || null;
}

// Curva de módulo mensual (m3/ha) por cultivo [Ago..Jul], tomada tal cual
// del "ANEXO 05 — MÓDULOS DE RIEGO (TEÓRICOS) PRE APROBADOS" (Campaña
// Chica II-2026 + Campaña Grande I-2027), la tabla oficial vigente que
// reemplaza a la hoja "MODULOS" interna del Excel usada antes — el
// usuario confirmó que esta es la fuente autorizada actual. A diferencia
// de la hoja interna, este Anexo 05 SÍ trae curva para los cultivos
// permanentes también (no solo los de ciclo corto), agrupados por tipo de
// riego (Gravedad/Tecnificado) en vez de por nombre de cultivo — de ahí
// los alias PERMANENTES_GRAVEDAD/TECNIFICADO/TECNIFICADO_DE más abajo.
const CURVA_PERMANENTES_GRAVEDAD = { chica: [1800, 1800, 1800, 1800, 1800], grande: [1800, 1900, 2100, 2100, 1800, 1700, 1700] };
const CURVA_PERMANENTES_TECNIFICADO = { chica: [1400, 1400, 1400, 1400, 1400], grande: [1400, 1500, 1500, 1400, 1400, 1400, 1400] };
// "PERMANENTES TECNIFICADO (DE)" del Anexo 05 no tiene un nombre de
// cultivo específico asociado en el resto del sistema — se asignó a CAÑA
// DE AZUCAR (TEC.) por ser el único permanente tecnificado sin curva
// propia ya cubierta por CURVA_PERMANENTES_TECNIFICADO; si no es la
// asignación correcta, la magnitud de moduloM3Ha no se ve afectada (los
// coeficientes se normalizan a que sumen 1), solo cambiaría la FORMA
// mensual con la que se reparte esa demanda.
const CURVA_PERMANENTES_TECNIFICADO_DE = { chica: [1250, 1250, 1250, 1250, 1250], grande: [1250, 1250, 1250, 1250, 1250, 1250, 1250] };

const MODULOS_MENSUAL = {
    ARROZ: { chica: [5000, 3500, 3500, 3000, 2000], grande: [0, 5000, 3500, 3500, 3000, 2000, 0] }, // Arroz Trasplante
    'ARROZ DIRECTO': { chica: [3500, 3500, 3000, 3000, 2000], grande: [0, 3500, 3500, 3000, 3000, 2000, 0] },
    MAIZ: { chica: [2100, 1900, 1600, 1400, 0], grande: [0, 2100, 1900, 1600, 1400, 0, 0] },
    SORGO: { chica: [2100, 2100, 2100, 2400, 2400], grande: [1400, 2100, 2100, 2100, 2400, 2400, 1400] }, // Sorgo Escobero
    'TUBEROSAS/MANÍ': { chica: [2000, 1500, 1500, 2000, 1000], grande: [0, 2000, 1500, 1500, 2000, 1000, 0] },
    'MELON/SANDIA': { chica: [1500, 2000, 2000, 1500, 0], grande: [0, 1500, 2000, 2000, 1500, 0, 0] },
    'AJI PAPRIKA': { chica: [1000, 1000, 1500, 1500, 1000], grande: [1000, 2000, 2000, 2000, 2000, 2000, 2000] },
    CEBOLLA: { chica: [0, 2500, 2000, 3000, 2500], grande: [0, 0, 0, 2500, 2000, 3000, 2500] },
    'MENESTRAS/HORTALIZAS': { chica: [0, 1000, 2000, 2000, 2000], grande: [0, 0, 1000, 2000, 2000, 2000, 0] },
    YUCA: { chica: [1300, 1300, 1300, 1300, 1300], grande: [1300, 1300, 2000, 1300, 1300, 1300, 1300] },
    TOMATE: { chica: [0, 1700, 2700, 2900, 1700], grande: [0, 0, 0, 1700, 2700, 2900, 1700] },
    VERDURAS: { chica: [0, 2800, 1900, 1800, 1500], grande: [0, 0, 0, 2800, 1900, 1800, 1500] },
    'ALGODÓN': { chica: [3250, 2100, 2250, 2300, 1300], grande: [0, 0, 3250, 2100, 2250, 2300, 1300] },
    MARGARITAS: { chica: [2000, 1000, 1000, 1000, 1000], grande: [1000, 2000, 1000, 1000, 1000, 1000, 1000] },
    ALFALFA: { chica: [1800, 1800, 1800, 1800, 1800], grande: [1800, 1650, 1650, 1650, 1650, 1650, 1650] },
    'PASTO ELEFANTE': { chica: [1500, 1500, 1500, 1500, 1500], grande: [1500, 1320, 1520, 1520, 1220, 1120, 1120] },
};
// Alias — mismos cultivos que ya comparten entrada en REFERENCIA_CULTIVO.
MODULOS_MENSUAL['SORGO ESCOBERO'] = MODULOS_MENSUAL.SORGO;
MODULOS_MENSUAL['SORGO - MAIZ'] = MODULOS_MENSUAL.SORGO;
MODULOS_MENSUAL.MELON = MODULOS_MENSUAL['MELON/SANDIA'];
MODULOS_MENSUAL.SANDIA = MODULOS_MENSUAL['MELON/SANDIA'];
MODULOS_MENSUAL.FRIJOL = MODULOS_MENSUAL['MENESTRAS/HORTALIZAS'];
MODULOS_MENSUAL.ALGODON = MODULOS_MENSUAL['ALGODÓN'];
MODULOS_MENSUAL.PASTOS = MODULOS_MENSUAL['PASTO ELEFANTE'];
// Permanentes agrupados por tipo de riego en el Anexo 05 (ver constantes
// CURVA_PERMANENTES_* arriba) — un cultivo por cada nombre real que ya
// usa ese módulo/tipo de riego en REFERENCIA_CULTIVO.
['BANANO', 'PLATANO', 'MANGO', 'PAPAYA', 'LIMON', 'LIMONERO', 'FRUTALES', 'FRUTALES (MANGO, BANANO)', 'PALTO', 'CAÑA DE AZUCAR (GRAVEDAD)']
    .forEach((clave) => { MODULOS_MENSUAL[clave] = CURVA_PERMANENTES_GRAVEDAD; });
MODULOS_MENSUAL['FRUTALES TECNIFICADO'] = CURVA_PERMANENTES_TECNIFICADO;
MODULOS_MENSUAL['CAÑA DE AZUCAR (TEC.)'] = CURVA_PERMANENTES_TECNIFICADO_DE;

// Curva mensual [Ago..Jul] (12 valores) de m3/ha para un cultivo, o null
// si no tiene curva de referencia (permanentes y de ciclo corto por
// igual — ver MODULOS_MENSUAL). El llamador (construirHojaE41,
// Sistema_Riego_CUSSHMI_14.html) usa esta curva COMPLETA como coeficiente
// mensual (normalizada a que sume 1) multiplicado por la demanda anual ya
// calculada (calcularDemandaHm3) — así, sin importar si moduloM3Ha
// coincide en magnitud con el total de esta curva, la suma mensual
// siempre reconcilia exacto con la demanda anual ya mostrada en la tabla
// CULTIVO APROBADO. Si un cultivo no tiene curva, el llamador reparte su
// demanda en partes iguales entre los 12 meses (mismo criterio que el
// Excel real usaba para permanentes antes de tener el Anexo 05).
function obtenerCurvaMensual(nombreCultivo) {
    const clave = normalizarCultivoNombre(nombreCultivo);
    const curva = clave && MODULOS_MENSUAL[clave];
    if (!curva) return null;
    return curva.chica.concat(curva.grande);
}

// 2 para cultivos de ciclo corto (se replantan dentro del mismo año
// agrícola), 1 para cultivos permanentes de 12 meses — ver nota arriba.
function obtenerFactorAnual(referencia) {
    return referencia.periodoMeses < 12 ? 2 : 1;
}

// Demanda de agua anual en hm3 para un cultivo+área — área[ha] × módulo ×
// factor anual, convertido de m3 a hm3.
function calcularDemandaHm3(referencia, areaHa) {
    return (areaHa * referencia.moduloM3Ha * obtenerFactorAnual(referencia)) / 1e6;
}

// Fecha de cosecha = fecha de siembra + período vegetativo (meses), pura.
// Devuelve {dia, mes, anio}.
function calcularFechaCosecha(siembraDia, siembraMes, siembraAnio, periodoMeses) {
    const fecha = new Date(siembraAnio, (siembraMes - 1) + periodoMeses, siembraDia);
    return { dia: fecha.getDate(), mes: fecha.getMonth() + 1, anio: fecha.getFullYear() };
}
