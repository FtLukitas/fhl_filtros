'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CosteoRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/listas-precios');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-600">
          Redirigiendo a Listas de Precios...
        </p>
      </div>
    </div>
  );
}
