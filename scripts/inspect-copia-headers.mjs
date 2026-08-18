import XLSX from 'xlsx';

const wb = XLSX.readFile('c:\\fhl_filtros\\Lista base Oct25 - copia.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const headers = data[2];
console.log('Headers count:', headers.length);
headers.forEach((h, idx) => {
  if (h) console.log(`Col ${idx}: ${h}`);
});

console.log('\n--- Ejemplo FHL-103 (Fila 4) ---');
const r4 = data[4];
headers.forEach((h, idx) => {
  if (r4[idx] !== '' && r4[idx] !== undefined) {
    console.log(`[${idx}] ${h || `Col_${idx}`}: ${r4[idx]}`);
  }
});
