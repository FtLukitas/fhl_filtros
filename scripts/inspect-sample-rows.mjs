import XLSX from 'xlsx';

const wb = XLSX.readFile('c:\\fhl_filtros\\Lista base Oct25 - copia.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

for (let r = 3; r < 20; r++) {
  const row = data[r];
  if (row[1] && String(row[1]).startsWith('FHL')) {
    console.log(`Row ${r} (${row[1]}): MayoristaBase=${row[33]}, MDP_Bolsa=${row[34]}, MDP_Star=${row[35]}, May1=${row[36]}, May2=${row[37]}, May3=${row[38]}, Com=${row[39]}`);
  }
}
