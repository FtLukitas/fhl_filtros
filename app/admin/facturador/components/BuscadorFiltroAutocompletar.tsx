'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import type { Filtro } from '../../../../lib/types';

interface BuscadorFiltroAutocompletarProps {
  onSeleccionar: (filtro: Filtro | { codigo_fhl: string }) => void;
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
        setAbierto(true);
        setIndiceActivo(-1);
      }
      setCargando(false);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [texto]);

  const seleccionar = (filtro: Filtro | { codigo_fhl: string }) => {
    onSeleccionar(filtro);
    setTexto('');
    setSugerencias([]);
    setAbierto(false);
    setIndiceActivo(-1);
    inputRef.current?.focus();
  };

  const handleAgregarManual = () => {
    const trimmed = texto.trim();
    if (!trimmed) return;
    const exacta = sugerencias.find(
      (s) => s.codigo_fhl.toLowerCase() === trimmed.toLowerCase()
    );
    seleccionar(exacta || { codigo_fhl: trimmed.toUpperCase() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      if (!abierto && sugerencias.length > 0) {
        setAbierto(true);
        setIndiceActivo(0);
        return;
      }
      if (!abierto) return;
      e.preventDefault();
      setIndiceActivo((prev) => (prev < sugerencias.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      if (!abierto) return;
      e.preventDefault();
      setIndiceActivo((prev) => (prev > 0 ? prev - 1 : sugerencias.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (abierto && indiceActivo >= 0 && sugerencias[indiceActivo]) {
        seleccionar(sugerencias[indiceActivo]);
      } else if (texto.trim().length > 0) {
        handleAgregarManual();
      }
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  };

  return (
    <div ref={contenedorRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
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
            onFocus={() => {
              if (sugerencias.length > 0 || (texto.trim().length >= 2 && !cargando)) {
                setAbierto(true);
              }
            }}
            placeholder="Buscar código (ej: FHL-001) o escribir nuevo..."
            className="w-full border border-slate-300 rounded pl-9 pr-16 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {cargando && (
              <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
            <button
              type="button"
              onClick={handleAgregarManual}
              disabled={!texto.trim()}
              title={texto.trim() ? `Agregar "${texto.trim()}" al presupuesto` : 'Escribí un código para agregar'}
              aria-label="Agregar filtro"
              className="p-1 rounded bg-blue-900 hover:bg-blue-800 text-white disabled:opacity-40 disabled:hover:bg-blue-900 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-sm active:scale-95"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Dropdown de sugerencias */}
      {abierto && sugerencias.length > 0 && (
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

      {/* Dropdown sin resultados pero con opción de agregar */}
      {abierto && sugerencias.length === 0 && texto.trim().length >= 2 && !cargando && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded shadow-lg p-3 text-center">
          <p className="text-xs text-slate-500 mb-2">
            No se encontró <span className="font-bold text-slate-800 font-mono">"{texto.trim()}"</span> en el catálogo.
          </p>
          <button
            type="button"
            onClick={handleAgregarManual}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Agregar como nuevo filtro
          </button>
        </div>
      )}
    </div>
  );
}
