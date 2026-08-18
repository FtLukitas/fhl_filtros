import XLSX from 'xlsx';

const wb = XLSX.readFile('c:\\fhl_filtros\\Lista base Oct25 - copia.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const priceColumns = [
  { key: 'mayorista_base', name: 'Mayorista Base', col: 33, predeterminada: false },
  { key: 'mdp_bolsa', name: 'MDP con Bolsa', col: 34, predeterminada: false },
  { key: 'mdp_starfilt', name: 'MDP c/Bolsa Starfilt', col: 35, predeterminada: false },
  { key: 'mayorista_1', name: 'Mayorista 1', col: 36, predeterminada: true },
  { key: 'mayorista_2', name: 'Mayorista 2', col: 37, predeterminada: false },
  { key: 'mayorista_3', name: 'Mayorista 3', col: 38, predeterminada: false },
  { key: 'comercio', name: 'Comercio', col: 39, predeterminada: false },
];

const filtrosExtraidos = [];

for (let r = 3; r < data.length; r++) {
  const row = data[r];
  const rawCode = String(row[1] || '').trim().toUpperCase();
  if (!rawCode || !rawCode.startsWith('FHL')) continue;

  const item = { codigo: rawCode, precios: {} };
  for (const pc of priceColumns) {
    const val = Number(row[pc.col]);
    if (!isNaN(val) && val > 0) {
      item.precios[pc.key] = Math.round(val);
    }
  }
  filtrosExtraidos.push(item);
}

console.log(`Total filtros detectados con precios: ${filtrosExtraidos.length}`);
console.log('Primeros 5 filtros:', JSON.stringify(filtrosExtraidos.slice(0, 5), null, 2));

for (const pc of priceColumns) {
  const conPrecio = filtrosExtraidos.filter(f => f.precios[pc.key] > 0).length;
  console.log(`Lista "${pc.name}": ${conPrecio} filtros con precio.`);
}
