import { NextRequest, NextResponse } from 'next/server';

interface FilaFiltroInput {
  codigo_fhl: string;
  equivalencias: string | null;
  dimensiones: string | null;
  descripcion_aplicacion: string | null;
  precio?: number;
  activo?: boolean;
}

interface FilaVehiculoInput {
  marca: string;
  modelo: string;
  version: string | null;
  año: string | null;
  filtro_asociado: string;
}

interface FilaPrecioInput {
  codigo: string;
  precio: number;
}

interface AlertaFila {
  index: number;
  codigo: string;
  tipo: 'precio' | 'dimensiones' | 'codigo' | 'vehiculo' | 'inconsistencia';
  severidad: 'baja' | 'media' | 'alta';
  mensaje: string;
  sugerencia: string;
}
async function llamarOpenRouterConReintentos(
  apiKey: string,
  payload: any,
  maxReintentosGLM: number = 10
): Promise<{ ok: boolean; data?: any; modeloUsado?: string }> {
  // 1. Intentar hasta 10 veces con z-ai/glm-5.2:free
  for (let intento = 1; intento <= maxReintentosGLM; intento++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(14000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fhlfiltros.com.ar',
          'X-Title': 'FHL Filtros Auditor IA',
        },
        body: JSON.stringify({ ...payload, model: 'z-ai/glm-5.2:free' }),
      });

      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, modeloUsado: 'z-ai/glm-5.2:free' };
      }

      if (res.status === 429 && intento < maxReintentosGLM) {
        await new Promise((r) => setTimeout(r, 600 + intento * 150));
        continue;
      }
    } catch (e) {
      if (intento < maxReintentosGLM) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
    }
  }

  // 2. Si fallaron los 10 intentos de GLM 5.2, pasar a los fallbacks:
  const fallbacks = [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'openrouter/free',
  ];

  for (const mod of fallbacks) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fhlfiltros.com.ar',
          'X-Title': 'FHL Filtros Auditor IA Fallback',
        },
        body: JSON.stringify({ ...payload, model: mod }),
      });

      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, modeloUsado: mod };
      }
    } catch (e) {
      console.warn(`Fallback a ${mod} falló:`, e);
    }
  }

  return { ok: false };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tipo, filas, catalogoReferencia, temperatura = 0.0 } = body as {
      tipo: 'filtros' | 'vehiculos' | 'normalizar_precios';
      filas: any[];
      catalogoReferencia?: { codigo_fhl: string; equivalencias: string; precio: number }[];
      temperatura?: number;
    };

    if (!filas || !Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'No se enviaron filas para auditar' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    // CASO 1: NORMALIZADOR Y AUDITOR DE LISTAS DE PRECIOS
    if (tipo === 'normalizar_precios') {
      const mapaEquivalencias = new Map<string, string>();
      const codigosFHLSet = new Set<string>();

      (catalogoReferencia || []).forEach((f) => {
        const codFhl = (f.codigo_fhl || '').trim().toUpperCase();
        if (codFhl) {
          codigosFHLSet.add(codFhl);
          mapaEquivalencias.set(codFhl, codFhl);
          const eqStr = (f.equivalencias || '').toUpperCase();
          const tokens = eqStr.split(/[,/;\n]+/).map((t) => t.trim().replace(/[\s-]/g, '')).filter(Boolean);
          tokens.forEach((t) => mapaEquivalencias.set(t, codFhl));
        }
      });

      let itemsNormalizados: {
        codigo_fhl: string;
        precio: number;
        codigoOriginal: string;
        fueMapeado: boolean;
        nota?: string;
      }[] = [];

      let scoreSalud = 95;
      let dictamen = 'Aprobado';
      let resumen = 'Precios validados y códigos estandarizados correctamente.';
      let modeloUsado = 'algoritmo-local';

      if (apiKey) {
        const systemPrompt = `Sos el Auditor y Normalizador de Precios de FHL Filtros (Argentina).
Tu tarea es tomar una lista de productos y precios desordenados y normalizarlos con precisión:
1. Normalizar códigos FHL (ej: "101", "fhl 101" -> "FHL-101").
2. Si el código corresponde a otra marca (Mann CU, Fram CF, Wega AKX, Mahle LA, OEM), consultá las equivalencias y asignale su código FHL-XXX equivalente.
3. Asegurar precios numéricos válidos.
4. Devolvé ÚNICAMENTE un JSON válido con esta estructura:
{
  "scoreSalud": <0 a 100>,
  "dictamen": <"Aprobado" | "Advertencias" | "Riesgoso">,
  "resumen": <texto de 2 o 3 oraciones explicando los cambios realizados>,
  "items": [
    {
      "codigo_fhl": <código normalizado FHL-XXX>,
      "precio": <precio numérico limpio>,
      "codigoOriginal": <código tal como venía en la lista>,
      "fueMapeado": <true si fue traducido desde otra marca o modificado, false si ya era FHL exacto>,
      "nota": <motivo del cambio o advertencia>
    }
  ]
}`;

        const userPrompt = `CATÁLOGO DE EQUIVALENCIAS CONOCIDAS FHL:
${JSON.stringify((catalogoReferencia || []).slice(0, 100).map((f) => ({ fhl: f.codigo_fhl, equiv: f.equivalencias })), null, 2)}

LISTA CRUDA A NORMALIZAR Y AUDITAR (${filas.length} ítems):
${JSON.stringify(filas.slice(0, 150), null, 2)}`;

        const respuestaIA = await llamarOpenRouterConReintentos(apiKey, {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: Math.max(0.0, Math.min(1.0, temperatura)),
          top_p: 0.1,
          max_tokens: 3500,
        }, 10);

        if (respuestaIA.ok && respuestaIA.data) {
          const rawContent = respuestaIA.data.choices?.[0]?.message?.content || '';
          const match = rawContent.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              if (Array.isArray(parsed.items) && parsed.items.length > 0) {
                itemsNormalizados = parsed.items;
                scoreSalud = parsed.scoreSalud ?? 90;
                dictamen = parsed.dictamen ?? 'Aprobado';
                resumen = parsed.resumen ?? 'Planilla normalizada con éxito por IA.';
                modeloUsado = respuestaIA.modeloUsado || 'z-ai/glm-5.2:free';
              }
            } catch (err) {
              console.warn('Error al parsear JSON de IA:', err);
            }
          }
        }
      }

      // Respaldo heurístico si no respondió la IA
      if (itemsNormalizados.length === 0) {
        itemsNormalizados = filas.map((f: any) => {
          const raw = String(f.codigo || f.codigo_fhl || f.Filtro || '').trim();
          let codNorm = raw.toUpperCase();
          let fueMapeado = false;
          let nota = '';

          const numMatch = codNorm.match(/^(\d{1,4})$/);
          if (numMatch) {
            codNorm = `FHL-${numMatch[1].padStart(3, '0')}`;
            fueMapeado = true;
            nota = 'Formato normalizado a FHL-XXX';
          } else if (codNorm.startsWith('FHL') && !codNorm.startsWith('FHL-')) {
            codNorm = `FHL-${codNorm.slice(3).trim().padStart(3, '0')}`;
            fueMapeado = true;
            nota = 'Prefijo estandarizado a FHL-XXX';
          }

          const cleanToken = raw.toUpperCase().replace(/[\s-]/g, '');
          if (mapaEquivalencias.has(cleanToken)) {
            const mappedFhl = mapaEquivalencias.get(cleanToken)!;
            if (mappedFhl !== codNorm) {
              codNorm = mappedFhl;
              fueMapeado = true;
              nota = `Mapeado por equivalencia desde ${raw}`;
            }
          }

          const precioNum = typeof f.precio === 'number' ? f.precio : parseFloat(String(f.precio || 0).replace(/[^0-9.]/g, '')) || 0;

          return {
            codigo_fhl: codNorm,
            precio: precioNum,
            codigoOriginal: raw,
            fueMapeado,
            nota: nota || (precioNum <= 0 ? 'Precio en $0' : undefined),
          };
        });
      }

      itemsNormalizados.sort((a, b) => a.codigo_fhl.localeCompare(b.codigo_fhl, 'es', { numeric: true }));

      return NextResponse.json({
        success: true,
        modeloUsado,
        auditoria: {
          scoreSalud,
          dictamen,
          resumen,
          totalFilas: itemsNormalizados.length,
          items: itemsNormalizados,
        },
      });
    }

    // CASO 2: AUDITORÍA DE PRODUCTOS (TABLA A O TABLA B)
    const alertasHeuristicas: AlertaFila[] = [];
    const codigosVistos = new Set<string>();

    if (tipo === 'filtros') {
      (filas as FilaFiltroInput[]).forEach((f, idx) => {
        const codigo = (f.codigo_fhl || '').trim().toUpperCase();
        const precio = Number(f.precio || 0);
        const dim = (f.dimensiones || '').trim();
        const equiv = (f.equivalencias || '').trim();

        if (!codigo || codigo === '—') {
          alertasHeuristicas.push({
            index: idx + 1,
            codigo: 'S/C',
            tipo: 'codigo',
            severidad: 'alta',
            mensaje: 'Fila sin código FHL identificador.',
            sugerencia: 'Asigná un código con formato FHL-XXX.',
          });
        } else if (codigosVistos.has(codigo)) {
          alertasHeuristicas.push({
            index: idx + 1,
            codigo: codigo,
            tipo: 'codigo',
            severidad: 'alta',
            mensaje: `El código ${codigo} está duplicado dentro de este mismo archivo Excel.`,
            sugerencia: 'Eliminá o consolidá las filas duplicadas.',
          });
        } else {
          codigosVistos.add(codigo);
        }

        if (precio <= 0) {
          alertasHeuristicas.push({
            index: idx + 1,
            codigo: codigo || '—',
            tipo: 'precio',
            severidad: 'media',
            mensaje: 'Producto con precio en $0. No podrá facturarse correctamente.',
            sugerencia: 'Ingresá el precio de costo o lista mayorista.',
          });
        } else if (precio > 100000) {
          alertasHeuristicas.push({
            index: idx + 1,
            codigo: codigo || '—',
            tipo: 'precio',
            severidad: 'alta',
            mensaje: `Precio de $${precio.toLocaleString('es-AR')} parece anormalmente elevado para un filtro de habitáculo.`,
            sugerencia: 'Verificá si tiene ceros de más o coma decimal corrida.',
          });
        }

        if (!dim) {
          alertasHeuristicas.push({
            index: idx + 1,
            codigo: codigo || '—',
            tipo: 'dimensiones',
            severidad: 'baja',
            mensaje: 'Filtro sin medidas ni dimensiones especificadas.',
            sugerencia: 'Cargá Largo, Ancho y Alto en milímetros.',
          });
        } else {
          const numMatch = dim.match(/(\d+)/g);
          if (numMatch) {
            const numeros = numMatch.map(Number);
            const numeroGigante = numeros.find((n) => n > 1000);
            if (numeroGigante) {
              alertasHeuristicas.push({
                index: idx + 1,
                codigo: codigo || '—',
                tipo: 'dimensiones',
                severidad: 'alta',
                mensaje: `Medida de ${numeroGigante} mm (más de 1 metro) es desproporcionada para un habitáculo.`,
                sugerencia: 'Revisá si la medida fue cargada en centímetros o tiene un cero extra.',
              });
            }
          }
        }

        if (equiv && !equiv.includes(',') && !equiv.includes('/') && equiv.length > 20) {
          alertasHeuristicas.push({
            index: idx + 1,
            codigo: codigo || '—',
            tipo: 'codigo',
            severidad: 'media',
            mensaje: 'Equivalencias parecen estar pegadas sin comas ni separadores.',
            sugerencia: 'Separar los códigos de otras marcas con comas (ej: AKX-1014, CF-8890).',
          });
        }
      });
    } else {
      (filas as FilaVehiculoInput[]).forEach((v, idx) => {
        const marca = (v.marca || '').trim().toUpperCase();
        const modelo = (v.modelo || '').trim().toUpperCase();
        const anio = (v.año || '').trim();
        const filtro = (v.filtro_asociado || '').trim().toUpperCase();

        if (!marca || !modelo || !filtro) {
          alertasHeuristicas.push({
            index: idx + 1,
            codigo: filtro || '—',
            tipo: 'vehiculo',
            severidad: 'alta',
            mensaje: 'Fila incompleta: faltan marca, modelo o filtro asociado.',
            sugerencia: 'Completá todos los campos requeridos.',
          });
        }

        if (anio) {
          const anioNum = parseInt(anio.replace(/[^0-9]/g, '').slice(0, 4), 10);
          if (anioNum > 2030 || (anioNum > 0 && anioNum < 1950)) {
            alertasHeuristicas.push({
              index: idx + 1,
              codigo: filtro || '—',
              tipo: 'vehiculo',
              severidad: 'media',
              mensaje: `Año ${anio} parece fuera de rango temporal lógico.`,
              sugerencia: 'Revisá el formato de año del vehículo (ej: 2013 → 2019).',
            });
          }
        }
      });
    }

    let resultadoIA = null;
    let modeloUsado = 'reglas-internas';

    const estadisticas = tipo === 'filtros' ? {
      totalFiltros: filas.length,
      sinPrecio: (filas as FilaFiltroInput[]).filter(f => !f.precio || f.precio <= 0).length,
      preciosAtipicosMayor100k: (filas as FilaFiltroInput[]).filter(f => Number(f.precio || 0) > 100000).length,
      sinDimensiones: (filas as FilaFiltroInput[]).filter(f => !f.dimensiones || f.dimensiones.trim() === '').length,
      sinEquivalencias: (filas as FilaFiltroInput[]).filter(f => !f.equivalencias || f.equivalencias.trim() === '').length,
      preciosPromedio: Math.round((filas as FilaFiltroInput[]).reduce((acc, f) => acc + Number(f.precio || 0), 0) / (filas.length || 1)),
      duplicados: alertasHeuristicas.filter(a => a.tipo === 'codigo' && a.mensaje.includes('duplicado')).length,
    } : {
      totalVehiculos: filas.length,
      marcasUnicas: Array.from(new Set((filas as FilaVehiculoInput[]).map(v => (v.marca || '').trim().toUpperCase()))).filter(Boolean).length,
      incompletos: alertasHeuristicas.filter(a => a.tipo === 'vehiculo' && a.severidad === 'alta').length,
      aniosFueraDeRango: alertasHeuristicas.filter(a => a.mensaje.includes('fuera de rango')).length,
    };

    if (apiKey) {
      const systemPrompt = `Sos el Auditor Técnico Principal y Experto en Calidad de Datos del catálogo automotriz de la fábrica "FHL Filtros" (Argentina).
Tu tarea es auditar lotes de importación Excel con máxima rigurosidad analítica y criterio comercial del mercado de autopartes.

Devolvé ÚNICAMENTE un objeto JSON válido con la siguiente estructura exacta (sin markdown adicional):
{
  "scoreSalud": <número entero entre 0 y 100 evaluando la integridad técnica, consistencia de precios y calidad de datos>,
  "dictamen": <"Aprobado" si score >= 85, "Advertencias" si score entre 60 y 84, o "Riesgoso" si score < 60>,
  "resumen": <diagnóstico ejecutivo detallado de 3 o 4 oraciones en español analizando la calidad del lote, anomalías críticas y riesgos operativos>,
  "recomendaciones": [<3 a 4 recomendaciones comerciales y técnicas de alta precisión para el operador>]
}`;

      const userPrompt = `Tipo de catálogo: ${tipo === 'filtros' ? 'Catálogo de Filtros de Habitáculo (Tabla A)' : 'Aplicaciones Vehiculares (Tabla B)'}
Total de filas a auditar: ${filas.length}

ESTADÍSTICAS DEL LOTE:
${JSON.stringify(estadisticas, null, 2)}

ANOMALÍAS DETECTADAS POR EL MOTOR HEURÍSTICO (${alertasHeuristicas.length} alertas):
${JSON.stringify(alertasHeuristicas.slice(0, 50), null, 2)}

MUESTRA REPRESENTATIVA DE FILAS:
${JSON.stringify(filas.slice(0, 25), null, 2)}`;

      const respuestaIA = await llamarOpenRouterConReintentos(apiKey, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: Math.max(0.0, Math.min(1.0, temperatura)),
        top_p: 0.1,
        max_tokens: 800,
      }, 10);

      if (respuestaIA.ok && respuestaIA.data) {
        const rawContent = respuestaIA.data.choices?.[0]?.message?.content || '';
        const match = rawContent.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.scoreSalud !== undefined && parsed.dictamen) {
              resultadoIA = parsed;
              modeloUsado = respuestaIA.modeloUsado || 'z-ai/glm-5.2:free';
            }
          } catch (err) {
            console.warn('Error al parsear dictamen IA:', err);
          }
        }
      }
    }

    const totalFilas = filas.length;
    const penalizacion = alertasHeuristicas.reduce((acc, a) => {
      if (a.severidad === 'alta') return acc + 15;
      if (a.severidad === 'media') return acc + 8;
      return acc + 3;
    }, 0);

    const scoreFinal = resultadoIA?.scoreSalud ?? Math.max(10, Math.min(100, 100 - penalizacion));
    const dictamenFinal =
      resultadoIA?.dictamen ??
      (scoreFinal >= 85 ? 'Aprobado' : scoreFinal >= 60 ? 'Advertencias' : 'Riesgoso');

    const resumenFinal =
      resultadoIA?.resumen ||
      (alertasHeuristicas.length === 0
        ? `El archivo contiene ${totalFilas} registros con formato consistente, precios válidos y dimensiones correctas. Listo para importar.`
        : `Se analizaron ${totalFilas} registros y se detectaron ${alertasHeuristicas.length} anomalías (precios desfasados o dimensiones dudosas). Se recomienda revisar antes de confirmar.`);

    const recomendacionesFinales =
      resultadoIA?.recomendaciones ||
      [
        'Verificar los precios que superen el rango habitual de filtros de habitáculo.',
        'Asegurar que todas las medidas estén expresadas en milímetros.',
        'Confirmar que no existan códigos duplicados en el archivo origen.'
      ];

    return NextResponse.json({
      success: true,
      modeloUsado,
      auditoria: {
        scoreSalud: scoreFinal,
        dictamen: dictamenFinal,
        resumen: resumenFinal,
        totalFilas,
        totalAlertas: alertasHeuristicas.length,
        filasConAlerta: alertasHeuristicas,
        recomendaciones: recomendacionesFinales
      }
    });
  } catch (error: any) {
    console.error('Error en API Auditoría Excel:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}

