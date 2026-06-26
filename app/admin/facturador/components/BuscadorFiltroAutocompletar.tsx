'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import type { Filtro } from '../../../../lib/types';

interface BuscadorFiltroAutocompletarProps {
  onSeleccionar: (filtro: Filtro) => void;
}

export default function BuscadorFiltroAutocompletar({ onSeleccionar }: BuscadorFiltroAutocompletarProps) {
  const [texto, setTexto] = useState('');
  const [sugerencias, setSugerencias] = useState<Filtro[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cerrar dropdown al clickear fuera
  useEffect(() => {
    const handleClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, []);

  // Buscar con debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (texto.trim().length < 2) {
      setSugerencias([]);
      setAbierto(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setCargando(true);
      // Normalizar: quitar guiones y espacios para buscar
      const termino = texto.trim().replace(/[-\s]/g, '');

      const { data, error } = await supabase
        .from('Tabla A')
        .select('*')
        .or(`codigo_fhl.ilike.%${termino}%,buscador_unificado.ilike.%${termino}%`)
        .limit(8);

      if (!error && data) {
        setSugerencias(data as Filtro[]);
        setAbierto(data.length > 0);
        setIndiceActivo(-1);
      }
      setCargando(false);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [texto]);

  const seleccionar = (filtro: Filtro) => {
    onSeleccionar(filtro);
    setTexto('');
    setSugerencias([]);
    setAbierto(false);
    setIndiceActivo(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!abierto) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceActivo((prev) => (prev < sugerencias.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceActivo((prev) => (prev > 0 ? prev - 1 : sugerencias.length - 1));
    } else if (e.key === 'Enter' && indiceActivo >= 0) {
      e.preventDefault();
      seleccionar(sugerencias[indiceActivo]);
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  };

  return (
    <div ref={contenedorRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => sugerencias.length > 0 && setAbierto(true)}
            placeholder="Buscar filtro por código (ej: FHL-001)..."
            className="w-full border border-slate-300 rounded pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {cargando && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Dropdown de sugerencias */}
      {abierto && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded shadow-lg max-h-64 overflow-y-auto">
          {sugerencias.map((filtro, idx) => (
            <button
              key={filtro.id}
              onClick={() => seleccionar(filtro)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-slate-100 last:border-b-0 ${
                idx === indiceActivo
                  ? 'bg-blue-50 text-blue-900'
                  : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span className="font-bold text-blue-900">{filtro.codigo_fhl}</span>
              {filtro.descripcion_aplicacion && (
                <span className="text-slate-500 ml-2 text-xs truncate">
                  {filtro.descripcion_aplicacion.slice(0, 60)}
                  {filtro.descripcion_aplicacion.length > 60 ? '...' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
