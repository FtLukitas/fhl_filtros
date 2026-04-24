'use client';

export default function QuienesSomos() {
  return (
    <main className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Encabezado con la barra roja de acento */}
        <header className="mb-12 flex items-center gap-4">
          {/* Barrita roja lateral */}
          <div className="w-2 h-14 bg-red-600 rounded-full"></div>
          
          <div>
            <h1 className="text-4xl font-black text-blue-900 italic uppercase leading-none">
              Quiénes Somos
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">
              Trayectoria y Calidad Industrial
            </p>
          </div>
        </header>

        <section className="space-y-8 text-slate-700 leading-relaxed text-lg">
          <p>
            En <span className="font-bold text-blue-900">FHL Filtros</span>, nos especializamos en la fabricación de soluciones de filtrado de alta eficiencia para la industria automotriz.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8">
            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200 hover:border-red-200 transition-colors group">
              <h3 className="font-bold text-blue-900 mb-3 text-xl group-hover:text-red-600 transition-colors">
                Misión
              </h3>
              <p className="text-sm text-slate-600">
                Garantizar la pureza del aire en el habitáculo, aplicando tecnología de precisión y estándares industriales en cada uno de nuestros procesos.
              </p>
            </div>
            
            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200 hover:border-red-200 transition-colors group">
              <h3 className="font-bold text-blue-900 mb-3 text-xl group-hover:text-red-600 transition-colors">
                Compromiso
              </h3>
              <p className="text-sm text-slate-600">
                Proveer productos confiables que aseguren el máximo rendimiento de los sistemas de climatización y la protección técnica de cada vehículo.
              </p>
            </div>
          </div>

          <p>
            Nuestra identidad combina la disciplina técnica con un enfoque orientado a resultados, asegurando que cada componente cumpla con las especificaciones más exigentes del mercado nacional.
          </p>
        </section>
      </div>
    </main>
  );
}