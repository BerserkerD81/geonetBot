import { Activity, ImageIcon, Wifi, Server } from 'lucide-react';

// SVG import (favicon)
import favicon from '../../public/favicon.svg';

interface EmptyChatProps {
  onSelectQuery?: (query: string) => void;
  onStartWizard?: (type: 'auth' | 'change-onu' | 'wifi' | 'monitor' | 'baja' | 'fotos') => void;
  disabled?: boolean;
}

export function EmptyChat({ onSelectQuery, onStartWizard, disabled = false }: EmptyChatProps) {
  const exampleQueries = [
    {
      icon: Activity,
      title: 'Instalaciones pendientes de autorizar',
      query: 'Enséñame las instalaciones pendientes de evidencia para autorizar el alta',
      description: 'Controla las órdenes donde aún faltan fotos o datos',
      wizardType: 'auth' as const,
    },
    {
      icon: ImageIcon,
      title: 'Agregar fotos a clientes',
      query: 'quiero agregar fotos de instalaicion',
      description: 'Carga evidencias para un cliente específico',
      wizardType: 'fotos' as const,
    },
    {
      icon: Wifi,
      title: 'Cambiar WiFi',
      query: 'cambiar wifi',
      description: 'Actualiza la configuración de red inalámbrica actualmente solo funciona en ONUs ZTE',
      wizardType: 'wifi' as const,
    },
    {
      icon: Server,
      title: 'Cambiar ONU',
      query: 'cambiar onu',
      description: 'Gestiona el reemplazo de una ONU',
      wizardType: 'change-onu' as const,
    },
    {
      icon: Activity,
      title: 'Dar de baja cliente',
      query: 'dar de bajacliente',
      description: 'Busca por nombre o RUT y confirma la baja del cliente',
      wizardType: 'baja' as const,
    },
    {
      icon: Activity,
      title: 'Monitoreo de cliente',
      query: 'monitoreo cliente',
      description: 'Consulta el estado y métricas de un cliente en tiempo real',
      wizardType: 'monitor' as const,
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
            <div className="inline-flex items-center justify-center size-14 sm:size-16 bg-[#1e3a8a] rounded-2xl mb-1 shadow-lg shadow-[#1e3a8a]/25 relative overflow-hidden">
              <img src={favicon} alt="GeoNetBot Logo" className="w-9 h-9 sm:w-11 sm:h-11 object-contain relative z-10" />
            </div>
            
            {/* Texto adaptable: 2xl en móvil -> 4xl en desktop */}
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
              GeoNetBot
            </h1>
            <p className="text-gray-400 text-sm sm:text-base max-w-md mx-auto leading-relaxed px-4">
              Autogestiona altas, valida instalaciones y administra tu red en tiempo real
            </p>
          </div>

          {/* Listado de Consultas */}
          <div className="space-y-3">
            <p className="text-[10px] sm:text-xs font-semibold text-gray-400 tracking-wider uppercase text-center sm:text-left px-1">
              Comienza rápido
            </p>
            
            {/* 3. Grilla Reactiva: 1 col (móvil), 2 cols (tablet), 3 cols (desktop) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {exampleQueries.map((example, index) => {
                const Icon = example.icon;
                return (
                  <button
                    key={index}
                    onClick={() => {
                      if ('wizardType' in example && example.wizardType && onStartWizard) {
                        onStartWizard(example.wizardType);
                      } else {
                        onSelectQuery?.(example.query);
                      }
                    }}
                    disabled={disabled}
                    className={`group p-4 rounded-xl bg-white border border-gray-200 text-left relative overflow-hidden transition-all duration-200 ${
                      disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:border-[#1e3a8a]/30 hover:shadow-md hover:shadow-[#1e3a8a]/15 hover:-translate-y-px active:translate-y-0'
                    }`}
                  >
                    <div className="flex gap-3 items-start">
                      <div className="flex-shrink-0 size-9 rounded-lg bg-[#1e3a8a]/10 border border-[#1e3a8a]/20 flex items-center justify-center transition-colors duration-150 group-hover:bg-[#1e3a8a]/15">
                        <Icon className="size-4 text-[#f5831f]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-800 mb-1 leading-tight group-hover:text-gray-900">
                          {example.title}
                        </h3>
                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
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
          <div className="text-center pt-4 border-t border-gray-200">
            <p className="text-[11px] text-gray-400 flex flex-wrap items-center justify-center gap-2">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-1.5 bg-orange-400 rounded-full animate-pulse"></span>
                Integrado con SmartOLT
              </span>
              <span className="hidden sm:inline text-gray-300">·</span>
              <span>Pensado para instaladores en terreno</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}