// Verifica un acta de sorteo exportada (JSON) recalculando cada resultado.
// Uso: npm run verificar -- acta_sorteo_2026-10-06.json
import { readFileSync } from 'node:fs';
import { verificarActa } from '../src/lib/sorteo.js';

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: npm run verificar -- <acta.json>');
  process.exit(2);
}

const acta = JSON.parse(readFileSync(ruta, 'utf8'));
const { ok, errores } = verificarActa(acta);

console.log(`Archivo de participantes: ${acta.archivo?.nombre} (SHA-256 ${acta.archivo?.sha256})`);
console.log(`Compromiso publicado:     ${acta.compromiso}`);
console.log(`Sorteos verificados:      ${acta.sorteos.length}`);
acta.sorteos.forEach(s => console.log(`  ${s.numero}. ${s.nombre}`));

if (ok) {
  console.log('\nRESULTADO: el acta es válida; todos los sorteos coinciden con la semilla.');
} else {
  console.log('\nRESULTADO: el acta NO es válida.');
  errores.forEach(e => console.log(`  - ${e}`));
  process.exit(1);
}
