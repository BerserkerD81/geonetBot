import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, X, Search, Loader2, AlertCircle,
  RefreshCw, Wifi, ChevronRight, ArrowLeftRight, Eye, EyeOff
} from 'lucide-react';
import { Button } from './ui/button';
import { SignalPanel } from './SignalPanel';
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

interface CurrentOnu {
  sn: string;
  model: string;
  externalId: string;
}

interface UnconfiguredOnu {
  sn: string;
  oltId: string;
  oltName: string;
  ponType: string;
  port: string;
  model: string;
}

interface PrepareResponse {
  ok: boolean;
  client: ClientResult;
  currentOnu: CurrentOnu | null;
  unconfiguredOnus: UnconfiguredOnu[];
  onuTypes: string[];
}

interface ChangeOnuWizardProps {
  apiBase: string;
  onClose: () => void;
  initialData?: { clientId: number; clientName: string; step: number };
}

type WizardStep = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Buscar' },
  { label: 'Configurar' },
  { label: 'Confirmar' },
  { label: 'Resultado' },
];

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

function SelectInput({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors disabled:bg-gray-50 disabled:text-gray-400">
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TextInput({ value, onChange, placeholder, readOnly, monospace }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; monospace?: boolean;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors
        ${readOnly ? 'bg-gray-50 text-gray-400 cursor-default' : ''}
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
        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 pr-9 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors" />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-32 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm font-medium break-all ${highlight ? 'text-[#1e3a8a] font-semibold' : 'text-gray-800'}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
      ${ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {ok ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
      {label}
    </span>
  );
}



// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChangeOnuWizard({ apiBase, onClose, initialData }: ChangeOnuWizardProps) {
  const { logStep, updateResume, completeSession } = useWizardLogger(apiBase, 'change-onu');

  const [step, setStep] = useState<WizardStep>((initialData?.step ?? 0) as WizardStep);

  // Step 0: search
  const [searchNombre, setSearchNombre] = useState('');
  const [searchRut, setSearchRut] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ClientResult[] | null>(null);
  const [searchError, setSearchError] = useState('');

  // Step 1: prepare
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(
    initialData ? { id_servicio: initialData.clientId, servicio: initialData.clientName } : null
  );
  const [prepareData, setPrepareData] = useState<PrepareResponse | null>(null);
  const [loadingPrepare, setLoadingPrepare] = useState(false);
  const [newSn, setNewSn] = useState('');
  const [newModel, setNewModel] = useState('');
  const [selectedOnuIdx, setSelectedOnuIdx] = useState<number | null>(null);

  const [refreshingOnus, setRefreshingOnus] = useState(false);
  const [signalRefreshKey, setSignalRefreshKey] = useState(0);

  // Step 2: submitting
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean; results: string[]; wifiRequired: boolean; newSn: string; newModel: string; error?: string;
  } | null>(null);

  // Step 3: WiFi via TR069 + GenieACS
  const [applyingWifi, setApplyingWifi] = useState(false);
  const [wifiDone, setWifiDone] = useState(false);
  const [wifiResults, setWifiResults] = useState<string[]>([]);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');

  // Step 3: background GenieACS task
  const [genieTaskQueued, setGenieTaskQueued] = useState(false);
  const [genieTaskStatus, setGenieTaskStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [genieTaskAttempts, setGenieTaskAttempts] = useState(0);
  const [genieTaskResults, setGenieTaskResults] = useState<string[]>([]);

  // Resume: trigger prepare when initialData lands on step 1
  useEffect(() => {
    if (initialData && initialData.step >= 1 && initialData.clientId) {
      setLoadingPrepare(true);
      apiCall(apiBase, '/wizard/change-onu/prepare', {
        method: 'POST',
        body: JSON.stringify({ clientId: initialData.clientId }),
      }).then(r => r.json()).then((data: PrepareResponse) => {
        if (data.ok) {
          setPrepareData(data);
          if (data.currentOnu?.sn) setNewSn(data.currentOnu.sn);
          if (data.currentOnu?.model) setNewModel(data.currentOnu.model);
        }
      }).catch(() => {}).finally(() => setLoadingPrepare(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Search handler
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

  // ── Select client → prepare
  const handleSelectClient = useCallback(async (client: ClientResult) => {
    setSelectedClient(client);
    setLoadingPrepare(true);
    setNewSn('');
    setNewModel('');
    setSelectedOnuIdx(null);
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
      const data: PrepareResponse = await res.json();
      if (!data.ok) throw new Error('Error cargando datos');
      setPrepareData(data);
      if (data.currentOnu?.sn) setNewSn(data.currentOnu.sn);
      if (data.currentOnu?.model) setNewModel(data.currentOnu.model);
    } catch (e) {
      setPrepareData(null);
    } finally {
      setLoadingPrepare(false);
    }
  }, [apiBase, logStep, updateResume]);

  // ── Pick unconfigured ONU → auto-fill new SN
  const handlePickOnu = useCallback((onu: UnconfiguredOnu, idx: number) => {
    setSelectedOnuIdx(idx);
    setNewSn(onu.sn);
  }, []);

  // ── Refresh unconfigured ONUs from backend
  const handleRefreshOnus = useCallback(async () => {
    if (!selectedClient) return;
    setRefreshingOnus(true);
    try {
      const res = await apiCall(apiBase, '/wizard/change-onu/prepare', {
        method: 'POST',
        body: JSON.stringify({ clientId: selectedClient.id_servicio }),
      });
      const data: PrepareResponse = await res.json();
      if (data.ok) {
        setPrepareData((prev: PrepareResponse | null) => prev ? { ...prev, unconfiguredOnus: data.unconfiguredOnus } : data);
        setSignalRefreshKey((k: number) => k + 1);
      }
    } catch { /* silent */ }
    finally {
      setRefreshingOnus(false);
    }
  }, [apiBase, selectedClient]);

  // ── Submit ONU change
  const handleSubmit = useCallback(async () => {
    if (!selectedClient || !prepareData) return;
    setSubmitting(true);
    logStep('onu-confirm', 'Cambio de ONU confirmado', 'ok', {
      inputData: { oldSn: prepareData.currentOnu?.sn, newSn, newModel },
    });
    try {
      const res = await apiCall(apiBase, '/wizard/change-onu/submit', {
        method: 'POST',
        body: JSON.stringify({
          clientId: selectedClient.id_servicio,
          onuExternalId: prepareData.currentOnu?.externalId || '',
          oldSn: prepareData.currentOnu?.sn || '',
          oldModel: prepareData.currentOnu?.model || '',
          newSn,
          newModel,
        }),
      });
      const data = await res.json();
      const result = {
        ok: data.ok,
        results: data.results || [],
        wifiRequired: data.wifiRequired || false,
        newSn: data.newSn || newSn,
        newModel: data.newModel || newModel,
        error: data.error,
      };
      setSubmitResult(result);
      logStep('onu-change', 'ONU cambiada', data.ok ? 'ok' : 'error', {
        outputData: { results: result.results },
        errorMsg: data.error,
      });
      if (!data.wifiRequired && data.ok) {
        completeSession(`ONU cambiada a ${newSn} para ${clientFullName(selectedClient)}`);
      }
      setStep(3);
    } catch (e: any) {
      setSubmitResult({ ok: false, results: [], wifiRequired: false, newSn, newModel, error: e.message });
      logStep('onu-change', 'ONU cambiada', 'error', { errorMsg: e.message });
      setStep(3);
    } finally {
      setSubmitting(false);
    }
  }, [apiBase, selectedClient, prepareData, newSn, newModel, logStep, completeSession]);

  // ── Apply TR069 + disable SmartOLT WiFi + GenieACS SSID/pass
  const handleApplyWifi = useCallback(async () => {
    const sn = submitResult?.newSn || newSn;
    if (!sn || !wifiSsid || !wifiPass) return;
    setApplyingWifi(true);
    try {
      const res = await apiCall(apiBase, '/wizard/auth/wifi', {
        method: 'POST',
        body: JSON.stringify({ sn, ssid: wifiSsid, pass: wifiPass, clientIp: selectedClient?.ip }),
      });
      const data = await res.json();
      const results: string[] = data.results || [];
      const ok = data.ok && results.some((r: string) => r.startsWith('✅'));
      setWifiResults(results);
      setWifiDone(true);
      if (data.genieTaskQueued) {
        setGenieTaskQueued(true);
        setGenieTaskStatus('pending');
        setGenieTaskAttempts(0);
        setGenieTaskResults([]);
      }
      logStep('wifi-genieacs', 'TR069 + WiFi SmartOLT + GenieACS', ok || data.genieTaskQueued ? 'ok' : 'error', {
        inputData: { sn, ssid: wifiSsid, clientIp: selectedClient?.ip },
        outputData: { results },
      });
      if (ok && !data.genieTaskQueued && selectedClient) {
        completeSession(`ONU cambiada y WiFi configurado para ${clientFullName(selectedClient)}`);
      }
    } catch (e: any) {
      setWifiResults([`❌ Error: ${e.message}`]);
      setWifiDone(true);
      logStep('wifi-genieacs', 'TR069 + WiFi SmartOLT + GenieACS', 'error', { errorMsg: e.message });
    } finally {
      setApplyingWifi(false);
    }
  }, [apiBase, submitResult, newSn, wifiSsid, wifiPass, selectedClient, logStep, completeSession]);

  const reset = useCallback(() => {
    setStep(0); setSelectedClient(null); setPrepareData(null);
    setSearchResults(null); setSearchNombre(''); setSearchRut('');
    setNewSn(''); setNewModel(''); setSelectedOnuIdx(null);
    setSubmitResult(null); setWifiDone(false); setWifiResults([]); setWifiSsid(''); setWifiPass('');
    setGenieTaskQueued(false); setGenieTaskStatus('pending'); setGenieTaskAttempts(0); setGenieTaskResults([]);
  }, []);

  const currentOnu = prepareData?.currentOnu;
  const unconfiguredOnus = prepareData?.unconfiguredOnus || [];
  const onuTypes = prepareData?.onuTypes || [];
  const canProceedFromStep1 = !!newSn && !!newModel && !!currentOnu?.externalId;

  // Poll background GenieACS task
  useEffect(() => {
    if (!genieTaskQueued || genieTaskStatus !== 'pending') return;
    const sn = submitResult?.newSn || newSn;
    if (!sn) return;
    const id = setInterval(async () => {
      try {
        const res = await apiCall(apiBase, `/wizard/auth/wifi/task-status?sn=${encodeURIComponent(sn)}`);
        const data = await res.json();
        if (data.task) {
          setGenieTaskAttempts(data.task.attempts);
          setGenieTaskResults(data.task.results || []);
          if (data.task.status !== 'pending') {
            setGenieTaskStatus(data.task.status);
            if (data.task.status === 'success' && selectedClient) {
              completeSession(`ONU cambiada y WiFi configurado para ${clientFullName(selectedClient)}`);
            }
          }
        }
      } catch {}
    }, 10_000);
    return () => clearInterval(id);
  }, [genieTaskQueued, genieTaskStatus, submitResult?.newSn, newSn, apiBase, selectedClient, completeSession]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-[#1e3a8a]/10 rounded-lg flex items-center justify-center">
            <ArrowLeftRight className="size-4 text-[#1e3a8a]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Cambio de ONU</h2>
            {selectedClient && (
              <p className="text-xs text-gray-400">{clientFullName(selectedClient)} · {selectedClient.plan_internet || selectedClient.servicio || ''}</p>
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
          <Loader2 className="size-8 animate-spin text-orange-400" />
          <p className="text-sm font-medium text-gray-600">Ejecutando cambio de ONU...</p>
          <p className="text-xs text-gray-400">Actualizando SmartOLT y Geonet</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-6">
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
                        className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white w-full sm:w-auto">
                        {searching ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Buscando...</> : <><Search className="size-3.5 mr-1.5" />Buscar</>}
                      </Button>
                    </div>
                  </div>

                  {searchError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      <AlertCircle className="size-3.5 flex-shrink-0" />
                      {searchError}
                    </div>
                  )}

                  {searchResults !== null && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          {searchResults.length ? `${searchResults.length} resultado(s)` : 'Sin resultados'}
                        </h3>
                      </div>
                      {searchResults.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">No se encontraron clientes. Intenta con otro nombre o RUT.</div>
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

            {/* ── Step 1: configure ── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                {loadingPrepare ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="size-7 animate-spin text-orange-400" />
                    <p className="text-sm text-gray-400">Cargando datos de ONU y SmartOLT...</p>
                  </div>
                ) : !prepareData ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <AlertCircle className="size-7 text-red-400" />
                    <p className="text-sm text-gray-500">No se pudieron cargar los datos.</p>
                    <Button variant="outline" size="sm" onClick={() => setStep(0)}>Volver</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Current ONU */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">ONU Actual (SmartOLT)</h3>
                      </div>
                      {currentOnu ? (
                        <div className="p-4 grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">SN actual</p>
                            <p className="text-sm font-mono font-semibold text-gray-800">{currentOnu.sn || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Modelo</p>
                            <p className="text-sm font-medium text-gray-800">{currentOnu.model || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">External ID</p>
                            <p className="text-xs font-mono text-gray-500 truncate">{currentOnu.externalId || '—'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4">
                          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <AlertCircle className="size-3.5 flex-shrink-0" />
                            No se encontró ONU en SmartOLT por IP ({selectedClient?.ip || 'sin IP'}). El External ID es obligatorio para ejecutar el cambio.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Unconfigured ONUs picker */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">ONUs sin asignar — selecciona para autocompletar SN nuevo</h3>
                        <button onClick={handleRefreshOnus} disabled={refreshingOnus}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e3a8a] transition-colors disabled:opacity-40">
                          <RefreshCw className={`size-3 ${refreshingOnus ? 'animate-spin' : ''}`} />
                          Actualizar
                        </button>
                      </div>
                      <div className="p-3 flex flex-wrap gap-2">
                        {unconfiguredOnus.length === 0 ? (
                          <p className="text-xs text-gray-400 px-1 py-0.5">No hay ONUs sin asignar. Presiona Actualizar para buscar.</p>
                        ) : unconfiguredOnus.map((onu, idx) => (
                          <button key={idx} onClick={() => handlePickOnu(onu, idx)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all
                              ${selectedOnuIdx === idx ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#1e3a8a]/40 hover:bg-[#1e3a8a]/5'}`}>
                            <span className="font-semibold">{onu.sn}</span>
                            <span className="ml-1.5 opacity-60">{onu.oltName} · P{onu.port}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* New ONU form */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Nueva ONU</h3>
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FieldGroup label="SN nuevo *">
                          <TextInput value={newSn} onChange={setNewSn} placeholder="ZTEGC..." monospace />
                        </FieldGroup>
                        <FieldGroup label="Modelo nuevo *">
                          {onuTypes.length > 0
                            ? <SelectInput value={newModel} onChange={setNewModel} options={onuTypes} placeholder="Seleccionar..." />
                            : <TextInput value={newModel} onChange={setNewModel} placeholder="Ej: ZTE-F660" />}
                        </FieldGroup>
                      </div>
                    </div>

                    {!currentOnu?.externalId && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                        <AlertCircle className="size-3.5 flex-shrink-0" />
                        No se encontró el External ID de la ONU actual. Sin este dato no es posible ejecutar el cambio en SmartOLT.
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 2: confirm ── */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Resumen de Cambio</h3>
                      {selectedClient && <p className="text-xs text-gray-400 mt-0.5">Cliente: {clientFullName(selectedClient)}</p>}
                    </div>
                    <div className="px-4 py-2">
                      <SummaryRow label="SN antiguo" value={currentOnu?.sn || '—'} />
                      <SummaryRow label="Modelo antiguo" value={currentOnu?.model || '—'} />
                      <SummaryRow label="External ID" value={currentOnu?.externalId || '—'} />
                      <SummaryRow label="SN nuevo" value={newSn} highlight />
                      <SummaryRow label="Modelo nuevo" value={newModel} highlight />
                      {selectedClient?.ip && <SummaryRow label="IP cliente" value={selectedClient.ip} />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                    <AlertCircle className="size-3.5 flex-shrink-0" />
                    Esta acción cambiará el tipo y SN en SmartOLT y actualizará el equipo en Geonet.
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: result + optional WiFi ── */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  {/* Result summary */}
                  <div className={`rounded-xl border p-4 ${submitResult?.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-start gap-2 mb-2">
                      {submitResult?.ok
                        ? <CheckCircle2 className="size-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        : <AlertCircle className="size-4 text-red-500 flex-shrink-0 mt-0.5" />}
                      <p className={`text-sm font-semibold ${submitResult?.ok ? 'text-emerald-800' : 'text-red-800'}`}>
                        {submitResult?.ok ? 'Cambio de ONU ejecutado' : 'Error en el cambio de ONU'}
                      </p>
                    </div>
                    <div className="space-y-0.5 ml-6">
                      {submitResult?.results.map((r, i) => <p key={i} className="text-sm text-gray-700">{r}</p>)}
                      {submitResult?.error && <p className="text-sm text-red-700">{submitResult.error}</p>}
                    </div>
                  </div>

                  {/* Signal level */}
                  {submitResult?.ok && selectedClient && (
                    <SignalPanel
                      apiBase={apiBase}
                      clientId={selectedClient.id_servicio}
                      sn={submitResult.newSn}
                      refreshTrigger={signalRefreshKey}
                    />
                  )}

                  {/* TR069 + WiFi disable — always shown after successful change */}
                  {submitResult?.ok && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">WiFi vía TR069 (GenieACS)</h3>
                          <p className="text-xs text-gray-400 mt-0.5">{submitResult.newModel} · SN: {submitResult.newSn}</p>
                        </div>
                        {wifiDone && (
                          <StatusBadge
                            ok={wifiResults.some(r => r.startsWith('✅'))}
                            label={wifiResults.some(r => r.startsWith('✅')) ? 'Listo' : 'Error'}
                          />
                        )}
                      </div>
                      <div className="p-4">
                        {!wifiDone ? (
                          <div className="space-y-3">
                            <FieldGroup label="SSID (nombre de red)">
                              <TextInput value={wifiSsid} onChange={setWifiSsid} placeholder="Mi Red WiFi" />
                            </FieldGroup>
                            <FieldGroup label="Contraseña">
                              <PasswordInput value={wifiPass} onChange={setWifiPass} placeholder="Mínimo 8 caracteres" />
                            </FieldGroup>
                            <div className="flex gap-2">
                              <Button size="sm" disabled={applyingWifi || !wifiSsid || !wifiPass} onClick={handleApplyWifi}
                                className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">
                                {applyingWifi
                                  ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Configurando...</>
                                  : <><Wifi className="size-3.5 mr-1.5" />Configurar WiFi</>}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => {
                                setWifiDone(true);
                                logStep('wifi-genieacs', 'WiFi saltado', 'skipped', {});
                                if (selectedClient) completeSession(`ONU cambiada para ${clientFullName(selectedClient)}`);
                              }} className="text-gray-500">Saltar</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              {wifiResults.map((r, i) => <p key={i} className="text-sm text-gray-700">{r}</p>)}
                              {!wifiResults.length && <p className="text-sm text-gray-400 italic">Saltado</p>}
                            </div>
                            {genieTaskQueued && (
                              <div className={`rounded-lg border px-3 py-2.5 flex items-start gap-2 ${
                                genieTaskStatus === 'pending' ? 'bg-blue-50 border-blue-200 text-blue-800'
                                : genieTaskStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                              }`}>
                                {genieTaskStatus === 'pending'
                                  ? <Loader2 className="size-4 animate-spin flex-shrink-0 mt-0.5" />
                                  : genieTaskStatus === 'success'
                                    ? <CheckCircle2 className="size-4 flex-shrink-0 mt-0.5" />
                                    : <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />}
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">
                                    {genieTaskStatus === 'pending'
                                      ? `Esperando registro TR069... (intento ${genieTaskAttempts}/28)`
                                      : genieTaskStatus === 'success'
                                        ? 'WiFi configurado correctamente por GenieACS'
                                        : 'No se pudo configurar WiFi automáticamente'}
                                  </p>
                                  {genieTaskResults.map((r, i) => <p key={i} className="text-xs mt-0.5 opacity-80">{r}</p>)}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Finish buttons */}
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
      {step < 3 && (
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-t border-gray-200">
          <Button variant="outline" size="sm" onClick={() => {
            if (step === 0) onClose();
            else if (step === 1) setStep(0);
            else setStep((step - 1) as WizardStep);
          }} className="text-gray-600">
            {step === 0 ? 'Cancelar' : '← Anterior'}
          </Button>

          {step === 0 && (
            <span className="text-xs text-gray-400">{searchResults !== null ? `${searchResults.length} resultado(s)` : 'Busca por nombre o RUT'}</span>
          )}
          {step === 1 && (
            <Button size="sm" disabled={!canProceedFromStep1 || loadingPrepare}
              onClick={() => setStep(2)}
              className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white disabled:opacity-50">
              Revisar resumen →
            </Button>
          )}
          {step === 2 && (
            <Button size="sm" disabled={submitting} onClick={handleSubmit}
              className="bg-[#f5831f] hover:bg-[#f5831f]/90 text-white font-semibold">
              {submitting ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              Ejecutar cambio
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
