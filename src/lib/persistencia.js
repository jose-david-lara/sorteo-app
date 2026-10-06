// Guarda la sesión en el navegador para que recargar la página no pierda la
// lista confirmada ni los sorteos ya hechos. Como el sorteo es determinístico
// a partir de la semilla, recargar tampoco permite "volver a tirar".

const CLAVE = 'sorteo-arbitros-camp:v2';

export const SESION_VACIA = {
  archivo: null,
  participantes: [],
  advertencias: [],
  confirmacion: null,
  sorteos: []
};

export function cargarSesion() {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE));
    if (guardada && Array.isArray(guardada.participantes) && Array.isArray(guardada.sorteos)) {
      return { ...SESION_VACIA, ...guardada };
    }
  } catch {
    // Almacenamiento no disponible o dato corrupto: se empieza de cero.
  }
  return SESION_VACIA;
}

export function guardarSesion(sesion) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(sesion));
  } catch {
    // Sin almacenamiento la app sigue funcionando, solo no sobrevive a una recarga.
  }
}

export function borrarSesion() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
}
