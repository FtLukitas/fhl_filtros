'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { ResultadoVehiculo } from '../../lib/types';

interface BuscadorVehiculoProps {
  onVerDetalle: (codigo: string) => void;
}

export default function BuscadorVehiculo({ onVerDetalle }: BuscadorVehiculoProps) {
  const [opciones, setOpciones] = useState({ marcas: [] as string[], modelos: [] as string[] });
  const [seleccion, setSeleccion] = useState({ marca: '', modelo: '' });
  const [listaResultados, setListaResultados] = useState<ResultadoVehiculo[]>([]);
  const [cargandoVehiculo, setCargandoVehiculo] = useState(false);
  const [busquedaRealizada, setBusquedaRealizada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar Marcas desde la Vista
  useEffect(() => {
    const getMarcas = async () => {
      const { data, error: err } = await supabase.from('marcas_unicas').select('marca').order('marca');
      if (err) {
        setError('No se pudieron cargar las marcas. Intentá recargar la página.');
        return;
      }
      if (data) {
        setOpciones(prev => ({ ...prev, marcas: data.map(i => i.marca) }));
      }
    };
    getMarcas();
  }, []);

  // Cargar Modelos desde la Vista
  useEffect(() => {
    if (!seleccion.marca) return;
    const getModelos = async () => {
      setError(null);
      const { data, error: err } = await supabase
        .from('modelos_unicos')
        .select('modelo')
        .eq('marca', seleccion.marca)
        .order('modelo');
      
      if (err) {
        setError('No se pudieron cargar los modelos. Intentá de nuevo.');
        return;
      }
      if (data) {
        setOpciones(prev => ({ ...prev, modelos: data.map(i => i.modelo) }));
      }
      setSeleccion(prev => ({ ...prev, modelo: '' }));
      setListaResultados([]);
      setBusquedaRealizada(false);
    };
    getModelos();
  }, [seleccion.marca]);

  // Buscar Vehículo
  const manejarBusquedaVehiculo = async () => {
    if (!seleccion.modelo) return;
    setCargandoVehiculo(true);
    setError(null);
    setBusquedaRealizada(true);
    
    try {
      // 1. Obtener vehículos de Tabla B no eliminados
      const { data: dbData, error: err } = await supabase
        .from('Tabla B')
        .select('*')
        .eq('marca', seleccion.marca)
        .eq('modelo', seleccion.modelo)
        .or('eliminado.is.null,eliminado.eq.false')
        .order('version');
      
      if (err) throw err;

      const vehiculos = (dbData as unknown as ResultadoVehiculo[]) || [];
      if (vehiculos.length === 0) {
        setListaResultados([]);
        return;
      }

      // 2. Obtener códigos únicos asociados y verificar que estén activos y no eliminados en Tabla A
      const codigosFiltros = Array.from(new Set(vehiculos.map((v) => v.filtro_asociado).filter(Boolean)));
      
      if (codigosFiltros.length === 0) {
        setListaResultados([]);
        return;
      }

      const { data: filtrosActivos } = await supabase
        .from('Tabla A')
        .select('codigo_fhl')
        .in('codigo_fhl', codigosFiltros)
        .eq('activo', true)
        .or('eliminado.is.null,eliminado.eq.false');

      const codigosValidos = new Set((filtrosActivos || []).map((f) => f.codigo_fhl));

      // 3. Filtrar vehículos cuyo filtro asociado esté activo y visible
      const resultadosFiltrados = vehiculos.filter(
        (v) => v.filtro_asociado && codigosValidos.has(v.filtro_asociado)
      );

      setListaResultados(resultadosFiltrados);
    } catch (err: any) {
      setError('Error al buscar vehículos. Intentá de nuevo.');
      console.error('Error:', err);
    } finally {
      setCargandoVehiculo(false);
    }
  };

  return (
    <section className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 mb-10" aria-labelledby="heading-buscador-vehiculo">
      <h2 id="heading-buscador-vehiculo" className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-900">
        <span className="w-2 h-6 bg-blue-900 rounded-full" aria-hidden="true"></span>
        BÚSQUEDA POR VEHÍCULO
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="select-marca-vehiculo" className="sr-only">
            Seleccionar Marca del Vehículo
          </label>
          <select 
            id="select-marca-vehiculo"
            aria-label="Seleccionar Marca del Vehículo"
            className="w-full p-3 bg-slate-100 border-none rounded-md font-medium text-slate-800 focus:ring-2 focus:ring-blue-900 outline-none"
            value={seleccion.marca}
            onChange={(e) => {
              setSeleccion({ marca: e.target.value, modelo: '' });
              setListaResultados([]);
              setBusquedaRealizada(false);
            }}
          >
            <option value="" disabled hidden>MARCA</option>
            {opciones.marcas.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="select-modelo-vehiculo" className="sr-only">
            Seleccionar Modelo del Vehículo
          </label>
          <select 
            id="select-modelo-vehiculo"
            aria-label="Seleccionar Modelo del Vehículo"
            className="w-full p-3 bg-slate-100 border-none rounded-md font-medium text-slate-800 disabled:opacity-50 outline-none focus:ring-2 focus:ring-blue-900"
            disabled={!seleccion.marca}
            value={seleccion.modelo}
            onChange={(e) => {
              setSeleccion({ ...seleccion, modelo: e.target.value });
              setListaResultados([]);
              setBusquedaRealizada(false);
            }}
          >
            <option value="" disabled hidden>MODELO</option>
            {opciones.modelos?.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <button 
          onClick={manejarBusquedaVehiculo}
          disabled={!seleccion.modelo || cargandoVehiculo}
          aria-busy={cargandoVehiculo}
          className="bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-bold py-3 rounded-md transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {cargandoVehiculo ? (
            <>
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>BUSCANDO...</span>
            </>
          ) : (
            <span>BUSCAR</span>
          )}
        </button>
      </div>

      {/* MENSAJE DE ERROR */}
      {error && (
        <div role="alert" aria-live="assertive" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* EMPTY STATE CUANDO NO HAY RESULTADOS */}
      {busquedaRealizada && !cargandoVehiculo && listaResultados.length === 0 && !error && (
        <div className="mt-6 p-6 bg-slate-50 border border-slate-200 rounded-md text-center">
          <p className="text-sm font-bold text-slate-700">
            No se encontraron filtros asociados para {seleccion.marca} {seleccion.modelo}.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Probá buscando por código o equivalencia en el buscador inferior.
          </p>
        </div>
      )}

      {/* LISTA DE RESULTADOS */}
      {listaResultados.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-150">
          {listaResultados.map((v, index) => (
            <div 
              key={index}
              className="bg-white p-5 rounded-md border border-slate-200 hover:shadow-md hover:border-blue-400 transition-all flex justify-between items-center group"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <h4 className="font-bold text-blue-900 text-base uppercase leading-tight group-hover:text-red-600 transition-colors truncate">
                  {seleccion.marca} {seleccion.modelo}
                </h4>
                <span className="text-slate-700 font-medium text-xs truncate">
                  {v.version || 'Versión Estándar'}
                </span>
                {v.año && (
                  <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded w-fit font-bold">
                    AÑO: {v.año}
                  </span>
                )}
              </div>
              
              <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
                <span className="bg-blue-50 text-blue-900 font-black px-2.5 py-1 rounded border border-blue-100 text-xs font-mono">
                  {v.filtro_asociado}
                </span>
                <button 
                  onClick={() => onVerDetalle(v.filtro_asociado)}
                  aria-label={`Ver detalle del filtro ${v.filtro_asociado} para ${seleccion.marca} ${seleccion.modelo}`}
                  className="text-[11px] bg-blue-900 hover:bg-blue-800 text-white px-3 py-1 rounded font-bold uppercase transition-colors"
                >
                  Ver Ficha
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
