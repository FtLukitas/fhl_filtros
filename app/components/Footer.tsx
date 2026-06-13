export default function Footer() {
  return (
    <footer className="w-full bg-blue-900 py-6 border-t border-blue-800 text-center mt-auto">
      <p className="text-xs text-blue-200 font-medium">
        © {new Date().getFullYear()} FHL Filtros. Desarrollado por <span className="font-semibold text-white">Feats Software</span>.
      </p>
    </footer>
  );
}
