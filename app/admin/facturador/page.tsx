'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { generarPDF, obtenerPDFBlobUrl } from '../../../lib/generarPDF';
import type {
  Cliente,
  PrecioCliente,
  Filtro,
  ListaPrecio,
  ItemListaPrecio,
  Pedido,
} from '../../../lib/types';
import SelectorCliente from './components/SelectorCliente';
import SelectorListaPrecio from './components/SelectorListaPrecio';
import BuscadorFiltroAutocompletar from './components/BuscadorFiltroAutocompletar';
import TablaItems, { type ItemFactura } from './components/TablaItems';

interface BorradorLocal {
  cliente: Cliente | null;
  items: ItemFactura[];
  observaciones: string;
  numeroPresupuesto: string;
  validezDias: number;
  listaSeleccionadaId?: string | null;
  usarPreciosCliente: boolean;
  guardadoAt: string;
}

function FacturadorContenido() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const pedidoIdAEditar = searchParams.get('pedidoId') || searchParams.get('editar');
  const modoEdicion = Boolean(pedidoIdAEditar);

  // --- Estado principal ---
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [preciosCliente, setPreciosCliente] = useState<Map<string, number>>(new Map());
  const [usarPreciosCliente, setUsarPreciosCliente] = useState<boolean>(true);
  
  // --- Listas de Precios ---
  const [listasPrecios, setListasPrecios] = useState<ListaPrecio[]>([]);
  const [listaSeleccionada, setListaSeleccionada] = useState<ListaPrecio | null>(null);
  const [itemsListaEspecíficos, setItemsListaEspecíficos] = useState<Map<string, number>>(new Map());
  const [preciosBaseFiltros, setPreciosBaseFiltros] = useState<Map<string, number>>(new Map());
  const [cargandoListas, setCargandoListas] = useState(true);

  const [items, setItems] = useState<ItemFactura[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [numeroPresupuesto, setNumeroPresupuesto] = useState('');
  const [validezDias, setValidezDias] = useState<number>(30);
  const [generando, setGenerando] = useState(false);
  const [guardandoPedido, setGuardandoPedido] = useState(false);
  const [cargandoEdicion, setCargandoEdicion] = useState(modoEdicion);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // --- Sistema de Autoguardado & Borrador ---
  const storageKey = modoEdicion
    ? `fhl_borrador_edicion_${pedidoIdAEditar}`
    : 'fhl_borrador_nuevo_pedido';

  const [ultimoGuardadoBorrador, setUltimoGuardadoBorrador] = useState<string | null>(null);
  const [borradorPendiente, setBorradorPendiente] = useState<BorradorLocal | null>(null);
  const [inicializado, setInicializado] = useState(false);

  // --- Vista previa ---
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [esMobile, setEsMobile] = useState(false);

  useEffect(() => {
    setEsMobile(/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  // Limpiar URL de blob al desmontar/cambiar para evitar fugas de memoria
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Limpiar previsualización si no hay cliente o ítems
  useEffect(() => {
    if (!cliente || items.length === 0) {
      setMostrarPreview(false);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [cliente, items]);

  // Generar/Actualizar la previsualización del PDF
  const actualizarPrevisualizacion = useCallback(async () => {
    if (!cliente || items.length === 0) return;
    setCargandoPreview(true);
    try {
      const url = await obtenerPDFBlobUrl({
        cliente,
        items,
        observaciones,
        numeroPresupuesto,
        validezDias,
      });
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setMostrarPreview(true);
    } catch (err) {
      console.error('Error al generar vista previa:', err);
    } finally {
      setCargandoPreview(false);
    }
  }, [cliente, items, observaciones, numeroPresupuesto, validezDias]);

  // Actualizar previsualización automáticamente si ya está visible y cambian los datos
  useEffect(() => {
    if (mostrarPreview && cliente && items.length > 0) {
      const timer = setTimeout(() => {
        actualizarPrevisualizacion();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [items, cliente, observaciones, numeroPresupuesto, validezDias, mostrarPreview, actualizarPrevisualizacion]);

  // Cargar listas de precios disponibles
  const cargarListasPrecios = useCallback(async () => {
    setCargandoListas(true);
    try {
      const resListas = await supabase
        .from('listas_precios')
        .select('*')
        .eq('activa', true)
        .eq('eliminado', false)
        .order('es_predeterminada', { ascending: false });

      if (resListas.data && resListas.data.length > 0) {
        const listas = resListas.data as ListaPrecio[];
        setListasPrecios(listas);
        
        // Seleccionar por defecto la predeterminada o la primera
        const defaultList = listas.find((l) => l.es_predeterminada) || listas[0];
        setListaSeleccionada(defaultList);
      }
    } catch (err) {
      console.error('Error al cargar listas de precios:', err);
    } finally {
      setCargandoListas(false);
    }
  }, []);

  useEffect(() => {
    cargarListasPrecios();
  }, [cargarListasPrecios]);

  // Cargar precios específicos de la lista seleccionada si tiene
  useEffect(() => {
    if (!listaSeleccionada) return;

    supabase
      .from('items_lista_precio')
      .select('*')
      .eq('lista_id', listaSeleccionada.id)
      .then(({ data }) => {
        const map = new Map<string, number>();
        if (data) {
          (data as ItemListaPrecio[]).forEach((it) => {
            map.set(it.codigo_fhl.toUpperCase(), Number(it.precio));
          });
        }
        setItemsListaEspecíficos(map);
      });
  }, [listaSeleccionada]);

  // Función pura para calcular el precio unitario según lista activa y cliente
  const calcularPrecioUnitario = useCallback(
    (
      codigo: string,
      precioBaseManual?: number,
      targetLista?: ListaPrecio | null,
      priorizarCliente: boolean = usarPreciosCliente
    ): number => {
      const codNorm = codigo.trim().toUpperCase();

      // 1. Si el cliente tiene precio personalizado acordado, priorizarlo
      if (priorizarCliente && preciosCliente.has(codNorm)) {
        return preciosCliente.get(codNorm)!;
      }

      const lista = targetLista ?? listaSeleccionada;

      // 2. Si la lista tiene precio específico cargado (tabla / Excel)
      if (itemsListaEspecíficos.has(codNorm)) {
        return itemsListaEspecíficos.get(codNorm)!;
      }

      // 3. Obtener precio base del catálogo
      let base = precioBaseManual ?? preciosBaseFiltros.get(codNorm) ?? 0;

      // 4. Si la lista es porcentual, aplicar % sobre la base
      if (lista?.tipo_ajuste === 'porcentaje' && Number(lista.porcentaje) !== 0) {
        const factor = 1 + (Number(lista.porcentaje) / 100);
        base = Math.round(base * factor);
      }

      return Math.max(0, base);
    },
    [
      preciosCliente,
      usarPreciosCliente,
      listaSeleccionada,
      itemsListaEspecíficos,
      preciosBaseFiltros,
    ]
  );

  // Cargar precios del cliente seleccionado
  const cargarPrecios = async (clienteId: string) => {
    const { data } = await supabase
      .from('precios_cliente')
      .select('*')
      .eq('cliente_id', clienteId);

    const mapa = new Map<string, number>();
    if (data) {
      (data as PrecioCliente[]).forEach((p) => {
        mapa.set(p.codigo_fhl.toUpperCase(), p.precio);
      });
    }
    setPreciosCliente(mapa);
  };

  // Cambiar lista de precios y recalcular automáticamente los ítems en la tabla
  const handleCambiarListaPrecio = useCallback(
    async (nuevaLista: ListaPrecio) => {
      setListaSeleccionada(nuevaLista);

      // Cargar items de la nueva lista
      const { data: dbItems } = await supabase
        .from('items_lista_precio')
        .select('*')
        .eq('lista_id', nuevaLista.id);

      const nuevoMap = new Map<string, number>();
      if (dbItems) {
        (dbItems as ItemListaPrecio[]).forEach((it) => {
          nuevoMap.set(it.codigo_fhl.toUpperCase(), Number(it.precio));
        });
      }
      setItemsListaEspecíficos(nuevoMap);

      // Recalcular precios de los ítems existentes
      setItems((prevItems) =>
        prevItems.map((it) => {
          const codNorm = it.codigo_fhl.toUpperCase();
          let precio = 0;

          if (usarPreciosCliente && preciosCliente.has(codNorm)) {
            precio = preciosCliente.get(codNorm)!;
          } else if (nuevoMap.has(codNorm)) {
            precio = nuevoMap.get(codNorm)!;
          } else {
            const base = preciosBaseFiltros.get(codNorm) || 0;
            if (base > 0) {
              const factor = 1 + (Number(nuevaLista.porcentaje || 0) / 100);
              precio = Math.round(base * factor);
            }
          }

          return {
            ...it,
            precioUnitario: precio > 0 ? precio : it.precioUnitario,
          };
        })
      );

      const detalleTipo =
        nuevaLista.tipo_ajuste === 'porcentaje' && Number(nuevaLista.porcentaje) !== 0
          ? ` (${Number(nuevaLista.porcentaje) > 0 ? `+${nuevaLista.porcentaje}%` : `${nuevaLista.porcentaje}%`})`
          : '';

      setMensaje({
        tipo: 'ok',
        texto: `Se aplicó la lista ${nuevaLista.nombre}${detalleTipo}. Precios actualizados.`,
      });
      setTimeout(() => setMensaje(null), 3000);
    },
    [usarPreciosCliente, preciosCliente, preciosBaseFiltros]
  );

  // --- Carga inicial: Modo Edición vs Carga Normal / Detección de Borrador ---
  useEffect(() => {
    let activo = true;

    async function inicializar() {
      // Caso 1: Modo Edición de un Pedido existente
      if (pedidoIdAEditar) {
        setCargandoEdicion(true);
        try {
          const { data: pedData, error: errPed } = await supabase
            .from('pedidos')
            .select('*, cliente:clientes(*), items:items_pedido(*)')
            .eq('id', pedidoIdAEditar)
            .single();

          if (errPed || !pedData) {
            console.error('Error al cargar pedido para edición:', errPed);
            setMensaje({ tipo: 'error', texto: 'No se pudo cargar el pedido solicitado.' });
            return;
          }

          if (activo) {
            if (pedData.cliente) {
              setCliente(pedData.cliente as Cliente);
              cargarPrecios(pedData.cliente.id);
            }
            setObservaciones(pedData.observaciones || '');
            setNumeroPresupuesto(`PED-${pedData.id.slice(0, 8).toUpperCase()}`);

            if (pedData.items && pedData.items.length > 0) {
              setItems(
                pedData.items.map((it: any, idx: number) => ({
                  id: `db-${it.id || idx}`,
                  codigo_fhl: it.codigo_fhl,
                  cantidad: Number(it.cantidad || 1),
                  precioUnitario: Number(it.precio_unitario || 0),
                }))
              );
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          if (activo) {
            setCargandoEdicion(false);
            setInicializado(true);
          }
        }
        return;
      }

      // Caso 2: Carga desde query param clienteId
      const cid = searchParams.get('clienteId');
      if (cid && !cliente) {
        supabase
          .from('clientes')
          .select('*')
          .eq('id', cid)
          .single()
          .then(({ data }) => {
            if (data && activo) {
              const cl = data as Cliente;
              setCliente(cl);
              cargarPrecios(cl.id);

              if (cl.lista_precio_id && listasPrecios.length > 0) {
                const asignada = listasPrecios.find((l) => l.id === cl.lista_precio_id);
                if (asignada) handleCambiarListaPrecio(asignada);
              }
            }
          });
      } else {
        // Caso 3: Verificar si hay un borrador previo guardado en localStorage
        try {
          const rawDraft = localStorage.getItem('fhl_borrador_nuevo_pedido');
          if (rawDraft) {
            const parsed = JSON.parse(rawDraft) as BorradorLocal;
            if (parsed && (parsed.items?.length > 0 || parsed.cliente)) {
              setBorradorPendiente(parsed);
            }
          }
        } catch (e) {
          console.warn('Error al leer borrador local:', e);
        }
      }

      if (activo) {
        setInicializado(true);
      }
    }

    inicializar();

    return () => {
      activo = false;
    };
  }, [pedidoIdAEditar, searchParams]);

  // --- Autoguardado Reactivo en LocalStorage ---
  useEffect(() => {
    if (!inicializado) return;

    // Si está todo vacío, no guardamos borrador innecesario
    if (!cliente && items.length === 0 && !observaciones.trim()) {
      return;
    }

    const timer = setTimeout(() => {
      try {
        const borrador: BorradorLocal = {
          cliente,
          items,
          observaciones,
          numeroPresupuesto,
          validezDias,
          listaSeleccionadaId: listaSeleccionada?.id,
          usarPreciosCliente,
          guardadoAt: new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        };

        localStorage.setItem(storageKey, JSON.stringify(borrador));
        setUltimoGuardadoBorrador(borrador.guardadoAt);
      } catch (err) {
        console.warn('Error al autoguardar borrador:', err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [
    inicializado,
    storageKey,
    cliente,
    items,
    observaciones,
    numeroPresupuesto,
    validezDias,
    listaSeleccionada,
    usarPreciosCliente,
  ]);

  // Restaurar borrador guardado
  const handleRestaurarBorrador = () => {
    if (!borradorPendiente) return;
    if (borradorPendiente.cliente) {
      setCliente(borradorPendiente.cliente);
      cargarPrecios(borradorPendiente.cliente.id);
    }
    if (borradorPendiente.items) {
      setItems(borradorPendiente.items);
    }
    if (borradorPendiente.observaciones) {
      setObservaciones(borradorPendiente.observaciones);
    }
    if (borradorPendiente.numeroPresupuesto) {
      setNumeroPresupuesto(borradorPendiente.numeroPresupuesto);
    }
    if (borradorPendiente.validezDias) {
      setValidezDias(borradorPendiente.validezDias);
    }
    setBorradorPendiente(null);
    setMensaje({ tipo: 'ok', texto: 'Borrador restaurado correctamente.' });
    setTimeout(() => setMensaje(null), 3000);
  };

  // Descartar borrador
  const handleDescartarBorrador = () => {
    try {
      localStorage.removeItem('fhl_borrador_nuevo_pedido');
    } catch (e) {
      console.warn(e);
    }
    setBorradorPendiente(null);
  };

  // Seleccionar cliente
  const handleSeleccionarCliente = useCallback(
    async (c: Cliente | null) => {
      setCliente(c);
      if (c) {
        await cargarPrecios(c.id);

        if (c.lista_precio_id && listasPrecios.length > 0) {
          const asignada = listasPrecios.find((l) => l.id === c.lista_precio_id);
          if (asignada) {
            await handleCambiarListaPrecio(asignada);
          }
        }
      } else {
        setPreciosCliente(new Map());
      }
    },
    [listasPrecios, handleCambiarListaPrecio]
  );

  // Agregar filtro a la lista de ítems
  const handleAgregarFiltro = useCallback(
    (filtro: Filtro | { codigo_fhl: string; precio?: number }) => {
      const codigo = filtro.codigo_fhl.trim();
      if (!codigo) return;

      const codNorm = codigo.toUpperCase();
      const existe = items.find((i) => i.codigo_fhl.toUpperCase() === codNorm);
      if (existe) {
        setMensaje({ tipo: 'error', texto: `${codigo} ya está en la lista.` });
        setTimeout(() => setMensaje(null), 2500);
        return;
      }

      const precioBase = 'precio' in filtro && typeof filtro.precio === 'number' ? filtro.precio : 0;

      if (precioBase > 0) {
        setPreciosBaseFiltros((prev) => {
          const next = new Map(prev);
          next.set(codNorm, precioBase);
          return next;
        });
      }

      const precioCalculado = calcularPrecioUnitario(codigo, precioBase);

      const nuevoItem: ItemFactura = {
        id: `${codigo}-${Date.now()}`,
        codigo_fhl: codigo,
        cantidad: 1,
        precioUnitario: precioCalculado,
      };

      setItems((prev) => [...prev, nuevoItem]);
    },
    [items, calcularPrecioUnitario]
  );

  // Actualizar ítem
  const handleActualizarItem = useCallback((id: string, campo: 'cantidad' | 'precioUnitario', valor: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item))
    );
  }, []);

  // Eliminar ítem
  const handleEliminarItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const total = items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0);

  // --- Guardar / Crear Pedido o Actualizar Pedido Existente ---
  const handleGuardarPedido = async (descargarPdf: boolean = false) => {
    if (!cliente) {
      setMensaje({ tipo: 'error', texto: 'Seleccioná un cliente primero.' });
      setTimeout(() => setMensaje(null), 4000);
      return;
    }
    if (items.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agregá al menos un filtro al pedido.' });
      setTimeout(() => setMensaje(null), 4000);
      return;
    }

    setGuardandoPedido(true);
    setMensaje(null);

    try {
      if (modoEdicion && pedidoIdAEditar) {
        // --- ACTUALIZACIÓN DE PEDIDO EXISTENTE ---
        const { error: errUpdatePed } = await supabase
          .from('pedidos')
          .update({
            cliente_id: cliente.id,
            total: total,
            observaciones: observaciones.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pedidoIdAEditar);

        if (errUpdatePed) throw errUpdatePed;

        // Reemplazar ítems del pedido
        await supabase.from('items_pedido').delete().eq('pedido_id', pedidoIdAEditar);

        const itemsPedidoDb = items.map((it) => ({
          pedido_id: pedidoIdAEditar,
          codigo_fhl: it.codigo_fhl,
          cantidad: it.cantidad,
          precio_unitario: it.precioUnitario,
        }));
        await supabase.from('items_pedido').insert(itemsPedidoDb);

        // Limpiar borrador local
        try {
          localStorage.removeItem(storageKey);
        } catch (e) {
          console.warn(e);
        }

        if (descargarPdf) {
          await generarPDF({
            cliente,
            items,
            observaciones,
            numeroPresupuesto: `PED-${pedidoIdAEditar.slice(0, 8).toUpperCase()}`,
            validezDias,
          });
        }

        router.push(`/admin/pedidos/${pedidoIdAEditar}`);
      } else {
        // --- CREACIÓN DE NUEVO PEDIDO ---
        const { data: nuevoPedido, error: errPed } = await supabase
          .from('pedidos')
          .insert({
            cliente_id: cliente.id,
            estado: 'pendiente',
            total: total,
            observaciones: observaciones.trim() || null,
          })
          .select()
          .single();

        if (errPed || !nuevoPedido) throw errPed;

        const itemsPedidoDb = items.map((it) => ({
          pedido_id: nuevoPedido.id,
          codigo_fhl: it.codigo_fhl,
          cantidad: it.cantidad,
          precio_unitario: it.precioUnitario,
        }));
        await supabase.from('items_pedido').insert(itemsPedidoDb);

        // Limpiar borrador local
        try {
          localStorage.removeItem(storageKey);
        } catch (e) {
          console.warn(e);
        }

        if (descargarPdf) {
          await generarPDF({
            cliente,
            items,
            observaciones,
            numeroPresupuesto: `PED-${nuevoPedido.id.slice(0, 8).toUpperCase()}`,
            validezDias,
          });
        }

        router.push(`/admin/pedidos/${nuevoPedido.id}`);
      }
    } catch (err: any) {
      console.error(err);
      setMensaje({ tipo: 'error', texto: err.message || 'Error al procesar el pedido' });
      setGuardandoPedido(false);
      setTimeout(() => setMensaje(null), 4000);
    }
  };

  // Limpiar todo
  const handleLimpiar = () => {
    if (confirm('¿Limpiar todo el formulario y descartar el borrador actual?')) {
      setCliente(null);
      setPreciosCliente(new Map());
      setItems([]);
      setObservaciones('');
      setNumeroPresupuesto('');
      setValidezDias(30);
      setMensaje(null);
      setMostrarPreview(false);
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        console.warn(e);
      }
      setUltimoGuardadoBorrador(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    }
  };

  if (cargandoEdicion) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Cargando datos del pedido para editar...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Banner de Borrador no guardado detectado */}
      {borradorPendiente && !modoEdicion && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-blue-950 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-700 shrink-0">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <div>
              <p className="text-xs font-bold text-blue-900">
                Se detectó un borrador guardado automáticamente
              </p>
              <p className="text-[11px] text-blue-700">
                {borradorPendiente.cliente ? `Cliente: ${borradorPendiente.cliente.nombre} • ` : ''}
                {borradorPendiente.items?.length || 0} filtros en la lista (Guardado a las {borradorPendiente.guardadoAt}).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRestaurarBorrador}
              className="px-3.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              Restaurar Borrador
            </button>
            <button
              onClick={handleDescartarBorrador}
              className="px-3 py-1.5 bg-white border border-blue-200 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Título de página y Estado de Autoguardado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {modoEdicion ? 'Modificación de Pedido' : 'Ventas & Producción'}
            </span>
            {modoEdicion && (
              <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                Modo Edición
              </span>
            )}
          </div>

          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            {modoEdicion ? `Editar Pedido #${pedidoIdAEditar?.slice(0, 8)}` : 'Cargar Nuevo Pedido'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {modoEdicion
              ? 'Modificá los filtros, cantidades o cliente asignado y guardá los cambios para actualizar el pedido.'
              : 'Seleccioná el cliente, agregá los filtros y creá el pedido con comprobante PDF inmediato.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Indicador de Autoguardado */}
          {ultimoGuardadoBorrador && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Autoguardado {ultimoGuardadoBorrador}</span>
            </div>
          )}

          <button
            onClick={() => router.push(modoEdicion ? `/admin/pedidos/${pedidoIdAEditar}` : '/admin/pedidos')}
            className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            <span>{modoEdicion ? 'Volver al Pedido' : 'Ver Todos los Pedidos'}</span>
          </button>
        </div>
      </div>

      {/* Mensaje flotante */}
      {mensaje && (
        <div
          className={`px-4 py-3 rounded-lg text-xs font-bold border transition-all ${
            mensaje.tipo === 'ok'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Grid de Dos Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Formulario (Columna izquierda - 7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* SECCIÓN 1: Cliente y Lista de Precios */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <SelectorCliente
              clienteSeleccionado={cliente}
              onSeleccionar={handleSeleccionarCliente}
            />

            <SelectorListaPrecio
              listas={listasPrecios}
              listaSeleccionada={listaSeleccionada}
              onSeleccionarLista={handleCambiarListaPrecio}
              tienePreciosPersonalizadosCliente={preciosCliente.size > 0}
              usarPreciosCliente={usarPreciosCliente}
              onTogglePreciosCliente={(usar) => {
                setUsarPreciosCliente(usar);
                setItems((prevItems) =>
                  prevItems.map((it) => {
                    const nuevoPrecio = calcularPrecioUnitario(it.codigo_fhl, undefined, listaSeleccionada, usar);
                    return {
                      ...it,
                      precioUnitario: nuevoPrecio > 0 ? nuevoPrecio : it.precioUnitario,
                    };
                  })
                );
              }}
              cargando={cargandoListas}
            />
          </div>

          {/* SECCIÓN 2: Agregar filtros */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              Agregar Filtros
            </h3>
            <BuscadorFiltroAutocompletar onSeleccionar={handleAgregarFiltro} />
            {!cliente && (
              <p className="text-[11px] text-amber-600 font-semibold mt-2">
                Seleccioná un cliente para autocompletar su lista de precios personalizada.
              </p>
            )}
          </div>

          {/* SECCIÓN 3: Tabla de ítems */}
          <TablaItems
            items={items}
            onActualizarItem={handleActualizarItem}
            onEliminarItem={handleEliminarItem}
          />

          {/* SECCIÓN 4: Observaciones y Detalles del Presupuesto */}
          {items.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Número de Comprobante / Presupuesto
                  </label>
                  <input
                    type="text"
                    value={numeroPresupuesto}
                    onChange={(e) => setNumeroPresupuesto(e.target.value)}
                    placeholder="Ej: 0001-000023"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                    Validez (días)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={validezDias}
                    onChange={(e) => setValidezDias(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Observaciones
                </label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Notas adicionales o requerimientos del pedido..."
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          )}

          {/* SECCIÓN 5: Acciones */}
          {items.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="text-xs text-slate-500">
                <span className="font-bold text-slate-700">{items.length}</span> ítem(s) •{' '}
                <span className="font-black text-blue-900 text-base font-mono">
                  ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={handleLimpiar}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Limpiar
                </button>

                <button
                  type="button"
                  onClick={() => handleGuardarPedido(false)}
                  disabled={guardandoPedido}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {guardandoPedido ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                      <span>{modoEdicion ? 'Actualizando...' : 'Guardando...'}</span>
                    </>
                  ) : (
                    <span>{modoEdicion ? 'Guardar Cambios' : 'Crear Pedido'}</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleGuardarPedido(true)}
                  disabled={guardandoPedido}
                  className="px-5 py-2 text-xs font-bold text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {guardandoPedido ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{modoEdicion ? 'Actualizando y Descargando...' : 'Creando y Descargando...'}</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>{modoEdicion ? 'Guardar y Descargar PDF' : 'Crear Pedido y Descargar PDF'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Previsualización (Columna derecha - 5 cols) */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col min-h-[450px]">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              Vista Previa del Documento
            </h3>

            {!cliente || items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                <svg className="text-slate-300 mb-2" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <p className="text-xs font-semibold text-slate-500">
                  Completá los datos del presupuesto o pedido para habilitar la vista previa.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-3">
                <button
                  onClick={actualizarPrevisualizacion}
                  disabled={cargandoPreview || generando}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {cargandoPreview ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Cargando Vista Previa...</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l5.67-5.67" />
                      </svg>
                      <span>{previewUrl ? 'Actualizar Vista Previa' : 'Ver Vista Previa'}</span>
                    </>
                  )}
                </button>

                {previewUrl ? (
                  esMobile ? (
                    <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-slate-200 rounded-lg h-[350px] space-y-4">
                      <p className="text-xs font-bold text-slate-800">Documento Generado</p>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-lg text-center flex items-center justify-center gap-1.5"
                      >
                        Abrir Vista Previa en Pantalla Completa
                      </a>
                    </div>
                  ) : (
                    <div className="flex-grow border border-slate-200 rounded-lg overflow-hidden h-[480px]">
                      <iframe
                        src={`${previewUrl}#toolbar=0&navpanes=0`}
                        className="w-full h-full"
                        title="Vista previa del presupuesto"
                      />
                    </div>
                  )
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center text-center p-6 bg-slate-50 border border-dashed border-slate-200 rounded-lg h-[480px]">
                    <p className="text-xs text-slate-500">
                      Hacé click en <strong>Ver Vista Previa</strong> para generar una copia interactiva del documento.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default function FacturadorPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-xs font-semibold text-slate-400">Cargando facturador...</div>}>
      <FacturadorContenido />
    </Suspense>
  );
}
