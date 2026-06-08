import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, X, Search, Loader2, AlertCircle,
  Activity, ChevronRight, RefreshCw, RotateCcw, Zap,
  Signal, Clock, Ruler, Wifi,
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

interface OnuDetail {
  sn: string;
  model: string;
  externalId: string;
}

interface MonitorResult {
  statusSummary: string;
  rx: string;
  tx: string;
  signal1490?: string;
  signal1310?: string;
  signalValue?: string;
  onlineUptime?: string;
  distanceOltOnu?: string;
  runningConfig?: string;
  graphType: string;
  signalGraphUrl?: string;
  trafficGraphUrl?: string;
  failedApis: string[];
}

interface Quality {
  label: string;
  tone: string;
  detail?: string;
}

interface PrepareResponse {
  ok: boolean;
  client: { id: number; name: string; rut: string; ip: string; plan: string };
  onuDetail: OnuDetail | null;
  monitor: MonitorResult | null;
  quality: Quality | null;
  error?: string;
}

interface MonitorWizardProps {
  apiBase: string;
  onClose: () => void;
  initialData?: { clientId: number; clientName: string; step: number };
}

type WizardStep = 0 | 1;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [{ label: 'Buscar' }, { label: 'Monitor' }];

const GRAPH_PERIODS: { key: string; label: string }[] = [
  { key: 'hourly', label: 'Hora' },
  { key: 'daily', label: 'Día' },
  { key: 'weekly', label: 'Semana' },
  { key: 'monthly', label: 'Mes' },
  { key: 'yearly', label: 'Año' },
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

function qualityColor(label: string) {
  if (label === 'Excelente' || label === 'Buena') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (label === 'Regular') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (label === 'Mala') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-gray-500 bg-gray-100 border-gray-200';
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

function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800
        focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors" />
  );
}

function MetricRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  if (!value || value === 'N/D') return null;
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-shrink-0 mt-0.5 size-7 bg-[#1e3a8a]/8 rounded-lg flex items-center justify-center">
        <Icon className="size-3.5 text-[#1e3a8a]" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-semibold text-gray-800 leading-tight">{value}</p>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel, loading }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-5 max-w-xs w-full mx-4">
        <p className="text-sm font-semibold text-gray-800 mb-1">Confirmar acción</p>
        <p className="text-xs text-gray-500 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>Cancelar</Button>
          <Button size="sm" onClick={onConfirm} disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white">
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MonitorWizard({ apiBase, onClose, initialData }: MonitorWizardProps) {
  const { logStep, updateResume, completeSession } = useWizardLogger(apiBase, 'monitor');
  const actionTakenRef = useRef(false);

  const [step, setStep] = useState<WizardStep>((initialData?.step ?? 0) as WizardStep);

  // Step 0: search
  const [searchNombre, setSearchNombre] = useState('');
  const [searchRut, setSearchRut] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ClientResult[] | null>(null);
  const [searchError, setSearchError] = useState('');

  // Step 1: monitor
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(
    initialData ? { id_servicio: initialData.clientId, servicio: initialData.clientName } : null
  );
  const [prepareData, setPrepareData] = useState<PrepareResponse | null>(null);
  const [loadingMonitor, setLoadingMonitor] = useState(false);
  const [graphType, setGraphType] = useState('daily');
  const [loadingGraph, setLoadingGraph] = useState(false);

  // Actions
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [confirmResync, setConfirmResync] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; msg: string } | null>(null);

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

  // ── Select client → load monitor
  const loadMonitor = useCallback(async (clientId: number, gt: string) => {
    setLoadingMonitor(true);
    setPrepareData(null);
    try {
      const res = await apiCall(apiBase, '/wizard/monitor/prepare', {
        method: 'POST',
        body: JSON.stringify({ clientId, graphType: gt }),
      });
      const data: PrepareResponse = await res.json();
      setPrepareData(data);
      logStep('monitor-load', 'Datos de monitoreo cargados', data.ok ? 'ok' : 'error', {
        outputData: { statusSummary: data.monitor?.statusSummary, quality: data.quality?.label, failedApis: data.monitor?.failedApis },
        errorMsg: data.error,
      });
    } catch (e: any) {
      setPrepareData({ ok: false, client: {} as any, onuDetail: null, monitor: null, quality: null, error: e.message });
      logStep('monitor-load', 'Datos de monitoreo cargados', 'error', { errorMsg: e.message });
    } finally {
      setLoadingMonitor(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  // Resume: auto-load monitor when resuming to step 1
  useEffect(() => {
    if (initialData?.step === 1 && initialData.clientId) {
      loadMonitor(initialData.clientId, 'daily');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectClient = useCallback(async (client: ClientResult) => {
    setSelectedClient(client);
    setActionResult(null);
    setStep(1);
    const name = clientFullName(client);
    logStep('client-select', 'Cliente seleccionado', 'ok', {
      inputData: { clientId: client.id_servicio, name },
    });
    updateResume({ step: 1, clientId: client.id_servicio }, { clientId: client.id_servicio, clientName: name });
    await loadMonitor(client.id_servicio, graphType);
  }, [graphType, loadMonitor, logStep, updateResume]);

  // ── Change graph period
  const handleGraphType = useCallback(async (gt: string) => {
    setGraphType(gt);
    if (!selectedClient || !prepareData?.onuDetail) return;
    setLoadingGraph(true);
    try {
      const res = await apiCall(apiBase, '/wizard/monitor/prepare', {
        method: 'POST',
        body: JSON.stringify({ clientId: selectedClient.id_servicio, graphType: gt }),
      });
      const data: PrepareResponse = await res.json();
      setPrepareData(data);
    } catch {
      // keep current data
    } finally {
      setLoadingGraph(false);
    }
  }, [apiBase, selectedClient, prepareData]);

  // ── Refresh (re-load monitor)
  const handleRefresh = useCallback(async () => {
    if (!selectedClient) return;
    setActionResult(null);
    await loadMonitor(selectedClient.id_servicio, graphType);
  }, [selectedClient, graphType, loadMonitor]);

  // ── Reboot
  const handleReboot = useCallback(async () => {
    if (!prepareData?.onuDetail?.externalId) return;
    setRebooting(true);
    setConfirmReboot(false);
    try {
      const res = await apiCall(apiBase, '/wizard/monitor/reboot', {
        method: 'POST',
        body: JSON.stringify({ onuExternalId: prepareData.onuDetail.externalId }),
      });
      const data = await res.json();
      const ok = !!data.ok;
      setActionResult({ ok, msg: ok ? '✅ Reboot enviado. La ONU se reiniciará en breve.' : `❌ ${data.error || 'Error al reiniciar'}` });
      logStep('reboot', 'Reboot de ONU', ok ? 'ok' : 'error', {
        inputData: { externalId: prepareData.onuDetail.externalId },
        errorMsg: ok ? undefined : data.error,
      });
      if (ok && selectedClient && !actionTakenRef.current) {
        actionTakenRef.current = true;
        completeSession(`Reboot enviado a ONU de ${clientFullName(selectedClient)}`);
      }
    } catch (e: any) {
      setActionResult({ ok: false, msg: `❌ Error: ${e.message}` });
      logStep('reboot', 'Reboot de ONU', 'error', { errorMsg: e.message });
    } finally {
      setRebooting(false);
    }
  }, [apiBase, prepareData, selectedClient, logStep, completeSession]);

  // ── Resync
  const handleResync = useCallback(async () => {
    if (!prepareData?.onuDetail?.externalId) return;
    setResyncing(true);
    setConfirmResync(false);
    try {
      const res = await apiCall(apiBase, '/wizard/monitor/resync', {
        method: 'POST',
        body: JSON.stringify({ onuExternalId: prepareData.onuDetail.externalId }),
      });
      const data = await res.json();
      const ok = !!data.ok;
      setActionResult({ ok, msg: ok ? '✅ Resync enviado. La configuración se sincronizará.' : `❌ ${data.error || 'Error al resincronizar'}` });
      logStep('resync', 'Resync de ONU', ok ? 'ok' : 'error', {
        inputData: { externalId: prepareData.onuDetail.externalId },
        errorMsg: ok ? undefined : data.error,
      });
      if (ok && selectedClient && !actionTakenRef.current) {
        actionTakenRef.current = true;
        completeSession(`Resync enviado a ONU de ${clientFullName(selectedClient)}`);
      }
    } catch (e: any) {
      setActionResult({ ok: false, msg: `❌ Error: ${e.message}` });
      logStep('resync', 'Resync de ONU', 'error', { errorMsg: e.message });
    } finally {
      setResyncing(false);
    }
  }, [apiBase, prepareData, selectedClient, logStep, completeSession]);

  const reset = useCallback(() => {
    setStep(0); setSelectedClient(null); setPrepareData(null);
    setSearchResults(null); setSearchNombre(''); setSearchRut(''); setSearchError('');
    setGraphType('daily'); setActionResult(null);
  }, []);

  const monitor = prepareData?.monitor;
  const quality = prepareData?.quality;
  const onuDetail = prepareData?.onuDetail;

  // ── Derived image URLs
  const imgBase = apiBase.replace(/\/wizard.*$/, '').replace(/\/api\/?$/, '');
  const signalGraphSrc = monitor?.signalGraphUrl ? `${imgBase}${monitor.signalGraphUrl}` : undefined;
  const trafficGraphSrc = monitor?.trafficGraphUrl ? `${imgBase}${monitor.trafficGraphUrl}` : undefined;

  // -------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Confirmation dialogs */}
      {confirmReboot && (
        <ConfirmDialog
          message="¿Reiniciar la ONU? El cliente perderá conexión temporalmente."
          onConfirm={handleReboot}
          onCancel={() => setConfirmReboot(false)}
          loading={rebooting}
        />
      )}
      {confirmResync && (
        <ConfirmDialog
          message="¿Resincronizar configuración de la ONU en SmartOLT?"
          onConfirm={handleResync}
          onCancel={() => setConfirmResync(false)}
          loading={resyncing}
        />
      )}

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-[#1e3a8a]/10 rounded-lg flex items-center justify-center">
            <Activity className="size-4 text-[#1e3a8a]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Monitoreo de cliente</h2>
            {selectedClient && (
              <p className="text-xs text-gray-400">{clientFullName(selectedClient)} · {selectedClient.plan_internet || selectedClient.servicio || ''}</p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <X className="size-4" />
        </button>
      </div>

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

            {/* ── Step 1: monitor panel ── */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                {loadingMonitor ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Loader2 className="size-8 animate-spin text-orange-400" />
                    <p className="text-sm text-gray-400">Consultando SmartOLT...</p>
                  </div>
                ) : !prepareData?.ok ? (
                  <div className="flex items-center gap-2 px-3 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <AlertCircle className="size-4 flex-shrink-0" />
                    {prepareData?.error || 'Error al cargar datos del cliente'}
                  </div>
                ) : (
                  <div className="space-y-4">

                    {/* Client + ONU info */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Equipo del cliente</h3>
                        {quality && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${qualityColor(quality.label)}`}>
                            {quality.tone} {quality.label}
                          </span>
                        )}
                      </div>
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">Plan</p>
                          <p className="font-medium text-gray-800 truncate">{prepareData.client.plan || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">IP</p>
                          <p className="font-mono font-medium text-gray-800">{prepareData.client.ip || '—'}</p>
                        </div>
                        {onuDetail ? (
                          <>
                            <div>
                              <p className="text-xs text-gray-400 mb-0.5">SN ONU</p>
                              <p className="font-mono font-semibold text-gray-800 text-xs">{onuDetail.sn || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 mb-0.5">Modelo</p>
                              <p className="font-medium text-gray-800 text-xs">{onuDetail.model || '—'}</p>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 flex items-center gap-1.5 text-xs text-amber-600">
                            <AlertCircle className="size-3.5 flex-shrink-0" />
                            ONU no encontrada en SmartOLT
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Signal metrics */}
                    {monitor && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Señal y estado</h3>
                          {quality?.detail && <p className="text-xs text-gray-400 mt-0.5">{quality.detail}</p>}
                        </div>
                        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <MetricRow icon={Signal} label="RX (ONU)" value={monitor.signal1490 || monitor.rx} />
                          <MetricRow icon={Wifi} label="TX" value={monitor.tx} />
                          <MetricRow icon={Clock} label="Uptime" value={monitor.onlineUptime} />
                          <MetricRow icon={Ruler} label="Distancia OLT" value={monitor.distanceOltOnu} />
                        </div>
                        {monitor.statusSummary && monitor.statusSummary !== 'N/D' && (
                          <div className="px-4 pb-3">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">Estado</p>
                            <p className="text-xs text-gray-600 font-mono leading-relaxed line-clamp-3">{monitor.statusSummary}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Graphs */}
                    {onuDetail && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Gráficos</h3>
                          <div className="flex gap-1">
                            {GRAPH_PERIODS.map(p => (
                              <button key={p.key} onClick={() => handleGraphType(p.key)} disabled={loadingGraph}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors
                                  ${graphType === p.key
                                    ? 'bg-[#1e3a8a] text-white'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="p-4 space-y-4">
                          {loadingGraph ? (
                            <div className="flex items-center justify-center py-10 gap-2">
                              <Loader2 className="size-5 animate-spin text-orange-400" />
                              <span className="text-sm text-gray-400">Cargando gráficos...</span>
                            </div>
                          ) : (
                            <>
                              {signalGraphSrc ? (
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Señal óptica</p>
                                  <img src={signalGraphSrc} alt="Gráfico señal" className="w-full rounded-lg border border-gray-100" />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
                                  <AlertCircle className="size-3.5 flex-shrink-0" />
                                  Gráfico de señal no disponible
                                </div>
                              )}
                              {trafficGraphSrc && (
                                <div>
                                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Tráfico</p>
                                  <img src={trafficGraphSrc} alt="Gráfico tráfico" className="w-full rounded-lg border border-gray-100" />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Action result */}
                    {actionResult && (
                      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm
                        ${actionResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                        {actionResult.ok ? <CheckCircle2 className="size-4 flex-shrink-0" /> : <AlertCircle className="size-4 flex-shrink-0" />}
                        {actionResult.msg}
                      </div>
                    )}

                    {/* Actions */}
                    {onuDetail && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</h3>
                        </div>
                        <div className="p-4 flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loadingMonitor || rebooting || resyncing}>
                            <RefreshCw className={`size-3.5 mr-1.5 ${loadingMonitor ? 'animate-spin' : ''}`} />
                            Refrescar
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => { setActionResult(null); setConfirmResync(true); }}
                            disabled={loadingMonitor || rebooting || resyncing}>
                            <RotateCcw className="size-3.5 mr-1.5" />
                            Resync config
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => { setActionResult(null); setConfirmReboot(true); }}
                            disabled={loadingMonitor || rebooting || resyncing}
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300">
                            <Zap className="size-3.5 mr-1.5" />
                            Reiniciar ONU
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Failed APIs info */}
                    {monitor && monitor.failedApis.length > 0 && (
                      <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                        <AlertCircle className="size-3.5 flex-shrink-0 mt-0.5" />
                        <span>Algunos datos no están disponibles: {monitor.failedApis.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-t border-gray-200">
        <Button variant="outline" size="sm" onClick={() => {
          if (step === 0) onClose();
          else { setStep(0); setSelectedClient(null); setPrepareData(null); setActionResult(null); }
        }} className="text-gray-600">
          {step === 0 ? 'Cancelar' : '← Volver'}
        </Button>

        {step === 0 && (
          <span className="text-xs text-gray-400">
            {searchResults !== null ? `${searchResults.length} resultado(s)` : 'Busca por nombre o RUT'}
          </span>
        )}

        {step === 1 && !loadingMonitor && prepareData?.ok && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RefreshCw className="size-3.5 mr-1.5" />
            Otro cliente
          </Button>
        )}
      </div>
    </div>
  );
}
