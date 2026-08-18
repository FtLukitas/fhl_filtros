import XLSX from 'xlsx';

const wb = XLSX.readFile('c:\\fhl_filtros\\Lista base Oct25 - copia.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('Fila 0 completa:', data[0]);
console.log('Fila 1 completa:', data[1]);
console.log('Fila 2 (Headers):', data[2]);

// Ver una fila con filtro completa
for (let i = 3; i < 20; i++) {
  if (data[i][0] && data[i][0].startsWith('FHL')) {
    console.log(`Fila ${i} (${data[i][0]}):`, data[i]);
  }
}
