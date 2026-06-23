import { useState, useEffect, type ElementType, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle2, AlertCircle, Minus, Loader2, ChevronDown, ChevronRight,
  Shield, Server, Wifi, Activity, UserX, ImageIcon, PlayCircle, RefreshCw,
  Calendar, Clock, User,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WizardStepLog {
  stepName: string;
  stepLabel: string;
  status: 'ok' | 'error' | 'skipped';
  timestamp: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  errorMsg?: string;
}

interface WizardSessionDetail {
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
  steps: WizardStepLog[];
  resumeData?: Record<string, unknown> | null;
}

export interface WizardReplayViewerProps {
  sessionId: string;
  apiBase: string;
  isAdmin: boolean;
  onContinue: (type: string, resumeData: Record<string, unknown>) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const WIZARD_META: Record<string, { label: string; Icon: ElementType; color: string; bg: string }> = {
  auth:           { label: 'Autorizar ONU',  Icon: Shield,    color: 'text-[#1e3a8a]',   bg: 'bg-blue-50' },
  'change-onu':   { label: 'Cambiar ONU',    Icon: Server,    color: 'text-purple-600',  bg: 'bg-purple-50' },
  wifi:           { label: 'Cambiar WiFi',   Icon: Wifi,      color: 'text-sky-600',     bg: 'bg-sky-50' },
  monitor:        { label: 'Monitoreo',      Icon: Activity,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
  baja:           { label: 'Dar de baja',    Icon: UserX,     color: 'text-red-600',     bg: 'bg-red-50' },
  fotos:          { label: 'Agregar fotos',  Icon: ImageIcon, color: 'text-orange-500',  bg: 'bg-orange-50' },
};

const STATUS_META: Record<string, { label: string; pill: string }> = {
  completed:     { label: 'Completado',  pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  failed:        { label: 'Fallido',     pill: 'bg-red-100 text-red-600 border-red-200' },
  abandoned:     { label: 'Abandonado',  pill: 'bg-gray-100 text-gray-500 border-gray-200' },
  'in-progress': { label: 'En progreso', pill: 'bg-amber-100 text-amber-700 border-amber-200' },
};

const FIELD_LABELS: Record<string, string> = {
  installationId: 'ID Instalación', name: 'Nombre', clientName: 'Cliente',
  clientId: 'ID Cliente', sn: 'SN / MAC', olt_id: 'OLT ID',
  onu_type: 'Tipo ONU', zone: 'Zona', odb: 'ODB', odb_port: 'Puerto ODB',
  vlan: 'VLAN', ssid: 'Nombre WiFi', pass: 'Contraseña WiFi',
  message: 'Mensaje', activated: 'Activado', usuario: 'Usuario WispHub',
  count: 'Fotos subidas', results: 'Resultados', step: 'Operación',
  download_speed_profile_name: 'Velocidad', address_or_comment: 'Etiqueta',
  board: 'Board', port: 'Puerto', ponType: 'Tipo PON',
  ok: 'Éxito', msg: 'Detalle', newSn: 'Nuevo SN', newModel: 'Nuevo Modelo',
  graphType: 'Tipo gráfico', confirmText: 'Confirmación', skipped: 'Saltado',
  ponOnu: 'ONU PON', error: 'Error', activationMsg: 'Activación',
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase());
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// RenderValue — handles all value types cleanly
// ---------------------------------------------------------------------------

function RenderValue({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="italic text-gray-400">—</span>;

  if (typeof v === 'boolean') {
    return <span className={v ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{v ? 'Sí' : 'No'}</span>;
  }

  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="italic text-gray-400">—</span>;

    // Array of primitives (strings, numbers)
    if (v.every(item => typeof item !== 'object' || item === null)) {
      return (
        <div className="space-y-0.5 w-full">
          {(v as (string | number)[]).map((item, i) => {
            const s = String(item);
            const isOk  = s.startsWith('✅');
            const isErr = s.startsWith('❌');
            return (
              <div key={i} className={`text-sm leading-snug ${isOk ? 'text-emerald-700' : isErr ? 'text-red-600' : 'text-gray-700'}`}>
                {s}
              </div>
            );
          })}
        </div>
      );
    }

    // Array of objects (e.g. baja steps: [{step, ok, msg}])
    return (
      <div className="space-y-1.5 w-full">
        {(v as Record<string, unknown>[]).map((item, i) => {
          const okVal = 'ok' in item ? Boolean(item.ok) : null;
          return (
            <div key={i} className={`rounded-lg border px-3 py-2 text-xs space-y-0.5 ${
              okVal === false ? 'bg-red-50 border-red-100' :
              okVal === true  ? 'bg-emerald-50 border-emerald-100' :
              'bg-gray-50 border-gray-100'
            }`}>
              {Object.entries(item)
                .filter(([, val]) => val != null && val !== '')
                .map(([k, val]) => (
                  <div key={k} className="flex items-start gap-2">
                    <span className="text-gray-400 shrink-0 min-w-[64px]">{fieldLabel(k)}</span>
                    <span className={`font-medium break-all ${
                      k === 'ok' ? (val ? 'text-emerald-700' : 'text-red-600') : 'text-gray-700'
                    }`}>
                      {typeof val === 'boolean' ? (val ? 'Sí' : 'No') : String(val)}
                    </span>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val != null && val !== '');
    if (entries.length === 0) return <span className="italic text-gray-400">—</span>;
    return (
      <div className="space-y-0.5 w-full text-xs">
        {entries.map(([k, val]) => (
          <div key={k} className="flex items-start gap-2">
            <span className="text-gray-400 shrink-0 min-w-[64px]">{fieldLabel(k)}</span>
            <span className="text-gray-700 break-all">
              {typeof val === 'boolean' ? (val ? 'Sí' : 'No') :
               Array.isArray(val) ? (val as unknown[]).join(', ') :
               String(val)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-gray-800 break-all">{String(v)}</span>;
}

// ---------------------------------------------------------------------------
// FormField — styled read-only form field (mimics wizard input)
// ---------------------------------------------------------------------------

function FormField({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[36px] flex items-start">
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormDataSection — renders data dict as a form-like 2-column grid
// ---------------------------------------------------------------------------

function FormDataSection({ data, label }: { data: Record<string, unknown>; label: string }) {
  const entries = Object.entries(data).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([k, v]) => {
          const isWide = Array.isArray(v) || (typeof v === 'object' && v !== null);
          return (
            <FormField key={k} label={fieldLabel(k)} wide={isWide}>
              <RenderValue v={v} />
            </FormField>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionSummaryCard — overview card shown at the top
// ---------------------------------------------------------------------------

function SessionSummaryCard({ detail, meta, statusMeta }: {
  detail: WizardSessionDetail;
  meta: { label: string; Icon: ElementType; color: string; bg: string };
  statusMeta: { label: string; pill: string };
}) {
  const endTs = detail.completedAt ?? detail.updatedAt;
  const durationMs = endTs
    ? new Date(endTs).getTime() - new Date(detail.startedAt).getTime()
    : null;
  const duration = durationMs !== null ? Math.max(0, Math.round(durationMs / 1000)) : null;
  const Icon = meta.Icon;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5 overflow-hidden">
      {/* Title row */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`size-10 ${meta.bg} rounded-xl flex items-center justify-center shrink-0`}>
              <Icon className={`size-5 ${meta.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-gray-900">{meta.label}</h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.pill}`}>
                  {statusMeta.label}
                </span>
              </div>
              {detail.clientName && (
                <p className="text-sm text-gray-600 mt-0.5 font-medium">{detail.clientName}</p>
              )}
            </div>
          </div>
        </div>

        {/* Meta grid */}
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <Calendar className="size-3 text-gray-300 shrink-0" />
            <span>Inicio: <span className="font-medium text-gray-700">{fmtDate(detail.startedAt)}</span></span>
          </div>
          {detail.completedAt && (
            <div className="flex items-center gap-1.5">
              <Calendar className="size-3 text-gray-300 shrink-0" />
              <span>Fin: <span className="font-medium text-gray-700">{fmtDate(detail.completedAt)}</span></span>
            </div>
          )}
          {duration !== null && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-3 text-gray-300 shrink-0" />
              <span>Duración: <span className="font-medium text-gray-700">
                {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`}
              </span></span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Activity className="size-3 text-gray-300 shrink-0" />
            <span>Pasos: <span className="font-medium text-gray-700">{detail.steps.length}</span></span>
          </div>
          {detail.userName && (
            <div className="flex items-center gap-1.5 col-span-2">
              <User className="size-3 text-gray-300 shrink-0" />
              <span>Técnico: <span className="font-medium text-gray-700">@{detail.userName}</span></span>
            </div>
          )}
        </div>

        {/* Result banner */}
        {detail.summary && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-800 font-medium">
            ✓ {detail.summary}
          </div>
        )}
        {detail.errorMsg && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
            {detail.errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepCard
// ---------------------------------------------------------------------------

function StepCard({ step, index, total, defaultOpen }: {
  step: WizardStepLog; index: number; total: number; defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasData = (step.inputData && Object.keys(step.inputData).length > 0)
               || (step.outputData && Object.keys(step.outputData).length > 0)
               || step.errorMsg;

  const statusIcon = step.status === 'ok'
    ? <CheckCircle2 className="size-4 text-emerald-500" />
    : step.status === 'error'
    ? <AlertCircle className="size-4 text-red-500" />
    : <Minus className="size-4 text-gray-400" />;

  const lineFill   = step.status === 'ok' ? 'bg-emerald-300' : step.status === 'error' ? 'bg-red-200' : 'bg-gray-200';
  const cardBorder = step.status === 'ok' ? 'border-emerald-100' : step.status === 'error' ? 'border-red-100' : 'border-gray-100';
  const cardBg     = step.status === 'ok' ? 'bg-white' : step.status === 'error' ? 'bg-red-50/20' : 'bg-gray-50/30';

  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0" style={{ width: '20px' }}>
        <div className="shrink-0 mt-1">{statusIcon}</div>
        {index < total - 1 && <div className={`w-0.5 flex-1 mt-1 ${lineFill}`} style={{ minHeight: '20px' }} />}
      </div>

      {/* Card */}
      <div className={`flex-1 mb-3 rounded-xl border ${cardBorder} ${cardBg} overflow-hidden shadow-sm`}>
        <button
          className="w-full flex items-start gap-3 px-4 py-3 text-left"
          onClick={() => hasData && setOpen(v => !v)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Paso {index + 1}</span>
              <span className="text-sm font-semibold text-gray-800 leading-tight">{step.stepLabel}</span>
            </div>
            {step.errorMsg && !open && (
              <p className="text-xs text-red-600 mt-0.5 truncate">{step.errorMsg}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-gray-400 font-mono">{fmtTime(step.timestamp)}</span>
            {hasData && (open
              ? <ChevronDown className="size-3.5 text-gray-400" />
              : <ChevronRight className="size-3.5 text-gray-400" />
            )}
          </div>
        </button>

        <AnimatePresence>
          {open && hasData && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden border-t border-gray-100"
            >
              <div className="px-4 pb-4 pt-3 space-y-4">
                {step.errorMsg && (
                  <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1">Error</p>
                    <p className="text-xs text-red-700 font-mono break-all">{step.errorMsg}</p>
                  </div>
                )}
                {step.inputData && Object.keys(step.inputData).length > 0 && (
                  <FormDataSection data={step.inputData} label="Datos ingresados" />
                )}
                {step.outputData && Object.keys(step.outputData).length > 0 && (
                  <FormDataSection data={step.outputData} label="Resultado" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function WizardReplayViewer({ sessionId, apiBase, isAdmin, onContinue, onClose }: WizardReplayViewerProps) {
  const [detail, setDetail] = useState<WizardSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`${apiBase}/wizard/sessions/${sessionId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d.ok) setDetail(d.session);
        else setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiBase, sessionId]);

  const meta = detail
    ? (WIZARD_META[detail.type] ?? { label: detail.type, Icon: Activity, color: 'text-gray-500', bg: 'bg-gray-50' })
    : null;
  const statusMeta = detail
    ? (STATUS_META[detail.status] ?? { label: detail.status, pill: 'bg-gray-100 text-gray-500 border-gray-200' })
    : null;
  const canResume = detail?.status === 'in-progress' && !!detail?.resumeData;

  const handleAction = () => {
    if (!detail) return;
    if (canResume) {
      onContinue(detail.type, {
        ...detail.resumeData!,
        ...(detail.clientName ? { clientName: detail.clientName } : {}),
        ...(detail.clientId   ? { clientId:   detail.clientId   } : {}),
      });
    } else {
      onContinue(detail.type, {});
    }
  };

  const Icon = meta?.Icon ?? Activity;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          {meta && (
            <div className={`size-9 ${meta.bg} rounded-xl flex items-center justify-center`}>
              <Icon className={`size-4.5 ${meta.color}`} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-gray-900">{meta?.label ?? 'Flujo'}</h2>
              {statusMeta && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusMeta.pill}`}>
                  {statusMeta.label}
                </span>
              )}
            </div>
            {detail?.clientName && (
              <p className="text-xs text-gray-500 leading-tight truncate">{detail.clientName}</p>
            )}
            {isAdmin && detail?.userName && (
              <p className="text-[11px] text-gray-400 leading-tight">@ {detail.userName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {detail && (
            <span className="hidden sm:block text-[11px] text-gray-400">{fmtDate(detail.startedAt)}</span>
          )}
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="size-8 animate-spin text-[#1e3a8a]/30" />
            <p className="text-sm text-gray-400">Cargando historial de pasos...</p>
          </div>
        ) : error || !detail ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <AlertCircle className="size-8 text-red-300" />
            <p className="text-sm text-gray-400">No se pudo cargar el historial</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6">
            {/* Summary card */}
            <SessionSummaryCard detail={detail} meta={meta!} statusMeta={statusMeta!} />

            {/* Step count header */}
            <div className="flex items-center gap-2 mb-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {detail.steps.length} {detail.steps.length === 1 ? 'paso ejecutado' : 'pasos ejecutados'}
              </p>
              <div className="flex-1 h-px bg-gray-200" />
              {detail.status === 'in-progress' && (
                <span className="text-[10px] text-amber-600 font-semibold">
                  Paso {detail.steps.length + 1} pendiente
                </span>
              )}
            </div>

            {/* Timeline */}
            {detail.steps.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400 italic">No se registraron pasos en este flujo</p>
              </div>
            ) : (
              <div>
                {detail.steps.map((step, i) => (
                  <StepCard
                    key={i}
                    step={step}
                    index={i}
                    total={detail.steps.length + (detail.status === 'in-progress' ? 1 : 0)}
                    defaultOpen={i === detail.steps.length - 1}
                  />
                ))}

                {/* Pending step indicator */}
                {detail.status === 'in-progress' && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0" style={{ width: '20px' }}>
                      <div className="size-4 rounded-full border-2 border-dashed border-amber-400 mt-1 flex items-center justify-center">
                        <div className="size-1.5 rounded-full bg-amber-400" />
                      </div>
                    </div>
                    <div className="flex-1 mb-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Paso {detail.steps.length + 1}
                        </span>
                        <span className="text-sm font-medium text-amber-700">En espera de continuar...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && !error && detail && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 bg-white border-t border-gray-200">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            ← Cerrar
          </button>
          <button
            onClick={handleAction}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              canResume
                ? 'bg-[#f5831f] hover:bg-[#e07318] text-white'
                : 'bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white'
            }`}
          >
            {canResume ? (
              <><RefreshCw className="size-3.5" /> Retomar desde paso {detail.steps.length + 1}</>
            ) : (
              <><PlayCircle className="size-3.5" /> Iniciar nuevo {meta?.label ?? 'flujo'}</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
