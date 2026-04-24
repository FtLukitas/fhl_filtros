export default function QuienesSomos() {
  return (
    <main className="min-h-screen bg-white py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12">
          <h1 className="text-4xl font-black text-blue-900 italic mb-4">¿QUIÉNES SOMOS?</h1>
          
        </header>

        <section className="space-y-8 text-slate-700 leading-relaxed text-lg">
          <p>
            En <span className="font-bold text-blue-900">FHL Filtros</span>, nos especializamos en la fabricación y comercialización de filtros de habitáculo de alta eficiencia para la industria automotriz. 
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <h3 className="font-bold text-blue-900 mb-2">Nuestra Misión</h3>
              <p className="text-sm">Proveer soluciones de filtrado que garanticen la pureza del aire en el habitáculo, protegiendo la salud de los conductores y el rendimiento de los sistemas de climatización.</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
              <h3 className="font-bold text-blue-900 mb-2">Calidad Industrial</h3>
              <p className="text-sm">Utilizamos procesos técnicos rigurosos y materiales de primera calidad, asegurando que cada filtro FHL cumpla con las especificaciones exactas de cada modelo.</p>
            </div>
          </div>

          <p>
            Somos una empresa familiar con raíces técnicas, donde la disciplina y la precisión en la electromecánica se traducen en productos confiables y duraderos.
          </p>
        </section>
      </div>
    </main>
  );
}