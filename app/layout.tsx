import type { Metadata } from "next";
import "./globals.css";
import LayoutCondicional from "./components/LayoutCondicional";

export const metadata: Metadata = {
  title: "FHL Filtros - Catálogo Online",
  description: "Especialistas en filtros de habitáculo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased flex flex-col min-h-screen">
        <LayoutCondicional>{children}</LayoutCondicional>
      </body>
    </html>
  );
}
