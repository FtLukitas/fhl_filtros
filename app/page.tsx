'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const extraerMedida = (texto: string, etiqueta: string) => {
  if (!texto) return '-';
  const regex = new RegExp(`${etiqueta}:\\s*(\\d+(?:[.,]\\d+)?)`, 'i');
  const coincidencia = texto.match(regex);
  return coincidencia ? coincidencia[1] : '-';
};

export default function FHLPage() {
  
  // ==========================================
  // 1. ESTADOS
  // ==========================================

  // --- Buscador por Texto ---
  const [busqueda, setBusqueda] = useState('');
  const [filtrosTexto, setFiltrosTexto] = useState<any[]>([]);
  const [cargandoTexto, setCargandoTexto] = useState(false);

  // --- Buscador por Vehículo ---
  const [opciones, setOpciones] = useState({ marcas: [] as string[], modelos: [] as string[] });
  const [seleccion, setSeleccion] = useState({ marca: '', modelo: '' });
  const [listaResultados, setListaResultados] = useState<any[]>([]);
  const [cargandoVehiculo, setCargandoVehiculo] = useState(false);

  // --- Estado del Modal ---
  const [filtroDetalle, setFiltroDetalle] = useState<any>(null);

  // ==========================================
  // 2. LÓGICA
  // ==========================================

  // --- Buscador por Texto ---
  useEffect(() => {
    const fetchPorTexto = async () => {
      if (busqueda.length < 2) { setFiltrosTexto([]); return; }
      setCargandoTexto(true);
      const { data } = await supabase
        .from('Tabla A')
        .select('*')
        .or(`codigo_fhl.ilike.%${busqueda}%,equivalencias.ilike.%${busqueda}%`);
      setFiltrosTexto(data || []);
      setCargandoTexto(false);
    };
    fetchPorTexto();
  }, [busqueda]);

  // --- Cargar Marcas desde la Vista ---
  useEffect(() => {
    const getMarcas = async () => {
      // Consultamos la vista que ya tiene los nombres únicos
      const { data } = await supabase.from('marcas_unicas').select('marca').order('marca');
      if (data) {
        setOpciones(prev => ({ ...prev, marcas: data.map(i => i.marca) }));
      }
    };
    getMarcas();
  }, []);

  // --- Cargar Modelos desde la Vista ---
  useEffect(() => {
    if (!seleccion.marca) return;
    const getModelos = async () => {
      const { data } = await supabase
        .from('modelos_unicos')
        .select('modelo')
        .eq('marca', seleccion.marca)
        .order('modelo');
      
      if (data) {
        setOpciones(prev => ({ ...prev, modelos: data.map(i => i.modelo) }));
      }
      setSeleccion(prev => ({ ...prev, modelo: '' }));
      setListaResultados([]);
    };
    getModelos();
  }, [seleccion.marca]);

  // --- BUSCAR Vehículo ---
  const manejarBusquedaVehiculo = async () => {
    if (!seleccion.modelo) return;
    setCargandoVehiculo(true);
    
    const { data, error } = await supabase
      .from('Tabla B')
      .select('version, año, filtro_asociado')
      .eq('marca', seleccion.marca)
      .eq('modelo', seleccion.modelo)
      .order('version');
    
    if (error) {
      console.error("Error:", error);
    } else {
      setListaResultados(data || []);
    }
    setCargandoVehiculo(false);
  };
  
  // ==========================================
  // 3. INTERFAZ
  // ==========================================
  
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-10 text-slate-800 relative">
      <div className="max-w-6xl mx-auto">
        
        {/* ENCABEZADO */}
        <header className="mb-10 text-center">
          
          <p className="text-slate-500 uppercase tracking-widest text-sm">Catálogo Industrial de Filtros de Habitáculo</p>
        </header>

        {/* SECCIÓN 1: BUSCADOR POR VEHÍCULO */}
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

          {/* LISTA DE RESULTADOS (Ajustada con Marca y Modelo como título) */}
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
                      onClick={async () => {
                        const { data } = await supabase.from('Tabla A').select('*').eq('codigo_fhl', v.filtro_asociado).single();
                        if (data) setFiltroDetalle(data);
                      }}
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

        {/* SECCIÓN 2: BUSCADOR POR CÓDIGO */}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {filtrosTexto.map((f) => (
              <div 
                key={f.id} 
                onClick={() => setFiltroDetalle(f)}
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
        </section>
      </div>

      {/* MODAL (DETALLE DEL FILTRO) */}
      {filtroDetalle && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[900] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 relative">
            
            <div className="bg-blue-900 p-6 flex justify-between items-center text-white">
              <div>
                <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Ficha Técnica FHL</span>
                <h3 className="text-3xl font-black">{filtroDetalle.codigo_fhl}</h3>
              </div>
              <button onClick={() => setFiltroDetalle(null)} className="text-white hover:text-red-400 font-black text-3xl w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">&times;</button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="mb-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Equivalencias OEM / Cruzadas</p>
                <p className="text-slate-700 font-medium">{filtroDetalle.equivalencias || 'Sin equivalencias registradas.'}</p>
              </div>

              <div className="mb-6">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Dimensiones Nominales (mm)</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Largo (A)</span>
                    <span className="text-2xl font-mono font-black text-blue-900">{extraerMedida(filtroDetalle.dimensiones, 'Largo')}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Ancho (B)</span>
                    <span className="text-2xl font-mono font-black text-blue-900">{extraerMedida(filtroDetalle.dimensiones, 'Ancho')}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Alto (H)</span>
                    <span className="text-2xl font-mono font-black text-blue-900">{extraerMedida(filtroDetalle.dimensiones, 'Alto')}</span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Aplicación Detallada</p>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">
                  {filtroDetalle.descripcion_aplicacion || 'No hay información de aplicación cargada para este filtro.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botón WhatsApp */}
      <a href="https://wa.me/5491131679782?text=Hola%20FHL%20Filtros!" target="_blank" rel="noopener noreferrer" className="fixed bottom-8 right-8 bg-[#25d366] text-white p-4 rounded-full shadow-lg hover:scale-110 transition-transform z-50">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>
    </main>
  );
}