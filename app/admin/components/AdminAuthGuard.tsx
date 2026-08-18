'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [verificando, setVerificando] = useState(pathname !== '/admin/login');

  useEffect(() => {
    if (pathname === '/admin/login') {
      setVerificando(false);
      return;
    }

    // Comprobar cookie de sesión mediante fetch ligero
    fetch('/api/auth/check')
      .then((res) => {
        if (!res.ok) {
          router.replace('/admin/login');
        } else {
          setVerificando(false);
        }
      })
      .catch(() => {
        router.replace('/admin/login');
      });
  }, [pathname, router]);

  if (verificando) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Verificando sesión...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
