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
    // Evitar el debounce en el primer render (valor vacío)
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
        .ilike('buscador_unificado', `%${terminoLimpio}%`);
    
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

  return (
    <section>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-lg font-bold whitespace-nowrap">O BUSCAR POR CÓDIGO/EQUIVALENCIA</h2>
        <div className="h-[1px] bg-slate-200 w-full"></div>
      </div>

      <input
        type="text"
        placeholder="Escribí código FHL o equivalencia (ej: AKX-1014)..."
        className="w-full p-4 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all mb-8"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {/* MENSAJE DE ERROR */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* SPINNER DE CARGA */}
      {mostrarCargando && (
        <div className="flex items-center justify-center gap-3 mb-8 text-slate-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Buscando filtros...</span>
        </div>
      )}

      {/* RESULTADOS */}
      {!mostrarCargando && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filtrosTexto.map((f) => (
            <div 
              key={f.id} 
              onClick={() => onVerDetalle(f.codigo_fhl)}
              className="bg-white p-5 rounded-xl border border-slate-200 hover:shadow-lg hover:border-blue-400 transition-all cursor-pointer transform hover:-translate-y-1 flex flex-col h-full group"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-blue-900 font-bold text-lg group-hover:text-red-500">{f.codigo_fhl}</span>
                <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-1 rounded font-bold uppercase transition-colors group-hover:bg-blue-900 group-hover:text-white">Ver Detalle</span>
              </div>
              
              <p className="text-xs text-slate-400 uppercase font-semibold">Equivalencias</p>
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
