// ══ Núcleo compartido — intérprete de intención del Asistente de Voz ══
// Traductor de preguntas en español (por voz o tecleadas) a una intención
// estructurada, SIN IA — palabras clave + patrones sobre 4 tipos de
// pregunta de campo (deuda de un usuario, agua programada hoy en una
// toma/canal, ubicación de una toma, e "información" general de una
// toma que combina las dos anteriores). No entiende lenguaje 100% libre;
// si no reconoce nada, intent:'desconocido' y el llamador debe mostrar
// la pregunta tal cual para que el usuario reformule o use el texto.
//
// No depende de Supabase ni del DOM. Reutiliza ORDEN_FIJO_CANAL_SUR /
// TOMAS_ORDEN_AL_FINAL de assets/core/anexoG2.js (debe cargarse antes que
// este script).
//
// Soporta memoria de conversación: interpretarPreguntaVoz(texto, contexto)
// recibe opcionalmente { ultimaToma, ultimaPersona } — si la pregunta no
// menciona explícitamente una toma/canal o un nombre, se usa lo último
// recordado (así "¿dónde está la toma SD3?" seguido de "¿y cuánta agua
// tiene?" no necesita repetir "SD3"). La función sigue siendo pura — el
// llamador es quien guarda/actualiza el contexto entre preguntas.

function _avQuitarTildes(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function _avNormalizar(s) {
    return _avQuitarTildes((s || '').toLowerCase())
        .replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
}
function _avLimpiarRemanente(s) {
    return (s || '').replace(/^(el|la|los|las|del|de la|de el|de)\s+/i, '').trim();
}

// ── Robustez ante el reconocimiento de voz: "SD3" se escucha frecuentemente
// como "ese de tres" (los nombres de las letras en español) en vez de las
// siglas — se reconstruye el código antes de buscarlo en la lista de tomas.
const _AV_NUMEROS_PALABRA = {
    cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
};
function _avNormalizarCodigosToma(norm) {
    let s = norm;
    // Letras deletreadas por su nombre en español ("ese"=S, "de"=D, "i"=I) -> siglas
    s = s.replace(/\bese\s+de\b/g, 'sd').replace(/\bese\s+i\b/g, 'si');
    s = s.replace(/\bs\s+de\b/g, 'sd').replace(/\bs\s+i\b/g, 'si');
    // Números escritos con palabras -> dígitos
    s = s.replace(/\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince)\b/g,
        (w) => String(_AV_NUMEROS_PALABRA[w]));
    // "punto"/"coma" + número -> ".número" (ej. SD8.1)
    s = s.replace(/\s*(?:punto|coma)\s*(\d+)/g, '.$1');
    // Pegar el código de letras con el número que le sigue inmediatamente ("sd 3" -> "sd3")
    s = s.replace(/\b(sd|si)\s+(\d)/g, '$1$2');
    return s.replace(/\s+/g, ' ').trim();
}

// Busca una toma conocida o "canal sur" en CUALQUIER posición de la
// frase ya normalizada — robusto al orden libre del español hablado
// (a diferencia de un regex anclado a una posición exacta de la frase).
function _avBuscarTomaOCanalEnFrase(norm) {
    const compacto = ' ' + _avQuitarTildes(norm).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
    if (compacto.includes(' CANAL SUR ') || compacto.includes(' TODO EL CANAL ') || compacto.includes(' TODAS LAS TOMAS ')) {
        return { tipo: 'canal', valor: 'CANAL_SUR', textoOriginal: norm };
    }
    // Ordenar por longitud del nombre compactado DESCENDENTE antes de comparar: "SD8.1" se
    // compacta a "SD8 1", que contiene "SD8" como subcadena — si se probara "SD8" primero,
    // "ubicación de SD8.1" resolvería mal a la toma "SD8". Probando primero los nombres más
    // largos/específicos, "SD8.1" gana el match antes de que "SD8" tenga oportunidad.
    const candidatas = (typeof ORDEN_FIJO_CANAL_SUR !== 'undefined' ? ORDEN_FIJO_CANAL_SUR : [])
        .concat(typeof TOMAS_ORDEN_AL_FINAL !== 'undefined' ? TOMAS_ORDEN_AL_FINAL : [])
        .slice()
        .sort((a, b) => b.length - a.length);
    for (const nombre of candidatas) {
        const nombreCompacto = ' ' + nombre.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
        if (compacto.includes(nombreCompacto)) return { tipo: 'toma', valor: nombre, textoOriginal: norm };
    }
    return { tipo: 'desconocido', valor: norm, textoOriginal: norm };
}

