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
    };
    getModelos();
  }, [seleccion.marca]);

  // Buscar Vehículo
  const manejarBusquedaVehiculo = async () => {
    if (!seleccion.modelo) return;
    setCargandoVehiculo(true);
    setError(null);
    
    const { data, error: err } = await supabase
      .from('Tabla B')
      .select('version, año, filtro_asociado')
      .eq('marca', seleccion.marca)
      .eq('modelo', seleccion.modelo)
      .order('version');
    
    if (err) {
      setError('Error al buscar vehículos. Intentá de nuevo.');
      console.error("Error:", err);
    } else {
      setListaResultados((data as unknown as ResultadoVehiculo[]) || []);
    }
    setCargandoVehiculo(false);
  };

  return (
    <section className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200 mb-10">
      <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
        <span className="w-2 h-6 bg-blue-900 rounded-full"></span>
        BÚSQUEDA POR VEHÍCULO
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <select 
          className="p-3 bg-slate-100 border-none rounded-lg font-medium focus:ring-2 focus:ring-blue-900 outline-none"
          value={seleccion.marca}
          onChange={(e) => {
            setSeleccion({ marca: e.target.value, modelo: '' });
            setListaResultados([]);
          }}
        >
          <option value="" disabled hidden>MARCA</option>
          {opciones.marcas.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select 
          className="p-3 bg-slate-100 border-none rounded-lg font-medium disabled:opacity-50 outline-none"
          disabled={!seleccion.marca}
          value={seleccion.modelo}
          onChange={(e) => {
            setSeleccion({ ...seleccion, modelo: e.target.value });
            setListaResultados([]);
          }}
        >
          <option value="" disabled hidden>MODELO</option>
          {opciones.modelos?.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <button 
          onClick={manejarBusquedaVehiculo}
          disabled={!seleccion.modelo || cargandoVehiculo}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          {cargandoVehiculo ? "BUSCANDO..." : "BUSCAR"}
        </button>
      </div>

      {/* MENSAJE DE ERROR */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* LISTA DE RESULTADOS */}
      {listaResultados.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4">
          {listaResultados.map((v, index) => (
            <div 
              key={index}
              className="bg-white p-5 rounded-xl border border-slate-200 hover:shadow-lg hover:border-blue-400 transition-all flex justify-between items-center group"
            >
              <div className="flex flex-col gap-1">
                <h4 className="font-bold text-blue-900 text-lg uppercase leading-tight group-hover:text-red-600 transition-colors">
                  {seleccion.marca} {seleccion.modelo}
                </h4>
                <span className="text-slate-700 font-medium">
                  {v.version || 'Versión Estándar'}
                </span>
                {v.año && (
                  <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded w-fit">
                    AÑO: {v.año}
                  </span>
                )}
              </div>
              
              <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
                <span className="bg-blue-50 text-blue-800 font-black px-3 py-1 rounded border border-blue-100 text-sm">
                  {v.filtro_asociado}
                </span>
                <button 
                  onClick={() => onVerDetalle(v.filtro_asociado)}
                  className="text-[10px] bg-slate-800 text-white px-3 py-1.5 rounded font-bold uppercase transition-colors hover:bg-blue-600"
                >
                  Ver Detalle
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
