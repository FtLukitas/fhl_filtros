'use client';

import { useState } from 'react';
import { comprimirAWebP, subirImagenProducto, eliminarImagenProducto } from '@/lib/supabase-storage';

interface ImagenUploaderProps {
  codigoFhl: string;
  imagenes: string[];
  onGuardar: (nuevasImagenes: string[]) => void;
  onCerrar: () => void;
}

export default function ImagenUploader({
  codigoFhl,
  imagenes: imagenesIniciales,
  onGuardar,
  onCerrar,
}: ImagenUploaderProps) {
  const [imagenes, setImagenes] = useState<string[]>(imagenesIniciales);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubirArchivos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setSubiendo(true);
    setError(null);
    const urlsNuevas: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgreso(`Comprimiendo y subiendo ${i + 1}/${files.length} (${file.name})...`);

        // Comprimir a WebP
        const webpBlob = await comprimirAWebP(file, 1200, 0.82);

        // Subir a Storage
        const urlPublica = await subirImagenProducto(webpBlob, codigoFhl);
        urlsNuevas.push(urlPublica);
      }

      setImagenes((prev) => [...prev, ...urlsNuevas]);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al procesar y subir imágenes');
    } finally {
      setSubiendo(false);
      setProgreso(null);
    }
  };

  const handleEliminarImagen = async (index: number) => {
    const urlAEliminar = imagenes[index];
    const nuevas = imagenes.filter((_, idx) => idx !== index);
    setImagenes(nuevas);

    // Intentar eliminar del bucket si fue subida a Supabase
    if (urlAEliminar.includes('supabase.co')) {
      await eliminarImagenProducto(urlAEliminar);
    }
  };

  const handleGuardarCambios = () => {
    onGuardar(imagenes);
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full p-6 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Galería de Producto
            </span>
            <h3 className="text-xl font-black text-slate-800">
              Imágenes para {codigoFhl}
            </h3>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Zona de subida */}
        <div className="mb-6">
          <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-md p-6 flex flex-col items-center justify-center cursor-pointer transition-all">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-900 mb-2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-sm font-bold text-slate-700">
              Hacé click para seleccionar fotos
            </span>
            <span className="text-xs text-slate-400 mt-0.5">
              Se convertirán automáticamente a WebP de alta compresión
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={subiendo}
              onChange={handleSubirArchivos}
              className="hidden"
            />
          </label>

          {progreso && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-blue-900 bg-blue-50 py-2 rounded-md">
              <div className="h-3.5 w-3.5 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              <span>{progreso}</span>
            </div>
          )}
        </div>

        {/* Lista de miniaturas */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Imágenes cargadas ({imagenes.length})
          </h4>

          {imagenes.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4 text-center bg-slate-50 rounded-md border border-slate-100">
              No hay fotos cargadas para este filtro aún.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-56 overflow-y-auto p-1">
              {imagenes.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="relative group rounded-md overflow-hidden border border-slate-200 bg-slate-50 aspect-square flex items-center justify-center p-1"
                >
                  <img
                    src={url}
                    alt={`Foto ${idx + 1}`}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => handleEliminarImagen(idx)}
                      aria-label={`Eliminar foto ${idx + 1}`}
                      className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold transition-transform active:scale-95"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>
                  {idx === 0 && (
                    <span className="absolute bottom-1 left-1 bg-blue-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                      Principal
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onCerrar}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardarCambios}
            disabled={subiendo}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-md transition-colors shadow"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}
