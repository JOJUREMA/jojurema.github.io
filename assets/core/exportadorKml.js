// ══ Núcleo compartido — Exportador KML ══
// Constructores puros de KML 2.2 válido (Sinceramiento de Áreas e
// Inventario de Infraestructura) — sin DOM ni Supabase, reciben datos
// ya calculados (coordenadas en grados decimales, colores ya resueltos)
// y devuelven texto XML. Usa <Data name="..."> (ExtendedData simple,
// sin declarar <Schema>) en vez de <SchemaData> — válido en KML 2.2,
// lo leen QGIS/Google Earth igual, y evita declarar un <Schema> con
// <SimpleField> por cada uno de los 14 tipos de estructura.
// Requiere que escapeHtml (assets/core/utilidades.js) ya esté cargado.

function _colorHexAKmlAABBGGRR(hex, alfa) {
    var h = (hex || '#00bcd4').toString().replace('#', '');
    if (h.length !== 6) h = '00bcd4';
    var r = h.substring(0, 2), g = h.substring(2, 4), b = h.substring(4, 6);
    var a = Number.isFinite(alfa) ? Math.max(0, Math.min(255, Math.round(alfa))).toString(16).padStart(2, '0') : 'ff';
    return (a + b + g + r).toLowerCase();
}

function _kmlCoordenadas(puntosLatLon) {
    return puntosLatLon.map(function (p) { return p[1] + ',' + p[0] + ',0'; }).join(' ');
}

function _kmlExtendedData(camposObj) {
    var partes = [];
    Object.keys(camposObj || {}).forEach(function (clave) {
        var valor = camposObj[clave];
        if (valor === null || valor === undefined || valor === '') return;
        partes.push('<Data name="' + escapeHtml(clave) + '"><value>' + escapeHtml(valor) + '</value></Data>');
    });
    return partes.length ? '<ExtendedData>' + partes.join('') + '</ExtendedData>' : '';
}

function construirPlacemarkPunto(nombre, lat, lon, estiloId, camposObj) {
    return '<Placemark><name>' + escapeHtml(nombre) + '</name>' +
        '<styleUrl>#' + estiloId + '</styleUrl>' +
        _kmlExtendedData(camposObj) +
        '<Point><coordinates>' + lon + ',' + lat + ',0</coordinates></Point>' +
        '</Placemark>';
}

function construirPlacemarkLinea(nombre, puntosLatLon, estiloId, camposObj) {
    return '<Placemark><name>' + escapeHtml(nombre) + '</name>' +
        '<styleUrl>#' + estiloId + '</styleUrl>' +
        _kmlExtendedData(camposObj) +
        '<LineString><tessellate>1</tessellate><coordinates>' + _kmlCoordenadas(puntosLatLon) + '</coordinates></LineString>' +
        '</Placemark>';
}

// puntosLatLon: [[lat,lon], ...] — se cierra el anillo automáticamente
// si el primer y último punto no coinciden.
function construirPlacemarkPoligono(nombre, puntosLatLon, estiloId, camposObj) {
    var anillo = puntosLatLon.slice();
    var primero = anillo[0], ultimo = anillo[anillo.length - 1];
    if (primero && ultimo && (primero[0] !== ultimo[0] || primero[1] !== ultimo[1])) anillo.push(primero);
    return '<Placemark><name>' + escapeHtml(nombre) + '</name>' +
        '<styleUrl>#' + estiloId + '</styleUrl>' +
        _kmlExtendedData(camposObj) +
        '<Polygon><outerBoundaryIs><LinearRing><coordinates>' + _kmlCoordenadas(anillo) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>' +
        '</Placemark>';
}

function construirEstiloLinea(id, colorHex, ancho) {
    return '<Style id="' + id + '"><LineStyle><color>' + _colorHexAKmlAABBGGRR(colorHex) + '</color><width>' + (ancho || 3) + '</width></LineStyle></Style>';
}

function construirEstiloPoligono(id, colorHex, relleno) {
    var alfaRelleno = relleno === false ? 0 : 120;
    return '<Style id="' + id + '"><LineStyle><color>' + _colorHexAKmlAABBGGRR(colorHex) + '</color><width>2</width></LineStyle>' +
        '<PolyStyle><color>' + _colorHexAKmlAABBGGRR(colorHex, alfaRelleno) + '</color></PolyStyle></Style>';
}

function construirEstiloIcono(id, iconUrl) {
    return '<Style id="' + id + '"><IconStyle><Icon><href>' + iconUrl + '</href></Icon></IconStyle></Style>';
}

// foldersArray: [{nombre, placemarksXml}, ...] — si hay uno solo, se
// omite el <Folder> (los Placemark van directo en <Document>).
function construirDocumentoKml(nombreDocumento, estilosXml, foldersArray) {
    var cuerpo;
    if (foldersArray.length === 1) {
        cuerpo = foldersArray[0].placemarksXml;
    } else {
        cuerpo = foldersArray.map(function (f) {
            return '<Folder><name>' + escapeHtml(f.nombre) + '</name>' + f.placemarksXml + '</Folder>';
        }).join('');
    }
    return '<?xml version="1.0" encoding="UTF-8"?>' +
        '<kml xmlns="http://www.opengis.net/kml/2.2">' +
        '<Document><name>' + escapeHtml(nombreDocumento) + '</name>' +
        estilosXml.join('') +
        cuerpo +
        '</Document></kml>';
}

function _descargarTextoComoArchivo(contenido, nombreArchivo, mimeType) {
    var blob = new Blob([contenido], { type: mimeType || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
}
