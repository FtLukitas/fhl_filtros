'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import type { Filtro } from '../lib/types';
import BuscadorVehiculo from './components/BuscadorVehiculo';
import BuscadorCodigo from './components/BuscadorCodigo';
import ModalDetalle from './components/ModalDetalle';

// Componente interno que orquesta el catálogo
function CatalogoFHL() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // --- Estado del Modal (controlado por URL) ---
  const [filtroDetalle, setFiltroDetalle] = useState<Filtro | null>(null);

  // Abrir modal: pushState actualiza la URL sincrónicamente + notifica al router
  const abrirFiltro = useCallback((codigo: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('filtro', codigo);
    const nuevaUrl = `${pathname}?${params.toString()}`;
    window.history.pushState(null, '', nuevaUrl);
    // Notificar a Next.js del cambio para que useSearchParams se actualice
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [pathname, searchParams]);

  // Cerrar modal: replaceState limpia la URL sincrónicamente
  const cerrarModal = useCallback(() => {
    setFiltroDetalle(null);
    window.history.replaceState(null, '', pathname);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [pathname]);

  // Cargar filtro desde URL (única fuente de verdad: searchParams)
  useEffect(() => {
    const codigo = searchParams.get('filtro');
    if (!codigo) {
      setFiltroDetalle(null);
      return;
    }

    const abortController = new AbortController();

    const cargar = async () => {
      try {
        const { data } = await supabase
          .from('Tabla A')
          .select('*')
          .eq('codigo_fhl', codigo)
          .single();

        if (!abortController.signal.aborted && data) {
          setFiltroDetalle(data as Filtro);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(err);
        }
      }
    };

    cargar();

    return () => {
      abortController.abort();
    };
  }, [searchParams]);

  // Limpiar ?filtro del historial al salir de la página (unmount).
  // Si el usuario navega a otra sección con el modal abierto, esto evita
  // que el Router Cache de Next.js guarde '/?filtro=XXX' como versión cacheada de '/'.
  useEffect(() => {
    return () => {
      if (window.location.search.includes('filtro=')) {
        window.history.replaceState(null, '', '/');
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-10 text-slate-800 relative">
      <div className="max-w-6xl mx-auto">
        
        {/* ENCABEZADO */}
        <header className="mb-10 text-center">
          <p className="text-slate-500 uppercase tracking-widest text-sm">Catálogo Industrial de Filtros de Habitáculo</p>
        </header>

        {/* BUSCADOR POR VEHÍCULO */}
        <BuscadorVehiculo onVerDetalle={abrirFiltro} />

        {/* BUSCADOR POR CÓDIGO */}
        <BuscadorCodigo onVerDetalle={abrirFiltro} />
      </div>

      {/* MODAL DE DETALLE */}
      <ModalDetalle filtro={filtroDetalle} onCerrar={cerrarModal} />
    </main>
  );
}

// Exportación con Suspense para manejar searchParams correctamente en Next.js
export default function FHLPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center font-medium text-slate-400">Cargando catálogo...</div>}>
      <CatalogoFHL />
    </Suspense>
  );
}