import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { systemPrompt, contextoCatalogo, historial, temperatura = 0.1 } = body;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Clave OPENROUTER_API_KEY no configurada en las variables de entorno' },
        { status: 500 }
      );
    }

    const modelosChat = [
      'z-ai/glm-5.2:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'openrouter/free'
    ];

    let textoRespuesta = '';

    // 1. Intentar hasta 10 veces con z-ai/glm-5.2:free
    for (let intento = 1; intento <= 10; intento++) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(14000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://fhlfiltros.com.ar',
            'X-Title': 'FHL Filtros Auditor IA Chat',
          },
          body: JSON.stringify({
            model: 'z-ai/glm-5.2:free',
            messages: [
              {
                role: 'system',
                content: `${systemPrompt}\n\nBASE DE DATOS COMPLETA DE FHL FILTROS:\n${JSON.stringify(contextoCatalogo, null, 2)}`,
              },
              ...(Array.isArray(historial) ? historial : []),
            ],
            temperature: Math.max(0.0, Math.min(1.0, temperatura)),
            top_p: 0.1,
            max_tokens: 2500,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            textoRespuesta = content;
            break;
          }
        }

        if (res.status === 429 && intento < 10) {
          await new Promise((r) => setTimeout(r, 600 + intento * 150));
          continue;
        }
      } catch (e) {
        if (intento < 10) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
      }
    }

    // 2. Si fallaron los 10 intentos de GLM 5.2, usar fallbacks:
    if (!textoRespuesta) {
      const fallbacks = [
        'nvidia/nemotron-3-super-120b-a12b:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'openrouter/free'
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
              'X-Title': 'FHL Filtros Auditor IA Chat Fallback',
            },
            body: JSON.stringify({
              model: mod,
              messages: [
                {
                  role: 'system',
                  content: `${systemPrompt}\n\nBASE DE DATOS COMPLETA DE FHL FILTROS:\n${JSON.stringify(contextoCatalogo, null, 2)}`,
                },
                ...(Array.isArray(historial) ? historial : []),
              ],
              temperature: Math.max(0.0, Math.min(1.0, temperatura)),
              top_p: 0.1,
              max_tokens: 2500,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            let content = data.choices?.[0]?.message?.content?.trim();
            if (content) {
              content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
              textoRespuesta = content;
              break;
            }
          }
        } catch (e) {
          console.warn(`Fallback a ${mod} falló:`, e);
        }
      }
    }

    if (!textoRespuesta) {
      textoRespuesta = 'No se pudo conectar con el proveedor de IA en este momento. Por favor intentá nuevamente.';
    }

    return NextResponse.json({ success: true, respuesta: textoRespuesta });
  } catch (error: any) {
    console.error('Error en API Auditoría Chat:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
