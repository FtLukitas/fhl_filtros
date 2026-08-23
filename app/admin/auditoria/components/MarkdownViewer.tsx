'use client';

import React from 'react';

interface MarkdownViewerProps {
  content: string;
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  // Parsear texto en bloques: tablas, párrafos, encabezados, listas
  const lineas = content.split('\n');
  const bloques: React.ReactNode[] = [];

  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i];

    // 1. Encabezados
    if (linea.startsWith('### ')) {
      bloques.push(
        <h4 key={i} className="text-xs font-black text-slate-900 mt-2 mb-1">
          {renderizarFormatoInline(linea.replace('### ', ''))}
        </h4>
      );
      i++;
      continue;
    }
    if (linea.startsWith('## ')) {
      bloques.push(
        <h3 key={i} className="text-sm font-black text-slate-900 mt-3 mb-1.5 border-b border-slate-200 pb-1">
          {renderizarFormatoInline(linea.replace('## ', ''))}
        </h3>
      );
      i++;
      continue;
    }
    if (linea.startsWith('# ')) {
      bloques.push(
        <h2 key={i} className="text-base font-black text-slate-900 mt-3 mb-2">
          {renderizarFormatoInline(linea.replace('# ', ''))}
        </h2>
      );
      i++;
      continue;
    }

    // 2. Tablas Markdown (| col | col |)
    if (linea.trim().startsWith('|') && linea.includes('|')) {
      const lineasTabla: string[] = [];
      while (i < lineas.length && lineas[i].trim().startsWith('|')) {
        lineasTabla.push(lineas[i]);
        i++;
      }

      if (lineasTabla.length >= 2) {
        const headerCols = lineasTabla[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        // Omitir la fila separadora (ej: |---|---|)
        const rowStartIndex = lineasTabla[1].includes('---') ? 2 : 1;
        const dataRows = lineasTabla.slice(rowStartIndex).map((r) =>
          r
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim())
        );

        bloques.push(
          <div key={`table-${i}`} className="my-2.5 overflow-x-auto border border-slate-200 rounded-lg shadow-2xs">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  {headerCols.map((h, hIdx) => (
                    <th key={hIdx} className="p-2 whitespace-nowrap">
                      {renderizarFormatoInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {dataRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-2 text-slate-800">
                        {renderizarFormatoInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 3. Listas con viñetas (* o -)
    if (linea.trim().startsWith('* ') || linea.trim().startsWith('- ')) {
      const itemsLista: string[] = [];
      while (
        i < lineas.length &&
        (lineas[i].trim().startsWith('* ') || lineas[i].trim().startsWith('- '))
      ) {
        itemsLista.push(lineas[i].trim().replace(/^[*\-]\s+/, ''));
        i++;
      }

      bloques.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-1 pl-4 list-disc text-slate-700">
          {itemsLista.map((it, itIdx) => (
            <li key={itIdx}>{renderizarFormatoInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 4. Párrafo estándar o línea vacía
    if (linea.trim() === '') {
      bloques.push(<div key={`br-${i}`} className="h-1.5" />);
    } else {
      bloques.push(
        <p key={i} className="my-1 text-slate-800 leading-relaxed">
          {renderizarFormatoInline(linea)}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-0.5">{bloques}</div>;
}

// Helper para parsear **negrita**, `codigo`, y *cursiva*
function renderizarFormatoInline(texto: string): React.ReactNode {
  if (!texto) return '';

  // Dividir por tokens de negrita (**texto**) y código (`codigo`)
  const partes = texto.split(/(\*\*.*?\*\*|`.*?`)/g);

  return partes.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-black text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="bg-slate-200/80 text-slate-900 font-mono font-bold px-1.5 py-0.5 rounded text-[11px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
