import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, X, Search, Loader2, AlertCircle,
  ChevronRight, RefreshCw, UserX, TriangleAlert,
} from 'lucide-react';
import { Button } from './ui/button';
import { useWizardLogger } from '../hooks/useWizardLogger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientResult {
  id_servicio: number;
  nombre?: string | null;
  apellidos?: string | null;
  cedula?: string | null;
  servicio?: string | null;
  plan_internet?: string | null;
  ip?: string | null;
  estado?: string | null;
  usuario?: string | null;
}

interface BajaStep {
  step: string;
  ok: boolean;
  msg: string;
}

interface BajaClienteWizardProps {
  apiBase: string;
  onClose: () => void;
  initialData?: { client: ClientResult; step: number };
}

type WizardStep = 0 | 1 | 2;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Buscar' },
  { label: 'Confirmar' },
  { label: 'Resultado' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientFullName(c: ClientResult) {
  return `${c.nombre || ''} ${c.apellidos || ''}`.trim() || c.servicio || `ID ${c.id_servicio}`;
}

function apiCall(base: string, path: string, opts?: RequestInit) {
  return fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
              ${active ? 'bg-red-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
              {done ? <CheckCircle2 className="size-3.5" /> : <span className="size-4 flex items-center justify-center">{i + 1}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-px mx-1 ${i < step ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800
        focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-colors" />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BajaClienteWizard({ apiBase, onClose, initialData }: BajaClienteWizardProps) {
  const { logStep, updateResume, completeSession } = useWizardLogger(apiBase, 'baja');

  const [step, setStep] = useState<WizardStep>((initialData?.step ?? 0) as WizardStep);

  // Step 0: search
  const [searchNombre, setSearchNombre] = useState('');
  const [searchRut, setSearchRut] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ClientResult[] | null>(null);
  const [searchError, setSearchError] = useState('');

  // Step 1: confirm
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(initialData?.client ?? null);
  const [confirmText, setConfirmText] = useState('');

  // Step 2: result
  const [submitting, setSubmitting] = useState(false);
  const [bajaSteps, setBajaSteps] = useState<BajaStep[]>([]);
  const [bajaOk, setBajaOk] = useState(false);

  // ── Search
  const handleSearch = useCallback(async () => {
    if (!searchNombre.trim() && !searchRut.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    try {
      const res = await apiCall(apiBase, '/wizard/change-onu/search', {
        method: 'POST',
        body: JSON.stringify({ nombre: searchNombre.trim(), rut: searchRut.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error buscando');
      setSearchResults(data.clients || []);
    } catch (e: any) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  }, [apiBase, searchNombre, searchRut]);

  // ── Select client → confirm step
  const handleSelectClient = useCallback((client: ClientResult) => {
    setSelectedClient(client);
    setConfirmText('');
    setStep(1);
    const name = clientFullName(client);
    logStep('client-select', 'Cliente seleccionado', 'ok', {
      inputData: { clientId: client.id_servicio, nombre: name, rut: client.cedula, estado: client.estado },
      clientId: client.id_servicio, clientName: name,
    });
    updateResume({ step: 1, client }, { clientId: client.id_servicio, clientName: name });
  }, [logStep, updateResume]);

  // ── Submit baja
  const handleSubmit = useCallback(async () => {
    if (!selectedClient) return;
    setSubmitting(true);
    setBajaSteps([]);
    setStep(2);
    const clientName = clientFullName(selectedClient);
    logStep('baja-confirm', 'Baja confirmada', 'ok', {
      inputData: { clientId: selectedClient.id_servicio, clientName, confirmedByTyping: true },
    });
    try {
      const res = await apiCall(apiBase, '/wizard/baja/submit', {
        method: 'POST',
        body: JSON.stringify({ clientId: selectedClient.id_servicio }),
      });
      const data = await res.json();
      setBajaSteps(data.steps || []);
      setBajaOk(data.ok === true);
      if (data.ok) {
        logStep('baja-execute', 'Baja ejecutada', 'ok', { outputData: { steps: data.steps } });
        completeSession(`Baja completada para ${clientName}`);
      } else {
        logStep('baja-execute', 'Baja ejecutada', 'error', {
          outputData: { steps: data.steps }, errorMsg: data.error || 'Falló',
        });
      }
    } catch (e: any) {
      setBajaSteps([{ step: 'error', ok: false, msg: `❌ Error de conexión: ${e.message}` }]);
      setBajaOk(false);
      logStep('baja-execute', 'Baja ejecutada', 'error', { errorMsg: e.message });
    } finally {
      setSubmitting(false);
    }
  }, [apiBase, selectedClient, logStep, completeSession]);

  const reset = useCallback(() => {
    setStep(0); setSelectedClient(null); setConfirmText('');
    setSearchResults(null); setSearchNombre(''); setSearchRut(''); setSearchError('');
    setBajaSteps([]); setBajaOk(false);
  }, []);

  // Confirm requires typing the client name exactly
  const expectedConfirm = selectedClient ? clientFullName(selectedClient).toLowerCase().trim() : '';
  const canConfirm = confirmText.trim().toLowerCase() === expectedConfirm && expectedConfirm.length > 0;

  // -------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-red-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-red-50 rounded-lg flex items-center justify-center">
            <UserX className="size-4 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Dar de baja cliente</h2>
            {selectedClient && step > 0 && (
              <p className="text-xs text-red-500 font-medium">{clientFullName(selectedClient)}</p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <X className="size-4" />
        </button>
      </div>

      {/* Submitting overlay */}
      {submitting && (
        <div className="absolute inset-0 z-50 bg-white/80 flex flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 animate-spin text-red-500" />
          <p className="text-sm font-medium text-gray-600">Ejecutando baja...</p>
          <p className="text-xs text-gray-400">Eliminando producto WiFi y dando de baja en Geonet</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto w-full px-4 py-6">
          <StepIndicator step={step} />

          <AnimatePresence mode="wait">

            {/* ── Step 0: search ── */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Buscar cliente</h3>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldGroup label="Nombre completo">
                        <TextInput value={searchNombre} onChange={setSearchNombre} placeholder="Juan Pérez" />
                      </FieldGroup>
                      <FieldGroup label="RUT">
                        <TextInput value={searchRut} onChange={setSearchRut} placeholder="12.345.678-9" />
                      </FieldGroup>
                    </div>
                    <div className="px-4 pb-4">
                      <Button disabled={searching || (!searchNombre.trim() && !searchRut.trim())} onClick={handleSearch}
                        className="bg-gray-800 hover:bg-gray-900 text-white w-full sm:w-auto">
                        {searching
                          ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Buscando...</>
                          : <><Search className="size-3.5 mr-1.5" />Buscar</>}
                      </Button>
                    </div>
                  </div>

                  {searchError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      <AlertCircle className="size-3.5 flex-shrink-0" />{searchError}
                    </div>
                  )}

                  {searchResults !== null && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          {searchResults.length ? `${searchResults.length} resultado(s)` : 'Sin resultados'}
                        </h3>
                      </div>
                      {searchResults.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">No se encontraron clientes.</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {searchResults.map(client => (
                            <button key={client.id_servicio} onClick={() => handleSelectClient(client)}
                              className="w-full text-left px-4 py-3 hover:bg-red-50 transition-colors group">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-red-700">{clientFullName(client)}</span>
                                    {client.estado && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 flex-shrink-0">{client.estado}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                                    <span>{client.cedula || '—'}</span>
                                    {client.plan_internet && <span>{client.plan_internet}</span>}
                                    {client.ip && <span>IP: {client.ip}</span>}
                                  </div>
                                </div>
                                <ChevronRight className="size-4 text-gray-300 group-hover:text-red-500 flex-shrink-0" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 1: confirm ── */}
            {step === 1 && selectedClient && (
              <motion.div key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  {/* Warning banner */}
                  <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <TriangleAlert className="size-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Acción irreversible</p>
                      <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                        Se eliminará el producto WiFi del cliente y se ejecutará la baja en Geonet.
                        El estado quedará como <strong>Cancelado</strong>. Esta acción no se puede deshacer.
                      </p>
                    </div>
                  </div>

                  {/* Client data */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Datos del cliente a dar de baja</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Nombre</p>
                        <p className="font-semibold text-gray-900">{clientFullName(selectedClient)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">RUT</p>
                        <p className="font-medium text-gray-800">{selectedClient.cedula || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Plan</p>
                        <p className="font-medium text-gray-800">{selectedClient.plan_internet || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">IP</p>
                        <p className="font-mono font-medium text-gray-800">{selectedClient.ip || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Usuario</p>
                        <p className="font-mono text-xs text-gray-700">{selectedClient.usuario || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Estado actual</p>
                        <p className="font-medium text-gray-800">{selectedClient.estado || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Typed confirmation */}
                  <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                      <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider">Confirmación requerida</h3>
                    </div>
                    <div className="p-4 space-y-2">
                      <p className="text-xs text-gray-600">
                        Para confirmar, escribe el nombre completo del cliente:
                        <span className="font-semibold text-gray-900 ml-1">{clientFullName(selectedClient)}</span>
                      </p>
                      <input
                        type="text"
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        placeholder="Escribe el nombre aquí..."
                        className={`w-full h-9 rounded-lg border px-3 text-sm transition-colors focus:outline-none focus:ring-2
                          ${canConfirm
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-800 focus:ring-emerald-300/30'
                            : 'border-gray-200 bg-white text-gray-800 focus:ring-red-300/30 focus:border-red-400'}`}
                      />
                      {confirmText.length > 0 && !canConfirm && (
                        <p className="text-[11px] text-red-500">El nombre no coincide</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Step 2: result ── */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  {submitting ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <Loader2 className="size-7 animate-spin text-red-500" />
                      <p className="text-sm text-gray-400">Procesando baja...</p>
                    </div>
                  ) : (
                    <>
                      {/* Overall result banner */}
                      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border
                        ${bajaOk ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        {bajaOk
                          ? <CheckCircle2 className="size-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                          : <AlertCircle className="size-5 text-red-600 flex-shrink-0 mt-0.5" />}
                        <div>
                          <p className={`text-sm font-semibold ${bajaOk ? 'text-emerald-800' : 'text-red-800'}`}>
                            {bajaOk ? 'Baja completada exitosamente' : 'La baja no se completó'}
                          </p>
                          {selectedClient && bajaOk && (
                            <p className="text-xs text-emerald-600 mt-0.5">{clientFullName(selectedClient)} — estado actualizado a Cancelado</p>
                          )}
                        </div>
                      </div>

                      {/* Step-by-step log */}
                      {bajaSteps.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Detalle de operaciones</h3>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {bajaSteps.map((s, i) => (
                              <div key={i} className="flex items-start gap-2.5 px-4 py-3">
                                <span className={`mt-0.5 text-xs font-bold flex-shrink-0 w-4 text-center
                                  ${s.ok ? 'text-emerald-600' : 'text-amber-500'}`}>
                                  {s.ok ? '✓' : '!'}
                                </span>
                                <p className="text-sm text-gray-700">{s.msg}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-3 flex-wrap">
                        <Button onClick={onClose} className="bg-gray-800 hover:bg-gray-900 text-white">Finalizar</Button>
                        {bajaOk && (
                          <Button variant="outline" onClick={reset}>
                            <RefreshCw className="size-3.5 mr-1.5" />Nueva baja
                          </Button>
                        )}
                        {!bajaOk && (
                          <Button variant="outline" onClick={() => setStep(1)}>
                            ← Volver
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      {step < 2 && (
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-t border-gray-200">
          <Button variant="outline" size="sm" onClick={() => {
            if (step === 0) onClose();
            else setStep(prev => (prev - 1) as WizardStep);
          }} className="text-gray-600">
            {step === 0 ? 'Cancelar' : '← Anterior'}
          </Button>

          {step === 0 && (
            <span className="text-xs text-gray-400">
              {searchResults !== null ? `${searchResults.length} resultado(s)` : 'Busca por nombre o RUT'}
            </span>
          )}

          {step === 1 && (
            <Button size="sm" disabled={!canConfirm} onClick={handleSubmit}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold">
              <UserX className="size-3.5 mr-1.5" />
              Dar de baja
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
