import XLSX from 'xlsx';

const wb = XLSX.readFile('c:\\fhl_filtros\\Lista base Oct25 - copia.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const headerRow = data[2];
console.log('Headers in row index 2:');
for (let c = 30; c < 42; c++) {
  console.log(`Col ${c}: "${headerRow[c]}" | Sample row 4: "${data[3]?.[c]}"`);
}
