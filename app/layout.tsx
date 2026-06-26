import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar"; // Importo nuevo Navbar
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";

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
        <Navbar />
        <div className="flex-grow">
          {children}
        </div>
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  );
}