// Resuelve toma/canal para una pregunta de ubicación/agua/info: si la
// frase no menciona ninguna explícitamente, cae al contexto de la
// conversación (última toma mencionada), si lo hay.
function _avResolverTomaConContexto(norm, contexto) {
    const resuelto = _avBuscarTomaOCanalEnFrase(_avNormalizarCodigosToma(norm));
    if (resuelto.tipo !== 'desconocido') return resuelto;
    if (contexto && contexto.ultimaToma) {
        return { tipo: 'toma', valor: contexto.ultimaToma, textoOriginal: resuelto.textoOriginal, deContexto: true };
    }
    return resuelto;
}

// ── Día objetivo para preguntas de agua/riego: "hoy" (por defecto),
// "mañana", "pasado mañana", o el nombre de cualquier día de la semana
// ("domingo", "el lunes"...). Las claves de caudalesPorDiaDetallado ya
// son estos mismos nombres en español sin tilde, así que no hace falta
// traducir nada más allá de calcular a qué fecha corresponde.
const _AV_DIAS_ABS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']; // indexado como Date.getDay()

function _avResolverDiaObjetivo(norm) {
    let offsetDias = null;
    if (/\bpasado\s+manana\b/.test(norm)) offsetDias = 2;
    else if (/\bmanana\b/.test(norm)) offsetDias = 1;
    else if (/\bhoy\b/.test(norm)) offsetDias = 0;

    if (offsetDias === null) {
        // Nombre de día explícito ("domingo", "el lunes"...) -> la próxima
        // ocurrencia de ese día (hoy mismo si hoy ES ese día).
        const hoy = new Date();
        for (let i = 0; i < _AV_DIAS_ABS.length; i++) {
            if (new RegExp('\\b' + _AV_DIAS_ABS[i] + '\\b').test(norm)) {
                offsetDias = ((i - hoy.getDay()) + 7) % 7;
                break;
            }
        }
    }
    if (offsetDias === null) offsetDias = 0; // sin mención explícita: "hoy" por defecto

    const fecha = new Date();
    fecha.setDate(fecha.getDate() + offsetDias);
    const claveDia = _AV_DIAS_ABS[fecha.getDay()];
    const etiqueta = offsetDias === 0 ? 'Hoy' : offsetDias === 1 ? 'Mañana' : offsetDias === 2 ? 'Pasado mañana' : 'El ' + claveDia;
    // Variante en minúsculas para insertar a mitad de frase ("...programados para HOY/MAÑANA/EL DOMINGO").
    const etiquetaPara = offsetDias === 0 ? 'hoy' : offsetDias === 1 ? 'mañana' : offsetDias === 2 ? 'pasado mañana' : 'el ' + claveDia;
    const y = fecha.getFullYear(), m = String(fecha.getMonth() + 1).padStart(2, '0'), d = String(fecha.getDate()).padStart(2, '0');
    return { claveDia, etiqueta, etiquetaPara, offsetDias, fechaISO: y + '-' + m + '-' + d };
}

// Palabras que pueden aparecer justo después de "deuda"/"debe" pero que
// describen QUÉ deuda (no A QUIÉN) — ej. "¿y su deuda atrasada?". Si el
// extractor "captura" una de estas solas, no es un nombre real: se
// descarta para que el llamador caiga al contexto de la conversación.
const _AV_PALABRAS_NO_NOMBRE = new Set([
    'atrasada', 'atrasado', 'campana', 'convenio', 'total', 'pagada', 'pagado', 'pendiente',
]);

