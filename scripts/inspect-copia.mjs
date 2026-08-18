import XLSX from 'xlsx';

const wb = XLSX.readFile('c:\\fhl_filtros\\Lista base Oct25 - copia.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('Total filas:', data.length);
console.log('Primeras 20 filas:');
for (let i = 0; i < Math.min(20, data.length); i++) {
  const rowClean = data[i].map(c => String(c).trim()).filter(c => c.length > 0);
  console.log(`Fila ${i}:`, JSON.stringify(rowClean.slice(0, 15)));
}
