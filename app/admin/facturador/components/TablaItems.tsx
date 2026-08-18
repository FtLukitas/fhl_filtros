'use client';

export interface ItemFactura {
  id: string;
  codigo_fhl: string;
  cantidad: number;
  precioUnitario: number;
}

interface TablaItemsProps {
  items: ItemFactura[];
  onActualizarItem: (id: string, campo: 'cantidad' | 'precioUnitario', valor: number) => void;
  onEliminarItem: (id: string) => void;
}

// Seleccionar todo el texto del input al hacer focus
const seleccionarTodo = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.select();
};

export default function TablaItems({ items, onActualizarItem, onEliminarItem }: TablaItemsProps) {
  const total = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
        <div className="text-slate-300 mb-2">
          <svg className="mx-auto" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 font-medium">
          Buscá un filtro arriba para agregar ítems al presupuesto
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th scope="col" className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">
                Código FHL
              </th>
              <th scope="col" className="text-center px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-28">
                Cantidad
              </th>
              <th scope="col" className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-36">
                Precio Unit.
              </th>
              <th scope="col" className="text-right px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-32">
                Subtotal
              </th>
              <th scope="col" className="w-12 px-2 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const subtotal = item.cantidad * item.precioUnitario;
              return (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-bold text-blue-900">{item.codigo_fhl}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      min="1"
                      aria-label={`Cantidad de unidades para el filtro ${item.codigo_fhl}`}
                      value={item.cantidad}
                      onFocus={seleccionarTodo}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') return;
                        onActualizarItem(item.id, 'cantidad', Math.max(1, parseInt(val) || 1));
                      }}
                      className="w-20 text-center border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center">
                      <span className="text-slate-500 mr-1 font-medium" aria-hidden="true">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Precio unitario en pesos para el filtro ${item.codigo_fhl}`}
                        value={item.precioUnitario === 0 ? 0 : (item.precioUnitario || '')}
                        onFocus={seleccionarTodo}
                        onChange={(e) =>
                          onActualizarItem(item.id, 'precioUnitario', Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        placeholder="0.00"
                        className="w-24 text-right border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 font-mono"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                    ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => onEliminarItem(item.id)}
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors cursor-pointer"
                      title={`Quitar ítem ${item.codigo_fhl}`}
                      aria-label={`Quitar ítem ${item.codigo_fhl} del presupuesto`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* TOTAL */}
      <div className="bg-blue-900 px-4 py-4 flex items-center justify-between">
        <span className="text-blue-200 text-sm font-bold uppercase tracking-wider">
          Total ({items.length} {items.length === 1 ? 'ítem' : 'ítems'})
        </span>
        <span className="text-white text-2xl font-black font-mono">
          ${total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}
