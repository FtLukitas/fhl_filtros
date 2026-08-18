'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ModalAjusteSaldoProps {
  abierto: boolean;
  onCerrar: () => void;
  cliente: {
    id: string;
    nombre: string;
  } | null;
  saldoActual: number;
  onGuardado: () => void;
}

type ModoAjuste = 'fijar' | 'sumar' | 'restar';

export default function ModalAjusteSaldo({
  abierto,
  onCerrar,
  cliente,
  saldoActual,
  onGuardado,
}: ModalAjusteSaldoProps) {
  const [modo, setModo] = useState<ModoAjuste>('fijar');
  const [montoInput, setMontoInput] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto && cliente) {
      setModo('fijar');
      setMontoInput(saldoActual > 0 ? saldoActual.toString() : '0');
      setConcepto('Ajuste manual de saldo');
      // Fecha actual en formato YYYY-MM-DD
      const hoy = new Date().toISOString().split('T')[0];
      setFecha(hoy);
      setError(null);
    }
  }, [abierto, cliente, saldoActual]);

  if (!abierto || !cliente) return null;

  const montoNumerico = parseFloat(montoInput) || 0;

  // Cálculo del nuevo saldo y del delta (diferencia)
  let nuevoSaldo = saldoActual;
  let deltaMonto = 0; // lo que se guardará en movimientos_saldo

  if (modo === 'fijar') {
    nuevoSaldo = Math.max(0, montoNumerico);
    deltaMonto = nuevoSaldo - saldoActual;
  } else if (modo === 'sumar') {
    deltaMonto = Math.max(0, montoNumerico);
    nuevoSaldo = saldoActual + deltaMonto;
  } else if (modo === 'restar') {
    deltaMonto = -Math.max(0, montoNumerico);
    nuevoSaldo = Math.max(0, saldoActual + deltaMonto);
  }

  const sugerenciasConcepto =
    modo === 'sumar'
      ? ['Anticipo en efectivo', 'Nota de crédito', 'Bonificación especial', 'Transferencia bancaria']
      : modo === 'restar'
      ? ['Devolución de saldo', 'Compensación contable', 'Ajuste por corrección', 'Retiro de crédito']
      : ['Ajuste manual de saldo', 'Saldo inicial de cuenta', 'Regularización contable'];

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deltaMonto === 0) {
      setError('El ajuste no genera ningún cambio en el saldo del cliente');
      return;
    }

    if (!concepto.trim()) {
      setError('Por favor especificá un motivo o concepto para el ajuste de saldo');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      // Determinamos el tipo de movimiento
      const tipoMovimiento =
        deltaMonto > 0
          ? modo === 'sumar'
            ? 'excedente'
            : 'ajuste_manual'
          : modo === 'restar'
          ? 'aplicado'
          : 'ajuste_manual';

      const fechaISO = fecha ? new Date(`${fecha}T12:00:00Z`).toISOString() : new Date().toISOString();

      const { error: insertErr } = await supabase.from('movimientos_saldo').insert({
        cliente_id: cliente.id,
        monto: deltaMonto,
        tipo: tipoMovimiento,
        nota: concepto.trim(),
        fecha: fechaISO,
      });

      if (insertErr) throw insertErr;

      onGuardado();
      onCerrar();
    } catch (err: any) {
      console.error('Error al guardar ajuste de saldo:', err);
      setError(err.message || 'No se pudo guardar el ajuste de saldo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-saldo-title"
        className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-150 border border-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-900 rounded-md">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Cuenta Corriente
              </span>
              <h2 id="modal-saldo-title" className="text-base font-black text-slate-900">
                Editar Saldo a Favor
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Cliente y Saldo Actual */}
        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200/80 mb-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Cliente
            </span>
            <span className="text-xs font-bold text-slate-900 block truncate max-w-[240px]">
              {cliente.nombre}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Saldo Actual
            </span>
            <span className="text-sm font-black font-mono text-blue-900">
              ${saldoActual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Selector de Modo */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg mb-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setModo('fijar');
              setMontoInput(saldoActual > 0 ? saldoActual.toString() : '0');
              setConcepto('Ajuste manual de saldo');
            }}
            className={`py-2 rounded-md transition-all cursor-pointer text-center ${
              modo === 'fijar'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Fijar Saldo
          </button>
          <button
            type="button"
            onClick={() => {
              setModo('sumar');
              setMontoInput('');
              setConcepto('Anticipo de pago');
            }}
            className={`py-2 rounded-md transition-all cursor-pointer text-center ${
              modo === 'sumar'
                ? 'bg-white text-green-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            + Sumar Crédito
          </button>
          <button
            type="button"
            onClick={() => {
              setModo('restar');
              setMontoInput('');
              setConcepto('Devolución de saldo');
            }}
            className={`py-2 rounded-md transition-all cursor-pointer text-center ${
              modo === 'restar'
                ? 'bg-white text-amber-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            - Restar / Deducir
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleGuardar} className="space-y-4">
          
          {/* Monto */}
          <div>
            <label htmlFor="monto-ajuste" className="block text-xs font-bold text-slate-700 mb-1">
              {modo === 'fijar' && 'Nuevo Saldo Final Exacto ($ ARS):'}
              {modo === 'sumar' && 'Monto a Agregar al Saldo ($ ARS):'}
              {modo === 'restar' && 'Monto a Deducir del Saldo ($ ARS):'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 font-mono">$</span>
              <input
                id="monto-ajuste"
                type="number"
                step="0.01"
                min="0"
                value={montoInput}
                onChange={(e) => setMontoInput(e.target.value)}
                placeholder="0.00"
                required
                className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-md text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>
          </div>

          {/* Previsualización del Impacto */}
          <div
            className={`p-3 rounded-md border text-xs flex items-center justify-between ${
              deltaMonto > 0
                ? 'bg-green-50/70 border-green-200 text-green-950'
                : deltaMonto < 0
                ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div>
              <span className="font-semibold block">
                {deltaMonto > 0 ? 'Movimiento: Crédito a Favor (+)' : deltaMonto < 0 ? 'Movimiento: Deducción (-)' : 'Sin Variación'}
              </span>
              <span className="text-[11px] opacity-80 font-mono">
                {deltaMonto >= 0 ? `+ $${deltaMonto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : `- $${Math.abs(deltaMonto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider font-bold block opacity-75">
                Saldo Resultante
              </span>
              <span className="text-sm font-black font-mono">
                ${nuevoSaldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Concepto / Motivo */}
          <div>
            <label htmlFor="concepto-ajuste" className="block text-xs font-bold text-slate-700 mb-1">
              Motivo o Concepto del Ajuste:
            </label>
            <input
              id="concepto-ajuste"
              type="text"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: Anticipo en efectivo, Nota de crédito #123..."
              required
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900"
            />

            {/* Chips de sugerencias */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {sugerenciasConcepto.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setConcepto(sug)}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-medium transition-colors cursor-pointer"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div>
            <label htmlFor="fecha-ajuste" className="block text-xs font-bold text-slate-700 mb-1">
              Fecha del Movimiento:
            </label>
            <input
              id="fecha-ajuste"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
          </div>

          {/* Mensaje de Error */}
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-md text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-md transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || deltaMonto === 0}
              className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-md transition-colors shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {guardando ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span>Guardar Saldo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