// Extrae el nombre de una persona para DEUDA, aceptando las dos formas
// naturales del español: "¿cuál es la deuda de Juan Pérez?" (disparador
// antes del nombre) y "Juan Pérez, ¿cuánto debe?" (disparador después).
// Se prueba primero la forma "nombre + disparador al final" (anclada a
// todo el string, más específica) para que "María López qué deuda tiene"
// no termine matcheando el patrón genérico "deuda (.+)" y capturando
// "tiene" en vez del nombre.
function _avExtraerNombreDeuda(norm) {
    let candidato = null;

    const disparadorDespues = /^(.+?)\s+(?:cuanto debe|que deuda tiene|debe cuanto|cuanta deuda tiene)\s*$/;
    const m2 = norm.match(disparadorDespues);
    if (m2 && m2[1] && m2[1].trim().length >= 2) candidato = m2[1].trim();

    if (!candidato) {
        const disparadorAntes = /(?:cual es la deuda|cuanta deuda tiene|informacion de deuda|deuda|cuanto debe)\s+(?:del usuario\s+|de la\s+|de\s+|pagar\s+)*(.+)$/;
        const m1 = norm.match(disparadorAntes);
        if (m1 && m1[1] && m1[1].trim().length >= 2) candidato = _avLimpiarRemanente(m1[1]);
    }

    if (candidato && _AV_PALABRAS_NO_NOMBRE.has(candidato.trim())) return null;
    return candidato;
}

/**
 * Interpreta una pregunta en español (texto crudo, con o sin tildes/signos)
 * y devuelve la intención estructurada:
 *   - { intent: 'deuda', parametro: '<nombre buscado>' }
 *   - { intent: 'agua_hoy', parametro: { tipo:'canal'|'toma'|'desconocido', valor, textoOriginal, deContexto?, dia } }
 *   - { intent: 'ubicacion', parametro: { tipo:'toma'|'desconocido', valor, textoOriginal, deContexto? } }
 *   - { intent: 'info_toma', parametro: { tipo:'canal'|'toma'|'desconocido', valor, textoOriginal, deContexto?, dia } }
 *   - { intent: 'desconocido', parametro: '<texto original>' }
 *
 * `dia` (en agua_hoy/info_toma): { claveDia:'lunes'..'domingo', etiqueta:'Hoy'|'Mañana'|..., offsetDias, fechaISO } —
 * "hoy" por defecto si la pregunta no menciona ningún día; reconoce "mañana",
 * "pasado mañana" y cualquier nombre de día de la semana.
 *
 * `contexto` (opcional): { ultimaToma: 'SD3'|null, ultimaPersona: 'Juan Pérez'|null } —
 * lo último resuelto con éxito en la conversación, para preguntas de seguimiento
 * que no repiten la toma/persona.
 */
function interpretarPreguntaVoz(textoCrudo, contexto) {
    const original = (textoCrudo || '').trim();
    const norm = _avNormalizar(original);
    if (!norm) return { intent: 'desconocido', parametro: original };

    const tieneUbicacion = /\b(donde|ubicacion|ubicad[oa]|llegar|llego|ruta|queda|situad[oa]|encuentra|localizacion|posicion)\b/.test(norm);
    const tieneAgua = /\b(agua|riego|regando|regadio|caudal)\b/.test(norm);
    const tieneDeudaKw = /\b(deuda|debe|debo)\b/.test(norm);
    const tieneInfo = /\b(informacion|info|cuentame|hablame|datos de)\b/.test(norm);

    if (tieneUbicacion) {
        const resuelto = _avResolverTomaConContexto(norm, contexto);
        // Una ubicación puntual no aplica a "todo el canal" — si resolvió a
        // 'canal', se trata como 'desconocido' para pedir precisar una toma.
        const parametro = resuelto.tipo === 'canal'
            ? { tipo: 'desconocido', valor: resuelto.textoOriginal, textoOriginal: resuelto.textoOriginal }
            : resuelto;
        return { intent: 'ubicacion', parametro };
    }
    if (tieneAgua) {
        const resuelto = _avResolverTomaConContexto(norm, contexto);
        resuelto.dia = _avResolverDiaObjetivo(norm);
        return { intent: 'agua_hoy', parametro: resuelto };
    }
    if (tieneDeudaKw) {
        let nombre = _avExtraerNombreDeuda(norm);
        if (!nombre && contexto && contexto.ultimaPersona) nombre = contexto.ultimaPersona;
        if (nombre) return { intent: 'deuda', parametro: nombre };
        // Si mencionó "deuda"/"debe" pero no se pudo extraer nombre ni hay
        // contexto previo, se sigue intentando con las demás interpretaciones
        // (podría ser una frase con "informacion" también, ver abajo).
    }
    if (tieneInfo) {
        const resuelto = _avResolverTomaConContexto(norm, contexto);
        if (resuelto.tipo !== 'desconocido') {
            resuelto.dia = _avResolverDiaObjetivo(norm);
            return { intent: 'info_toma', parametro: resuelto };
        }
    }
    return { intent: 'desconocido', parametro: original };
}
