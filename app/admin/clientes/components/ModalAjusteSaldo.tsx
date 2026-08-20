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
  deudaActual?: number;
  saldoActual?: number;
  onGuardado: () => void;
}

type ModoAjuste = 'cargar_deuda' | 'sumar_credito' | 'fijar_deuda';

export default function ModalAjusteSaldo({
  abierto,
  onCerrar,
  cliente,
  deudaActual = 0,
  saldoActual = 0,
  onGuardado,
}: ModalAjusteSaldoProps) {
  const [modo, setModo] = useState<ModoAjuste>('cargar_deuda');
  const [montoInput, setMontoInput] = useState('');
  const [concepto, setConcepto] = useState('');
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto && cliente) {
      setModo('cargar_deuda');
      setMontoInput('');
      setConcepto('Saldo deudor anterior');
      const hoy = new Date().toISOString().split('T')[0];
      setFecha(hoy);
      setError(null);
    }
  }, [abierto, cliente]);

  if (!abierto || !cliente) return null;

  const montoNumerico = parseFloat(montoInput) || 0;

  // Cálculo del impacto financiero
  let deltaMonto = 0; // lo que se insertará en movimientos_saldo
  let deudaResultante = deudaActual;
  let saldoResultante = saldoActual;

  if (modo === 'cargar_deuda') {
    deltaMonto = -Math.abs(montoNumerico);
    deudaResultante = deudaActual + Math.abs(montoNumerico);
    saldoResultante = saldoActual;
  } else if (modo === 'sumar_credito') {
    deltaMonto = Math.abs(montoNumerico);
    deudaResultante = deudaActual;
    saldoResultante = saldoActual + Math.abs(montoNumerico);
  } else if (modo === 'fijar_deuda') {
    // Si el usuario quiere fijar la deuda total en X:
    const deudaDeseada = Math.max(0, montoNumerico);
    const diferencia = deudaDeseada - deudaActual;
    deltaMonto = -diferencia;
    deudaResultante = deudaDeseada;
    saldoResultante = saldoActual;
  }

  const sugerenciasConcepto =
    modo === 'cargar_deuda'
      ? ['Saldo deudor anterior', 'Deuda inicial convenida', 'Recargo administrativo', 'Cheque rechazado', 'Ajuste de deuda']
      : modo === 'sumar_credito'
      ? ['Anticipo en efectivo', 'Transferencia recibida', 'Nota de crédito', 'Bonificación especial']
      : ['Regularización contable', 'Ajuste a saldo convenido', 'Auditoría de cuenta'];

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deltaMonto === 0) {
      setError('Por favor ingresá un monto mayor a 0 para el ajuste');
      return;
    }

    if (!concepto.trim()) {
      setError('Por favor especificá un motivo o concepto para el movimiento');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const tipoMovimiento =
        deltaMonto < 0
          ? 'ajuste_manual'
          : 'anticipo';

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
      console.error('Error al guardar movimiento de cuenta corriente:', err);
      setError(err.message || 'No se pudo guardar el ajuste.');
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
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-md ${
              modo === 'cargar_deuda' ? 'bg-red-50 text-red-700' : modo === 'sumar_credito' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-900'
            }`}>
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
                Ajustar Deuda o Saldo
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

        {/* Cliente y Estado Financiero Actual */}
        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200/80 mb-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Cliente
            </span>
            <span className="font-bold text-slate-900 block truncate" title={cliente.nombre}>
              {cliente.nombre}
            </span>
          </div>

          <div className="text-right flex items-center justify-end gap-3">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Deuda Actual
              </span>
              <span className={`font-black font-mono text-sm ${deudaActual > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                ${deudaActual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {saldoActual > 0 && (
              <div className="border-l border-slate-200 pl-3">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                  A Favor
                </span>
                <span className="font-black font-mono text-sm text-emerald-700">
                  ${saldoActual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Selector de Modo */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg mb-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setModo('cargar_deuda');
              setMontoInput('');
              setConcepto('Saldo deudor anterior');
            }}
            className={`py-2 rounded-md transition-all cursor-pointer text-center ${
              modo === 'cargar_deuda'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            + Sumar a Deuda
          </button>
          <button
            type="button"
            onClick={() => {
              setModo('sumar_credito');
              setMontoInput('');
              setConcepto('Anticipo de pago');
            }}
            className={`py-2 rounded-md transition-all cursor-pointer text-center ${
              modo === 'sumar_credito'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            + Saldo a Favor
          </button>
          <button
            type="button"
            onClick={() => {
              setModo('fijar_deuda');
              setMontoInput(deudaActual.toString());
              setConcepto('Regularización contable');
            }}
            className={`py-2 rounded-md transition-all cursor-pointer text-center ${
              modo === 'fijar_deuda'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Fijar Deuda
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleGuardar} className="space-y-4">
          
          {/* Monto */}
          <div>
            <label htmlFor="monto-ajuste" className="block text-xs font-bold text-slate-700 mb-1">
              {modo === 'cargar_deuda' && 'Monto a Sumar a la Deuda ($ ARS):'}
              {modo === 'sumar_credito' && 'Monto de Saldo a Favor a Acreditar ($ ARS):'}
              {modo === 'fijar_deuda' && 'Deuda Total Resultante Deseada ($ ARS):'}
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

          {/* Previsualización del Impacto en la Deuda / Saldo */}
          <div
            className={`p-3.5 rounded-md border text-xs flex items-center justify-between ${
              modo === 'cargar_deuda' || (modo === 'fijar_deuda' && deudaResultante > deudaActual)
                ? 'bg-red-50/80 border-red-200 text-red-950'
                : modo === 'sumar_credito'
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div>
              <span className="font-bold block text-[11px] uppercase tracking-wider">
                {modo === 'cargar_deuda' && '⚠️ Aumento de Deuda'}
                {modo === 'sumar_credito' && '✓ Crédito a Favor'}
                {modo === 'fijar_deuda' && 'Ajuste de Deuda Total'}
              </span>
              <span className="text-xs font-medium">
                {modo === 'cargar_deuda' && `Se sumarán $${montoNumerico.toLocaleString('es-AR')} a la deuda`}
                {modo === 'sumar_credito' && `Se acreditarán $${montoNumerico.toLocaleString('es-AR')} a favor`}
                {modo === 'fijar_deuda' && `La deuda total quedará fijada en $${deudaResultante.toLocaleString('es-AR')}`}
              </span>
            </div>

            <div className="text-right border-l pl-3 border-slate-200">
              <span className="text-[10px] uppercase tracking-wider font-bold block opacity-75">
                Deuda Total Resultante
              </span>
              <span className="text-base font-black font-mono text-red-600">
                ${deudaResultante.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Concepto / Motivo */}
          <div>
            <label htmlFor="concepto-ajuste" className="block text-xs font-bold text-slate-700 mb-1">
              Motivo / Concepto del Registro:
            </label>
            <input
              id="concepto-ajuste"
              type="text"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: Saldo deudor anterior, Anticipo en efectivo..."
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
              Fecha del Registro:
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
              className={`px-5 py-2 text-white font-bold text-xs rounded-md transition-colors shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5 ${
                modo === 'cargar_deuda'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-900 hover:bg-blue-800'
              }`}
            >
              {guardando ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{modo === 'cargar_deuda' ? 'Confirmar y Sumar a Deuda' : 'Guardar Registro'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
