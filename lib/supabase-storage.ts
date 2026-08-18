import { supabase } from './supabase';

/**
 * Comprime y convierte cualquier imagen (PNG, JPG, HEIC, etc.) a formato WebP en el navegador
 */
export async function comprimirAWebP(
  file: File,
  maxDimension = 1200,
  quality = 0.82
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Redimensionar proporcionalmente si excede el tamaño máximo
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo inicializar el contexto del canvas'));
          return;
        }

        // Fondo transparente o blanco según convenga (WebP soporta alpha)
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Error al convertir imagen a WebP'));
            }
          },
          'image/webp',
          quality
        );
      };
      img.onerror = () => reject(new Error('Error al cargar la imagen'));
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
  });
}

/**
 * Sube una imagen WebP a Supabase Storage en el bucket 'productos'
 * Retorna la URL pública directa
 */
export async function subirImagenProducto(
  blob: Blob,
  nombreBase: string
): Promise<string> {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 7);
  const nombreLimpio = nombreBase.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'producto';
  const path = `${nombreLimpio}_${timestamp}_${randomStr}.webp`;

  const { data, error } = await supabase.storage
    .from('productos')
    .upload(path, blob, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data: publicData } = supabase.storage
    .from('productos')
    .getPublicUrl(data.path);

  return publicData.publicUrl;
}

/**
 * Elimina una imagen del bucket de Supabase Storage dada su URL pública
 */
export async function eliminarImagenProducto(url: string): Promise<void> {
  try {
    const parts = url.split('/productos/');
    if (parts.length > 1) {
      const path = parts[1];
      await supabase.storage.from('productos').remove([path]);
    }
  } catch (err) {
    console.warn('No se pudo eliminar la imagen de storage:', err);
  }
}
