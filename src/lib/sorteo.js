// Algoritmo de sorteo verificable.
//
// 1. La lista de participantes se confirma (bloquea) ANTES de generar la semilla,
//    así nadie puede ajustar la lista conociendo la semilla.
// 2. La semilla son 32 bytes de crypto.getRandomValues (CSPRNG del navegador).
//    Al confirmar se muestra su compromiso = SHA-256(semilla), para que quede
//    registrado ante los presentes antes del primer sorteo.
// 3. Cada sorteo deriva su número de HMAC-SHA256(semilla, "n:huella:intento") y
//    usa muestreo por rechazo para que todos los elegibles tengan exactamente la
//    misma probabilidad (sin sesgo de módulo).
// 4. Con la semilla revelada en el acta, cualquiera puede recalcular todos los
//    resultados (ver verificarActa y scripts/verificar-acta.mjs).
//
// Se usa @noble/hashes y no crypto.subtle porque crypto.subtle solo existe en
// contextos seguros (HTTPS/localhost) y en la intranet puede servirse por HTTP.

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const ALGORITMO = 'hmac-sha256-rechazo-v1';

const RANGO_UINT32 = 0x100000000;
const MAXIMO_INTENTOS = 1000;

export function generarSemilla() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function sha256Hex(datos) {
  const bytes = typeof datos === 'string' ? utf8ToBytes(datos) : datos;
  return bytesToHex(sha256(bytes));
}

export function compromisoDeSemilla(semillaHex) {
  return sha256Hex(hexToBytes(semillaHex));
}

// La huella de la lista confirmada incluye quién quedó excluido.
function listaParaHuella(participantes) {
  return participantes.map(p => ({ nombre: p.nombre, activo: p.activo }));
}

export function huellaLista(nombres) {
  return sha256Hex(JSON.stringify(nombres));
}

// Índice uniforme en [0, n) derivado de forma determinística de la semilla.
export function elegirIndice(semillaHex, numeroSorteo, huella, n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('No hay participantes elegibles');
  }
  const clave = hexToBytes(semillaHex);
  const limite = Math.floor(RANGO_UINT32 / n) * n;
  for (let intento = 0; intento < MAXIMO_INTENTOS; intento++) {
    const mac = hmac(sha256, clave, utf8ToBytes(`${numeroSorteo}:${huella}:${intento}`));
    const valor = new DataView(mac.buffer, mac.byteOffset, mac.byteLength).getUint32(0, false);
    if (valor < limite) return valor % n;
  }
  // Probabilidad < 2^-1000: solo ocurriría con un error de implementación.
  throw new Error('No se pudo obtener un número aleatorio válido');
}

export function obtenerElegibles(participantes, sorteos) {
  const yaSorteados = new Set(sorteos.map(s => s.participanteId));
  return participantes.filter(p => p.activo && !yaSorteados.has(p.id));
}

export function realizarSorteo(semillaHex, participantes, sorteos) {
  const elegibles = obtenerElegibles(participantes, sorteos);
  const numero = sorteos.length + 1;
  const huella = huellaLista(elegibles.map(p => p.nombre));
  const indice = elegirIndice(semillaHex, numero, huella, elegibles.length);
  const elegido = elegibles[indice];
  return {
    numero,
    participanteId: elegido.id,
    nombre: elegido.nombre,
    indice,
    totalElegibles: elegibles.length,
    huellaElegibles: huella,
    fecha: new Date().toISOString()
  };
}

// Recalcula todos los sorteos del acta a partir de la semilla revelada.
export function verificarActa(acta) {
  const errores = [];
  if (acta.algoritmo !== ALGORITMO) {
    errores.push(`Algoritmo desconocido: ${acta.algoritmo}`);
    return { ok: false, errores };
  }
  if (compromisoDeSemilla(acta.semilla) !== acta.compromiso) {
    errores.push('La semilla no coincide con el compromiso publicado');
  }
  if (huellaLista(listaParaHuella(acta.participantes)) !== acta.huellaParticipantes) {
    errores.push('La lista de participantes no coincide con su huella');
  }

  const participantes = acta.participantes.map((p, id) => ({ id, nombre: p.nombre, activo: p.activo }));
  const recalculados = [];
  for (const sorteo of acta.sorteos) {
    const esperado = realizarSorteo(acta.semilla, participantes, recalculados);
    if (esperado.numero !== sorteo.numero || esperado.nombre !== sorteo.nombre) {
      errores.push(`Sorteo ${sorteo.numero}: el acta dice "${sorteo.nombre}" pero corresponde "${esperado.nombre}"`);
    }
    recalculados.push(esperado);
  }
  return { ok: errores.length === 0, errores };
}

// Fija la lista y genera la semilla. Debe llamarse una sola vez por sesión.
export function confirmarLista(participantes) {
  const semilla = generarSemilla();
  return {
    fecha: new Date().toISOString(),
    semilla,
    compromiso: compromisoDeSemilla(semilla),
    huellaParticipantes: huellaLista(listaParaHuella(participantes))
  };
}

export function construirActa({ archivo, participantes, confirmacion, sorteos }) {
  return {
    algoritmo: ALGORITMO,
    archivo,
    listaConfirmada: confirmacion.fecha,
    huellaParticipantes: confirmacion.huellaParticipantes,
    compromiso: confirmacion.compromiso,
    semilla: confirmacion.semilla,
    participantes: listaParaHuella(participantes),
    sorteos: sorteos.map(({ participanteId, ...s }) => s),
    exportado: new Date().toISOString()
  };
}
