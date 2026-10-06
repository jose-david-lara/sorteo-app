import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { leerParticipantes, limpiarNombre, validarArchivo } from './excel';

function libroCon(filas) {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Hoja1');
  return new Uint8Array(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }));
}

describe('leerParticipantes', () => {
  it('usa la columna "Nombre" aunque no sea la primera', () => {
    const { participantes, advertencias } = leerParticipantes(libroCon([
      ['CI', 'Nombre y Apellido'],
      [123, 'Ana Pérez'],
      [456, 'Luis Gómez']
    ]));
    expect(participantes.map(p => p.nombre)).toEqual(['Ana Pérez', 'Luis Gómez']);
    expect(advertencias).toEqual([]);
  });

  it('ignora filas vacías en lugar de crear participantes fantasma', () => {
    const { participantes } = leerParticipantes(libroCon([
      ['Nombre'], ['Ana'], [''], ['   '], [null], ['Luis']
    ]));
    expect(participantes.map(p => p.nombre)).toEqual(['Ana', 'Luis']);
  });

  it('omite duplicados (sin distinguir tildes ni mayúsculas) y avisa', () => {
    const { participantes, advertencias } = leerParticipantes(libroCon([
      ['Nombre'], ['José Lara'], ['jose lara'], ['JOSÉ  LARA']
    ]));
    expect(participantes).toHaveLength(1);
    expect(advertencias[0]).toMatch(/2 nombre\(s\) repetido/);
  });

  it('sin encabezado usa la primera columna desde la primera fila', () => {
    const { participantes, advertencias } = leerParticipantes(libroCon([['Ana'], ['Luis']]));
    expect(participantes.map(p => p.nombre)).toEqual(['Ana', 'Luis']);
    expect(advertencias).toHaveLength(1);
  });

  it('convierte números a texto', () => {
    const { participantes } = leerParticipantes(libroCon([['Nombre'], [12345]]));
    expect(participantes[0].nombre).toBe('12345');
  });
});

describe('limpiarNombre', () => {
  it('quita caracteres invisibles y de dirección', () => {
    expect(limpiarNombre('Ana​‮ Pérez\t')).toBe('Ana Pérez');
  });
});

describe('validarArchivo', () => {
  it('rechaza extensiones y tamaños no permitidos', () => {
    expect(validarArchivo({ name: 'lista.csv', size: 10 })).toMatch(/xlsx/);
    expect(validarArchivo({ name: 'lista.xlsx', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(validarArchivo({ name: 'lista.xlsx', size: 1000 })).toBeNull();
  });
});
