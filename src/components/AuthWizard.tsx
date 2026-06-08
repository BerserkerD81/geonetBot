import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, ChevronRight, X, Search, Loader2, AlertCircle,
  MapPin, Server, Wifi, Zap, ExternalLink
} from 'lucide-react';
import { Button } from './ui/button';
import { ProcessingModal } from './ProcessingModal';
import { PhotoUploadPanel } from './FotosWizard';
import { useWizardLogger } from '../hooks/useWizardLogger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Installation {
  id: number;
  id_servicio?: number | null;
  nombre?: string | null;
  apellidos?: string | null;
  cedula?: string | null;
  servicio?: string | null;
  plan_internet?: string | null;
  zona?: string | null;
  direccion?: string | null;
  estado_instalacion?: string | null;
  sn_onu?: string | null;
  usuario?: string | null;
}

interface UnconfiguredOnu {
  sn: string;
  oltId: string;
  oltName: string;
  ponType: string;
  port: string;
  model: string;
}

interface OdbObject { id: string; name: string; }

interface PrepareResponse {
  ok: boolean;
  defaults: Record<string, any>;
  collected: Record<string, any>;
  options: Record<string, string[]>;
  unconfiguredOnus: UnconfiguredOnu[];
  oltAvailability: any[];
  odbObjects: OdbObject[];
}

interface FormData {
  sn: string; olt_id: string; pon_type: string; board: string; port: string;
  onu_type: string; onu_mode: string; vlan: string; zone: string;
  odb: string; odb_port: string; name: string; address_or_comment: string;
  download_speed_profile_name: string;
}

interface AuthWizardProps {
  apiBase: string;
  onClose: () => void;
  initialData?: { installationId: number; step: number; clientName?: string };
}

type WizardStep = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Instalación', icon: Server },
  { label: 'Configurar', icon: Wifi },
  { label: 'Autorizar', icon: CheckCircle2 },
  { label: 'Activar', icon: Zap },
];

const WIFI_MODELS = ['ZTEF6600P', 'ZXHNF600P'];

function isWifiModel(onuType: string) {
  return WIFI_MODELS.includes(String(onuType).toUpperCase().replace(/[- ]/g, ''));
}

