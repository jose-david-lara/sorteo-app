import * as XLSX from 'xlsx';

export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;
export const MAXIMO_PARTICIPANTES = 5000;
const LARGO_MAXIMO_NOMBRE = 150;

// Caracteres de control, de ancho cero y de dirección (bidi), que permiten
// nombres visualmente idénticos pero distintos.
const CARACTERES_INVISIBLES = /[\u0000-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function limpiarNombre(valor) {
  return String(valor ?? '')
    .normalize('NFC')
    .replace(CARACTERES_INVISIBLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clave para detectar duplicados: sin tildes, sin mayúsculas.
export function claveNombre(nombre) {
  return nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function esEncabezado(valor) {
  const clave = claveNombre(limpiarNombre(valor));
  return clave === 'name' || ['nombre', 'arbitro', 'participante'].some(p => clave.includes(p));
}

export function validarArchivo(archivo) {
  if (!/\.(xlsx|xls)$/i.test(archivo.name)) {
    return 'El archivo debe ser .xlsx o .xls';
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return 'El archivo supera el máximo de 5 MB';
  }
  return null;
}

// Lee la primera hoja y devuelve participantes únicos y advertencias para el operador.
export function leerParticipantes(datos) {
  const libro = XLSX.read(datos, {
    type: 'array',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
    sheetRows: MAXIMO_PARTICIPANTES + 2
  });
  const advertencias = [];
  if (libro.SheetNames.length === 0) {
    throw new Error('El archivo no tiene hojas');
  }
  if (libro.SheetNames.length > 1) {
    advertencias.push(`El archivo tiene ${libro.SheetNames.length} hojas; solo se leyó "${libro.SheetNames[0]}".`);
  }

  const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false
  });

  const primeraFila = filas[0] || [];
  let columna = primeraFila.findIndex(esEncabezado);
  let inicio = 1;
  if (columna === -1) {
    columna = 0;
    inicio = 0;
    advertencias.push('No se encontró una columna "Nombre"; se usó la primera columna y la primera fila como datos.');
  }

  const participantes = [];
  const vistos = new Map();
  const duplicados = [];
  let recortados = 0;

  for (let i = inicio; i < filas.length; i++) {
    let nombre = limpiarNombre(filas[i][columna]);
    if (!nombre) continue;
    if (nombre.length > LARGO_MAXIMO_NOMBRE) {
      nombre = nombre.slice(0, LARGO_MAXIMO_NOMBRE);
      recortados++;
    }
    const clave = claveNombre(nombre);
    if (vistos.has(clave)) {
      duplicados.push(`${nombre} (fila ${i + 1})`);
      continue;
    }
    vistos.set(clave, true);
    participantes.push({ id: participantes.length, nombre, activo: true });
  }

  if (participantes.length > MAXIMO_PARTICIPANTES) {
    throw new Error(`El archivo supera el máximo de ${MAXIMO_PARTICIPANTES} participantes`);
  }
  if (duplicados.length > 0) {
    advertencias.push(`Se omitieron ${duplicados.length} nombre(s) repetido(s): ${duplicados.join(', ')}.`);
  }
  if (recortados > 0) {
    advertencias.push(`${recortados} nombre(s) superaban ${LARGO_MAXIMO_NOMBRE} caracteres y se recortaron.`);
  }
  return { participantes, advertencias };
}

function fechaLocal(iso) {
  return iso ? new Date(iso).toLocaleString('es-PY') : '';
}

export function exportarExcel(acta) {
  const sorteados = new Set(acta.sorteos.map(s => s.nombre));

  const hojaActa = XLSX.utils.aoa_to_sheet([
    ['Acta de sorteo de árbitros - CAMP'],
    [],
    ['Archivo de participantes', acta.archivo.nombre],
    ['SHA-256 del archivo', acta.archivo.sha256],
    ['Lista confirmada', fechaLocal(acta.listaConfirmada)],
    ['Huella de la lista', acta.huellaParticipantes],
    ['Compromiso (SHA-256 de la semilla)', acta.compromiso],
    ['Semilla', acta.semilla],
    ['Algoritmo', acta.algoritmo],
    ['Participantes activos', acta.participantes.filter(p => p.activo).length],
    ['Participantes excluidos', acta.participantes.filter(p => !p.activo).length],
    ['Árbitros sorteados', acta.sorteos.length],
    ['Exportado', fechaLocal(acta.exportado)]
  ]);
  hojaActa['!cols'] = [{ wch: 36 }, { wch: 70 }];

  const hojaSorteos = XLSX.utils.aoa_to_sheet([
    ['Orden', 'Árbitro', 'Fecha y hora', 'Elegibles en ese sorteo'],
    ...acta.sorteos.map(s => [s.numero, s.nombre, fechaLocal(s.fecha), s.totalElegibles])
  ]);
  hojaSorteos['!cols'] = [{ wch: 8 }, { wch: 45 }, { wch: 22 }, { wch: 22 }];

  const hojaParticipantes = XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Estado', 'Resultado'],
    ...acta.participantes.map(p => [
      p.nombre,
      p.activo ? 'Activo' : 'Excluido',
      sorteados.has(p.nombre) ? 'Sorteado' : 'No sorteado'
    ])
  ]);
  hojaParticipantes['!cols'] = [{ wch: 45 }, { wch: 12 }, { wch: 14 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaActa, 'Acta');
  XLSX.utils.book_append_sheet(libro, hojaSorteos, 'Sorteos');
  XLSX.utils.book_append_sheet(libro, hojaParticipantes, 'Participantes');
  XLSX.writeFile(libro, `sorteo_arbitros_${acta.exportado.slice(0, 10)}.xlsx`);
}

export function descargarActaJson(acta) {
  const blob = new Blob([JSON.stringify(acta, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `acta_sorteo_${acta.exportado.slice(0, 10)}.json`;
  enlace.click();
  URL.revokeObjectURL(url);
}
