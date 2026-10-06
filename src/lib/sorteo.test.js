import { describe, expect, it } from 'vitest';
import {
  compromisoDeSemilla,
  confirmarLista,
  construirActa,
  elegirIndice,
  generarSemilla,
  realizarSorteo,
  verificarActa
} from './sorteo';

const SEMILLA = 'a'.repeat(64);

function crearParticipantes(n) {
  return Array.from({ length: n }, (_, id) => ({ id, nombre: `Árbitro ${id + 1}`, activo: true }));
}

function sortearTodos(participantes, confirmacion, cantidad) {
  const sorteos = [];
  for (let i = 0; i < cantidad; i++) {
    sorteos.push(realizarSorteo(confirmacion.semilla, participantes, sorteos));
  }
  return sorteos;
}

describe('elegirIndice', () => {
  it('es determinístico para la misma semilla, sorteo y lista', () => {
    expect(elegirIndice(SEMILLA, 1, 'h', 37)).toBe(elegirIndice(SEMILLA, 1, 'h', 37));
  });

  it('siempre devuelve un índice dentro del rango', () => {
    for (let n = 1; n <= 50; n++) {
      const i = elegirIndice(SEMILLA, n, 'h', n);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(n);
    }
  });

  it('rechaza listas vacías', () => {
    expect(() => elegirIndice(SEMILLA, 1, 'h', 0)).toThrow();
  });

  it('distribuye de forma uniforme (chi-cuadrado)', () => {
    const n = 7;
    const muestras = 70000;
    const conteo = new Array(n).fill(0);
    for (let k = 0; k < muestras; k++) {
      conteo[elegirIndice(SEMILLA, k, 'h', n)]++;
    }
    const esperado = muestras / n;
    const chi2 = conteo.reduce((acc, c) => acc + (c - esperado) ** 2 / esperado, 0);
    // Valor crítico chi-cuadrado con 6 grados de libertad, p = 0.001
    expect(chi2).toBeLessThan(22.46);
  });
});

describe('realizarSorteo', () => {
  it('no repite árbitros ni elige excluidos', () => {
    const participantes = crearParticipantes(10).map(p => p.id % 3 === 0 ? { ...p, activo: false } : p);
    const confirmacion = confirmarLista(participantes);
    const sorteos = sortearTodos(participantes, confirmacion, 6);
    const ids = sorteos.map(s => s.participanteId);
    expect(new Set(ids).size).toBe(6);
    ids.forEach(id => expect(participantes[id].activo).toBe(true));
  });

  it('una semilla nueva por confirmación', () => {
    expect(generarSemilla()).not.toBe(generarSemilla());
    expect(generarSemilla()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verificarActa', () => {
  const participantes = crearParticipantes(20).map(p => p.id === 4 ? { ...p, activo: false } : p);
  const confirmacion = confirmarLista(participantes);
  const sorteos = sortearTodos(participantes, confirmacion, 3);
  const archivo = { nombre: 'lista.xlsx', sha256: '00' };
  const acta = construirActa({ archivo, participantes, confirmacion, sorteos });

  it('acepta un acta legítima', () => {
    expect(compromisoDeSemilla(acta.semilla)).toBe(acta.compromiso);
    expect(verificarActa(acta)).toEqual({ ok: true, errores: [] });
  });

  it('detecta un resultado alterado', () => {
    const alterada = { ...acta, sorteos: acta.sorteos.map((s, i) => i === 1 ? { ...s, nombre: 'Otro' } : s) };
    expect(verificarActa(alterada).ok).toBe(false);
  });

  it('detecta una semilla cambiada', () => {
    expect(verificarActa({ ...acta, semilla: SEMILLA }).ok).toBe(false);
  });

  it('detecta un cambio en los excluidos', () => {
    const alterada = { ...acta, participantes: acta.participantes.map(p => ({ ...p, activo: true })) };
    expect(verificarActa(alterada).ok).toBe(false);
  });
});
