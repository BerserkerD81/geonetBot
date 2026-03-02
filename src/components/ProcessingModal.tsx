import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ServerCog, XCircle } from 'lucide-react';

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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
        >
          <motion.div
            layoutId="modal-container"
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            className="bg-white border border-gray-200 p-6 md:p-8 rounded-2xl shadow-2xl shadow-gray-900/10 max-w-sm w-full relative overflow-hidden"
          >
            {/* Top accent bar */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
            
            {/* Error ambient */}
            {steps.some(s => s.status === 'error') && (
               <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/8 rounded-full blur-3xl transition-colors duration-500" />
            )}

            <div className="flex flex-col items-center text-center mb-7 relative z-10">
              <div className="h-14 w-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 border border-gray-200 shadow-sm">
                <ServerCog className="text-emerald-500 size-7" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 tracking-tight">Procesando solicitud</h3>
              <p className="text-xs text-gray-400 mt-1">Esto puede tomar unos segundos…</p>
            </div>

            <div className="space-y-2 relative z-10">
              {steps.map((step, index) => {
                const isActive = step.status === 'loading';
                const isComplete = step.status === 'complete';
                const isError = step.status === 'error';

                return (
                  <motion.div 
                    key={step.id} 
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.08 }}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors duration-300 border ${
                      isActive  ? 'bg-emerald-50  border-emerald-200/80' : 
                      isError   ? 'bg-red-50      border-red-200/80' :
                      isComplete? 'bg-gray-50     border-gray-200/60' :
                                  'border-transparent'
                    }`}
                  >
                    <div className="shrink-0 flex items-center justify-center">
                      {isActive ? (
                        <span className="relative block h-[18px] w-[18px]">
                          <span className="absolute inset-0 rounded-full border-2 border-emerald-500/25" aria-hidden />
                          <span className="absolute inset-0 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" aria-label="Cargando" />
                        </span>
                      ) : isComplete ? (
                        <CheckCircle2 className="size-4.5 text-emerald-500" />
                      ) : isError ? (
                        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                          <XCircle className="size-4.5 text-red-500" />
                        </motion.div>
                      ) : (
                        <Circle className="size-4.5 text-gray-300" />
                      )}
                    </div>
                    
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium transition-colors ${
                        isActive   ? 'text-emerald-700' : 
                        isError    ? 'text-red-600' :
                        isComplete ? 'text-gray-700' : 'text-gray-400'
                      }`}>
                        {step.label}
                      </span>
                      {isError && (
                        <span className="text-[10px] text-red-400 mt-0.5">
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