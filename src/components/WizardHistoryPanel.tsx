import { useState, useEffect, useCallback, type ElementType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle2, AlertCircle, Clock, Loader2,
  ChevronRight, ChevronDown, RefreshCw, Activity,
  ImageIcon, Wifi, Server, UserX, RotateCcw, Shield,
} from 'lucide-react';
import { Button } from './ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WizardStepLog {
  stepName: string;
  stepLabel: string;
  status: 'ok' | 'error' | 'skipped';
  timestamp: string;
  inputData?: Record<string, any>;
  outputData?: Record<string, any>;
  errorMsg?: string;
}

interface WizardSessionSummary {
  id: string;
  userId: number;
  userName?: string;
  type: string;
  status: string;
  clientId?: number;
  clientName?: string;
  summary?: string;
  errorMsg?: string;
  startedAt: string;
  updatedAt?: string;
  completedAt?: string;
}

interface WizardSessionDetail extends WizardSessionSummary {
  steps: WizardStepLog[];
  resumeData?: Record<string, any> | null;
}

interface WizardHistoryPanelProps {
  apiBase: string;
  isAdmin: boolean;
  onResume: (type: string, resumeData: Record<string, any>) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WIZARD_META: Record<string, { label: string; Icon: ElementType; color: string }> = {
  auth:       { label: 'Autorizar ONU',      Icon: Shield,    color: 'text-[#1e3a8a]' },
  'change-onu': { label: 'Cambiar ONU',      Icon: Server,    color: 'text-purple-600' },
  wifi:       { label: 'Cambiar WiFi',       Icon: Wifi,      color: 'text-sky-600' },
  monitor:    { label: 'Monitoreo',          Icon: Activity,  color: 'text-emerald-600' },
  baja:       { label: 'Dar de baja',        Icon: UserX,     color: 'text-red-600' },
  fotos:      { label: 'Agregar fotos',      Icon: ImageIcon, color: 'text-orange-500' },
};

const STATUS_META: Record<string, { label: string; classes: string }> = {
  completed:   { label: 'Completado',   classes: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  failed:      { label: 'Fallido',      classes: 'bg-red-100 text-red-700 border-red-200' },
  abandoned:   { label: 'Abandonado',   classes: 'bg-gray-100 text-gray-500 border-gray-200' },
  'in-progress': { label: 'En progreso', classes: 'bg-amber-100 text-amber-700 border-amber-200' },
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function apiGet(base: string, path: string) {
  return fetch(`${base}${path}`, { credentials: 'include' });
}

// ---------------------------------------------------------------------------
// StepDetail
// ---------------------------------------------------------------------------

function StepDetail({ step }: { step: WizardStepLog }) {
  const [open, setOpen] = useState(false);
  const hasData = step.inputData || step.outputData || step.errorMsg;

  return (
    <div className={`rounded-lg border text-xs overflow-hidden
      ${step.status === 'ok' ? 'border-emerald-100 bg-emerald-50/50'
        : step.status === 'error' ? 'border-red-100 bg-red-50/50'
        : 'border-gray-100 bg-gray-50/50'}`}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => hasData && setOpen(v => !v)}
      >
        <span className={`flex-shrink-0 ${step.status === 'ok' ? 'text-emerald-600' : step.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
          {step.status === 'ok' ? '✓' : step.status === 'error' ? '✗' : '−'}
        </span>
        <span className="font-medium text-gray-700 flex-1">{step.stepLabel}</span>
        <span className="text-gray-400 font-mono">{fmtTime(step.timestamp)}</span>
        {hasData && (open ? <ChevronDown className="size-3 text-gray-400" /> : <ChevronRight className="size-3 text-gray-400" />)}
      </button>

      <AnimatePresence>
        {open && hasData && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-current/10">
              {step.errorMsg && (
                <div className="mt-2 px-2 py-1.5 rounded bg-red-100 text-red-700 font-mono text-[11px] break-all">
                  {step.errorMsg}
                </div>
              )}
              {step.inputData && Object.keys(step.inputData).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-2 mb-1">Datos ingresados</p>
                  <pre className="text-[11px] text-gray-600 font-mono bg-white/80 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(step.inputData, null, 2)}
                  </pre>
                </div>
              )}
              {step.outputData && Object.keys(step.outputData).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Resultado</p>
                  <pre className="text-[11px] text-gray-600 font-mono bg-white/80 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(step.outputData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionRow
// ---------------------------------------------------------------------------

function SessionRow({
  session, apiBase, isAdmin, onResume,
}: {
  session: WizardSessionSummary;
  apiBase: string;
  isAdmin: boolean;
  onResume: (type: string, resumeData: Record<string, any>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<WizardSessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const meta = WIZARD_META[session.type] || { label: session.type, Icon: Activity, color: 'text-gray-500' };
  const statusMeta = STATUS_META[session.status] || { label: session.status, classes: 'bg-gray-100 text-gray-500 border-gray-200' };
  const { Icon } = meta;

  const loadDetail = useCallback(async () => {
    if (detail) return;
    setLoadingDetail(true);
    try {
      const res = await apiGet(apiBase, `/wizard/sessions/${session.id}`);
      const data = await res.json();
      if (data.ok) setDetail(data.session);
    } catch {}
    finally { setLoadingDetail(false); }
  }, [apiBase, session.id, detail]);

  const handleExpand = () => {
    if (!expanded) loadDetail();
    setExpanded(v => !v);
  };

  const handleResume = () => {
    if (!detail?.resumeData) return;
    // Merge session-level clientName/clientId so wizards can display client info without extra fetch
    const merged = {
      ...detail.resumeData,
      ...(session.clientName ? { clientName: session.clientName } : {}),
      ...(session.clientId ? { clientId: session.clientId } : {}),
    };
    onResume(session.type, merged);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <button
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={handleExpand}
      >
        <div className={`flex-shrink-0 mt-0.5 size-7 rounded-lg bg-gray-100 flex items-center justify-center`}>
          <Icon className={`size-3.5 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{meta.label}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusMeta.classes}`}>
              {statusMeta.label}
            </span>
            {isAdmin && session.userName && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{session.userName}</span>
            )}
          </div>
          {session.clientName && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{session.clientName}</p>
          )}
          {session.summary && (
            <p className="text-xs text-emerald-700 mt-0.5 truncate">{session.summary}</p>
          )}
          {session.errorMsg && (
            <p className="text-xs text-red-600 mt-0.5 truncate">{session.errorMsg}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-[11px] text-gray-400">{fmtDate(session.startedAt)}</p>
          {expanded ? <ChevronDown className="size-3.5 text-gray-400 mt-1 ml-auto" /> : <ChevronRight className="size-3.5 text-gray-400 mt-1 ml-auto" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-gray-100"
          >
            <div className="px-4 py-3 space-y-3">
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="size-3.5 animate-spin" />Cargando detalle...
                </div>
              ) : detail ? (
                <>
                  {/* Steps */}
                  {detail.steps.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Pasos ejecutados</p>
                      {detail.steps.map((step, i) => (
                        <StepDetail key={i} step={step} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No se registraron pasos</p>
                  )}

                  {/* Resume button */}
                  {session.status === 'in-progress' && detail.resumeData && (
                    <div className="pt-1">
                      <Button size="sm" onClick={handleResume}
                        className="bg-[#f5831f] hover:bg-[#f5831f]/90 text-white font-semibold">
                        <RefreshCw className="size-3.5 mr-1.5" />
                        Retomar desde paso {detail.steps.length + 1}
                      </Button>
                    </div>
                  )}

                  {/* Session ID for reference */}
                  <p className="text-[10px] text-gray-300 font-mono">ID: {session.id}</p>
                </>
              ) : (
                <p className="text-xs text-red-500">No se pudo cargar el detalle</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function WizardHistoryPanel({ apiBase, isAdmin, onResume, onClose }: WizardHistoryPanelProps) {
  const [sessions, setSessions] = useState<WizardSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '80' });
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('type', filterType);
      const res = await apiGet(apiBase, `/wizard/sessions?${params}`);
      const data = await res.json();
      if (data.ok) setSessions(data.sessions || []);
    } catch {}
    finally { setLoading(false); }
  }, [apiBase, filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-[#1e3a8a]/10 rounded-lg flex items-center justify-center">
            <RotateCcw className="size-4 text-[#1e3a8a]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Historial de flujos</h2>
            <p className="text-xs text-gray-400">{isAdmin ? 'Vista admin — todos los usuarios' : 'Tus flujos recientes'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 flex gap-2 px-4 py-2.5 bg-white border-b border-gray-100 overflow-x-auto">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-7 rounded-lg border border-gray-200 px-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a8a]/30">
          <option value="">Todos los estados</option>
          <option value="in-progress">En progreso</option>
          <option value="completed">Completados</option>
          <option value="failed">Fallidos</option>
          <option value="abandoned">Abandonados</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="h-7 rounded-lg border border-gray-200 px-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-[#1e3a8a]/30">
          <option value="">Todos los tipos</option>
          {Object.entries(WIZARD_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="size-7 animate-spin text-[#1e3a8a]/40" />
              <p className="text-sm text-gray-400">Cargando historial...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16">
              <RotateCcw className="size-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No hay flujos registrados aún</p>
            </div>
          ) : (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-4 gap-2 pb-1">
                {(['completed', 'in-progress', 'failed', 'abandoned'] as const).map(s => {
                  const count = sessions.filter(x => x.status === s).length;
                  if (!count) return null;
                  const m = STATUS_META[s];
                  return (
                    <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
                      className={`rounded-lg border px-2 py-1.5 text-center transition-all cursor-pointer
                        ${filterStatus === s ? m.classes + ' ring-1 ring-current' : 'border-gray-200 bg-white'}`}>
                      <p className="text-base font-bold text-gray-800">{count}</p>
                      <p className="text-[10px] text-gray-500">{m.label}</p>
                    </button>
                  );
                })}
              </div>

              {sessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  apiBase={apiBase}
                  isAdmin={isAdmin}
                  onResume={onResume}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
