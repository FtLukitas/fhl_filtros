  import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar"; // Importamos tu nuevo Navbar

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
      <body className="antialiased">
        <Navbar /> {/* Se renderiza arriba de todo */}
        {children}
      </body>
    </html>
  );
}
