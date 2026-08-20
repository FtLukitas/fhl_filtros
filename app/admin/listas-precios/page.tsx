'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type {
  ListaPrecio,
  Filtro,
  TipoAjusteLista,
} from '@/lib/types';
import ImportadorExcelListaPrecio from './components/ImportadorExcelListaPrecio';
import ModalVerPreciosLista from './components/ModalVerPreciosLista';

export default function ListasPreciosPage() {
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [conteosItems, setConteosItems] = useState<Record<string, number>>({});
  const [conteosClientes, setConteosClientes] = useState<Record<string, number>>({});
  const [filtrosMuestra, setFiltrosMuestra] = useState<Filtro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Tab activo: 'activas' | 'papelera'
  const [tabActivo, setTabActivo] = useState<'activas' | 'papelera'>('activas');

  // Modal Crear / Editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [listaEditando, setListaEditando] = useState<ListaPrecio | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formTipoAjuste, setFormTipoAjuste] = useState<TipoAjusteLista>('excel');
  const [formPorcentaje, setFormPorcentaje] = useState<number>(0);
  const [formEsPredeterminada, setFormEsPredeterminada] = useState(false);
  const [formActiva, setFormActiva] = useState(true);

  // Modales de Excel y Ver Precios
  const [modalExcel, setModalExcel] = useState<{ abierto: boolean; lista: ListaPrecio | null }>({
    abierto: false,
    lista: null,
  });
  const [modalVerPrecios, setModalVerPrecios] = useState<{ abierto: boolean; lista: ListaPrecio | null }>({
    abierto: false,
    lista: null,
  });

  // Modal Confirmación Eliminación Permanente
  const [modalEliminarPermanente, setModalEliminarPermanente] = useState<{
    abierto: boolean;
    lista: ListaPrecio | null;
    eliminando: boolean;
  }>({
    abierto: false,
    lista: null,
    eliminando: false,
  });

  // Simulador de precios
  const [filtroSimulado, setFiltroSimulado] = useState<Filtro | null>(null);
  const [precioBaseSimulado, setPrecioBaseSimulado] = useState<number>(5000);

  const notificar = (tipo: 'ok' | 'error', texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje(null), 3500);
  };

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [resListas, resFiltros, resItems, resClientes] = await Promise.all([
        supabase.from('listas_precios').select('*').order('created_at', { ascending: true }),
        supabase.from('Tabla A').select('*').eq('eliminado', false).limit(50),
        supabase.from('items_lista_precio').select('lista_id, codigo_fhl'),
        supabase.from('clientes').select('lista_precio_id').eq('eliminado', false),
      ]);

      const dataListas = (resListas.data as ListaPrecio[]) || [];
      const dataFiltros = (resFiltros.data as Filtro[]) || [];

      // Conteo de items por lista
      const conteos: Record<string, number> = {};
      if (resItems.data) {
        resItems.data.forEach((it: any) => {
          conteos[it.lista_id] = (conteos[it.lista_id] || 0) + 1;
        });
      }
      setConteosItems(conteos);

      // Conteo de clientes por lista
      const clientesMap: Record<string, number> = {};
      if (resClientes.data) {
        resClientes.data.forEach((c: any) => {
          if (c.lista_precio_id) {
            clientesMap[c.lista_precio_id] = (clientesMap[c.lista_precio_id] || 0) + 1;
          }
        });
      }
      setConteosClientes(clientesMap);

      setListas(dataListas);
      setFiltrosMuestra(dataFiltros);

      if (dataFiltros.length > 0 && !filtroSimulado) {
        const conPrecio = dataFiltros.find((f) => f.precio && f.precio > 0) || dataFiltros[0];
        setFiltroSimulado(conPrecio);
        if (conPrecio.precio) setPrecioBaseSimulado(Number(conPrecio.precio));
      }
    } catch (err: any) {
      console.error(err);
      notificar('error', 'Error al cargar listas de precios');
    } finally {
      setCargando(false);
    }
  }, [filtroSimulado]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Listas divididas por estado
  const listasActivas = useMemo(() => listas.filter((l) => !l.eliminado), [listas]);
  const listasPapelera = useMemo(() => listas.filter((l) => l.eliminado), [listas]);

  const abrirCrear = () => {
    setListaEditando(null);
    setFormNombre('');
    setFormDescripcion('');
    setFormTipoAjuste('excel');
    setFormPorcentaje(0);
    setFormEsPredeterminada(false);
    setFormActiva(true);
    setModalAbierto(true);
  };

  const abrirEditar = (l: ListaPrecio) => {
    setListaEditando(l);
    setFormNombre(l.nombre);
    setFormDescripcion(l.descripcion || '');
    setFormTipoAjuste(l.tipo_ajuste === 'porcentaje' ? 'porcentaje' : 'excel');
    setFormPorcentaje(Number(l.porcentaje || 0));
    setFormEsPredeterminada(l.es_predeterminada);
    setFormActiva(l.activa);
    setModalAbierto(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombre.trim()) {
      notificar('error', 'El nombre de la lista es obligatorio');
      return;
    }

    setGuardando(true);
    try {
      if (formEsPredeterminada) {
        await supabase
          .from('listas_precios')
          .update({ es_predeterminada: false })
          .neq('id', listaEditando?.id || '00000000-0000-0000-0000-000000000000');
      }

      const payload = {
        nombre: formNombre.trim(),
        descripcion: formDescripcion.trim() || null,
        tipo_ajuste: formTipoAjuste,
        porcentaje: formTipoAjuste === 'porcentaje' ? Number(formPorcentaje) : 0,
        es_predeterminada: formEsPredeterminada,
        activa: formActiva,
      };

      if (listaEditando) {
        const { error } = await supabase
          .from('listas_precios')
          .update(payload)
          .eq('id', listaEditando.id);
        if (error) throw error;
        notificar('ok', 'Lista de precios actualizada correctamente');
      } else {
        const { error } = await supabase
          .from('listas_precios')
          .insert(payload);
        if (error) throw error;
        notificar('ok', 'Nueva lista de precios creada');
      }

      setModalAbierto(false);
      await cargarDatos();
    } catch (err: any) {
      console.error(err);
      notificar('error', err.message || 'Error al guardar la lista');
    } finally {
      setGuardando(false);
    }
  };

  const handleMoverAPapelera = async (id: string, nombre: string) => {
    if (!confirm(`¿Mandar la lista "${nombre}" a la papelera? Los precios cargados se conservarán.`)) return;

    try {
      const { error } = await supabase
        .from('listas_precios')
        .update({
          eliminado: true,
          eliminado_at: new Date().toISOString(),
          es_predeterminada: false,
        })
        .eq('id', id);

      if (error) throw error;
      notificar('ok', `Lista "${nombre}" enviada a la papelera`);
      await cargarDatos();
    } catch (err: any) {
      console.error(err);
      notificar('error', 'Error al mover a papelera');
    }
  };

  const handleRestaurar = async (id: string, nombre: string) => {
    try {
      const { error } = await supabase
        .from('listas_precios')
        .update({
          eliminado: false,
          eliminado_at: null,
        })
        .eq('id', id);

      if (error) throw error;
      notificar('ok', `Lista "${nombre}" restaurada con éxito`);
      await cargarDatos();
    } catch (err: any) {
      console.error(err);
      notificar('error', 'Error al restaurar lista');
    }
  };

  const handleEliminarPermanente = async () => {
    const lista = modalEliminarPermanente.lista;
    if (!lista) return;

    setModalEliminarPermanente((prev) => ({ ...prev, eliminando: true }));
    try {
      // 1. Borrar items_lista_precio
      await supabase.from('items_lista_precio').delete().eq('lista_id', lista.id);

      // 2. Desvincular clientes que apunten a esta lista
      await supabase
        .from('clientes')
        .update({ lista_precio_id: null })
        .eq('lista_precio_id', lista.id);

      // 3. Borrar la lista definitivamente
      const { error } = await supabase.from('listas_precios').delete().eq('id', lista.id);
      if (error) throw error;

      notificar('ok', `Lista "${lista.nombre}" eliminada permanentemente`);
      setModalEliminarPermanente({ abierto: false, lista: null, eliminando: false });
      await cargarDatos();
    } catch (err: any) {
      console.error(err);
      notificar('error', 'Error al eliminar definitivamente la lista');
      setModalEliminarPermanente((prev) => ({ ...prev, eliminando: false }));
    }
  };

  const handleSetPredeterminada = async (id: string) => {
    try {
      await supabase.from('listas_precios').update({ es_predeterminada: false }).neq('id', id);
      const { error } = await supabase
        .from('listas_precios')
        .update({ es_predeterminada: true, activa: true })
        .eq('id', id);

      if (error) throw error;
      notificar('ok', 'Lista predeterminada actualizada');
      await cargarDatos();
    } catch (err: any) {
      console.error(err);
      notificar('error', 'Error al establecer lista predeterminada');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notificación */}
      {mensaje && (
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-lg font-bold text-xs flex items-center justify-between shadow-md transition-all ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-900 text-emerald-100 border border-emerald-700'
              : 'bg-red-900 text-red-100 border border-red-700'
          }`}
        >
          <span>{mensaje.texto}</span>
          <button
            type="button"
            onClick={() => setMensaje(null)}
            className="text-white hover:opacity-75 font-black text-sm ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Barra Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl shadow-xs border border-slate-200">
        <div>
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            Comercial & Facturación
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
            Listas de Precios y Tarifas
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Administrá múltiples listas de precios: importá planillas Excel (2 columnas), editá precios por filtro y aplicá aumentos por porcentaje.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={abrirCrear}
            className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Nueva Lista de Precios</span>
          </button>
        </div>
      </div>

      {/* Tabs: Activas vs Papelera */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTabActivo('activas')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
              tabActivo === 'activas'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Listas Activas</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-800 text-white">
              {listasActivas.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTabActivo('papelera')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
              tabActivo === 'papelera'
                ? 'bg-red-800 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Papelera</span>
            {listasPapelera.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-700 text-white">
                {listasPapelera.length}
              </span>
            )}
          </button>
        </div>

        <span className="text-xs text-slate-400 font-medium hidden sm:inline">
          {listasActivas.length} tarifa(s) disponibles para facturación
        </span>
      </div>

      {/* Grid de Listas Activas */}
      {tabActivo === 'activas' && (
        <>
          {cargando ? (
            <div className="p-12 text-center text-xs font-bold text-slate-400">
              Cargando listas de precios...
            </div>
          ) : listasActivas.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-4 shadow-xs">
              <div className="w-12 h-12 bg-amber-50 text-amber-800 rounded-full flex items-center justify-center mx-auto border border-amber-200">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-800">No hay listas de precios activas</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Creá tu primera lista de precios comercial (ej: "Mayorista", "Distribuidor", "Mostrador") para empezar a facturar.
              </p>
              <button
                type="button"
                onClick={abrirCrear}
                className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                + Crear Primera Lista
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {listasActivas.map((l) => {
                const totalItems = conteosItems[l.id] || 0;
                const esPorcentaje = l.tipo_ajuste === 'porcentaje';

                return (
                  <div
                    key={l.id}
                    className={`bg-white rounded-xl shadow-xs border p-5 flex flex-col justify-between transition-all ${
                      l.es_predeterminada
                        ? 'border-blue-500/80 ring-2 ring-blue-500/10'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      {/* Cabecera Tarjeta */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {l.es_predeterminada && (
                              <span className="text-[10px] font-black uppercase tracking-wider bg-blue-900 text-white px-2 py-0.5 rounded">
                                Predeterminada
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                esPorcentaje
                                  ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {esPorcentaje ? 'Margen Porcentual' : 'Precios Fijos / Excel'}
                            </span>
                          </div>
                          <h3 className="text-base font-black text-slate-900 tracking-tight">{l.nombre}</h3>
                        </div>

                        {/* Botón de opciones */}
                        <button
                          type="button"
                          onClick={() => abrirEditar(l)}
                          className="p-1.5 text-slate-400 hover:text-blue-900 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
                          title="Editar configuración"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </div>

                      {/* Descripción */}
                      <p className="text-xs text-slate-500 mb-4 line-clamp-2 min-h-[32px]">
                        {l.descripcion || 'Sin descripción adicional.'}
                      </p>

                      {/* Info Técnica / Valores */}
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5 mb-4 text-xs">
                        {esPorcentaje ? (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 font-medium">Ajuste sobre Catálogo:</span>
                            <span className="font-black font-mono text-purple-900">
                              {Number(l.porcentaje) >= 0 ? `+${l.porcentaje}%` : `${l.porcentaje}%`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 font-medium">Filtros con precio propio:</span>
                            <span className="font-black font-mono text-emerald-900">
                              {totalItems} producto(s)
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                          <span className="text-slate-500 font-medium">Clientes vinculados:</span>
                          <span className="font-bold text-slate-700">
                            {conteosClientes[l.id] || 0} cliente(s)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Acciones Rápidas */}
                    <div className="space-y-2 pt-3 border-t border-slate-100">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setModalVerPrecios({ abierto: true, lista: l })}
                          className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs rounded-lg transition-colors border border-blue-200 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>Ver / Editar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setModalExcel({ abierto: true, lista: l })}
                          className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg transition-colors border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          <span>Importar Excel</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        {!l.es_predeterminada ? (
                          <button
                            type="button"
                            onClick={() => handleSetPredeterminada(l.id)}
                            className="text-[11px] font-bold text-slate-500 hover:text-blue-900 transition-colors cursor-pointer"
                          >
                            ⭐ Hacer Predeterminada
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-blue-900">
                            ✓ Lista Activa Principal
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleMoverAPapelera(l.id, l.nombre)}
                          className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          Mover a Papelera
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab: Papelera de Listas */}
      {tabActivo === 'papelera' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-600">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Listas de Precios Eliminadas ({listasPapelera.length})
            </h3>
            <span className="text-xs text-slate-400">
              Podés restaurarlas en cualquier momento o eliminarlas de forma definitiva.
            </span>
          </div>

          {listasPapelera.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 italic">
              La papelera de listas de precios está vacía.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {listasPapelera.map((l) => (
                <div key={l.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div>
                    <span className="font-bold text-sm text-slate-900 block">{l.nombre}</span>
                    <span className="text-xs text-slate-400">
                      Eliminada el {l.eliminado_at ? new Date(l.eliminado_at).toLocaleDateString('es-AR') : 'recientemente'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRestaurar(l.id, l.nombre)}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-md border border-emerald-200 transition-colors cursor-pointer"
                    >
                      Restaurar Lista
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalEliminarPermanente({ abierto: true, lista: l, eliminando: false })}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-md border border-red-200 transition-colors cursor-pointer"
                    >
                      Eliminar Definitivo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Crear / Editar Lista */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 animate-in zoom-in-95 duration-150 border border-slate-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-base font-black text-slate-900">
                {listaEditando ? 'Editar Lista de Precios' : 'Nueva Lista de Precios'}
              </h2>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardar} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nombre de la Lista *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mayorista General, Distribuidor Interior, Mostrador..."
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Descripción (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notas internas sobre quién usa esta lista o condiciones comerciales..."
                  value={formDescripcion}
                  onChange={(e) => setFormDescripcion(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tipo de Lista de Precios
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormTipoAjuste('excel')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      formTipoAjuste === 'excel'
                        ? 'border-blue-900 bg-blue-50/50 ring-2 ring-blue-900/10'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-bold text-xs text-slate-900 block">Precios Fijos / Excel</span>
                    <span className="text-[11px] text-slate-500">
                      Precios específicos por cada filtro (importados o editados a mano).
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTipoAjuste('porcentaje')}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      formTipoAjuste === 'porcentaje'
                        ? 'border-blue-900 bg-blue-50/50 ring-2 ring-blue-900/10'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-bold text-xs text-slate-900 block">Margen Porcentual</span>
                    <span className="text-[11px] text-slate-500">
                      Calcula un % fijo (+/-) sobre el precio de lista del catálogo base.
                    </span>
                  </button>
                </div>
              </div>

              {formTipoAjuste === 'porcentaje' && (
                <div className="bg-purple-50/60 p-3.5 rounded-lg border border-purple-200 space-y-2">
                  <label className="block text-xs font-bold text-purple-900 uppercase">
                    Porcentaje de Ajuste sobre Catálogo (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="0"
                      value={formPorcentaje}
                      onChange={(e) => setFormPorcentaje(parseFloat(e.target.value) || 0)}
                      className="w-32 border border-purple-300 rounded px-3 py-1.5 text-xs font-bold font-mono text-slate-900 bg-white"
                    />
                    <span className="text-xs text-purple-800">
                      (Ej: <code>20</code> para +20% o <code>-15</code> para 15% de descuento)
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formEsPredeterminada}
                    onChange={(e) => setFormEsPredeterminada(e.target.checked)}
                    className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                  />
                  <span className="text-xs font-bold text-slate-700">Lista Predeterminada del Sistema</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formActiva}
                    onChange={(e) => setFormActiva(e.target.checked)}
                    className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                  />
                  <span className="text-xs font-bold text-slate-700">Lista Activa</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {guardando ? 'Guardando...' : listaEditando ? 'Actualizar Lista' : 'Crear Lista'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Importar Excel (2 columnas) */}
      {modalExcel.abierto && modalExcel.lista && (
        <ImportadorExcelListaPrecio
          lista={modalExcel.lista}
          abierto={modalExcel.abierto}
          onCerrar={() => setModalExcel({ abierto: false, lista: null })}
          onFinalizado={() => {
            setModalExcel({ abierto: false, lista: null });
            cargarDatos();
            notificar('ok', `Precios importados con éxito a "${modalExcel.lista?.nombre}"`);
          }}
        />
      )}

      {/* Modal: Ver y Editar Precios por Producto */}
      {modalVerPrecios.abierto && modalVerPrecios.lista && (
        <ModalVerPreciosLista
          lista={modalVerPrecios.lista}
          abierto={modalVerPrecios.abierto}
          onCerrar={() => setModalVerPrecios({ abierto: false, lista: null })}
          onActualizado={() => {
            cargarDatos();
          }}
        />
      )}

      {/* Modal Confirmación Eliminación Permanente */}
      {modalEliminarPermanente.abierto && modalEliminarPermanente.lista && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-black text-slate-900">
                ¿Eliminar permanentemente "{modalEliminarPermanente.lista.nombre}"?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Esta acción borrará de forma definitiva todos los precios específicos asociados a esta lista y la desvinculará de cualquier cliente. Esta acción <span className="font-bold text-red-600">no se puede deshacer</span>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={modalEliminarPermanente.eliminando}
                onClick={() => setModalEliminarPermanente({ abierto: false, lista: null, eliminando: false })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={modalEliminarPermanente.eliminando}
                onClick={handleEliminarPermanente}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-lg transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {modalEliminarPermanente.eliminando ? 'Eliminando...' : 'Sí, Eliminar Definitivo'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
