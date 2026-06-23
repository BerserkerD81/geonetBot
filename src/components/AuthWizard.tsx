import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, ChevronRight, X, Search, Loader2, AlertCircle,
  MapPin, Server, Wifi, Zap, ExternalLink, Eye, EyeOff, RefreshCw
} from 'lucide-react';
import { Button } from './ui/button';
import { ProcessingModal } from './ProcessingModal';
import { PhotoUploadPanel } from './FotosWizard';
import { SignalPanel } from './SignalPanel';
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
  ip?: string | null;
}

interface UnconfiguredOnu {
  sn: string;
  oltId: string;
  oltName: string;
  ponType: string;
  port: string;
  board: string;
  model: string;
}

interface OdbObject { id: string; name: string; }
interface VlanOption { vlan_id: string; name?: string; }

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

function PasswordInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 pr-9 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors"
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
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

  // VLANs (dynamic, by OLT)
  const [vlanOptions, setVlanOptions] = useState<VlanOption[]>([]);
  const [loadingVlans, setLoadingVlans] = useState(false);

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

  const [refreshingOnus, setRefreshingOnus] = useState(false);
  const [signalRefreshKey, setSignalRefreshKey] = useState(0);

  // Step 3: post-auth
  const [tr069EarlyStatus, setTr069EarlyStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [applyingWifi, setApplyingWifi] = useState(false);
  const [wifiDone, setWifiDone] = useState(false);
  const [wifiResults, setWifiResults] = useState<string[]>([]);
  const [genieTaskQueued, setGenieTaskQueued] = useState(false);
  const [genieTaskStatus, setGenieTaskStatus] = useState<'pending' | 'success' | 'failed' | null>(null);
  const [genieTaskResults, setGenieTaskResults] = useState<string[]>([]);
  const [genieTaskAttempts, setGenieTaskAttempts] = useState(0);
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{
    ok: boolean; activated: boolean; activationMsg: string;
    isPyme: boolean; usuario: string; contractUrl?: string; contractError?: string;
  } | null>(null);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');

  const loadInstallations = useCallback(async (sync = false) => {
    setLoadingInstalls(true);
    try {
      const url = sync ? '/wizard/auth/installations?sync=true' : '/wizard/auth/installations';
      const r = await apiCall(apiBase, url);
      const d = await r.json();
      setInstallations(d.results || []);
    } catch {
      setInstallations([]);
    } finally {
      setLoadingInstalls(false);
    }
  }, [apiBase]);

  const refreshOnus = useCallback(async () => {
    if (!selectedInstall) return;
    setRefreshingOnus(true);
    try {
      const res = await apiCall(apiBase, '/wizard/auth/prepare', {
        method: 'POST',
        body: JSON.stringify({ installationId: selectedInstall.id }),
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
  }, [apiBase, selectedInstall]);

  // Poll tarea GenieACS pendiente cada 30s
  useEffect(() => {
    if (!genieTaskQueued || genieTaskStatus === 'success' || genieTaskStatus === 'failed') return;
    const sn = formData.sn;
    if (!sn) return;
    const interval = setInterval(async () => {
      try {
        const r = await apiCall(apiBase, `/wizard/auth/wifi/task-status?sn=${encodeURIComponent(sn)}`);
        const d = await r.json();
        if (d.found) {
          setGenieTaskAttempts(d.attempts ?? 0);
          setGenieTaskResults(d.results ?? []);
          if (d.status === 'success' || d.status === 'failed') {
            setGenieTaskStatus(d.status);
            clearInterval(interval);
          }
        }
      } catch { /* silent */ }
    }, 10_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genieTaskQueued, genieTaskStatus, formData.sn, apiBase]);

  // Fetch installations on mount (skip if resuming directly to step 1)
  useEffect(() => {
    if (initialData?.step === 1) {
      setLoadingInstalls(false);
      return;
    }
    loadInstallations();
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

  // Fetch VLANs for a given OLT ID
  const fetchVlansForOlt = useCallback(async (oltId: string) => {
    if (!oltId) { setVlanOptions([]); return; }
    setLoadingVlans(true);
    try {
      const r = await apiCall(apiBase, `/wizard/auth/vlans?oltId=${encodeURIComponent(oltId)}`);
      const d = await r.json();
      setVlanOptions(d.vlans || []);
    } catch {
      setVlanOptions([]);
    } finally {
      setLoadingVlans(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (step === 1 && formData.olt_id) fetchVlansForOlt(formData.olt_id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.olt_id, step]);

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
      sn: onu.sn,
      olt_id: onu.oltId,
      pon_type: onu.ponType || 'gpon',
      port: onu.port,
      board: onu.board || '',
      onu_type: prev.onu_type || onu.model || '',
      vlan: '',
    }));
  }, []);

  const setField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  // OLT change → reset VLAN (useEffect will refetch vlans)
  const handleOltChange = useCallback((oltId: string) => {
    setField('olt_id', oltId);
    setField('vlan', '');
  }, [setField]);

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

        // Activar TR069 perfil 3 inmediatamente tras la autorización (sin bloquear UI)
        setTr069EarlyStatus('pending');
        apiCall(apiBase, '/wizard/auth/tr069', {
          method: 'POST',
          body: JSON.stringify({ sn: formData.sn }),
        }).then(r => r.json()).then(d => {
          setTr069EarlyStatus(d.ok ? 'success' : 'error');
        }).catch(() => {
          setTr069EarlyStatus('error');
        });
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

  // Configure WiFi via TR069 (GenieACS) + disable SmartOLT WiFi
  const handleApplyWifi = useCallback(async () => {
    if (!formData.sn || !wifiSsid || !wifiPass) return;
    setApplyingWifi(true);
    try {
      const res = await apiCall(apiBase, '/wizard/auth/wifi', {
        method: 'POST',
        body: JSON.stringify({
          sn: formData.sn,
          ssid: wifiSsid,
          pass: wifiPass,
          clientIp: selectedInstall?.ip,
          board: formData.board,
          port: formData.port,
          olt_id: formData.olt_id,
        }),
      });
      const data = await res.json();
      const results: string[] = data.results || [];
      setWifiResults(results);
      setWifiDone(true);
      if (data.genieTaskQueued) {
        setGenieTaskQueued(true);
        setGenieTaskStatus('pending');
      }
      logStep('wifi-apply', 'TR069 + WiFi SmartOLT + GenieACS', data.ok ? 'ok' : 'error', {
        inputData: { sn: formData.sn, ssid: wifiSsid },
        outputData: { results },
      });
    } catch (e: any) {
      setWifiResults([`❌ Error: ${e.message}`]);
      setWifiDone(true);
      logStep('wifi-apply', 'TR069 + WiFi SmartOLT + GenieACS', 'error', { errorMsg: e.message });
    } finally {
      setApplyingWifi(false);
    }
  }, [apiBase, formData.sn, wifiSsid, wifiPass, selectedInstall, logStep]);

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
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-800">Buscar instalación</h3>
                      <button onClick={() => loadInstallations(true)} disabled={loadingInstalls}
                        title="Sincronizar clientes desde WispHub y actualizar BD"
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e3a8a] transition-colors disabled:opacity-40">
                        <RefreshCw className={`size-3.5 ${loadingInstalls ? 'animate-spin' : ''}`} />
                        Sincronizar
                      </button>
                    </div>
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
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">ONUs Disponibles — selecciona para autocompletar SN</h3>
                        <button onClick={refreshOnus} disabled={refreshingOnus}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e3a8a] transition-colors disabled:opacity-40">
                          <RefreshCw className={`size-3 ${refreshingOnus ? 'animate-spin' : ''}`} />
                          Actualizar
                        </button>
                      </div>
                      <div className="p-3 flex flex-wrap gap-2">
                        {unconfiguredOnus.length === 0 ? (
                          <p className="text-xs text-gray-400 px-1 py-0.5">No hay ONUs disponibles. Presiona Actualizar para buscar.</p>
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
                          {selectedOnuIdx !== null
                            ? <div className="h-9 flex items-center px-3 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-800 gap-1.5">
                                <Server className="size-3.5 text-blue-400 flex-shrink-0" />
                                {formData.olt_id} <span className="text-blue-400 text-xs font-normal">· desde ONU</span>
                              </div>
                            : <TextInput value={formData.olt_id} onChange={handleOltChange} placeholder="ID numérico" />}
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

                        <FieldGroup label={loadingVlans ? 'VLAN (cargando...)' : vlanOptions.length ? `VLAN (${vlanOptions.length})` : 'VLAN'}>
                          {vlanOptions.length > 0 ? (
                            <div className="relative">
                              <select value={formData.vlan} onChange={e => setField('vlan', e.target.value)} disabled={loadingVlans}
                                className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors disabled:bg-gray-50 disabled:text-gray-400">
                                <option value="">Seleccionar VLAN...</option>
                                {vlanOptions.map(v => (
                                  <option key={v.vlan_id} value={v.vlan_id}>
                                    {v.name ? `${v.vlan_id} — ${v.name}` : v.vlan_id}
                                  </option>
                                ))}
                              </select>
                              {loadingVlans && <Loader2 className="absolute right-7 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-gray-400 pointer-events-none" />}
                            </div>
                          ) : (
                            <div className="relative">
                              <TextInput value={formData.vlan} onChange={v => setField('vlan', v)} placeholder={loadingVlans ? 'Cargando VLANs...' : formData.olt_id ? 'Sin VLANs para este OLT' : 'Ingresa OLT ID primero'} readOnly={loadingVlans} />
                              {loadingVlans && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-gray-400" />}
                            </div>
                          )}
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
                          {selectedOnuIdx !== null
                            ? <div className="h-9 flex items-center px-3 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-800 gap-1.5">
                                <Server className="size-3.5 text-blue-400 flex-shrink-0" />
                                {formData.board || '—'} <span className="text-blue-400 text-xs font-normal">· desde ONU</span>
                              </div>
                            : <TextInput value={formData.board} onChange={v => setField('board', v)} placeholder="Auto" />}
                        </FieldGroup>

                        <FieldGroup label="Port">
                          {selectedOnuIdx !== null
                            ? <div className="h-9 flex items-center px-3 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-800 gap-1.5">
                                <Server className="size-3.5 text-blue-400 flex-shrink-0" />
                                {formData.port || '—'} <span className="text-blue-400 text-xs font-normal">· desde ONU</span>
                              </div>
                            : <TextInput value={formData.port} onChange={v => setField('port', v)} placeholder="Auto" />}
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

                  {/* Signal level */}
                  {selectedInstall && (
                    <SignalPanel
                      apiBase={apiBase}
                      clientId={(selectedInstall.id_servicio || selectedInstall.id) as number}
                      sn={formData.sn}
                      refreshTrigger={signalRefreshKey}
                    />
                  )}

                  {/* WiFi configuration via GenieACS TR069 */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">WiFi vía TR069 (GenieACS)</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Configura SSID y contraseña en 2.4GHz y 5GHz</p>
                      </div>
                      {wifiDone && <StatusBadge ok={wifiResults.some(r => r.startsWith('✅'))} label={wifiResults.some(r => r.startsWith('✅')) ? 'Listo' : 'Error'} />}
                    </div>
                    <div className="p-4">
                      {!wifiDone ? (
                        <div className="space-y-3">
                          {tr069EarlyStatus !== 'idle' && (
                            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg
                              ${tr069EarlyStatus === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : tr069EarlyStatus === 'pending' ? 'bg-blue-50 text-blue-600 border border-blue-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                              {tr069EarlyStatus === 'pending'
                                ? <Loader2 className="size-3 animate-spin flex-shrink-0" />
                                : tr069EarlyStatus === 'success'
                                  ? <CheckCircle2 className="size-3 flex-shrink-0" />
                                  : <AlertCircle className="size-3 flex-shrink-0" />}
                              {tr069EarlyStatus === 'pending' ? 'Activando perfil TR069 en SmartOLT...'
                                : tr069EarlyStatus === 'success' ? 'TR069 perfil 3 ya activado en SmartOLT'
                                : 'No se pudo activar TR069 ahora — se reintentará al configurar WiFi'}
                            </div>
                          )}
                          <FieldGroup label="SSID (nombre de red)">
                            <TextInput value={wifiSsid} onChange={setWifiSsid} placeholder="Mi Red WiFi" />
                          </FieldGroup>
                          <FieldGroup label="Contraseña">
                            <PasswordInput value={wifiPass} onChange={setWifiPass} placeholder="Mínimo 8 caracteres" />
                          </FieldGroup>
                          <Button size="sm" disabled={applyingWifi || !wifiSsid || !wifiPass}
                            onClick={handleApplyWifi}
                            className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">
                            {applyingWifi
                              ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Configurando...</>
                              : <><Wifi className="size-3.5 mr-1.5" />Configurar WiFi</>}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {wifiResults.map((r, i) => <p key={i} className="text-sm text-gray-700">{r}</p>)}

                          {/* Tarea GenieACS en background */}
                          {genieTaskQueued && (
                            <div className={`mt-2 rounded-lg border px-3 py-2.5 text-xs space-y-1
                              ${genieTaskStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : genieTaskStatus === 'failed'  ? 'bg-red-50 border-red-200 text-red-800'
                              : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                              <div className="flex items-center gap-1.5 font-medium">
                                {genieTaskStatus === 'success' ? <CheckCircle2 className="size-3.5" />
                                : genieTaskStatus === 'failed'  ? <AlertCircle className="size-3.5" />
                                : <Loader2 className="size-3.5 animate-spin" />}
                                {genieTaskStatus === 'success' ? 'WiFi configurado automáticamente'
                                : genieTaskStatus === 'failed'  ? 'Tarea fallida — configura desde WifiWizard'
                                : `Configurando WiFi en background... (intento ${genieTaskAttempts})`}
                              </div>
                              {genieTaskResults.map((r, i) => <p key={i} className="opacity-80">{r}</p>)}
                            </div>
                          )}

                          {!genieTaskQueued && !wifiResults.some(r => r.startsWith('✅')) && (
                            <Button size="sm" variant="outline" onClick={() => setWifiDone(false)} className="mt-2">
                              Reintentar
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WispHub activation + contract */}
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
                        setTr069EarlyStatus('idle');
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
