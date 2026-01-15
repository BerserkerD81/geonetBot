import { Users, Monitor, Bot, Network, Activity, MapPin, Database } from 'lucide-react';

interface EmptyChatProps {
  onSelectQuery?: (query: string) => void;
}

export function EmptyChat({ onSelectQuery }: EmptyChatProps) {
  const exampleQueries = [
    {
      icon: MapPin,
      title: 'Verificar cobertura y factibilidad',
      query: '¿Puedo dar de alta un cliente nuevo en la zona centro con SmartOLT?',
      description: 'Revisa si la zona y el puerto OLT están disponibles'
    },
    {
      icon: Users,
      title: 'Revisar cuenta de cliente',
      query: 'Muéstrame el estado de la ONT del cliente con ID CL-2024-001',
      description: 'Consulta resumen de cliente, ONT y puerto de OLT'
    },
    {
      icon: Monitor,
      title: 'Estado de ONT',
      query: '¿La ONT del cliente está en línea y con buena potencia óptica?',
      description: 'Comprueba si la ONT responde correctamente en la OLT'
    },
    {
      icon: Network,
      title: 'Estado de puerto OLT',
      query: 'Muéstrame el estado del puerto PON 1/1/8 y sus ONTs asociadas',
      description: 'Revisa alarmas, potencia y cantidad de clientes conectados'
    },
    {
      icon: Activity,
      title: 'Instalaciones pendientes de autorizar',
      query: 'Enséñame las instalaciones pendientes de evidencia para autorizar el alta',
      description: 'Controla las órdenes donde aún faltan fotos o datos'
    },
    {
      icon: Database,
      title: 'Checklist de instalación',
      query: 'Dame un checklist para que el instalador valide la instalación antes de autorizar el alta',
      description: 'Guía al técnico con pasos claros en terreno'
    },
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-3xl w-full space-y-8 py-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center size-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl mb-1 shadow-xl shadow-emerald-500/20 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-green-500 rounded-2xl blur-lg opacity-40 animate-pulse"></div>
            <Bot className="size-8 text-white relative z-10" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight bg-gradient-to-br from-white to-neutral-300 bg-clip-text text-transparent">
            Asistente SmartOLT
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Ayuda al instalador a autogestionar altas, validar instalaciones y revisar el estado de ONT/OLT en tiempo real
          </p>
        </div>

        {/* Example Query Templates */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-neutral-500 px-1 tracking-wide uppercase">
            Comienza rápido
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {exampleQueries.map((example, index) => {
              const Icon = example.icon;
              return (
                <button
                  key={index}
                  onClick={() => onSelectQuery?.(example.query)}
                  className="group p-4 rounded-xl bg-neutral-900/50 border border-neutral-800/80 hover:bg-neutral-800/60 hover:border-neutral-700 transition-all duration-300 text-left relative overflow-hidden shadow-sm hover:shadow-md hover:shadow-emerald-500/5"
                >
                  {/* Hover gradient effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 to-green-600/0 group-hover:from-emerald-500/5 group-hover:to-green-600/5 transition-all duration-300" />
                  
                  <div className="relative flex gap-3">
                    <div className="flex-shrink-0 size-10 rounded-lg bg-neutral-800/70 group-hover:bg-gradient-to-br group-hover:from-emerald-500/20 group-hover:to-green-600/20 border border-neutral-700 group-hover:border-emerald-500/30 flex items-center justify-center transition-all duration-300">
                      <Icon className="size-4.5 text-emerald-400 group-hover:text-emerald-300 transition-colors duration-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-white mb-1.5 group-hover:text-emerald-50 transition-colors duration-300">
                        {example.title}
                      </h3>
                      <p className="text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors duration-300 leading-relaxed line-clamp-2">
                        {example.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center pt-4 border-t border-neutral-800/50">
          <p className="text-xs text-neutral-600 flex items-center justify-center gap-2">
            <span className="inline-block size-1.5 bg-emerald-500 rounded-full animate-pulse shadow-sm shadow-emerald-500/50"></span>
            Integrado con SmartOLT • Pensado para instaladores en terreno
          </p>
        </div>
      </div>
    </div>
  );
}