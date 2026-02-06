import { Bot, Activity ,ImageIcon} from 'lucide-react';

interface EmptyChatProps {
  onSelectQuery?: (query: string) => void;
  disabled?: boolean;
}

export function EmptyChat({ onSelectQuery, disabled = false }: EmptyChatProps) {
  const exampleQueries = [
    {
      icon: Activity,
      title: 'Instalaciones pendientes de autorizar',
      query: 'Enséñame las instalaciones pendientes de evidencia para autorizar el alta',
      description: 'Controla las órdenes donde aún faltan fotos o datos'
    },
    {
      icon: ImageIcon,
      title: 'Agregar fotos a clientes',
      query: 'quiero agregar fotos de instalaicion',
      description: 'Carga evidencias para un cliente específico'
    },
  ];

  return (
    // 1. Contenedor principal con scroll seguro (evita cortes en móviles apaisados)
    <div className="h-full w-full overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center p-4">
        
        {/* 2. Ancho máximo controlado para que no se "desparrame" en monitores grandes */}
        <div className="max-w-3xl w-full space-y-6 sm:space-y-8 py-6">
          
          {/* Header Responsive */}
          <div className="text-center space-y-3 sm:space-y-4">
            <div className="inline-flex items-center justify-center size-14 sm:size-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl mb-1 shadow-xl shadow-emerald-500/20 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-green-500 rounded-2xl blur-lg opacity-40 animate-pulse"></div>
              <Bot className="size-7 sm:size-8 text-white relative z-10" />
            </div>
            
            {/* Texto adaptable: 2xl en móvil -> 4xl en desktop */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight bg-gradient-to-br from-white to-neutral-300 bg-clip-text text-transparent px-2">
              GeoNetBot
            </h1>
            <p className="text-neutral-400 text-xs sm:text-base max-w-lg mx-auto leading-relaxed px-4">
              Ayuda al instalador a autogestionar altas, validar instalaciones tiempo real
            </p>
          </div>

          {/* Listado de Consultas */}
          <div className="space-y-3">
            <h2 className="text-[10px] sm:text-xs font-semibold text-neutral-500 px-1 tracking-wide uppercase text-center sm:text-left">
              Comienza rápido
            </h2>
            
            {/* 3. Grilla Reactiva: 1 col (móvil), 2 cols (tablet), 3 cols (desktop) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {exampleQueries.map((example, index) => {
                const Icon = example.icon;
                return (
                  <button
                    key={index}
                    onClick={() => onSelectQuery?.(example.query)}
                    disabled={disabled}
                    className={`group p-4 rounded-xl bg-neutral-900/50 border border-neutral-800/80 transition-all duration-300 text-left relative overflow-hidden shadow-sm h-full ${
                      disabled
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:bg-neutral-800/60 hover:border-neutral-700 hover:shadow-md hover:shadow-emerald-500/5'
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 to-green-600/0 group-hover:from-emerald-500/5 group-hover:to-green-600/5 transition-all duration-300" />
                    
                    <div className="relative flex gap-3 items-start sm:items-center">
                      <div className="flex-shrink-0 size-10 rounded-lg bg-neutral-800/70 group-hover:bg-gradient-to-br group-hover:from-emerald-500/20 group-hover:to-green-600/20 border border-neutral-700 group-hover:border-emerald-500/30 flex items-center justify-center transition-all duration-300">
                        <Icon className="size-4.5 text-emerald-400 group-hover:text-emerald-300 transition-colors duration-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white mb-1.5 group-hover:text-emerald-50 transition-colors duration-300 leading-tight">
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

          {/* Footer */}
          <div className="text-center pt-4 border-t border-neutral-800/50">
            <p className="text-[10px] sm:text-xs text-neutral-600 flex flex-wrap items-center justify-center gap-2">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-1.5 bg-emerald-500 rounded-full animate-pulse shadow-sm shadow-emerald-500/50"></span>
                Integrado con SmartOLT
              </span>
              <span className="hidden sm:inline text-neutral-700">•</span>
              <span>Pensado para instaladores en terreno</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}