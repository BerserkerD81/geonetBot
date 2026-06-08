import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, X, Search, Loader2, AlertCircle,
  Wifi, ChevronRight, RefreshCw, Eye, EyeOff
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
}

interface CurrentOnu {
  sn: string;
  model: string;
  externalId: string;
}

interface WifiWizardProps {
  apiBase: string;
  onClose: () => void;
  initialData?: { clientId: number; clientName: string; step: number };
}

type WizardStep = 0 | 1 | 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Buscar' },
  { label: 'Configurar' },
  { label: 'Resultado' },
];

const WIFI_MODELS = ['ZTEF6600P', 'ZXHNF600P'];
function isWifiModel(m: string) {
  return WIFI_MODELS.includes(String(m).toUpperCase().replace(/[- ]/g, ''));
}

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
              ${active ? 'bg-[#1e3a8a] text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
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

function TextInput({ value, onChange, placeholder, monospace }: {
  value: string; onChange: (v: string) => void; placeholder?: string; monospace?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800
        focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors
        ${monospace ? 'font-mono' : ''}`} />
  );
}

function PasswordInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 pr-9 text-sm text-gray-800
          focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors" />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WifiWizard({ apiBase, onClose, initialData }: WifiWizardProps) {
  const { logStep, updateResume, completeSession } = useWizardLogger(apiBase, 'wifi');

  const [step, setStep] = useState<WizardStep>((initialData?.step ?? 0) as WizardStep);

  // Step 0: search
  const [searchNombre, setSearchNombre] = useState('');
  const [searchRut, setSearchRut] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ClientResult[] | null>(null);
  const [searchError, setSearchError] = useState('');

  // Step 1: prepare + form
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(
    initialData ? { id_servicio: initialData.clientId, servicio: initialData.clientName } : null
  );
  const [currentOnu, setCurrentOnu] = useState<CurrentOnu | null>(null);
  const [manualSn, setManualSn] = useState('');
  const [loadingPrepare, setLoadingPrepare] = useState(false);
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');

  // Step 2: result
  const [applying, setApplying] = useState(false);
  const [wifiResults, setWifiResults] = useState<string[]>([]);
  const [wifiOk, setWifiOk] = useState(false);

  // Resume: trigger prepare when initialData lands on step 1
  useEffect(() => {
    if (initialData && initialData.step === 1 && initialData.clientId) {
      setLoadingPrepare(true);
      apiCall(apiBase, '/wizard/change-onu/prepare', {
        method: 'POST',
        body: JSON.stringify({ clientId: initialData.clientId }),
      }).then(r => r.json()).then(data => {
        if (data.ok && data.currentOnu) {
          setCurrentOnu(data.currentOnu);
          setManualSn(data.currentOnu.sn || '');
        }
      }).catch(() => {}).finally(() => setLoadingPrepare(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Select client → prepare (get ONU info)
  const handleSelectClient = useCallback(async (client: ClientResult) => {
    setSelectedClient(client);
    setCurrentOnu(null);
    setManualSn('');
    setLoadingPrepare(true);
    setStep(1);
    const name = clientFullName(client);
    logStep('client-select', 'Cliente seleccionado', 'ok', {
      inputData: { clientId: client.id_servicio, name },
    });
    updateResume({ step: 1, clientId: client.id_servicio }, { clientId: client.id_servicio, clientName: name });
    try {
      const res = await apiCall(apiBase, '/wizard/change-onu/prepare', {
        method: 'POST',
        body: JSON.stringify({ clientId: client.id_servicio }),
      });
      const data = await res.json();
      if (data.ok && data.currentOnu) {
        setCurrentOnu(data.currentOnu);
        setManualSn(data.currentOnu.sn || '');
      }
    } catch {
      // currentOnu stays null → user can enter SN manually
    } finally {
      setLoadingPrepare(false);
    }
  }, [apiBase, logStep, updateResume]);

  // ── Apply WiFi
  const handleApply = useCallback(async () => {
    const snToUse = currentOnu?.sn || manualSn;
    if (!snToUse || !ssid || pass.length < 8) return;
    setApplying(true);
    try {
      const res = await apiCall(apiBase, '/wizard/auth/wifi', {
        method: 'POST',
        body: JSON.stringify({ sn: snToUse, ssid, pass }),
      });
      const data = await res.json();
      const results: string[] = data.results || [];
      const ok = data.ok && results.some((r: string) => r.startsWith('✅'));
      setWifiResults(results);
      setWifiOk(ok);
      logStep('wifi-apply', 'WiFi aplicado', ok ? 'ok' : 'error', {
        inputData: { sn: snToUse, ssid },
        outputData: { results },
      });
      if (ok && selectedClient) {
        completeSession(`WiFi actualizado para ${clientFullName(selectedClient)}`);
      }
    } catch (e: any) {
      setWifiResults([`❌ Error de conexión: ${e.message}`]);
      setWifiOk(false);
      logStep('wifi-apply', 'WiFi aplicado', 'error', { errorMsg: e.message });
    } finally {
      setApplying(false);
      setStep(2);
    }
  }, [apiBase, currentOnu, manualSn, ssid, pass, selectedClient, logStep, completeSession]);

  const reset = useCallback(() => {
    setStep(0); setSelectedClient(null); setCurrentOnu(null); setManualSn('');
    setSearchResults(null); setSearchNombre(''); setSearchRut(''); setSearchError('');
    setSsid(''); setPass(''); setWifiResults([]); setWifiOk(false);
  }, []);

  const effectiveSn = currentOnu?.sn || manualSn;
  const wifiCapable = currentOnu ? isWifiModel(currentOnu.model) : true; // if manual, allow
  const canApply = !!effectiveSn && !!ssid.trim() && pass.length >= 8 && wifiCapable;

  // -------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-[#1e3a8a]/10 rounded-lg flex items-center justify-center">
            <Wifi className="size-4 text-[#1e3a8a]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Cambio de WiFi</h2>
            {selectedClient && (
              <p className="text-xs text-gray-400">{clientFullName(selectedClient)} · {selectedClient.plan_internet || selectedClient.servicio || ''}</p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <X className="size-4" />
        </button>
      </div>

      {/* Apply overlay */}
      {applying && (
        <div className="absolute inset-0 z-50 bg-white/80 flex flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 animate-spin text-orange-400" />
          <p className="text-sm font-medium text-gray-600">Aplicando configuración WiFi...</p>
          <p className="text-xs text-gray-400">Configurando 2.4GHz y 5GHz</p>
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
                      <p className="text-xs text-gray-400 mt-0.5">Solo ONUs ZTE F6600P y ZTE F600P son compatibles</p>
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
                        className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white w-full sm:w-auto">
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
                              className="w-full text-left px-4 py-3 hover:bg-[#1e3a8a]/5 transition-colors group">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#1e3a8a]">{clientFullName(client)}</span>
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
                                <ChevronRight className="size-4 text-gray-300 group-hover:text-[#1e3a8a] flex-shrink-0" />
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

            {/* ── Step 1: configure WiFi ── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  {loadingPrepare ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <Loader2 className="size-7 animate-spin text-orange-400" />
                      <p className="text-sm text-gray-400">Buscando ONU del cliente...</p>
                    </div>
                  ) : (
                    <>
                      {/* ONU info card */}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">ONU del cliente</h3>
                          {currentOnu && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border
                              ${isWifiModel(currentOnu.model)
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-red-50 text-red-700 border-red-200'}`}>
                              {isWifiModel(currentOnu.model) ? '✓ Compatible WiFi' : '✗ No compatible'}
                            </span>
                          )}
                        </div>

                        {currentOnu ? (
                          <div className="p-4 grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-gray-400 mb-0.5">SN</p>
                              <p className="text-sm font-mono font-semibold text-gray-800">{currentOnu.sn || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 mb-0.5">Modelo</p>
                              <p className="text-sm font-medium text-gray-800">{currentOnu.model || '—'}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 space-y-3">
                            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                              <AlertCircle className="size-3.5 flex-shrink-0" />
                              No se encontró la ONU automáticamente (sin IP registrada o sin snapshot en SmartOLT). Ingresa el SN manualmente.
                            </div>
                            <FieldGroup label="SN de la ONU">
                              <TextInput value={manualSn} onChange={setManualSn} placeholder="ZTEGC..." monospace />
                            </FieldGroup>
                          </div>
                        )}
                      </div>

                      {/* Incompatible model warning */}
                      {currentOnu && !isWifiModel(currentOnu.model) && (
                        <div className="flex items-start gap-2 px-3 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                          <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">Modelo no compatible</p>
                            <p className="text-xs mt-0.5">El modelo <strong>{currentOnu.model}</strong> no admite configuración WiFi remota. Solo los modelos ZTE F6600P y ZTE F600P son compatibles.</p>
                          </div>
                        </div>
                      )}

                      {/* WiFi form — only if compatible or manual */}
                      {(!currentOnu || isWifiModel(currentOnu.model)) && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Nueva configuración WiFi</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Se aplicará en 2.4GHz y 5GHz ({effectiveSn ? `SN: ${effectiveSn}` : 'sin SN'})</p>
                          </div>
                          <div className="p-4 space-y-4">
                            <FieldGroup label="Nombre de red (SSID) *">
                              <TextInput value={ssid} onChange={setSsid} placeholder="Mi Red WiFi" />
                            </FieldGroup>
                            <FieldGroup label={`Contraseña * ${pass.length > 0 && pass.length < 8 ? '— mínimo 8 caracteres' : ''}`}>
                              <PasswordInput value={pass} onChange={setPass} placeholder="Mínimo 8 caracteres" />
                            </FieldGroup>
                            {ssid && pass.length >= 8 && (
                              <div className="p-3 bg-[#1e3a8a]/5 border border-[#1e3a8a]/15 rounded-lg text-xs text-gray-600 space-y-0.5">
                                <p><span className="font-medium">2.4GHz SSID:</span> {ssid}</p>
                                <p><span className="font-medium">5GHz SSID:</span> {ssid}_5G</p>
                                <p><span className="font-medium">Contraseña:</span> {'•'.repeat(pass.length)}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 2: result ── */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className={`rounded-xl border p-4 ${wifiOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-start gap-2 mb-3">
                      {wifiOk
                        ? <CheckCircle2 className="size-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        : <AlertCircle className="size-4 text-amber-600 flex-shrink-0 mt-0.5" />}
                      <p className={`text-sm font-semibold ${wifiOk ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {wifiOk ? 'WiFi configurado correctamente' : 'Resultado parcial o con errores'}
                      </p>
                    </div>
                    <div className="ml-6 space-y-1">
                      {wifiResults.map((r, i) => <p key={i} className="text-sm text-gray-700">{r}</p>)}
                    </div>
                  </div>

                  {wifiOk && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Datos configurados</p>
                      <div className="flex gap-2 text-sm">
                        <span className="text-gray-400 w-24 flex-shrink-0">SSID 2.4GHz</span>
                        <span className="font-medium text-gray-800">{ssid}</span>
                      </div>
                      <div className="flex gap-2 text-sm">
                        <span className="text-gray-400 w-24 flex-shrink-0">SSID 5GHz</span>
                        <span className="font-medium text-gray-800">{ssid}_5G</span>
                      </div>
                      <div className="flex gap-2 text-sm">
                        <span className="text-gray-400 w-24 flex-shrink-0">Contraseña</span>
                        <span className="font-mono text-gray-800">{pass}</span>
                      </div>
                      <div className="flex gap-2 text-sm">
                        <span className="text-gray-400 w-24 flex-shrink-0">SN ONU</span>
                        <span className="font-mono text-gray-800">{effectiveSn}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={onClose} className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">Finalizar</Button>
                    <Button variant="outline" onClick={reset}>
                      <RefreshCw className="size-3.5 mr-1.5" />Nuevo cambio
                    </Button>
                  </div>
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
            else setStep(0);
          }} className="text-gray-600">
            {step === 0 ? 'Cancelar' : '← Anterior'}
          </Button>

          {step === 0 && (
            <span className="text-xs text-gray-400">
              {searchResults !== null ? `${searchResults.length} resultado(s)` : 'Busca por nombre o RUT'}
            </span>
          )}

          {step === 1 && !loadingPrepare && (
            <Button size="sm" disabled={!canApply || applying} onClick={handleApply}
              className="bg-[#f5831f] hover:bg-[#f5831f]/90 text-white font-semibold">
              {applying ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Wifi className="size-3.5 mr-1.5" />}
              Aplicar WiFi
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
