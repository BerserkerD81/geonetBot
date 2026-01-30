import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, Circle, ServerCog, XCircle } from 'lucide-react';

// 1. Agregamos 'error' al tipo
interface Step {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'complete' | 'error'; 
}

export function ProcessingModal({ isOpen, steps }: { isOpen: boolean; steps: Step[] }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        >
          <motion.div
            layoutId="modal-container"
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="bg-neutral-900 border border-neutral-800 p-6 md:p-8 rounded-2xl shadow-2xl max-w-sm w-full relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-600" />
            
            {/* Si hay un error, cambiamos sutilmente el fondo ambiental */}
            {steps.some(s => s.status === 'error') && (
               <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl transition-colors duration-500" />
            )}

            <div className="flex flex-col items-center text-center mb-8 relative z-10">
              <div className="h-16 w-16 bg-neutral-800/80 rounded-2xl flex items-center justify-center mb-4 border border-neutral-700 shadow-inner">
                <ServerCog className="text-emerald-500 size-8" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Procesando Solicitud</h3>
            </div>

            <div className="space-y-4 relative z-10">
              {steps.map((step, index) => {
                const isActive = step.status === 'loading';
                const isComplete = step.status === 'complete';
                const isError = step.status === 'error'; // Detectar error

                return (
                  <motion.div 
                    key={step.id} 
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`flex items-center gap-3.5 p-3 rounded-xl transition-colors duration-300 border ${
                      isActive ? 'bg-emerald-900/10 border-emerald-500/20' : 
                      isError ? 'bg-red-900/10 border-red-500/20' : // Estilo para error
                      'border-transparent'
                    }`}
                  >
                    <div className="shrink-0 flex items-center justify-center">
                      {isActive ? (
                        <Loader2 className="size-5 text-emerald-400 animate-spin" />
                      ) : isComplete ? (
                        <CheckCircle2 className="size-5 text-emerald-500" />
                      ) : isError ? (
                        // Icono de X Roja
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                        >
                            <XCircle className="size-5 text-red-500" />
                        </motion.div>
                      ) : (
                        <Circle className="size-5 text-neutral-700" />
                      )}
                    </div>
                    
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium transition-colors ${
                        isActive ? 'text-emerald-100' : 
                        isError ? 'text-red-400' : // Texto rojo si falla
                        isComplete ? 'text-neutral-300' : 'text-neutral-500'
                      }`}>
                        {step.label}
                      </span>
                      {isError && (
                        <span className="text-[10px] text-red-500/80">
                          Falló la operación
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}