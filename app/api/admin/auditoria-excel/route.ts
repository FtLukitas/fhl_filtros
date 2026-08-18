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

interface AlertaFila {
  index: number;
  codigo: string;
  tipo: 'precio' | 'dimensiones' | 'codigo' | 'vehiculo' | 'inconsistencia';
  severidad: 'baja' | 'media' | 'alta';
  mensaje: string;
  sugerencia: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tipo, filas, temperatura = 0.0 } = body as {
      tipo: 'filtros' | 'vehiculos';
      filas: (FilaFiltroInput | FilaVehiculoInput)[];
      temperatura?: number;
    };

    if (!filas || !Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'No se enviaron filas para auditar' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    // 1. Análisis Algorítmico Heurístico de Alta Precisión (Fallas duras garantizadas)
    const alertasHeuristicas: AlertaFila[] = [];
    const codigosVistos = new Set<string>();

    if (tipo === 'filtros') {
      (filas as FilaFiltroInput[]).forEach((f, idx) => {
        const codigo = (f.codigo_fhl || '').trim().toUpperCase();
        const precio = Number(f.precio || 0);
        const dim = (f.dimensiones || '').trim();
        const equiv = (f.equivalencias || '').trim();

        // Código vacío o mal formado
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

        // Precios anómalos
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

        // Dimensiones
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

        // Equivalencias
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
      // Vehículos
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

    // 2. Consulta a OpenRouter para Dictamen Ejecutivo y Análisis Semántico
    let resultadoIA = null;
    let modeloUsado = 'reglas-internas';

    // Métricas estadísticas avanzadas para alimentar la IA
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

      const modelos = [
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        'openrouter/free'
      ];

      for (const mod of modelos) {
        try {
          const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(8000),
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://fhlfiltros.com.ar',
              'X-Title': 'FHL Filtros Auditor IA'
            },
            body: JSON.stringify({
              model: mod,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
              ],
              temperature: Math.max(0.0, Math.min(1.0, temperatura)),
              top_p: 0.1,
              max_tokens: 800
            })
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const rawContent = aiData.choices?.[0]?.message?.content || '';
            const match = rawContent.match(/\{[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              if (parsed.scoreSalud !== undefined && parsed.dictamen) {
                resultadoIA = parsed;
                modeloUsado = mod;
                break;
              }
            }
          }
        } catch (e) {
          console.warn(`Fallback al siguiente modelo tras error en ${mod}:`, e);
        }
      }
    }

    // 3. Consolidar Diagnóstico Final
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
