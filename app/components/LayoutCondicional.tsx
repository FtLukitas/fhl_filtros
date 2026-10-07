'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';

export default function LayoutCondicional({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const esAdmin = pathname.startsWith('/admin');

  if (esAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <div className="flex-grow">{children}</div>
      <Footer />
    </>
  );
}
