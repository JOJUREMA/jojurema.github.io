// ══ Núcleo compartido — captura de campo sin conexión (IndexedDB) ══
// Para "Sinceramiento de Áreas": la captura de vértices GPS y fotos pasa
// en el predio, donde a menudo no hay señal — los datos no se pueden
// perder por eso. Envoltorio delgado sobre IndexedDB (nativa del
// navegador, sin librería externa): el estado "actual" de vértices/fotos
// de un registro vive acá; la sincronización hacia Supabase es un
// proceso aparte (ver movil/sinceramiento-areas.html) que simplemente
// lee lo que hay acá y lo empuja cuando hay red — nunca al revés.
const CAPTURA_DB_NOMBRE = 'cusshmi-campo';
const CAPTURA_DB_VERSION = 1;

function abrirBaseCaptura() {
    return new Promise((resolve, reject) => {
        const peticion = indexedDB.open(CAPTURA_DB_NOMBRE, CAPTURA_DB_VERSION);
        peticion.onupgradeneeded = function (evento) {
            const db = evento.target.result;
            if (!db.objectStoreNames.contains('vertices')) {
                db.createObjectStore('vertices', { keyPath: 'registroId' });
            }
            if (!db.objectStoreNames.contains('fotos')) {
                const store = db.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
                store.createIndex('porRegistro', 'registroId', { unique: false });
            }
        };
        peticion.onsuccess = function () { resolve(peticion.result); };
        peticion.onerror = function () { reject(peticion.error); };
    });
}

// El arreglo completo de vértices reemplaza al anterior — el estado local
// es siempre "la versión actual", no un historial de cambios (ver
// justificación en el plan: un registro lo captura una sola persona, de
// una vez, no hace falta resolver conflictos concurrentes).
async function guardarVerticesLocal(registroId, vertices) {
    const db = await abrirBaseCaptura();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('vertices', 'readwrite');
        tx.objectStore('vertices').put({
            registroId: registroId,
            vertices: vertices,
            actualizadoEn: new Date().toISOString(),
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
    });
}

async function obtenerVerticesLocal(registroId) {
    const db = await abrirBaseCaptura();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('vertices', 'readonly');
        const peticion = tx.objectStore('vertices').get(registroId);
        peticion.onsuccess = function () { resolve(peticion.result ? peticion.result.vertices : []); };
        peticion.onerror = function () { reject(peticion.error); };
    });
}

// Cada foto es su propio registro local (a diferencia de los vértices, no
// se reemplaza un arreglo completo) — el Blob se guarda tal cual,
// IndexedDB lo soporta de forma nativa. Devuelve el id local (para poder
// quitarla o marcarla sincronizada después).
async function guardarFotoLocal(registroId, blob, nombreArchivo) {
    const db = await abrirBaseCaptura();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('fotos', 'readwrite');
        const peticion = tx.objectStore('fotos').add({
            registroId: registroId,
            blob: blob,
            nombreArchivo: nombreArchivo,
            sincronizada: false,
            pathRemoto: null,
            creadoEn: new Date().toISOString(),
        });
        peticion.onsuccess = function () { resolve(peticion.result); };
        peticion.onerror = function () { reject(peticion.error); };
    });
}

async function listarFotosLocal(registroId) {
    const db = await abrirBaseCaptura();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('fotos', 'readonly');
        const indice = tx.objectStore('fotos').index('porRegistro');
        const peticion = indice.getAll(registroId);
        peticion.onsuccess = function () { resolve(peticion.result || []); };
        peticion.onerror = function () { reject(peticion.error); };
    });
}

async function marcarFotoSincronizada(idLocal, pathRemoto) {
    const db = await abrirBaseCaptura();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('fotos', 'readwrite');
        const store = tx.objectStore('fotos');
        const peticion = store.get(idLocal);
        peticion.onsuccess = function () {
            const registro = peticion.result;
            if (!registro) return;
            registro.sincronizada = true;
            registro.pathRemoto = pathRemoto;
            store.put(registro);
        };
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
    });
}

async function eliminarFotoLocal(idLocal) {
    const db = await abrirBaseCaptura();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('fotos', 'readwrite');
        tx.objectStore('fotos').delete(idLocal);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
    });
}