function fullName(inst: Installation) {
  return `${inst.nombre || ''} ${inst.apellidos || ''}`.trim() || inst.servicio || `ID ${inst.id_servicio ?? inst.id}`;
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
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
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
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors disabled:bg-gray-50 disabled:text-gray-400"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TextInput({ value, onChange, placeholder, readOnly }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors
        ${readOnly ? 'bg-gray-50 text-gray-400 cursor-default' : ''}`}
    />
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-gray-800 break-all">{value}</span>
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

export function AuthWizard({ apiBase, onClose, initialData }: AuthWizardProps) {
  const { logStep, updateResume, completeSession } = useWizardLogger(apiBase, 'auth');

  const [step, setStep] = useState<WizardStep>((initialData?.step ?? 0) as WizardStep);

  // Step 0: installation list
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loadingInstalls, setLoadingInstalls] = useState(true);
  const [installSearch, setInstallSearch] = useState('');
  const [selectedInstall, setSelectedInstall] = useState<Installation | null>(null);

  // Step 1: form
  const [prepareData, setPrepareData] = useState<PrepareResponse | null>(null);
  const [loadingPrepare, setLoadingPrepare] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    sn: '', olt_id: '', pon_type: 'gpon', board: '', port: '',
    onu_type: '', onu_mode: 'Routing', vlan: '', zone: '', odb: '',
    odb_port: '', name: '', address_or_comment: '',
    download_speed_profile_name: '',
  });
  const [selectedOnuIdx, setSelectedOnuIdx] = useState<number | null>(null);

  // ODB list (dynamic, filtered by zone)
  const [odbOptions, setOdbOptions] = useState<string[]>([]);
  const [odbObjects, setOdbObjects] = useState<OdbObject[]>([]);
  const [loadingOdbs, setLoadingOdbs] = useState(false);

  // ODB ports
  const [odbPorts, setOdbPorts] = useState<string[]>([]);
  const [loadingOdbPorts, setLoadingOdbPorts] = useState(false);

  // Step 2: submit
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState('');
  const [authActions, setAuthActions] = useState<any[]>([]);

  // Step 3: post-auth
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [applyingWifi, setApplyingWifi] = useState(false);
  const [wifiDone, setWifiDone] = useState(false);
  const [wifiResults, setWifiResults] = useState<string[]>([]);
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{
    ok: boolean; activated: boolean; activationMsg: string;
    isPyme: boolean; usuario: string; contractUrl?: string; contractError?: string;
  } | null>(null);

  // Fetch installations on mount (skip if resuming directly to step 1)
  useEffect(() => {
    if (initialData?.step === 1) {
      setLoadingInstalls(false);
      return;
    }
    setLoadingInstalls(true);
    apiCall(apiBase, '/wizard/auth/installations')
      .then(r => r.json())
      .then(d => setInstallations(d.results || []))
      .catch(() => setInstallations([]))
      .finally(() => setLoadingInstalls(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  // Resume: trigger prepare when resuming to step 1
  useEffect(() => {
    if (initialData?.step === 1 && initialData.installationId) {
      const fakeInst: Installation = {
        id: initialData.installationId,
        servicio: initialData.clientName || `ID ${initialData.installationId}`,
      };
      handleSelectInstall(fakeInst);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter installations
  const filteredInstalls = useMemo(() => {
    const q = installSearch.toLowerCase();
    if (!q) return installations;
    return installations.filter(i => {
      const name = fullName(i).toLowerCase();
      return name.includes(q) || (i.cedula || '').toLowerCase().includes(q) || (i.servicio || '').toLowerCase().includes(q);
    });
  }, [installations, installSearch]);

  // Fetch ODBs for a given zone
  const fetchOdbsForZone = useCallback(async (zone: string): Promise<OdbObject[]> => {
    if (!zone) return [];
    try {
      const res = await apiCall(apiBase, `/wizard/auth/odbs?zone=${encodeURIComponent(zone)}`);
      const data = await res.json();
      return (data.odbs || []) as OdbObject[];
    } catch {
      return [];
    }
  }, [apiBase]);

  // Fetch ports for an ODB externalId
  const fetchOdbPorts = useCallback(async (externalId: string): Promise<string[]> => {
    try {
      const res = await apiCall(apiBase, `/odb/odbs/${encodeURIComponent(externalId)}/ports`);
      const data = await res.json();
      return data.ports || [];
    } catch {
      return [];
    }
  }, [apiBase]);

  // Select installation → prepare
  const handleSelectInstall = useCallback(async (inst: Installation) => {
    setSelectedInstall(inst);
    setLoadingPrepare(true);
    setOdbPorts([]);
    setOdbOptions([]);
    setOdbObjects([]);
    setStep(1);
    const name = fullName(inst);
    logStep('install-select', 'Instalación seleccionada', 'ok', {
      inputData: { installationId: inst.id, name },
    });
    updateResume({ step: 1, installationId: inst.id }, { clientId: inst.id_servicio || inst.id, clientName: name });
    try {
      const res = await apiCall(apiBase, '/wizard/auth/prepare', {
        method: 'POST',
        body: JSON.stringify({ installationId: inst.id }),
      });
      const data: PrepareResponse = await res.json();
      if (!data.ok) throw new Error('Error preparando formulario');
      setPrepareData(data);

      const c = data.collected;
      const prefilledOdb = c.odb || '';
      const prefilledZone = c.zone || '';

      setFormData(prev => ({
        ...prev,
        sn: c.sn || '', olt_id: c.olt_id || '', pon_type: c.pon_type || 'gpon',
        board: c.board || '', port: c.port || '', onu_type: c.onu_type || '',
        onu_mode: c.onu_mode || 'Routing', vlan: c.vlan || '', zone: prefilledZone,
        odb: prefilledOdb, odb_port: c.odb_port || c['odb-port'] || '',
        name: c.name || '', address_or_comment: c.address_or_comment || '',
        download_speed_profile_name: c.download_speed_profile_name || '',
      }));

      // Always fetch ODBs filtered by zone (ignore prepare's unfiltered odbObjects)
      if (prefilledZone) {
        setLoadingOdbs(true);
        const zoneOdbs = await fetchOdbsForZone(prefilledZone);
        setOdbObjects(zoneOdbs);
        setOdbOptions(zoneOdbs.map(o => o.name));
        setLoadingOdbs(false);

        // If there's a pre-selected ODB, fetch its ports
        if (prefilledOdb && zoneOdbs.length) {
          const match = zoneOdbs.find(o => o.name === prefilledOdb) || zoneOdbs.find(o => o.id === prefilledOdb);
          const externalId = match?.id || prefilledOdb;
          setLoadingOdbPorts(true);
          const ports = await fetchOdbPorts(externalId);
          setOdbPorts(ports);
          setLoadingOdbPorts(false);
        }
      } else {
        // No zone → seed from prepare's odbObjects as fallback
        const fallback: OdbObject[] = data.odbObjects || [];
        setOdbObjects(fallback);
        setOdbOptions(fallback.map(o => o.name));
      }
    } catch {
      setPrepareData(null);
    } finally {
      setLoadingPrepare(false);
    }
  }, [apiBase, fetchOdbsForZone, fetchOdbPorts, logStep, updateResume]);

  // Pick unconfigured ONU → auto-fill SN, OLT, port, model
  const handlePickOnu = useCallback((onu: UnconfiguredOnu, idx: number) => {
    setSelectedOnuIdx(idx);
    setFormData(prev => ({
      ...prev,
      sn: onu.sn, olt_id: onu.oltId, pon_type: onu.ponType || 'gpon',
      port: onu.port, onu_type: prev.onu_type || onu.model || '',
    }));
  }, []);

  const setField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  // Zone change → fetch filtered ODBs, reset ODB + ports
  const handleZoneChange = useCallback(async (zoneName: string) => {
    setField('zone', zoneName);
    setField('odb', '');
    setField('odb_port', '');
    setOdbPorts([]);
    if (!zoneName) return;
    setLoadingOdbs(true);
    try {
      const objs = await fetchOdbsForZone(zoneName);
      setOdbObjects(objs);
      setOdbOptions(objs.map(o => o.name));
    } finally {
      setLoadingOdbs(false);
    }
  }, [fetchOdbsForZone, setField]);

  // ODB change → fetch available ports
  const handleOdbChange = useCallback(async (odbName: string) => {
    setField('odb', odbName);
    setField('odb_port', '');
    setOdbPorts([]);
    if (!odbName) return;
    const match = odbObjects.find(o => o.name === odbName) || odbObjects.find(o => o.id === odbName);
    const externalId = match?.id || odbName;
    setLoadingOdbPorts(true);
    const ports = await fetchOdbPorts(externalId);
    setOdbPorts(ports);
    if (ports.length === 1) setField('odb_port', ports[0]);
    setLoadingOdbPorts(false);
  }, [odbObjects, fetchOdbPorts, setField]);

  // Submit authorization
  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    logStep('onu-configure', 'Formulario de autorización completado', 'ok', {
      inputData: { sn: formData.sn, onu_type: formData.onu_type, zone: formData.zone, olt_id: formData.olt_id },
    });
    try {
      const res = await apiCall(apiBase, '/chat/submitAuth', {
        method: 'POST',
        body: JSON.stringify({ ...formData }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubmitStatus('success');
        setSubmitMessage(data.message || 'ONU autorizada correctamente');
        setAuthActions(data.actions || []);
        logStep('onu-auth', 'ONU autorizada', 'ok', { outputData: { message: data.message } });
        setStep(3);
      } else {
        setSubmitStatus('error');
        setSubmitMessage(data.message || data.error || 'Error al autorizar');
        logStep('onu-auth', 'ONU autorizada', 'error', { errorMsg: data.message || data.error });
      }
    } catch (e: any) {
      setSubmitStatus('error');
      setSubmitMessage(e.message || 'Error de conexión');
      logStep('onu-auth', 'ONU autorizada', 'error', { errorMsg: e.message });
    } finally {
      setSubmitting(false);
    }
  }, [apiBase, formData, logStep]);

  // Apply WiFi
  const handleApplyWifi = useCallback(async () => {
    setApplyingWifi(true);
    try {
      const res = await apiCall(apiBase, '/wizard/auth/wifi', {
        method: 'POST',
        body: JSON.stringify({ sn: formData.sn, ssid: wifiSsid, pass: wifiPass }),
      });
      const data = await res.json();
      const results: string[] = data.results || [];
      const ok = data.ok && results.some((r: string) => r.startsWith('✅'));
      setWifiResults(results);
      setWifiDone(true);
      logStep('wifi-apply', 'WiFi aplicado', ok ? 'ok' : 'error', {
        inputData: { sn: formData.sn, ssid: wifiSsid },
        outputData: { results },
      });
    } catch (e: any) {
      setWifiResults([`❌ Error: ${e.message}`]);
      setWifiDone(true);
      logStep('wifi-apply', 'WiFi aplicado', 'error', { errorMsg: e.message });
    } finally {
      setApplyingWifi(false);
    }
  }, [apiBase, formData.sn, wifiSsid, wifiPass, logStep]);

  // Activate WispHub
  const handleActivate = useCallback(async () => {
    const targetId = selectedInstall?.id_servicio || selectedInstall?.id;
    if (!targetId) return;
    setActivating(true);
    try {
      const res = await apiCall(apiBase, '/wizard/auth/activate', {
        method: 'POST',
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      setActivateResult(data);
      logStep('activate', 'Activación en WispHub', data.ok ? 'ok' : 'error', {
        outputData: { activated: data.activated, usuario: data.usuario },
        errorMsg: data.ok ? undefined : data.activationMsg,
      });
      if (data.ok && data.activated && selectedInstall) {
        completeSession(`ONU autorizada y activada para ${fullName(selectedInstall)}`);
      }
    } catch (e: any) {
      setActivateResult({ ok: false, activated: false, activationMsg: e.message, isPyme: false, usuario: '' });
      logStep('activate', 'Activación en WispHub', 'error', { errorMsg: e.message });
    } finally {
      setActivating(false);
    }
  }, [apiBase, selectedInstall, logStep, completeSession]);

  const requiredMissing = !formData.sn || !formData.olt_id || !formData.onu_type || !formData.zone || !formData.name;
  const wifiRequired = isWifiModel(formData.onu_type);
  const opts = prepareData?.options || {};
  const unconfiguredOnus = prepareData?.unconfiguredOnus || [];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Processing modal only while submitting */}
      <ProcessingModal
        isOpen={submitting}
        status="loading"
        title="Autorizando ONU..."
        description="Registrando en SmartOLT, configurando WAN y actualizando Geonet..."
      />

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-[#1e3a8a]/10 rounded-lg flex items-center justify-center">
            <Server className="size-4 text-[#1e3a8a]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Autorización de ONU</h2>
            {selectedInstall && (
              <p className="text-xs text-gray-400">{fullName(selectedInstall)} · {selectedInstall.plan_internet || selectedInstall.servicio || ''}</p>
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
            {/* ── Step 0: select installation ── */}
            {step === 0 && (
              <motion.div key="step0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Buscar instalación</h3>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
                      <input type="text" value={installSearch} onChange={e => setInstallSearch(e.target.value)} placeholder="Nombre, RUT o servicio..." autoFocus
                        className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a]" />
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-[calc(100vh-320px)] overflow-y-auto">
                    {loadingInstalls ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="size-5 animate-spin text-orange-400" />
                        <span className="ml-2 text-sm text-gray-400">Cargando instalaciones...</span>
                      </div>
                    ) : filteredInstalls.length === 0 ? (
                      <div className="py-10 text-center text-sm text-gray-400">
                        {installSearch ? 'Sin resultados' : 'No hay instalaciones'}
                      </div>
                    ) : (
                      filteredInstalls.map(inst => (
                        <button key={inst.id} onClick={() => handleSelectInstall(inst)} className="w-full text-left px-4 py-3 hover:bg-[#1e3a8a]/5 transition-colors group">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#1e3a8a]">{fullName(inst)}</span>
                                {inst.estado_instalacion && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100 flex-shrink-0">{inst.estado_instalacion}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-gray-400">{inst.cedula || '—'}</span>
                                {inst.plan_internet && <span className="text-xs text-gray-400">{inst.plan_internet}</span>}
                                {inst.zona && <span className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin className="size-2.5" />{inst.zona}</span>}
                              </div>
                            </div>
                            <ChevronRight className="size-4 text-gray-300 group-hover:text-[#1e3a8a] flex-shrink-0" />
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Step 1: configure ── */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                {loadingPrepare ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="size-7 animate-spin text-orange-400" />
                    <p className="text-sm text-gray-400">Cargando configuración de red...</p>
                  </div>
                ) : !prepareData ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <AlertCircle className="size-7 text-red-400" />
                    <p className="text-sm text-gray-500">No se pudieron cargar los datos.</p>
                    <Button variant="outline" size="sm" onClick={() => setStep(0)}>Volver</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* ONUs libres */}
                    {unconfiguredOnus.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">ONUs Disponibles — selecciona para autocompletar SN</h3>
                        </div>
                        <div className="p-3 flex flex-wrap gap-2">
                          {unconfiguredOnus.map((onu, idx) => (
                            <button key={idx} onClick={() => handlePickOnu(onu, idx)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all
                                ${selectedOnuIdx === idx ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-[#1e3a8a]/40 hover:bg-[#1e3a8a]/5'}`}>
                              <span className="font-semibold">{onu.sn}</span>
                              <span className="ml-1.5 opacity-60">{onu.oltName} · P{onu.port}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Form */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Configuración de Red</h3>
                      </div>
                      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

                        <FieldGroup label="SN / MAC *">
                          <TextInput value={formData.sn} onChange={v => setField('sn', v)} placeholder="ZTEGC..." />
                        </FieldGroup>

                        <FieldGroup label="OLT ID *">
                          <TextInput value={formData.olt_id} onChange={v => setField('olt_id', v)} placeholder="ID numérico" />
                        </FieldGroup>

                        <FieldGroup label="Tipo de ONU *">
                          {opts['auth-onu_type']?.length
                            ? <SelectInput value={formData.onu_type} onChange={v => setField('onu_type', v)} options={opts['auth-onu_type']} placeholder="Seleccionar..." />
                            : <TextInput value={formData.onu_type} onChange={v => setField('onu_type', v)} placeholder="Ej: ZTE-F660" />}
                        </FieldGroup>

                        <FieldGroup label="Zona *">
                          {opts['auth-zone']?.length ? (
                            <div className="relative">
                              <SelectInput value={formData.zone} onChange={handleZoneChange} options={opts['auth-zone']} placeholder="Seleccionar..." disabled={loadingOdbs} />
                              {loadingOdbs && <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-gray-400 pointer-events-none" />}
                            </div>
                          ) : (
                            <TextInput value={formData.zone} onChange={handleZoneChange} placeholder="Zona" />
                          )}
                        </FieldGroup>

                        <FieldGroup label={loadingOdbs ? 'ODB (cargando...)' : 'ODB'}>
                          {odbOptions.length > 0 ? (
                            <div className="relative">
                              <SelectInput value={formData.odb} onChange={handleOdbChange} options={odbOptions} placeholder="Seleccionar..." />
                              {loadingOdbs && <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-gray-400 pointer-events-none" />}
                            </div>
                          ) : (
                            <div className="relative">
                              <TextInput value={formData.odb} onChange={handleOdbChange} placeholder={loadingOdbs ? 'Cargando ODBs...' : 'ODB'} readOnly={loadingOdbs} />
                              {loadingOdbs && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-gray-400" />}
                            </div>
                          )}
                        </FieldGroup>

                        <FieldGroup label={loadingOdbPorts ? 'Puerto ODB (cargando...)' : odbPorts.length ? `Puerto ODB (${odbPorts.length} disponibles)` : 'Puerto ODB'}>
                          {odbPorts.length > 0 ? (
                            <SelectInput value={formData.odb_port} onChange={v => setField('odb_port', v)} options={odbPorts} placeholder="Seleccionar puerto..." />
                          ) : (
                            <div className="relative">
                              <TextInput value={formData.odb_port} onChange={v => setField('odb_port', v)} placeholder={loadingOdbPorts ? 'Cargando...' : 'Ej: 1'} readOnly={loadingOdbPorts} />
                              {loadingOdbPorts && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-gray-400" />}
                            </div>
                          )}
                        </FieldGroup>

                        <FieldGroup label="VLAN">
                          {opts['auth-vlan']?.length
                            ? <SelectInput value={formData.vlan} onChange={v => setField('vlan', v)} options={opts['auth-vlan']} placeholder="Seleccionar..." />
                            : <TextInput value={formData.vlan} onChange={v => setField('vlan', v)} placeholder="100" />}
                        </FieldGroup>

                        <FieldGroup label="Velocidad">
                          {opts['auth-speed']?.length
                            ? <SelectInput value={formData.download_speed_profile_name} onChange={v => setField('download_speed_profile_name', v)} options={opts['auth-speed']} placeholder="Seleccionar..." />
                            : <TextInput value={formData.download_speed_profile_name} onChange={v => setField('download_speed_profile_name', v)} placeholder="200M" />}
                        </FieldGroup>

                        <FieldGroup label="Nombre servicio *">
                          <TextInput value={formData.name} onChange={v => setField('name', v)} placeholder="Nombre del servicio" />
                        </FieldGroup>

                        <FieldGroup label="Etiqueta Roja">
                          <TextInput value={formData.address_or_comment} onChange={v => setField('address_or_comment', v)} placeholder="E134332" />
                        </FieldGroup>

                        <FieldGroup label="Board">
                          <TextInput value={formData.board} onChange={v => setField('board', v)} placeholder="Auto" />
                        </FieldGroup>

                        <FieldGroup label="Port">
                          <TextInput value={formData.port} onChange={v => setField('port', v)} placeholder="Auto" />
                        </FieldGroup>
                      </div>
                    </div>

                    {requiredMissing && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        <AlertCircle className="size-3.5 flex-shrink-0" />
                        <span>Completa los campos * para continuar (SN, OLT ID, Tipo ONU, Zona, Nombre)</span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 2: confirm + result ── */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                {submitStatus === 'error' ? (
                  <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6 text-center">
                    <AlertCircle className="size-12 text-red-400 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-red-700 mb-1">Error de Autorización</h3>
                    <p className="text-sm text-gray-500 mb-5 whitespace-pre-wrap">{submitMessage}</p>
                    <div className="flex justify-center gap-3">
                      <Button variant="outline" onClick={() => { setSubmitStatus('idle'); setStep(1); }}>Volver al formulario</Button>
                      <Button onClick={handleSubmit} disabled={submitting} className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">Reintentar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Resumen de Autorización</h3>
                        {selectedInstall && <p className="text-xs text-gray-400 mt-0.5">Cliente: {fullName(selectedInstall)}</p>}
                      </div>
                      <div className="px-4 py-2">
                        <SummaryRow label="SN / MAC" value={formData.sn} />
                        <SummaryRow label="OLT ID" value={formData.olt_id} />
                        <SummaryRow label="Tipo ONU" value={formData.onu_type} />
                        <SummaryRow label="Zona" value={formData.zone} />
                        <SummaryRow label="ODB" value={formData.odb} />
                        <SummaryRow label="Puerto ODB" value={formData.odb_port} />
                        <SummaryRow label="VLAN" value={formData.vlan} />
                        <SummaryRow label="Velocidad" value={formData.download_speed_profile_name} />
                        <SummaryRow label="Nombre servicio" value={formData.name} />
                        <SummaryRow label="Etiqueta Roja" value={formData.address_or_comment} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                      <AlertCircle className="size-3.5 flex-shrink-0" />
                      <span>Verifica los datos antes de autorizar. Esta acción registrará la ONU en SmartOLT y configurará la WAN.</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 3: post-auth (WiFi + WispHub activation) ── */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  {/* Auth result summary */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-800">ONU Autorizada</p>
                        <p className="text-xs text-emerald-700 mt-0.5 whitespace-pre-wrap">{submitMessage}</p>
                      </div>
                    </div>
                  </div>

                  {/* WiFi config (only for compatible models) */}
                  {wifiRequired && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Configurar WiFi</h3>
                          <p className="text-xs text-gray-400 mt-0.5">Modelo {formData.onu_type} — ONU compatible</p>
                        </div>
                        {wifiDone && <StatusBadge ok={wifiResults.some(r => r.startsWith('✅'))} label={wifiResults.some(r => r.startsWith('✅')) ? 'Aplicado' : 'Error'} />}
                      </div>
                      <div className="p-4 space-y-3">
                        {!wifiDone ? (
                          <>
                            <FieldGroup label="Nombre WiFi (SSID)">
                              <TextInput value={wifiSsid} onChange={setWifiSsid} placeholder="Nuevo Nombre de Red" />
                            </FieldGroup>
                            <FieldGroup label="Contraseña WiFi">
                              <TextInput value={wifiPass} onChange={setWifiPass} placeholder="Mínimo 8 caracteres" />
                            </FieldGroup>
                            <div className="flex gap-2">
                              <Button size="sm" disabled={applyingWifi || !wifiSsid || wifiPass.length < 8} onClick={handleApplyWifi}
                                className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">
                                {applyingWifi ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Aplicando...</> : 'Aplicar WiFi'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setWifiDone(true)} className="text-gray-500">
                                Saltar WiFi
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            {wifiResults.map((r, i) => <p key={i} className="text-sm text-gray-700">{r}</p>)}
                            {!wifiResults.length && <p className="text-sm text-gray-400 italic">WiFi saltado</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* WispHub activation + contract */}
                  {(!wifiRequired || wifiDone) && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <div>
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Activar en WispHub</h3>
                          <p className="text-xs text-gray-400 mt-0.5">Generar contrato y activar servicio</p>
                        </div>
                        {activateResult && <StatusBadge ok={activateResult.activated} label={activateResult.activated ? 'Activado' : 'Error'} />}
                      </div>
                      <div className="p-4">
                        {!activateResult ? (
                          <Button size="sm" disabled={activating} onClick={handleActivate}
                            className="bg-[#f5831f] hover:bg-[#f5831f]/90 text-white font-semibold">
                            {activating ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Activando...</> : '🚀 Generar Contrato y Activar'}
                          </Button>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm text-gray-700">
                              {activateResult.activated
                                ? `✅ Servicio activado para ${activateResult.usuario}`
                                : `❌ Falló la activación: ${activateResult.activationMsg}`}
                            </p>
                            {activateResult.contractUrl && (
                              <a href={activateResult.contractUrl} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1e3a8a] hover:underline">
                                <ExternalLink className="size-3.5" />Ver / descargar contrato
                              </a>
                            )}
                            {activateResult.contractError && (
                              <p className="text-xs text-red-600">⚠️ Contrato: {activateResult.contractError}</p>
                            )}
                            {!activateResult.activated && (
                              <Button size="sm" variant="outline" onClick={handleActivate} disabled={activating}>Reintentar</Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fotos de instalación */}
                  {activateResult?.activated && selectedInstall && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Fotos de instalación</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Agrega las evidencias directamente a la ficha del cliente en Geonet</p>
                      </div>
                      <div className="p-4">
                        <PhotoUploadPanel
                          apiBase={apiBase}
                          clientId={(selectedInstall.id_servicio || selectedInstall.id) as number}
                          clientLabel={fullName(selectedInstall)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Finish */}
                  {activateResult && (
                    <div className="flex gap-3">
                      <Button onClick={onClose} className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">Finalizar</Button>
                      <Button variant="outline" onClick={() => {
                        setStep(0); setSelectedInstall(null); setPrepareData(null);
                        setSubmitStatus('idle'); setSelectedOnuIdx(null);
                        setWifiDone(false); setWifiSsid(''); setWifiPass(''); setWifiResults([]);
                        setActivateResult(null); setAuthActions([]);
                      }}>Nueva autorización</Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer navigation */}
      {step !== 3 && submitStatus !== 'error' && (
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-t border-gray-200">
          <Button variant="outline" size="sm" onClick={step === 0 ? onClose : () => setStep((step - 1) as WizardStep)} className="text-gray-600">
            {step === 0 ? 'Cancelar' : '← Anterior'}
          </Button>
          {step === 0 && <span className="text-xs text-gray-400">{filteredInstalls.length} instalaciones</span>}
          {step === 1 && (
            <Button size="sm" disabled={requiredMissing || loadingPrepare} onClick={() => setStep(2)} className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white disabled:opacity-50">
              Revisar resumen →
            </Button>
          )}
          {step === 2 && submitStatus === 'idle' && (
            <Button size="sm" disabled={submitting} onClick={handleSubmit} className="bg-[#f5831f] hover:bg-[#f5831f]/90 text-white font-semibold">
              {submitting ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              Autorizar ONU
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
