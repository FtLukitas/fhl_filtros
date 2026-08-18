'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { Filtro } from '../../lib/types';

const extraerMedida = (texto: string | null, etiqueta: string) => {
  if (!texto) return '-';
  const regex = new RegExp(`${etiqueta}:\\s*(\\d+(?:[.,]\\d+)?)`, 'i');
  const coincidencia = texto.match(regex);
  return coincidencia ? coincidencia[1] : '-';
};

const normalizarBusqueda = (texto: string) => {
  return texto.replace(/[- ]/g, '').toLowerCase();
};

interface BuscadorCodigoProps {
  onVerDetalle: (codigo: string) => void;
}

export default function BuscadorCodigo({ onVerDetalle }: BuscadorCodigoProps) {
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [filtrosTexto, setFiltrosTexto] = useState<Filtro[]>([]);
  const [cargandoTexto, setCargandoTexto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primerRender = useRef(true);

  // Debounce de 350ms
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setBusquedaDebounced(busqueda);
    }, 350);
    return () => clearTimeout(timer);
  }, [busqueda]);

  // Fetch cuando cambia el valor debounced
  useEffect(() => {
    const fetchPorTexto = async () => {
      const terminoLimpio = normalizarBusqueda(busquedaDebounced);
      if (terminoLimpio.length < 2) { 
        setFiltrosTexto([]); 
        setCargandoTexto(false);
        return; 
      }
      setCargandoTexto(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('Tabla A')
        .select('*')
        .ilike('buscador_unificado', `%${terminoLimpio}%`)
        .eq('activo', true)
        .or('eliminado.is.null,eliminado.eq.false');
    
      if (err) {
        setError('Error al buscar filtros. Intentá de nuevo.');
        console.error(err);
      } else {
        setFiltrosTexto((data as Filtro[]) || []);
      }
      setCargandoTexto(false);
    };

    fetchPorTexto();
  }, [busquedaDebounced]);

  // Mostrar spinner inmediatamente al tipear (antes del debounce)
  const mostrarCargando = cargandoTexto || (busqueda !== busquedaDebounced && normalizarBusqueda(busqueda).length >= 2);
  const sinResultados = !mostrarCargando && busquedaDebounced.trim().length >= 2 && filtrosTexto.length === 0;

  return (
    <section aria-labelledby="heading-buscador-codigo">
      <div className="flex items-center gap-4 mb-6">
        <h2 id="heading-buscador-codigo" className="text-lg font-bold whitespace-nowrap text-slate-800">
          O BUSCAR POR CÓDIGO/EQUIVALENCIA
        </h2>
        <div className="h-[1px] bg-slate-200 w-full" aria-hidden="true"></div>
      </div>

      <div className="relative mb-8">
        <label htmlFor="input-buscador-codigo" className="sr-only">
          Buscar por código FHL o equivalencia
        </label>
        <input
          id="input-buscador-codigo"
          type="search"
          placeholder="Escribí código FHL o equivalencia (ej: AKX-1014, FHL-001)..."
          className="w-full p-4 rounded-lg border-2 border-slate-200 focus:border-blue-900 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-slate-900 placeholder:text-slate-400 font-medium"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar filtro por código FHL o equivalencia cruzada"
        />
      </div>

      {/* MENSAJE DE ERROR */}
      {error && (
        <div role="alert" aria-live="assertive" className="mb-6 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* SPINNER DE CARGA */}
      {mostrarCargando && (
        <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 mb-8 text-slate-500">
          <svg className="animate-spin h-5 w-5 text-blue-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-semibold">Buscando filtros en el catálogo...</span>
        </div>
      )}

      {/* EMPTY STATE */}
      {sinResultados && (
        <div className="bg-white rounded-lg p-8 text-center border border-slate-200 mb-8 shadow-xs">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-400 mb-2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p className="text-sm font-bold text-slate-700">
            No se encontraron filtros para <span className="text-blue-900 font-mono">"{busquedaDebounced.trim()}"</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Verificá el código o equivalencia ingresada o probá buscando por marca y modelo de vehículo arriba.
          </p>
        </div>
      )}

      {/* RESULTADOS */}
      {!mostrarCargando && filtrosTexto.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filtrosTexto.map((f) => (
            <div 
              key={f.id} 
              role="button"
              tabIndex={0}
              onClick={() => onVerDetalle(f.codigo_fhl)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onVerDetalle(f.codigo_fhl);
                }
              }}
              aria-label={`Ver ficha técnica y medidas del filtro ${f.codigo_fhl}`}
              className="bg-white p-5 rounded-lg border border-slate-200 hover:shadow-lg hover:border-blue-500 transition-all cursor-pointer transform hover:-translate-y-0.5 flex flex-col h-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-blue-900 font-black text-lg group-hover:text-red-600 transition-colors">
                  {f.codigo_fhl}
                </span>
                <span className="text-[10px] bg-blue-50 text-blue-900 px-2 py-1 rounded font-bold uppercase transition-colors group-hover:bg-blue-900 group-hover:text-white border border-blue-100">
                  Ver Ficha
                </span>
              </div>
              
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Equivalencias</p>
              <p className="text-sm text-slate-600 mb-4 line-clamp-2">{f.equivalencias || 'N/A'}</p>
  
              <div className="mt-auto border-t border-slate-100 pt-3">
                <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Largo</span>
                    <span className="text-sm font-black text-slate-700">{extraerMedida(f.dimensiones, 'Largo')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Ancho</span>
                    <span className="text-sm font-black text-slate-700">{extraerMedida(f.dimensiones, 'Ancho')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Alto</span>
                    <span className="text-sm font-black text-slate-700">{extraerMedida(f.dimensiones, 'Alto')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
