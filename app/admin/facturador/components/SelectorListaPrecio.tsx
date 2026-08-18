'use client';

import React from 'react';
import type { ListaPrecio } from '@/lib/types';

interface SelectorListaPrecioProps {
  listas: ListaPrecio[];
  listaSeleccionada: ListaPrecio | null;
  onSeleccionarLista: (lista: ListaPrecio) => void;
  tienePreciosPersonalizadosCliente?: boolean;
  usarPreciosCliente?: boolean;
  onTogglePreciosCliente?: (usar: boolean) => void;
  cargando?: boolean;
}

export default function SelectorListaPrecio({
  listas,
  listaSeleccionada,
  onSeleccionarLista,
  tienePreciosPersonalizadosCliente = false,
  usarPreciosCliente = true,
  onTogglePreciosCliente,
  cargando = false,
}: SelectorListaPrecioProps) {
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-900" aria-hidden="true">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
          <label htmlFor="selector-lista-precio" className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Lista de Precios
          </label>
        </div>

        {listaSeleccionada && (
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded ${
              listaSeleccionada.tipo_ajuste === 'porcentaje' && Number(listaSeleccionada.porcentaje) < 0
                ? 'bg-green-100 text-green-800 border border-green-200'
                : listaSeleccionada.tipo_ajuste === 'porcentaje' && Number(listaSeleccionada.porcentaje) > 0
                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                : listaSeleccionada.es_predeterminada
                ? 'bg-blue-100 text-blue-900 border border-blue-200'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {listaSeleccionada.tipo_ajuste === 'porcentaje' && Number(listaSeleccionada.porcentaje) !== 0
              ? Number(listaSeleccionada.porcentaje) > 0
                ? `+${listaSeleccionada.porcentaje}% Recargo`
                : `${Math.abs(listaSeleccionada.porcentaje)}% Descuento`
              : listaSeleccionada.es_predeterminada
              ? 'Lista Predeterminada'
              : 'Lista Activa'}
          </span>
        )}
      </div>

      {/* Selector de Listas */}
      <div className="relative">
        <select
          id="selector-lista-precio"
          value={listaSeleccionada?.id || ''}
          onChange={(e) => {
            const encontrada = listas.find((l) => l.id === e.target.value);
            if (encontrada) {
              onSeleccionarLista(encontrada);
            }
          }}
          disabled={cargando || listas.length === 0}
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition-all cursor-pointer disabled:opacity-50"
        >
          {listas.map((l) => {
            const porcentajeTxt =
              l.tipo_ajuste === 'porcentaje' && Number(l.porcentaje) !== 0
                ? ` (${Number(l.porcentaje) > 0 ? `+${l.porcentaje}%` : `${l.porcentaje}%`})`
                : '';
            const predTxt = l.es_predeterminada ? ' — Predeterminada' : '';

            return (
              <option key={l.id} value={l.id}>
                {l.nombre}{porcentajeTxt}{predTxt}
              </option>
            );
          })}
        </select>
      </div>

      {/* Toggle para Precios Acordados / Personalizados del Cliente */}
      {tienePreciosPersonalizadosCliente && onTogglePreciosCliente && (
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="toggle-precios-cliente"
              checked={usarPreciosCliente}
              onChange={(e) => onTogglePreciosCliente(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-900 cursor-pointer"
            />
            <label htmlFor="toggle-precios-cliente" className="text-[11px] text-slate-700 font-semibold cursor-pointer">
              Priorizar tarifas personalizadas del cliente
            </label>
          </div>
          <span className="text-[10px] text-blue-900 font-bold bg-blue-50 px-1.5 py-0.5 rounded">
            Precios Acordados
          </span>
        </div>
      )}
    </div>
  );
}
