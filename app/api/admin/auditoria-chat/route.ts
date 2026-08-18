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
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'openrouter/free'
    ];

    let textoRespuesta = '';

    for (const mod of modelosChat) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(9000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://fhlfiltros.com.ar',
            'X-Title': 'FHL Filtros Auditor IA Chat',
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
          const content = data.choices?.[0]?.message?.content?.trim();
          if (content) {
            textoRespuesta = content;
            break;
          }
        }
      } catch (e) {
        console.warn(`Fallback al siguiente modelo tras error en ${mod}:`, e);
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
