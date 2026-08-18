'use client';

import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  if (!content) return null;

  // Separar el contenido en bloques (párrafos, tablas, listas, encabezados, bloques de código)
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Bloque de código ```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // saltar el cierre ```
      elements.push(
        <pre
          key={`code-${elements.length}`}
          className="p-3 my-2 bg-slate-900 text-slate-100 font-mono text-xs rounded-md overflow-x-auto border border-slate-800"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // 2. Tablas Markdown (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        // Primera fila: headers
        const headerCells = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        // Si la segunda fila es divisor |--|--|, la salteamos
        const isDivider = tableLines[1].includes('---');
        const bodyRows = (isDivider ? tableLines.slice(2) : tableLines.slice(1)).map((r) =>
          r
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim())
        );

        elements.push(
          <div
            key={`table-${elements.length}`}
            className="my-3 overflow-x-auto border border-slate-200 rounded-md shadow-xs bg-white"
          >
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  {headerCells.map((h, hIdx) => (
                    <th key={hIdx} className="p-2 border-r border-slate-200 last:border-r-0">
                      {parseInlineFormatting(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-2 border-r border-slate-100 last:border-r-0 text-slate-700">
                        {parseInlineFormatting(cell)}
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

    // 3. Encabezados (#, ##, ###)
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${elements.length}`} className="text-xs font-black text-slate-900 uppercase tracking-wider mt-3 mb-1">
          {parseInlineFormatting(trimmed.slice(4))}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${elements.length}`} className="text-sm font-bold text-slate-900 mt-3 mb-1.5">
          {parseInlineFormatting(trimmed.slice(3))}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${elements.length}`} className="text-base font-black text-slate-900 mt-4 mb-2">
          {parseInlineFormatting(trimmed.slice(2))}
        </h2>
      );
      i++;
      continue;
    }

    // 4. Citas (> quote)
    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`quote-${elements.length}`}
          className="border-l-4 border-blue-900 pl-3 py-1 my-2 bg-blue-50/50 text-slate-700 italic text-xs rounded-r"
        >
          {parseInlineFormatting(trimmed.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // 5. Listas con viñetas (- o * )
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        listItems.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-1 my-2 text-xs text-slate-700">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {parseInlineFormatting(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 6. Listas numeradas (1. , 2. )
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const text = lines[i].trim().replace(/^\d+\.\s/, '');
        listItems.push(text);
        i++;
      }
      elements.push(
        <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-1 my-2 text-xs text-slate-700">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {parseInlineFormatting(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 7. Línea vacía
    if (!trimmed) {
      i++;
      continue;
    }

    // 8. Párrafo estándar
    elements.push(
      <p key={`p-${elements.length}`} className="text-xs text-slate-800 leading-relaxed my-1.5 font-normal">
        {parseInlineFormatting(line)}
      </p>
    );
    i++;
  }

  return <div className={`space-y-1 ${className}`}>{elements}</div>;
}

/**
 * Parsea formato inline: **negrita**, *cursiva*, `código`, enlaces [texto](url)
 */
function parseInlineFormatting(text: string): React.ReactNode {
  if (!text) return text;

  // Split por bloques de formato inline: `code`, **bold**, *italic*
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  // Regex para detectar tokens: `code`, **bold**, *italic*
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/;

  while (remaining.length > 0) {
    const match = remaining.match(regex);
    if (!match || match.index === undefined) {
      tokens.push(remaining);
      break;
    }

    // Texto previo al match
    if (match.index > 0) {
      tokens.push(remaining.slice(0, match.index));
    }

    const matchedStr = match[0];

    // Código inline `...`
    if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      tokens.push(
        <code
          key={`inline-code-${keyIdx++}`}
          className="px-1.5 py-0.5 bg-slate-100 text-blue-900 border border-slate-200 rounded font-mono text-[11px] font-bold"
        >
          {matchedStr.slice(1, -1)}
        </code>
      );
    }
    // Negrita **...**
    else if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
      tokens.push(
        <strong key={`bold-${keyIdx++}`} className="font-bold text-slate-900">
          {matchedStr.slice(2, -2)}
        </strong>
      );
    }
    // Cursiva *...*
    else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
      tokens.push(
        <em key={`italic-${keyIdx++}`} className="italic text-slate-800">
          {matchedStr.slice(1, -1)}
        </em>
      );
    }

    remaining = remaining.slice(match.index + matchedStr.length);
  }

  return tokens.length === 1 ? tokens[0] : <>{tokens}</>;
}
