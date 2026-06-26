'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import type { Filtro } from '../../lib/types';

// --- Utilidades ---

const extraerMedida = (texto: string | null, etiqueta: string) => {
  if (!texto) return '-';
  const regex = new RegExp(`${etiqueta}:\\s*(\\d+(?:[.,]\\d+)?)`, 'i');
  const coincidencia = texto.match(regex);
  return coincidencia ? coincidencia[1] : '-';
};

const normalizarImagenes = (imagenes: string | string[] | null): string[] => {
  if (!imagenes) return [];
  if (Array.isArray(imagenes)) return imagenes;
  if (typeof imagenes === 'string') {
    try {
      return JSON.parse(imagenes);
    } catch {
      return [];
    }
  }
  return [];
};

const copiarAlPortapapeles = async (texto: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto);
  } else {
    const el = document.createElement('textarea');
    el.value = texto;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
};

// --- Componente ---

interface ModalDetalleProps {
  filtro: Filtro | null;
  onCerrar: () => void;
}

export default function ModalDetalle({ filtro, onCerrar }: ModalDetalleProps) {
  const pathname = usePathname();
  const [indiceImagen, setIndiceImagen] = useState(0);
  const [zoomActivo, setZoomActivo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Reset state cuando cambia el filtro mostrado
  useEffect(() => {
    if (filtro) {
      setIndiceImagen(0);
      setZoomActivo(false);
      setCopiado(false);
    }
  }, [filtro?.codigo_fhl]);

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (filtro) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [filtro]);

  // Cerrar con tecla Escape
  useEffect(() => {
    if (!filtro) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtro, onCerrar]);

  const compartirFiltro = useCallback(async () => {
    if (!filtro?.codigo_fhl) return;
    const url = `${window.location.origin}${pathname}?filtro=${filtro.codigo_fhl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `FHL ${filtro.codigo_fhl}`, url });
        return;
      }
    } catch {}
    await copiarAlPortapapeles(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }, [filtro, pathname]);

  if (!filtro) return null;

  const listaImagenes = normalizarImagenes(filtro.imagen_url);

  return (
    <div
      className="fixed inset-0 bg-slate-900/70 z-[900] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Ficha técnica del filtro ${filtro.codigo_fhl}`}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="bg-blue-900 p-6 flex justify-between items-center text-white">
          <div>
            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Ficha Técnica FHL</span>
            <h3 className="text-3xl font-black">{filtro.codigo_fhl}</h3>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center">
              <button onClick={compartirFiltro} className="text-white hover:text-green-300 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors" title="Compartir">
                {copiado ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                )}
              </button>
              <span className="text-[10px] text-blue-200">{copiado ? 'Copiado' : 'Compartir'}</span>
            </div>
            <div className="flex flex-col items-center">
              <button onClick={onCerrar} className="text-white hover:text-red-400 font-black text-3xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors" aria-label="Cerrar ficha técnica">&times;</button>
              <span className="text-[10px] text-blue-200">Salir</span>
            </div>
          </div>
        </div>

        {/* CONTENIDO SCROLLEABLE */}
        <div className={`p-6 will-change-transform ${zoomActivo ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          <div className="mb-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Equivalencias OEM / Cruzadas</p>
            <p className="text-slate-700 font-medium">{filtro.equivalencias || 'Sin equivalencias registradas.'}</p>
          </div>

          {/* VISOR DE IMÁGENES */}
          <div className="mb-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Vista del Producto</p>
            
            {listaImagenes.length > 0 ? (
              <div className="flex flex-col gap-3">
                {/* Foto Principal */}
                <div 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 md:p-4 flex items-center justify-center h-[280px] md:h-[380px] overflow-hidden shadow-inner transition-all cursor-zoom-in hover:border-blue-300"
                  onClick={() => setZoomActivo(true)}
                >
                  <img
                    src={listaImagenes[indiceImagen]}
                    alt={`Filtro FHL ${filtro.codigo_fhl} - Vista ${indiceImagen + 1}`}
                    className="w-full h-full object-contain"
                    loading="lazy"
                  />
                </div>

                {/* Modal interno para Zoom a pantalla completa */}
                {zoomActivo && (
                  <div 
                    className="fixed inset-0 z-[1000] bg-slate-900/95 flex items-center justify-center p-4 md:p-10 cursor-zoom-out animate-in fade-in duration-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomActivo(false);
                    }}
                  >
                    <img
                      src={listaImagenes[indiceImagen]}
                      alt="Vista ampliada"
                      className="max-w-full max-h-full object-contain drop-shadow-2xl"
                    />
                    <span className="absolute top-6 md:top-10 right-6 md:right-10 text-white font-bold bg-white/10 hover:bg-white/20 transition-colors px-4 py-2 rounded-full text-[10px] uppercase tracking-widest backdrop-blur-sm">
                      Cerrar [X]
                    </span>
                  </div>
                )}

                {/* Galería de Miniaturas */}
                {listaImagenes.length > 1 && (
                  <div className="flex gap-3 overflow-x-auto py-2 justify-center scrollbar-hide">
                    {listaImagenes.map((url: string, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setIndiceImagen(idx)}
                        className={`w-20 h-16 md:w-24 md:h-20 rounded-lg border-2 flex-shrink-0 overflow-hidden bg-slate-50 transition-all focus:outline-none ${
                          indiceImagen === idx 
                            ? 'border-blue-600 shadow-md scale-105 ring-2 ring-blue-100' 
                            : 'border-slate-200 hover:border-blue-400 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img 
                          src={url} 
                          className="w-full h-full object-contain p-1 mix-blend-multiply" 
                          alt={`Miniatura ${idx + 1}`} 
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Placeholder si no hay imagen */
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-6 flex items-center justify-center h-[260px] shadow-inner">
                <div className="text-slate-300 flex flex-col items-center gap-2 select-none">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Imagen no disponible</span>
                </div>
              </div>
            )}
          </div>

          {/* DIMENSIONES */}
          <div className="mb-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Dimensiones Nominales (mm)</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Largo (A)</span>
                <span className="text-2xl font-mono font-black text-blue-900">{extraerMedida(filtro.dimensiones, 'Largo')}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Ancho (B)</span>
                <span className="text-2xl font-mono font-black text-blue-900">{extraerMedida(filtro.dimensiones, 'Ancho')}</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Alto (H)</span>
                <span className="text-2xl font-mono font-black text-blue-900">{extraerMedida(filtro.dimensiones, 'Alto')}</span>
              </div>
            </div>
          </div>

          {/* APLICACIÓN */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Aplicación Detallada</p>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">
              {filtro.descripcion_aplicacion || 'No hay información de aplicación cargada para este filtro.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
