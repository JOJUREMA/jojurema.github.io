// Dibujo esquemático de la sección de un canal/dren (SVG, función pura) —
// único tipo que conserva un esquema (Toma/Compuerta/Puentes lo perdieron
// a pedido explícito del usuario, ese formato no les corresponde).

function _svgNum(v) {
    var n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function _svgEnvoltura(contenidoSvg, anchoViewBox, altoViewBox) {
    return '<svg viewBox="0 0 ' + anchoViewBox + ' ' + altoViewBox + '" xmlns="http://www.w3.org/2000/svg" ' +
        'style="width:100%; max-width:360px; height:auto; display:block; margin:8px auto;">' + contenidoSvg + '</svg>';
}

function _svgEtiqueta(x, y, texto, anchor) {
    return '<text x="' + x + '" y="' + y + '" font-size="11" fill="#ffffff" text-anchor="' + (anchor || 'middle') + '" ' +
        'font-family="sans-serif">' + texto + '</text>';
}

// Canal Lateral y Drenes comparten la misma geometría de sección
// trapezoidal — un canal/dren abierto es más ancho ARRIBA (espejo de
// agua, Base Mayor B) que en la solera excavada (Base Menor b, ABAJO).
// H es la altura total de la sección, con su propia cota vertical a la
// izquierda del dibujo; el tirante y es el nivel de agua, medido desde
// la solera hacia arriba.
function dibujarSeccionTrapezoidal(baseMayor, baseMenor, altura, tirante) {
    var B = _svgNum(baseMayor), b = _svgNum(baseMenor), H = _svgNum(altura);
    var y = _svgNum(tirante); // el tirante es opcional — se dibuja si viene
    if (!B || !b || !H) return null;

    var MARGEN_IZQ = 46; // espacio reservado para la cota de H, sin recortarse
    var ANCHO_DIBUJO = 240;
    var escala = ANCHO_DIBUJO / Math.max(B, b);
    var Bpx = B * escala, bpx = b * escala, Hpx = H * escala;
    var margenXTope = MARGEN_IZQ + (ANCHO_DIBUJO - Bpx) / 2; // B, arriba (espejo de agua)
    var margenXBase = MARGEN_IZQ + (ANCHO_DIBUJO - bpx) / 2; // b, abajo (solera)
    var baseY = 170; // solera
    var topY = baseY - Hpx; // borde libre

    var puntos = [
        [margenXBase, baseY],
        [margenXBase + bpx, baseY],
        [margenXTope + Bpx, topY],
        [margenXTope, topY],
    ].map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');

    var contenido = '<polygon points="' + puntos + '" fill="rgba(0,188,212,0.18)" stroke="#00bcd4" stroke-width="2"/>';

    if (y && y < H) {
        var ypx = y * escala;
        var anchoEnY = bpx + (Bpx - bpx) * (ypx / Hpx); // se ensancha hacia arriba
        var margenEnY = MARGEN_IZQ + (ANCHO_DIBUJO - anchoEnY) / 2;
        var lineaY = baseY - ypx;
        contenido += '<line x1="' + margenEnY + '" y1="' + lineaY + '" x2="' + (margenEnY + anchoEnY) + '" y2="' + lineaY + '" ' +
            'stroke="#7ec8e3" stroke-width="1.5" stroke-dasharray="4,3"/>';
        contenido += _svgEtiqueta(margenEnY - 6, lineaY + 4, 'y=' + y + 'm', 'end');
    }

    contenido += _svgEtiqueta(MARGEN_IZQ + ANCHO_DIBUJO / 2, topY - 8, 'B=' + B + 'm');
    contenido += _svgEtiqueta(MARGEN_IZQ + ANCHO_DIBUJO / 2, baseY + 16, 'b=' + b + 'm (solera)');

    // Cota vertical de H, a la izquierda del dibujo (línea + marcas + etiqueta)
    var xCotaH = MARGEN_IZQ - 18;
    contenido += '<line x1="' + xCotaH + '" y1="' + topY + '" x2="' + xCotaH + '" y2="' + baseY + '" stroke="#ffffff" stroke-width="1"/>';
    contenido += '<line x1="' + (xCotaH - 4) + '" y1="' + topY + '" x2="' + (xCotaH + 4) + '" y2="' + topY + '" stroke="#ffffff" stroke-width="1"/>';
    contenido += '<line x1="' + (xCotaH - 4) + '" y1="' + baseY + '" x2="' + (xCotaH + 4) + '" y2="' + baseY + '" stroke="#ffffff" stroke-width="1"/>';
    contenido += _svgEtiqueta(xCotaH, (baseY + topY) / 2 + 4, 'H=' + H + 'm', 'middle');

    return _svgEnvoltura(contenido, MARGEN_IZQ + ANCHO_DIBUJO, 190);
}
