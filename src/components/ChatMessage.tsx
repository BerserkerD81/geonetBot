import { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Bot, Check as CheckIcon, ChevronLeft, ChevronRight, ChevronsUpDown, 
  MapPin, Maximize2, Download, Eye, EyeOff, X, ImageOff, Loader2,
  Server, HardDrive, Network, Lock, AlertTriangle, ShieldAlert, Trash2, Info
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { useAuth } from '../contexts/AuthContext';
import { ProcessingModal } from './ProcessingModal';

// --- CONSTANTES DE CONFIGURACIÓN DEL FORMULARIO ---
const HIDDEN_FIELDS = ['auth-olt_id', 'auth-pon_type', 'auth-board', 'auth-onu_mode', 'auth-port'];
const READ_ONLY_FIELDS = ['auth-name', 'auth-sn'];
const AUTO_SELECT_FIELDS = ['auth-onu_type', 'auth-vlan', 'auth-zone', 'auth-speed'];

// --- TIPOS ---

type OnuEntry = {
  id: string;
  label: string;
  ponType?: string;
  port?: string;
  board?: string;
  ponPort?: string;
  sn?: string;
  type?: string;
  model?: string;
  description?: string;
  actionPayload?: string;
};

type OltEntry = {
  oltId: string;
  oltName?: string;
  availableCount?: number;
  onus: OnuEntry[];
};

type UnconfiguredOnu = {
  olt?: string;
  sn?: string;
  serial?: string;
  pon?: string;
  port?: string;
  model?: string;
};

type OdbApiResponseItem = {
  id?: string | number;
  name?: string;
  externalId?: string | number;
};

type PortApiResponseItem = string | number | { port: string | number };

type ActionOption = {
  id: string;
  label: string;
  type: 'button' | 'input' | 'link';
  placeholder?: string;
  options?: string[];
  payload?: string;
  helperText?: string;
  url?: string;
  value?: string;
  disabled?: boolean;
};

type SmartoltAvailability = {
  olts?: OltEntry[];
  suggestedVlan?: string;
  suggestedZone?: string;
};

type InstallationEntry = {
  id: string;
  clientName: string;
  rut?: string;
  address?: string;
  actionPayload?: string;
};

type MonitorMetadata = {
  clientName?: string;
  clientIdServicio?: string | number;
  ip?: string;
  onuExternalId?: string;
  refreshedAt?: string;
  graphType?: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | string;
  statusSummary?: string;
  rx?: string;
  tx?: string;
  rut?: string;
  plan?: string;
  distanceOltOnu?: string;
  onlineUptime?: string;
  wisphubServiceStatus?: string;
  lastInvoiceDate?: string;
  lastInvoicePaid?: string;
  signalValue?: string;
  signal1310?: string;
  signal1490?: string;
  runningConfig?: string;
  fullStatusInfo?: string;
  signalGraphUrl?: string;
  trafficGraphUrl?: string;
  failedApis?: string[];
  resyncResult?: { error?: string } | Record<string, unknown>;
};

type MessageMetadata = {
  smartoltAvailability?: SmartoltAvailability;
  installations?: InstallationEntry[];
  monitor?: MonitorMetadata;
};

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  imageDataUrl?: string;
  createdAt?: string;
  isLatest?: boolean;
  isAwaitingResponse?: boolean;
  disableActions?: boolean;
  onRetry?: () => void;
  shouldAnimate?: boolean;
  messageId?: string;
  versions?: string[];
  currentVersion?: number;
  onVersionChange?: (messageId: string, direction: 'prev' | 'next') => void;
  actions?: ActionOption[];
  onActionSelect?: (payload: string) => void | Promise<void>;
  onReplaceMessage?: (messageId: string, payload: string) => void | Promise<void>;
  onSubmitAuth?: (collected: Record<string, string>) => boolean | void | Promise<boolean | void>;
  onSubmitWan?: (collected: Record<string, string>) => void | Promise<void>;
  onSubmitAction?: (payload: string, collected: Record<string, string>) => void | Promise<void>;
  highlighted?: boolean;
  metadata?: MessageMetadata | null;
}

// --- UTILIDADES ---

const _envApi = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
const _mode = (import.meta.env as Record<string, string | undefined>).MODE ?? 'production';
const API_BASE = _envApi ?? (_mode === 'development' ? 'http://localhost:3000' : '/api');

const resolveImageUrl = (url?: string) => {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const cleanBase = API_BASE.replace(/\/+$/, '');
  const cleanPath = url.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
};

const normalizeSpeedProfile = (val: string) => {
  const raw = (val || '').trim();
  if (!raw) return '';
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return raw;
  const num = match[1].replace(/\.0+$/, '');
  return `${num}M`;
};

const toMonitorTextBlock = (value: any, maxLen = 5000): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return undefined;
    return s.length > maxLen ? `${s.slice(0, maxLen)}\n...` : s;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    const serialized = JSON.stringify(value, null, 2);
    if (!serialized) return undefined;
    return serialized.length > maxLen ? `${serialized.slice(0, maxLen)}\n...` : serialized;
  } catch {
    return String(value);
  }
};

const toDbmString = (value: any): string | undefined => {
  const txt = toMonitorTextBlock(value);
  if (!txt) return undefined;
  if (/dbm/i.test(txt)) return txt;
  const num = Number(txt.replace(',', '.'));
  if (!Number.isNaN(num)) {
    const clean = Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${clean} dBm`;
  }
  return txt;
};

const normalizeText = (value: string) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const getMonitorStatusTone = (statusSummary?: string) => {
  const status = normalizeText(statusSummary || '');
  if (/critical|critico|critica|offline|caido|falla|error|down/.test(status)) {
    return {
      badgeClass: 'bg-red-50 border-red-200 text-red-700',
      dotClass: 'bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.18)]',
      accentClass: 'from-[#f7f9ff] to-white border-[#dbe6ff]'
    };
  }
  if (/regular|warning|alerta|inestable|degradado|degraded/.test(status)) {
    return {
      badgeClass: 'bg-amber-50 border-amber-200 text-amber-700',
      dotClass: 'bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.18)]',
      accentClass: 'from-[#f7f9ff] to-white border-[#dbe6ff]'
    };
  }
  if (/very good|muy bueno|good|ok|online|up|estable|normal/.test(status)) {
    return {
      badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      dotClass: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]',
      accentClass: 'from-[#f7f9ff] to-white border-[#dbe6ff]'
    };
  }
  return {
    badgeClass: 'bg-gray-50 border-gray-200 text-gray-700',
    dotClass: 'bg-gray-400 shadow-[0_0_0_4px_rgba(156,163,175,0.18)]',
    accentClass: 'from-[#f7f9ff] to-white border-[#dbe6ff]'
  };
};

const parseMonitorPanelFromContent = (content: string): Partial<MonitorMetadata> & { resyncLine?: string; apiWarnings?: string } => {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  const pick = (regex: RegExp) => lines.find(l => regex.test(l));
  const valueOf = (regex: RegExp) => pick(regex)?.replace(regex, '$1').trim();

  const signalGraphLine = pick(/gr[aá]fico\s+señal/i);
  const trafficGraphLine = pick(/gr[aá]fico\s+tr[aá]fico/i);
  const lastInvoiceRaw = valueOf(/^💳\s*\*\*Última\s+factura:\*\*\s*(.+)$/i);
  const invoiceMatch = lastInvoiceRaw?.match(/^(.*?)\s*\(([^)]+)\)\s*$/);

  const signalGraphUrl = signalGraphLine?.match(/\(([^)]+)\)/)?.[1];
  const trafficGraphUrl = trafficGraphLine?.match(/\(([^)]+)\)/)?.[1];

  return {
    clientName: valueOf(/^👤\s*\*\*Cliente:\*\*\s*(.+)$/i),
    clientIdServicio: valueOf(/^🆔\s*\*\*Servicio:\*\*\s*(.+)$/i),
    ip: valueOf(/^🌍\s*\*\*IP:\*\*\s*(.+)$/i),
    onuExternalId: valueOf(/^🔢\s*\*\*ONU External ID:\*\*\s*(.+)$/i),
    statusSummary: valueOf(/^📶\s*\*\*Estado ONU:\*\*\s*(.+)$/i),
    onlineUptime: valueOf(/^⏱️\s*\*\*Tiempo en línea:\*\*\s*(.+)$/i),
    distanceOltOnu: valueOf(/^📏\s*\*\*Distancia ONU-OLT:\*\*\s*(.+)$/i),
    wisphubServiceStatus: valueOf(/^🛰️\s*\*\*Estado WispHub:\*\*\s*(.+)$/i),
    lastInvoiceDate: invoiceMatch?.[1]?.trim() || lastInvoiceRaw,
    lastInvoicePaid: invoiceMatch?.[2]?.trim(),
    signalValue: valueOf(/^📡\s*\*\*Señal ONU\/OLT Rx:\*\*\s*(.+)$/i),
    rx: valueOf(/^📥\s*\*\*RX:\*\*\s*(.+)$/i),
    tx: valueOf(/^📤\s*\*\*TX:\*\*\s*(.+)$/i),
    graphType: valueOf(/^🗂️\s*\*\*Per[ií]odo gr[aá]ficos:\*\*\s*(.+)$/i)?.toLowerCase(),
    rut: valueOf(/^🪪\s*\*\*RUT:\*\*\s*(.+)$/i),
    plan: valueOf(/^🚀\s*\*\*Plan:\*\*\s*(.+)$/i),
    signalGraphUrl,
    trafficGraphUrl,
    resyncLine: lines.find(l => /^✅\s*\*\*Resync ejecutado\*\*/i.test(l) || /^❌\s*\*\*Resync:\*\*/i.test(l)),
    apiWarnings: lines.find(l => /^⚠️\s*APIs\s+con\s+error:/i.test(l))
  };
};

const parseMarkdownTableToInstallations = (content: string, actions?: ActionOption[], preferClientSelect: boolean = false): InstallationEntry[] => {
  try {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (lines.length < 3) return [];

    const header = lines[0].toLowerCase();
    if (!header.includes('cliente') || !header.includes('dirección')) return [];

    const dataLines = lines.slice(2);
    const parsed: InstallationEntry[] = [];

    dataLines.forEach(line => {
      const cols = line.split('|').map(c => c.trim());
      if (cols.length >= 6) {
        const clientName = cols[2];
        const rut = cols[3];
        const installId = cols[4];
        const address = cols[5];
        if (!installId || !clientName || installId === '-') return;

        const relatedAction = actions?.find(
          a => a.id === `select-installation-${installId}` || 
               (a.payload && a.payload.includes(`instalación ${installId}`))
        );

        const actionPayload = preferClientSelect
          ? `seleccionar cliente ${installId}`
          : (relatedAction?.payload || `seleccionar instalación ${installId}`);

        parsed.push({
          id: installId,
          clientName,
          rut,
          address,
          actionPayload
        });
      }
    });
    return parsed;
  } catch (e) {
    console.error("Error parseando tabla markdown", e);
    return [];
  }
};

const parseUnconfiguredOnusFromMarkdown = (content: string): UnconfiguredOnu[] => {
  try {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    // If the message includes an explicit flow label (added to separate flows),
    // only parse tables that are intended for "Cambio de ONU" flow.
    const flowLine = lines.find(l => /^🔁\s*Flujo:/i.test(l));
    const flow = flowLine ? flowLine.replace(/^🔁\s*Flujo:\s*/i, '').trim().toLowerCase() : '';
    // If a flow label exists and it's NOT a change-ONU flow, skip parsing here.
    if (flow && !/cambio\s*de\s*onu/i.test(flow)) return [];

    // fallback: look for header line containing OLT and SN (after possible flow label)
    let hdrLine = lines.find(l => /olt\s*\|\s*sn/i.test(l) || /modelo\s*\|/i.test(l));
    if (!hdrLine) hdrLine = lines[0] || '';

    const isOnuTable = /olt/i.test(hdrLine) && /sn/i.test(hdrLine);
    if (!isOnuTable) return [];

    // rows are lines that start with | (markdown tables)
    const tableLines = lines.filter(l => l.startsWith('|'));
    if (tableLines.length < 2) return [];

    const data: UnconfiguredOnu[] = tableLines.slice(1).map(line => {
      const cols = line.split('|').map(c => c.trim());
      const obj: UnconfiguredOnu = {};
      // detect if first data column is a numeric index (e.g. '| 1 | OLT ...')
      const maybeIndex = cols[1] || '';
      const hasIndex = /^\d+$/.test(String(maybeIndex));
      const off = hasIndex ? 1 : 0;

      obj.olt = cols[1 + off] || cols[2 + off] || '';
      obj.sn = (cols[2 + off] || cols[3 + off] || '').replace(/\[.*?\]/g, '').trim();
      obj.pon = cols[3 + off] || cols[4 + off] || '';
      obj.port = cols[4 + off] || cols[5 + off] || '';
      obj.model = cols[5 + off] || cols[6 + off] || '';
      return obj;
    })
    // filter out placeholder rows like '| - | - | - | - | - | - |'
    .filter(r => {
      if (!r) return false;
      const vals = [r.olt, r.sn, r.pon, r.port, r.model].map(v => String(v || '').trim());
      const allEmptyOrDash = vals.every(v => !v || /^-+$/.test(v) || /^\s*-\s*$/.test(v));
      return !allEmptyOrDash && (r.sn || r.olt);
    });

    return data;
  } catch {
    return [];
  }
};

// Helper: unique by keya
function uniqBy<T>(arr: T[], fn: (item: T) => string) {
  const m = new Map<string, T>();
  for (const it of arr) {
    try {
      const k = String(fn(it) ?? '');
      if (!m.has(k)) m.set(k, it);
    } catch {
      // ignore
    }
  }
  return Array.from(m.values());
}

// --- COMPONENTE: MODAL DE PROCESAMIENTO ---
// Corrección: Usamos ProcessStep[] en lugar de any[]


// --- COMPONENTES AUXILIARES ---
function SearchableSelect({
  action,
  value,
  onChange,
  disabled
}: {
  action: ActionOption;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const display = value || 'Selecciona una opción';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className={`w-full justify-between h-10 bg-white border-gray-200 text-gray-900 text-sm transition-all
            ${open ? 'border-emerald-500/60 ring-2 ring-emerald-500/25' : 'hover:border-gray-300'} 
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="truncate text-left flex-1 font-medium">{display}</span>
          {!disabled && <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-100 text-gray-400" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border-gray-200 shadow-xl"
        align="start"
      >
        <Command className="bg-transparent">
          {/* CAMBIO AQUÍ: 
            [&_svg]:text-white -> Pone el icono en blanco puro.
            [&_svg]:opacity-100 -> Asegura que no tenga transparencia heredada.
          */}
          <CommandInput 
            placeholder={action.placeholder || 'Buscar...'} 
            className="text-sm text-gray-900 placeholder:text-gray-400 bg-white border-b border-gray-200 [&_svg]:text-gray-400 [&_svg]:opacity-100" 
          />
          <CommandList className="border-t border-gray-200">
            <CommandEmpty className="py-3 text-sm text-gray-500 text-center">Sin resultados</CommandEmpty>
            <CommandGroup>
              {action.options?.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(val) => {
                    onChange(val);
                    setOpen(false);
                  }}
                  className="text-sm py-2.5 text-gray-900 hover:bg-gray-50 aria-selected:bg-gray-100 aria-selected:text-gray-900 cursor-pointer"
                >
                  <CheckIcon className={`mr-2 h-4 w-4 text-emerald-400 ${value === opt ? 'opacity-100' : 'opacity-0'}`} />
                  <span className="truncate">{opt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
function ImagePreview({ 
  src, 
  alt, 
  className, 
  onClick, 
  onDownload 
}: { 
  src: string; 
  alt: string; 
  className?: string; 
  onClick?: () => void;
  onDownload?: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const finalSrc = resolveImageUrl(src);

  if (!finalSrc) return null;

  return (
    <div className={`relative overflow-hidden bg-neutral-950 ${className}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50 z-10">
          <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
        </div>
      )}
      
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[150px] bg-neutral-900 text-neutral-500 gap-2 p-4 border border-neutral-800 rounded-lg">
          <ImageOff className="h-8 w-8 opacity-50" />
          <span className="text-xs text-center">No se pudo cargar la imagen</span>
        </div>
      )}

      <img 
        src={finalSrc} 
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('success')}
        onError={() => setStatus('error')}
        onClick={status === 'success' ? onClick : undefined}
      />

      {status === 'success' && (
        <>
           <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-3 cursor-pointer" onClick={onClick}>
            <Button size="icon" variant="secondary" className="rounded-full bg-[#1e3a8a]/70 backdrop-blur-md border-[#1e3a8a]/60 hover:bg-[#2f5bbd]/80">
               <Maximize2 className="size-4 text-orange-400" />
             </Button>
             {onDownload && (
               <Button 
                 size="icon" 
                 variant="secondary" 
                className="rounded-full bg-[#1e3a8a]/70 backdrop-blur-md border-[#1e3a8a]/60 hover:bg-[#2f5bbd]/80"
                 onClick={(e) => { e.stopPropagation(); onDownload(); }}
               >
                 <Download className="size-4 text-orange-400" />
               </Button>
             )}
           </div>
        </>
      )}
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---
export function ChatMessage({
  role,
  content,
  imageDataUrl,
  createdAt,
  isLatest = false,
  isAwaitingResponse = false,
  disableActions = false,
  shouldAnimate = false,
  messageId = '',
  versions,
  currentVersion,
  onVersionChange,
  actions,
  onActionSelect,
  onReplaceMessage,
  onSubmitAuth,
  onSubmitWan,
  onSubmitAction,
  highlighted = false,
  metadata,
}: ChatMessageProps) {
  const { user } = useAuth();
  const authUser = user as { username?: string | null; displayName?: string | null; email?: string | null } | null;
  const isUser = role === 'user';

  // --- NUEVO: REFERENCIA PARA SCROLL SUAVE ---
  const messageRef = useRef<HTMLDivElement>(null);

  // --- NUEVO: EFECTO DE SCROLL ---
  useEffect(() => {
    // Si es el último mensaje, hacemos scroll suave al INICIO del bloque
    if (isLatest && messageRef.current) {
      setTimeout(() => {
        messageRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start', // Esto alinea la parte superior del mensaje con el top de la vista
          inline: 'nearest'
        });
      }, 150); // Pequeño delay para asegurar que el contenido renderizó
    }
  }, [isLatest, content]); 

  // Estados
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
  const [odbNameToExternalId, setOdbNameToExternalId] = useState<Record<string, string>>({});
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [monitorLive, setMonitorLive] = useState(false);
  const [selectedOnu, setSelectedOnu] = useState<{
    oltId?: string;
    board?: string;
    port?: string;
    ponType?: string;
    onuId?: string;
  } | null>(null);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [showWifiPass, setShowWifiPass] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const consumedActionKeysRef = useRef<Set<string>>(new Set());
  const [, setConsumedActionVersion] = useState(0);
  const monitorInitialRefreshKeyRef = useRef('');
  const [isMonitorRefreshing, setIsMonitorRefreshing] = useState(false);
  const monitorRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRunningConfig, setShowRunningConfig] = useState(false);
  const [showFullStatusInfo, setShowFullStatusInfo] = useState(false);
  const [confirmBajaOpen, setConfirmBajaOpen] = useState(false);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    resolved: string;
    actionPayload?: string;
    value?: string;
    actionId?: string;
    showProcessing: boolean;
  } | null>(null);
  
  // Estado para la animación
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const disableActionButtons = disableActions || (!isUser && (!isLatest || isAwaitingResponse || isSubmitting));

  const getActionLockKey = (actionId?: string, actionPayload?: string, value?: string) => {
    const id = String(actionId || '').trim().toLowerCase();
    const payload = String(actionPayload || '').trim().toLowerCase();
    const val = String(value || '').trim().toLowerCase();
    if (id) return `id:${id}`;
    if (payload) return `payload:${payload}`;
    return val ? `value:${val}` : '';
  };

  const isSingleUseSelectionAction = (source: string) => {
    return /seleccionar\s+cliente|seleccionar\s+instalaci[oó]n|seleccionar\s+onu|select-client|select-installation|select-onu|usar\s+onu|use-onu/i.test(source);
  };

  const isActionLocked = (actionId?: string, actionPayload?: string, value?: string) => {
    const key = getActionLockKey(actionId, actionPayload, value);
    return !!key && consumedActionKeysRef.current.has(key);
  };

  // Estado de procesamiento para el modal
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [processingTitle, setProcessingTitle] = useState<string | undefined>(undefined);
  const [processingDescription, setProcessingDescription] = useState<string | undefined>(undefined);
  const confirmBajaTarget = pendingConfirmAction?.value?.trim() || 'el cliente seleccionado';

  useEffect(() => {
    return () => {
      if (monitorRefreshTimerRef.current) {
        clearTimeout(monitorRefreshTimerRef.current);
      }
    };
  }, []);

  const openProcessingModal = (title?: string, description?: string) => {
    setProcessingStatus('loading');
    setProcessingTitle(title);
    setProcessingDescription(description);
    setIsProcessing(true);
  };

  const closeProcessingModal = () => {
    setIsProcessing(false);
    setProcessingTitle(undefined);
    setProcessingDescription(undefined);
  };

  // --- LÓGICA DE INICIALIZACIÓN Y AUTO-FILL ---
  
  useEffect(() => {
    if (!actions || !Array.isArray(actions)) return;

    const initialValues: Record<string, string> = {};

    actions.forEach(action => {
      // 1. Inicializar campos ocultos y de solo lectura
      if (
        (HIDDEN_FIELDS.includes(action.id) || READ_ONLY_FIELDS.includes(action.id)) && 
        action.placeholder
      ) {
        initialValues[action.id] = action.placeholder;
      }

      // 2. Lógica de auto-selección
      if (AUTO_SELECT_FIELDS.includes(action.id) && action.options?.length && action.placeholder) {
        const placeholderVal = action.placeholder.trim();
        
        let match = action.options.find(opt => opt === placeholderVal);
        
        if (!match) {
          match = action.options.find(opt => 
            opt.startsWith(placeholderVal + ' ') || 
            opt.startsWith(placeholderVal + '-')
          );
        }

        if (match) {
          initialValues[action.id] = match;
          
          if (action.id === 'auth-zone') {
             setTimeout(() => fetchOdbOptionsForZone(match!), 100);
          }
        }
      }
    });

    setInputValues(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(initialValues).forEach(([k, v]) => {
        if (!next[k] && v) {
          next[k] = v;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

  }, [actions]);

  // --- LÓGICA DE PROCESAMIENTO DE DATOS ---

  const smartoltAvailability = (metadata?.smartoltAvailability as SmartoltAvailability | undefined) || null;
  const hasSmartoltTable = Boolean(smartoltAvailability?.olts?.length);
  
  const hasClientSelectActions = useMemo(() => {
    return (actions || []).some(a => (a?.payload || '').toLowerCase().includes('seleccionar cliente'));
  }, [actions]);

  const installations: InstallationEntry[] = useMemo(() => {
    if (metadata?.installations && metadata.installations.length > 0) {
      return uniqBy(metadata.installations, (i) => String(i.id || (i.clientName + '|' + i.address)));
    }
    if (!isUser && content.includes('|') && content.toLowerCase().includes('cliente')) {
      const parsed = parseMarkdownTableToInstallations(content, actions, hasClientSelectActions);
      return uniqBy(parsed, (i) => String(i.id || (i.clientName + '|' + i.address)));
    }
    return [];
  }, [metadata, content, isUser, actions, hasClientSelectActions]);

  const unconfiguredOnus = useMemo(() => {
    if (isUser) return [];
    // Solo mostrar la tabla de Disponibilidad SmartOLT si el mensaje es refresh onu
    const isRefreshOnu = content.toLowerCase().includes('refresh onu') || content.toLowerCase().includes('refresh onu-list');
    if (isRefreshOnu) return [];
    const parsed = parseUnconfiguredOnusFromMarkdown(content);
    // Deduplicate by SN/serial/label
    return uniqBy(parsed, (o) => String((o.sn || o.serial || '').toString()).trim());
  }, [content, isUser]);

  const hasOnuTableInContent = useMemo(() => {
    if (isUser) return false;
    // If a flow label explicitly marks this as "Cambio de ONU", treat it as an ONU table.
    if (/🔁\s*Flujo:\s*Cambio\s*de\s*ONU/i.test(content)) return true;
    return /\|\s*#\s*\|\s*OLT\s*\|\s*SN/i.test(content) || /onus sin autorizar/i.test(content) || /olt\s*\|\s*sn/i.test(content);
  }, [content, isUser]);

  const monitorPanel = useMemo(() => {
    if (isUser) return null;
    const hasMonitorSignal = /panel\s+monitoreo\s+smartolt|monitoreo\s+cliente/i.test(content) || !!metadata?.monitor;
    if (!hasMonitorSignal) return null;

    const parsed = parseMonitorPanelFromContent(content);
    const fromMeta = (metadata?.monitor || {}) as MonitorMetadata;
    const smartoltRaw = ((metadata?.monitor || {}) as any)?.smartolt || {};

    const runningFromRaw =
      smartoltRaw?.runningConfig?.running_config ||
      smartoltRaw?.runningConfig?.runningConfig ||
      smartoltRaw?.runningConfig?.config ||
      smartoltRaw?.runningConfig;

    const fullStatusFromRaw =
      smartoltRaw?.fullStatus?.full_status_info ||
      smartoltRaw?.fullStatus?.fullStatusInfo ||
      smartoltRaw?.fullStatusInfo;

    const signalValueFromRaw =
      smartoltRaw?.signal?.onu_signal_value ||
      smartoltRaw?.details?.onu_details?.onu_signal_value;

    const signal1310FromRaw =
      smartoltRaw?.signal?.onu_signal_1310 ||
      smartoltRaw?.details?.onu_details?.signal_1310;

    const signal1490FromRaw =
      smartoltRaw?.signal?.onu_signal_1490 ||
      smartoltRaw?.details?.onu_details?.signal_1490;

    const panel = {
      clientName: fromMeta.clientName || parsed.clientName,
      clientIdServicio: fromMeta.clientIdServicio || parsed.clientIdServicio,
      ip: fromMeta.ip || parsed.ip,
      onuExternalId: fromMeta.onuExternalId || parsed.onuExternalId,
      refreshedAt: fromMeta.refreshedAt,
      graphType: fromMeta.graphType || parsed.graphType || 'daily',
      statusSummary: fromMeta.statusSummary || parsed.statusSummary,
      onlineUptime: fromMeta.onlineUptime || parsed.onlineUptime,
      distanceOltOnu: fromMeta.distanceOltOnu || parsed.distanceOltOnu,
      wisphubServiceStatus: fromMeta.wisphubServiceStatus || parsed.wisphubServiceStatus,
      lastInvoiceDate: fromMeta.lastInvoiceDate || parsed.lastInvoiceDate,
      lastInvoicePaid: fromMeta.lastInvoicePaid || parsed.lastInvoicePaid,
      signalValue: fromMeta.signalValue || parsed.signalValue || toMonitorTextBlock(signalValueFromRaw),
      rx: fromMeta.rx || parsed.rx,
      tx: fromMeta.tx || parsed.tx,
      signal1310: toDbmString(fromMeta.signal1310 || signal1310FromRaw),
      signal1490: toDbmString(fromMeta.signal1490 || signal1490FromRaw),
      runningConfig: toMonitorTextBlock(fromMeta.runningConfig || runningFromRaw),
      fullStatusInfo: toMonitorTextBlock(fromMeta.fullStatusInfo || fullStatusFromRaw, 3500),
      rut: fromMeta.rut || parsed.rut,
      plan: fromMeta.plan || parsed.plan,
      signalGraphUrl: fromMeta.signalGraphUrl || parsed.signalGraphUrl,
      trafficGraphUrl: fromMeta.trafficGraphUrl || parsed.trafficGraphUrl,
      resyncLine: parsed.resyncLine,
      apiWarnings: parsed.apiWarnings || ((fromMeta.failedApis || []).length ? `⚠️ APIs con error: ${fromMeta.failedApis?.join(' | ')}` : undefined)
    };

    if (!panel.clientName && !panel.onuExternalId && !panel.statusSummary) return null;
    return panel;
  }, [content, metadata, isUser]);

  const monitorGraphTypeLabel = useMemo(() => {
    const type = String(monitorPanel?.graphType || '').toLowerCase();
    if (type.includes('hour') || type.includes('hora')) return 'Hora';
    if (type.includes('week') || type.includes('seman')) return 'Semana';
    if (type.includes('month') || type.includes('mes')) return 'Mes';
    if (type.includes('year') || type.includes('año') || type.includes('ano')) return 'Año';
    return 'Día';
  }, [monitorPanel?.graphType]);

  const monitorStatusTone = useMemo(() => getMonitorStatusTone(monitorPanel?.statusSummary), [monitorPanel?.statusSummary]);
  const monitorIsUpdating = Boolean(monitorPanel && isLatest && (isAwaitingResponse || isMonitorRefreshing));
  const monitorLastUpdateLabel = useMemo(() => {
    const updateSource = monitorPanel?.refreshedAt || createdAt;
    if (!updateSource) return null;
    const date = new Date(updateSource);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }, [monitorPanel?.refreshedAt, createdAt]);
  const monitorPeriodKey = useMemo(() => normalizeText(monitorGraphTypeLabel), [monitorGraphTypeLabel]);

  useEffect(() => {
    if (!monitorPanel?.onuExternalId) setMonitorLive(false);
  }, [monitorPanel?.onuExternalId]);

  useEffect(() => {
    if (!monitorPanel?.onuExternalId) return;
    setShowRunningConfig(false);
    setShowFullStatusInfo(false);
  }, [monitorPanel?.onuExternalId]);

  useEffect(() => {
    if (!monitorLive || !monitorPanel?.onuExternalId || !isLatest || disableActionButtons) return;
    const interval = setInterval(() => {
      invokeAction(`monitoreo refresh ${monitorPanel.onuExternalId}`, monitorPanel.onuExternalId, 'monitor_refresh_live', false);
    }, 30000);
    return () => clearInterval(interval);
  }, [monitorLive, monitorPanel?.onuExternalId, isLatest, disableActionButtons]);

  useEffect(() => {
    if (!monitorPanel?.onuExternalId || !isLatest || disableActionButtons || !onReplaceMessage) return;
    const key = `${messageId || 'no-id'}:${monitorPanel.onuExternalId}`;
    if (monitorInitialRefreshKeyRef.current === key) return;
    monitorInitialRefreshKeyRef.current = key;
    invokeAction(`monitoreo refresh ${monitorPanel.onuExternalId}`, monitorPanel.onuExternalId, 'monitor_refresh_boot', false);
  }, [monitorPanel?.onuExternalId, isLatest, disableActionButtons, onReplaceMessage, messageId]);
  
  const hasInstallationsTable = Boolean(installations.length);

  // --- LÓGICA DE ANIMACIÓN ---
  
  const finalCleanText = useMemo(() => {
    if (isUser) return content;
    if (monitorPanel) {
      const lines = ['📡 Panel de monitoreo actualizado'];
      if (monitorPanel.resyncLine) lines.push(monitorPanel.resyncLine);
      if (monitorPanel.apiWarnings) lines.push(monitorPanel.apiWarnings);
      return lines.join('\n');
    }
    const isRefreshOnu = content.toLowerCase().includes('refresh onu') || content.toLowerCase().includes('refresh onu-list');
    let cleanedContent = content;
    if (hasInstallationsTable || hasSmartoltTable || hasOnuTableInContent) {
      const tableRegex = /^\|.*\|[\s\S]*?(\n(?![ \t]*\|)|$)/gm;
      cleanedContent = cleanedContent.replace(tableRegex, '').trim();
    }
    // Ocultar encabezado y bloque de 'ONUs sin autorizar' si es refresh onu
    if (isRefreshOnu) {
      cleanedContent = cleanedContent.replace(/ONUs?\s+sin\s+autorizar[\s\S]*?(?=Disponibilidad|$)/i, '').trim();
    }
    return cleanedContent || (hasInstallationsTable ? "He encontrado las siguientes instalaciones:" : "");
  }, [content, isUser, hasInstallationsTable, hasSmartoltTable, hasOnuTableInContent, monitorPanel]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    if (shouldAnimate && !isUser) {
      setDisplayedContent('');
      setIsTyping(true);
      let index = 0;
      
      timeout = setTimeout(() => {
        interval = setInterval(() => {
          if (index < finalCleanText.length) {
            setDisplayedContent(finalCleanText.slice(0, index + 1));
            index++;
          } else {
            setIsTyping(false);
            if (interval) clearInterval(interval);
          }
        }, 10);
      }, 50);

    } else {
      setDisplayedContent(finalCleanText);
      setIsTyping(false);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [finalCleanText, shouldAnimate, isUser]);


  // --- HANDLERS Y FETCHING ---
  
  const fetchOdbOptionsForZone = async (zone: string) => {
    const trimmed = zone.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`${API_BASE}/smartolt/zones/${encodeURIComponent(trimmed)}/odbs`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data?.odbs)) {
        const odbMap: Record<string, string> = {};
        const options = data.odbs.map((o: OdbApiResponseItem) => {
            if (o?.name && o?.externalId) odbMap[o.name] = String(o.externalId);
            return o?.name || (o?.id ? String(o.id) : '');
          }).filter(Boolean).map(String);
        setDynamicOptions((prev) => ({ ...prev, 'auth-odb': options }));
        setOdbNameToExternalId(odbMap);
      }
    } catch (err) { console.error(err); }
  };

  const fetchPortsForOdb = async (odbNameOrId: string) => {
    const externalId = odbNameToExternalId[odbNameOrId] || odbNameOrId;
    if (!externalId) return;
    try {
      const res = await fetch(`${API_BASE}/odb/odbs/${encodeURIComponent(externalId)}/ports`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data?.ports)) {
        const portOptions = data.ports.map((p: PortApiResponseItem) => 
          typeof p === 'object' ? String(p.port) : String(p)
        );
        setDynamicOptions((prev) => ({ ...prev, 'auth-odb-port': portOptions }));
      }
    } catch (err) { console.error(err); }
  };

  const downloadImage = (url: string) => {
    const fullUrl = resolveImageUrl(url);
    if(!fullUrl) return;
    const link = document.createElement('a');
    link.href = fullUrl;
    link.download = `smartolt-evidencia-${Date.now()}.png`;
    link.click();
  };

  const resolvePayload = (actionPayload?: string, value?: string) => {
    let payload = actionPayload || value || '';
    if (!payload) return '';

    if (payload.includes('{input}') && value) {
      payload = payload.replace('{input}', value);
    }

    if (payload.includes('{')) {
      Object.entries(inputValues).forEach(([key, val]) => {
        if (!key) return;
        payload = payload.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val ?? ''));
      });
    }

    return payload;
  };

  // Decide whether to replace the current assistant message (refresh) or send a normal action
  const executeResolvedAction = (resolved: string, actionPayload?: string, value?: string, actionId?: string, showProcessing: boolean = true) => {
    if (disableActionButtons) return;

    const lowSource = ((actionId || actionPayload || value) || '').toString().toLowerCase();
    const lockSource = `${actionId || ''} ${actionPayload || ''} ${value || ''} ${resolved}`.toLowerCase();
    const isSingleUse = isSingleUseSelectionAction(lockSource);
    const lockKey = getActionLockKey(actionId, actionPayload, resolved || value);

    if (isSingleUse && lockKey && consumedActionKeysRef.current.has(lockKey)) return;

    const replacePattern = /refresh\s*onu|refresh\s*onu-list|refrescar\s*onu|refrescar\s*onus|refrescar\s*onu-list|^refresh|monitoreo\s+refresh|monitoreo\s+resync|monitoreo\s+grafico|monitoreo\s+gr[aá]fico|monitoreo\s+periodo|monitoreo\s+per[ií]odo/i;
    const normalizedActionId = (actionId || '').toLowerCase();
    const monitorPanelAction = /^monitor[_-](graph|refresh|resync)/.test(normalizedActionId) || normalizedActionId === 'monitor_refresh_live';
    const shouldReplace = replacePattern.test(lowSource) || normalizedActionId.includes('refresh') || monitorPanelAction;
    const monitorActionRequested = monitorPanelAction || /monitoreo\s+(refresh|resync|grafico|gr[aá]fico|periodo|per[ií]odo)/i.test(lockSource);
    const canReplace = Boolean(shouldReplace && onReplaceMessage && messageId);
    const canSelect = Boolean(onActionSelect);
    const hasHandler = canReplace || canSelect;
    if (!hasHandler) return;

    const isClientLoading = /seleccionar\s+cliente|select-client|buscar\s+cliente|search\s+client/i.test(lowSource);
    const loadingTitle = isClientLoading ? 'Cargando cliente…' : 'Cargando…';
    const loadingDescription = isClientLoading
      ? 'Buscando información del cliente, espera un momento.'
      : 'Procesando solicitud, por favor espera.';

    const run = async () => {
      let lockApplied = false;
      try {
        if (isSingleUse && lockKey) {
          consumedActionKeysRef.current.add(lockKey);
          lockApplied = true;
          setConsumedActionVersion((v) => v + 1);
        }

        if (showProcessing) {
          openProcessingModal(loadingTitle, loadingDescription);
        }

        if (monitorActionRequested) {
          setIsMonitorRefreshing(true);
        }

        if (canReplace) {
          await onReplaceMessage?.(messageId, resolved);
        } else {
          await onActionSelect?.(resolved);
        }
      } catch (err) {
        if (lockApplied && lockKey) {
          consumedActionKeysRef.current.delete(lockKey);
          setConsumedActionVersion((v) => v + 1);
        }
        console.error('invokeAction error', err);
      } finally {
        if (monitorActionRequested) {
          if (monitorRefreshTimerRef.current) clearTimeout(monitorRefreshTimerRef.current);
          monitorRefreshTimerRef.current = setTimeout(() => setIsMonitorRefreshing(false), 450);
        }
        if (showProcessing) {
          closeProcessingModal();
        }
      }
    };

    void run();
  };

  const invokeAction = (actionPayload?: string, value?: string, actionId?: string, showProcessing: boolean = true) => {
    if (disableActionButtons) return;

    const resolved = resolvePayload(actionPayload, value);
    if (!resolved) return;

    const needsBajaConfirmation = /^dar\s+(?:de\s+)?baja\s+submit\s+\d+/i.test(resolved.trim());
    if (needsBajaConfirmation) {
      setPendingConfirmAction({ resolved, actionPayload, value, actionId, showProcessing });
      setConfirmBajaOpen(true);
      return;
    }

    executeResolvedAction(resolved, actionPayload, value, actionId, showProcessing);
  };

  const handleOnuSelect = (onu: OnuEntry, olt: OltEntry) => {
    setSelectedOnu({ oltId: olt.oltId, board: onu.board, port: onu.port, ponType: onu.ponType, onuId: onu.id });
    if (onu.actionPayload) invokeAction(onu.actionPayload, onu.label, onu.id);
  };

  const safeActions = useMemo(() => (Array.isArray(actions) ? actions.filter((a) => a?.type) : []), [actions]);
  
  const inputActions = useMemo(() => {
    const rawInputs = safeActions.filter((a) => a.type === 'input');
    const hasSpeedPrev = !!inputValues['auth-speed'] || !!inputValues['auth-download'] || !!inputValues['auth-upload'];
    
    const filtered = rawInputs.filter((a) => {
        if (HIDDEN_FIELDS.includes(a.id)) return false;
        if (selectedOnu && ["auth-olt_id", "auth-board", "auth-port"].includes(a.id)) return false;
        return !["auth-download", "auth-upload"].includes(a.id);
    }).map(a => ({ ...a, options: dynamicOptions[a.id] || a.options }));

    if ((rawInputs.some(a => ['auth-download', 'auth-upload'].includes(a.id)) || hasSpeedPrev) && !filtered.some(a => a.id === 'auth-speed')) {
      filtered.push({
        id: 'auth-speed', label: 'Velocidad (M)', placeholder: 'Ej: 300M',
        options: ['200M', '400M', '600M', '800M'], helperText: 'Velocidad simétrica', type: 'input'
      });
    }
    return filtered;
  }, [safeActions, selectedOnu, dynamicOptions, inputValues]);

  const buttonActions = safeActions
    .filter((a) => a.type === 'button' || a.type === 'link')
    .filter((a) => {
      if (hasSmartoltTable) {
        if (a.id.includes('select-onu') || (a.payload || '').toLowerCase().includes('seleccionar onu')) {
          return false;
        }
      }
      return true;
    });

  const submitAction = buttonActions.find((a) => {
    const id = String(a.id || '').toLowerCase();
    if (['auth-submit', 'wan-apply', 'wifi_submit', 'change-onu-submit'].includes(id)) return true;
    // Match explicit wifi submit/apply variants only (avoid matching search buttons like wifi_search_submit)
    if (/^wifi(?:[_-]?)(?:apply|submit)$/i.test(id)) return true;
    // Match explicit change-onu submit/apply (english/spanish)
    if (/^(?:change[_-]?onu|cambio[_-]?onu)(?:[_-]?(?:submit|apply))?$/i.test(id)) return true;
    return false;
  });
  
  const selectionButtonsToRender = buttonActions.filter((a) => {
    const isSelection = a.id.startsWith('select') || (a.payload || '').toLowerCase().includes('seleccionar');
    if (!isSelection) return false;
    if (hasInstallationsTable && (a.id.startsWith('select-installation-') || installations.some(i => i.actionPayload === a.payload))) return false;
    if (hasInstallationsTable && hasClientSelectActions && ((a.payload || '').toLowerCase().includes('seleccionar cliente') || a.id.startsWith('select-client-'))) return false;
    return true;
  });

  const selectionIds = new Set(selectionButtonsToRender.map(a => a.id));
  const otherButtons = buttonActions.filter(a => a.id !== submitAction?.id && !selectionIds.has(a.id) && !a.id.startsWith('select-installation-'))
    .filter(a => !(hasInstallationsTable && hasClientSelectActions && (a.id.startsWith('select-client-') || (a.payload || '').toLowerCase().includes('seleccionar cliente'))));

  const isMonitorControlAction = (action: ActionOption) => {
    const actionSource = normalizeText(`${action.id || ''} ${action.label || ''} ${action.payload || ''}`);
    if (!actionSource) return false;
    if (/^monitor[_-]/.test(normalizeText(action.id || ''))) return true;
    return /monitoreo\s+(refresh|resync|grafico|periodo|hora|dia|semana|mes|ano)/.test(actionSource);
  };

  const monitorControlButtons = monitorPanel ? otherButtons.filter(isMonitorControlAction) : [];
  const monitorControlIds = new Set(monitorControlButtons.map((a) => a.id));
  const nonMonitorButtons = otherButtons.filter((a) => !monitorControlIds.has(a.id));
  
const handleBulkSubmit = async () => {
  if (disableActionButtons || submitInFlightRef.current) return;
  submitInFlightRef.current = true;
  setIsSubmitting(true);

  let shouldUseProcessingModal = false;
  let isAuthFlow = false;

  try {
    // 1. Identificar el tipo de acción
    const sid = String(submitAction?.id || '').toLowerCase();
    const isWanFlow = sid === 'wan-apply' || sid.endsWith('wan-apply');
    const isWifiFlow = /^wifi(?:[_-]?)(?:apply|submit)$/i.test(sid);
    const isAuth = sid === 'auth-submit';
    const isChangeOnuFlow = /^(?:change[_-]?onu|cambio[_-]?onu)/i.test(sid);
    isAuthFlow = isAuth;

    // 2. Validación específica para WiFi (antes de procesar nada)
    if (isWifiFlow) {
      // Support different wifi field ids returned by backend (wifi_pass, wifi_onu_pass, wifi_passwd...)
      const pass = inputValues['wifi_pass'] || inputValues['wifi_onu_pass'] || inputValues['wifi_passwd'] || '';
      // Regex: Mínimo 8 caracteres (sin requerir mayúscula ni número)
      const passRegex = /^.{8,}$/;
      if (!passRegex.test(pass)) {
        setWifiError("La contraseña debe tener mín. 8 caracteres.");
        return; // Detener ejecución si la validación falla
      }
      setWifiError(null);
    }

    // 3. Mostrar modal de espera para todos los flujos con respuesta asíncrona
    shouldUseProcessingModal = isAuth || isWanFlow || isWifiFlow || isChangeOnuFlow;
    if (shouldUseProcessingModal) {
      if (isAuth) {
        openProcessingModal('Cargando…', 'Dame un momento mientras autorizo en SmartOLT y registro la ONU.');
      } else if (isWifiFlow) {
        openProcessingModal('Cargando…', 'Aplicando configuración WiFi, espera un momento.');
      } else if (isWanFlow) {
        openProcessingModal('Cargando…', 'Aplicando configuración WAN, espera un momento.');
      } else if (isChangeOnuFlow) {
        openProcessingModal('Cargando…', 'Procesando cambio de ONU, espera un momento.');
      }
    }

    // 4. Recolección de Datos (Inputs + ONU Seleccionada)
    const collected: Record<string, string> = {};
    let speedValue = '';

    // Asegurarnos de incluir 'auth-speed' en la recolección si existe en los inputs dinámicos
    const allInputActions = [...safeActions];
    if (inputActions.some(a => a.id === 'auth-speed') && !allInputActions.find(a => a.id === 'auth-speed')) {
        allInputActions.push({ id: 'auth-speed', label: 'Speed', type: 'input' });
    }

    for (const action of allInputActions) {
      if (action.type !== 'input') continue;

      const val = (inputValues[action.id] || action.placeholder || '').toString().trim();
      
      // Ignorar campos vacíos que no sean estrictamente necesarios (excepto SN o Wifi)
      if (!val && action.id !== 'auth-sn' && !action.id.startsWith('wifi_') && !HIDDEN_FIELDS.includes(action.id)) continue;
      
      // Normalizar velocidad si es necesario
      if (action.id === 'auth-speed') { 
        speedValue = normalizeSpeedProfile(val); 
        continue; 
      }

      // Limpiar prefijos de las claves (auth- o wan-)
      const key = action.id.startsWith('wifi_') ? action.id : action.id.replace(/^auth-|^wan-/, '');
      collected[key] = val;
    }

    // Asignar perfiles de velocidad si se detectaron
    if (speedValue) {
      collected['download_speed_profile_name'] = speedValue;
      collected['upload_speed_profile_name'] = speedValue;
    }

    // Fusionar con los datos de la ONU seleccionada (Board, Port, SN, etc.)
    if (selectedOnu) {
      Object.assign(collected, selectedOnu);
    }

    // Preparar payload para acciones genéricas (reemplazo de variables como {ssid}).
    // Aplicar el mismo reemplazo de placeholders para el flujo de cambio de ONU.
    let finalPayload = submitAction?.payload || '';
    if ((isWifiFlow || isChangeOnuFlow) && finalPayload) {
      Object.keys(collected).forEach((key) => {
        finalPayload = finalPayload.replace(new RegExp(`{${key}}`, 'g'), collected[key]);
      });
    }

    // 5. Ejecución de la Promesa (Try / Catch)
    try {
      if (isAuth) {
        // A) FLUJO DE AUTORIZACIÓN (CON MODAL)
        
        // PASO CRÍTICO: Esperar a que el backend termine el proceso real.
        // El modal se queda en estado "loading" en el primer paso mientras esto ocurre.
        const authResult = await onSubmitAuth?.(collected);
        if (authResult === false) {
          throw new Error('Auth submission failed');
        }

        setProcessingStatus('success');
        await new Promise((resolve) => setTimeout(resolve, 900));
        closeProcessingModal();

      } 
      else if (isChangeOnuFlow) {
        if (onSubmitAction) await onSubmitAction(finalPayload, collected);
        else if (onActionSelect) await onActionSelect(finalPayload);
      }
      else if (isWifiFlow) {
        // B) FLUJO WIFI
        if (onSubmitAction) await onSubmitAction(finalPayload, collected);
        else if (onActionSelect) await onActionSelect(finalPayload);
      } 
      else if (isWanFlow) {
        // C) FLUJO WAN
        await onSubmitWan?.(collected);
      } 
      else {
        // D) DEFAULT
        const defaultAuthResult = await onSubmitAuth?.(collected);
        if (defaultAuthResult === false) {
          throw new Error('Auth submission failed');
        }
      }

    } catch (e) {
      console.error("Error en submit:", e);

      // --- ZONA DE ERROR (SOLO PARA AUTH) ---
      if (isAuth) {
        setProcessingStatus('error');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        closeProcessingModal();
      }
      // Nota: Para otros flujos (Wifi/Wan) podrías poner un toast de error aquí si quisieras.
    }
    } finally {
      if (!isAuthFlow && shouldUseProcessingModal) {
        closeProcessingModal();
      }
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };
  const hasVersions = versions && versions.length > 1;
  const currentIdx = currentVersion ?? 0;

  return (
    <div 
      ref={messageRef} 
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${highlighted ? 'bg-neutral-900/40' : ''} px-2 sm:px-3 py-2 scroll-mt-16`} // scroll-mt-16 da margen arriba
    >
      <div className="w-full max-w-4xl flex gap-2 sm:gap-3 items-start">
        {!isUser && (
          <div className="hidden sm:flex mt-1 h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1e3a8a] border border-[#1e3a8a] text-orange-500" aria-label="Bot">
            <Bot className="size-4" />
          </div>
        )}
        
        <div className="flex-1 group min-w-0">
          {isUser ? (
            <div className="flex flex-col items-end">
              <div className="text-xs text-neutral-500 mb-1.5 mr-1 font-medium">{authUser?.username || 'Tú'}</div>
              <div className="inline-block max-w-[98%] sm:max-w-[85%] bg-neutral-800 text-neutral-50 px-3.5 sm:px-4 py-2.5 rounded-2xl border border-neutral-700/60 text-[15px] whitespace-pre-wrap shadow-sm">
                {displayedContent}
                
                {imageDataUrl && (
                  <div className="mt-3 relative group/img overflow-hidden rounded-xl border border-neutral-700 max-w-full sm:max-w-xs">
                    <ImagePreview 
                      src={imageDataUrl}
                      alt="Enviada"
                      onClick={() => { setZoomImageUrl(imageDataUrl); setIsZoomed(true); }}
                      className="max-h-64 w-full object-cover cursor-pointer"
                    />
                  </div>
                )}
              </div>
              {createdAt && <div className="mt-1 mr-2 text-[10px] text-neutral-500">{new Date(createdAt).toLocaleTimeString()}</div>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-neutral-50 text-sm sm:text-[15px] leading-[1.8] whitespace-pre-wrap break-words">
                {displayedContent}
                {isTyping && <span className="inline-block w-1.5 h-4 align-middle bg-emerald-400 ml-1 animate-pulse rounded-sm" />}

                {/* Ocultar ONUs sin autorizar si es refresh onu */}
                {unconfiguredOnus.length > 0 && !hasSmartoltTable && !(content.toLowerCase().includes('refresh onu') || content.toLowerCase().includes('refresh onu-list')) && (
                  <div className="mt-4 w-full flex flex-col items-center md:items-stretch px-1 sm:px-0">
                    <div className="w-full max-w-[22rem] md:max-w-none mx-auto space-y-4">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                        <span className="h-2 w-2 rounded-full bg-amber-500" /> ONUs sin autorizar para intercambiar
                      </div>

                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-2 overflow-hidden shadow-sm w-full">
                        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-neutral-800/50 text-[11px] font-bold text-neutral-500 uppercase">
                          <div className="col-span-3">OLT / Label</div>
                          <div className="col-span-2 text-center">PON</div>
                          <div className="col-span-2 text-center">Port</div>
                          <div className="col-span-3">Modelo</div>
                          <div className="col-span-2 text-right">Acción</div>
                        </div>

                        <div className="divide-y divide-neutral-800">
                          {unconfiguredOnus.map((o: UnconfiguredOnu, idx: number) => {
                            const sn = String(o.sn || o.serial || '').trim();
                            // hide entries without a serial/SN (no actionable ONU)
                            if (!sn) return null;
                            const label = sn || o.model || 'Sin etiqueta';
                            const actionMatch = safeActions.find(a => String(a.label || '').trim() === sn || String(a.payload || '').includes(sn));
                            const oltRaw = String(o.olt || '').trim();
                            const oltMatch = oltRaw.match(/\[(\d+)\]/);
                            const oltPart = oltMatch ? ` olt ${oltMatch[1]}` : (/^\d+$/.test(oltRaw) ? ` olt ${oltRaw}` : '');
                            const ponPart = o.pon ? ` pon ${o.pon}` : '';
                            const portPart = o.port ? ` port ${o.port}` : '';
                            const modelPart = o.model ? ` model ${o.model}` : '';
                            const fallbackPayload = `seleccionar onu ${sn}${oltPart}${ponPart}${portPart}${modelPart}`;
                            const rowActionLocked = isActionLocked(actionMatch?.id, actionMatch?.payload || fallbackPayload, actionMatch?.label || sn);
                            return (
                              <div key={idx} className="flex flex-col md:grid md:grid-cols-12 md:items-center gap-3 md:gap-2 px-3 sm:px-4 py-3 text-[13px] hover:bg-neutral-800/30 transition-colors">
                                <div className="col-span-12 md:col-span-3 flex flex-col md:flex-row md:items-center gap-2">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-neutral-200 truncate">{label}</span>
                                    <span className="text-[11px] font-mono text-neutral-500 uppercase bg-neutral-900/50 px-1 rounded w-fit mt-0.5">{sn || 'Sin SN'}</span>
                                  </div>
                                  <span className="md:hidden px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 text-[10px] font-bold border border-amber-500/20">{o.olt || ''}</span>
                                </div>

                                <div className="col-span-12 md:col-span-2 flex items-center md:justify-center text-neutral-300">
                                  <span className="font-mono bg-neutral-800/40 px-1.5 py-0.5 rounded">{o.pon || '-'}</span>
                                </div>

                                <div className="col-span-12 md:col-span-2 flex items-center md:justify-center text-neutral-300">
                                  <span className="font-mono bg-neutral-800/40 px-1.5 py-0.5 rounded">{o.port || '-'}</span>
                                </div>

                                <div className="col-span-12 md:col-span-3 text-xs text-neutral-400 italic truncate flex items-center gap-2">
                                  {o.model || 'N/A'}
                                </div>

                                <div className="col-span-12 md:col-span-2 text-right mt-1 md:mt-0">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      if (actionMatch) {
                                        invokeAction(actionMatch.payload, actionMatch.label, actionMatch.id);
                                      } else if (sn) {
                                        invokeAction(fallbackPayload, sn);
                                      }
                                    }}
                                    disabled={disableActionButtons || rowActionLocked}
                                    className="w-full md:w-auto h-10 md:h-8 px-4 text-xs font-semibold bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md rounded-lg active:scale-95 transition-transform"
                                  >
                                    Seleccionar
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* If the assistant included an ONU table but parsing returned no rows, show a friendly notice, except on refresh onu */}
                {hasOnuTableInContent && !hasSmartoltTable && unconfiguredOnus.length === 0 && !(content.toLowerCase().includes('refresh onu') || content.toLowerCase().includes('refresh onu-list')) && (
                  <div className="mt-4 w-full">
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 text-sm text-neutral-300">
                      <div className="font-semibold text-neutral-200 mb-1">ONUs sin autorizar para intercambiar</div>
                      <div className="text-xs text-neutral-400">No se encontraron ONUs libres para asignar. Intenta refrescar o verifica en SmartOLT.</div>
                    </div>
                  </div>
                )}

                {imageDataUrl && (
                  <div className="mt-4 relative group/img w-full max-w-sm sm:max-w-md">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 shadow-xl transition-all hover:border-emerald-500/50 overflow-hidden">
                        <ImagePreview 
                          src={imageDataUrl}
                          alt="Evidencia técnica"
                          onClick={() => { setZoomImageUrl(imageDataUrl); setIsZoomed(true); }}
                          onDownload={() => downloadImage(imageDataUrl)}
                          className="h-auto max-h-[350px] object-cover"
                        />
                    </div>
                  </div>
                )}

                {monitorPanel && (
                  <div className={`mt-4 w-full rounded-2xl border bg-white p-4 sm:p-5 transition-all duration-300 ${monitorIsUpdating ? 'border-[#1e3a8a]/30 shadow-md shadow-[#1e3a8a]/10' : 'border-[#1e3a8a]/15 shadow-sm'}`}>
                    <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`h-2.5 w-2.5 rounded-full ${monitorStatusTone.dotClass} ${monitorIsUpdating ? 'animate-pulse' : ''}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 tracking-wide truncate">Panel Monitoreo SmartOLT</div>
                          <div className="text-[11px] text-gray-500 truncate">
                            {monitorLastUpdateLabel ? `Actualizado ${monitorLastUpdateLabel}` : 'Actualización disponible'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] px-2 py-1 rounded border font-medium ${monitorStatusTone.badgeClass}`}>
                          {monitorPanel.statusSummary || 'Sin estado'}
                        </span>
                        {monitorPanel.onuExternalId && (
                          <span className="text-[11px] font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded border border-gray-200">ONU {monitorPanel.onuExternalId}</span>
                        )}
                        {monitorPanel.onuExternalId && (
                          <Button
                            size="sm"
                            disabled={disableActionButtons}
                            onClick={() => setMonitorLive((prev) => !prev)}
                            className={`h-7 px-2.5 text-[11px] border transition-all duration-200 ${monitorLive ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white' : 'bg-[#1e3a8a] hover:bg-[#243f96] border-[#1e3a8a] text-white'}`}
                          >
                            {monitorLive ? '⏸ Detener tiempo real' : '▶ Tiempo real'}
                          </Button>
                        )}
                      </div>
                    </div>

                    {monitorIsUpdating ? (
                      <div className="mb-3 text-[11px] text-[#1e3a8a] bg-[#1e3a8a]/5 border border-[#1e3a8a]/20 rounded-lg px-3 py-2 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Actualizando métricas y gráficos del panel...
                      </div>
                    ) : monitorLive ? (
                      <div className="mb-3 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        Monitoreo en tiempo real activo: actualización automática cada 30 segundos.
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs mb-3">
                      {[
                        { label: 'Cliente', value: monitorPanel.clientName || 'N/D', spanTwoMobile: true },
                        { label: 'Servicio', value: monitorPanel.clientIdServicio || 'N/D' },
                        { label: 'IP', value: monitorPanel.ip || 'N/D' },
                        { label: 'Período', value: monitorGraphTypeLabel },
                        { label: 'Status', value: monitorPanel.statusSummary || 'N/D' },
                        { label: 'ONU/OLT Rx signal', value: monitorPanel.signalValue || monitorPanel.rx || 'N/D', spanTwoMobile: true },
                        { label: '1310nm (OLT Rx)', value: monitorPanel.signal1310 || 'N/D' },
                        { label: '1490nm (ONU Rx)', value: monitorPanel.signal1490 || 'N/D' },
                        { label: 'TX', value: monitorPanel.tx || 'N/D' },
                        { label: 'Distancia ONU-OLT', value: monitorPanel.distanceOltOnu || 'N/D' },
                        { label: 'Tiempo en línea', value: monitorPanel.onlineUptime || 'N/D' },
                        { label: 'Estado WispHub', value: monitorPanel.wisphubServiceStatus || 'N/D' },
                        {
                          label: 'Última factura',
                          spanTwoMobile: true,
                          value: monitorPanel.lastInvoiceDate
                            ? `${monitorPanel.lastInvoiceDate}${monitorPanel.lastInvoicePaid ? ` (${monitorPanel.lastInvoicePaid})` : ''}`
                            : (monitorPanel.lastInvoicePaid || 'N/D')
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className={`rounded-lg border px-3 py-2 bg-gradient-to-b transition-all duration-200 ${monitorStatusTone.accentClass} ${monitorIsUpdating ? 'border-[#1e3a8a]/20' : 'border-[#1e3a8a]/15'} hover:border-[#1e3a8a]/25 hover:shadow-sm ${item.spanTwoMobile ? 'col-span-2 lg:col-span-1' : ''}`}
                        >
                          <span className="text-[#1e3a8a]/70">{item.label}</span>
                          <div className="text-gray-900 font-medium truncate">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {monitorControlButtons.length > 0 && (
                      <div className="mt-3 rounded-xl border border-[#1e3a8a]/15 bg-[#f7f9ff] p-2.5">
                        <div className="text-[11px] text-[#1e3a8a]/70 mb-2">Controles monitoreo</div>
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                          {monitorControlButtons.map((a) => {
                            const actionSource = normalizeText(`${a.label || ''} ${a.payload || ''}`);
                            const isPeriodAction = /(hora|dia|semana|mes|ano)/.test(actionSource) && /(monitor|monitoreo|grafico|periodo)/.test(actionSource);
                            const isActivePeriod = isPeriodAction && actionSource.includes(monitorPeriodKey);
                            const isRefreshAction = /(actualizar|refresh)/.test(actionSource);
                            const isResyncAction = /(resync)/.test(actionSource);
                            const isSearchClientAction = /(buscar\s+otro\s+cliente|buscar\s+cliente)/.test(actionSource);

                            if (a.type === 'link' && a.url) {
                              const href = a.url.startsWith('http') ? a.url : `${API_BASE}${a.url}`;
                              if (disableActionButtons) {
                                return (
                                  <span
                                    key={a.id}
                                    className="inline-flex items-center justify-center rounded-lg text-[11px] font-medium h-9 w-full sm:w-auto bg-gray-200 text-gray-500 px-3 border border-gray-200 cursor-not-allowed select-none"
                                    aria-disabled="true"
                                  >
                                    {a.label}
                                  </span>
                                );
                              }

                              return (
                                <a
                                  key={a.id}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center rounded-lg text-[11px] font-medium h-9 w-full sm:w-auto px-3 bg-white hover:bg-[#eef3ff] text-[#1e3a8a] hover:text-[#f5831f] border border-[#1e3a8a]/20 shadow-sm transition-colors no-underline"
                                >
                                  {a.label}
                                </a>
                              );
                            }

                            return (
                              <Button
                                key={a.id}
                                size="sm"
                                variant="secondary"
                                disabled={disableActionButtons || isActionLocked(a.id, a.payload, a.label)}
                                onClick={() => invokeAction(a.payload, a.label, a.id)}
                                className={`h-9 w-full sm:w-auto px-3 text-[11px] border transition-all duration-200 shadow-sm ${isActivePeriod ? 'bg-[#1e3a8a] text-white hover:bg-[#243f96] hover:!text-[#f5831f] border-[#1e3a8a]' : isRefreshAction ? 'bg-[#1e3a8a] text-white hover:bg-[#243f96] hover:!text-[#f5831f] border-[#1e3a8a]' : isResyncAction ? 'bg-white text-[#1e3a8a] hover:bg-[#eef3ff] hover:!text-[#f5831f] border-[#1e3a8a]/35' : isSearchClientAction ? 'bg-white text-gray-700 hover:bg-gray-100 hover:!text-[#f5831f] border-gray-200' : 'bg-white text-[#1e3a8a] hover:bg-[#eef3ff] hover:!text-[#f5831f] border-[#1e3a8a]/20'}`}
                              >
                                {a.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(monitorPanel.signalGraphUrl || monitorPanel.trafficGraphUrl) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        {monitorPanel.signalGraphUrl && (
                          <div className={`rounded-xl border bg-gray-50 p-2 transition-all duration-300 ${monitorIsUpdating ? 'border-[#1e3a8a]/25 shadow-sm shadow-[#1e3a8a]/10' : 'border-gray-200'}`}>
                            <div className="text-[11px] text-gray-600 mb-2">Gráfico señal ({monitorGraphTypeLabel.toLowerCase()})</div>
                            <ImagePreview
                              src={monitorPanel.signalGraphUrl}
                              alt="Gráfico señal"
                              className="h-44 rounded-lg border border-gray-200 cursor-zoom-in"
                              onClick={() => { setZoomImageUrl(monitorPanel.signalGraphUrl || null); setIsZoomed(true); }}
                              onDownload={() => monitorPanel.signalGraphUrl && downloadImage(monitorPanel.signalGraphUrl)}
                            />
                          </div>
                        )}
                        {monitorPanel.trafficGraphUrl && (
                          <div className={`rounded-xl border bg-gray-50 p-2 transition-all duration-300 ${monitorIsUpdating ? 'border-[#1e3a8a]/25 shadow-sm shadow-[#1e3a8a]/10' : 'border-gray-200'}`}>
                            <div className="text-[11px] text-gray-600 mb-2">Gráfico tráfico ({monitorGraphTypeLabel.toLowerCase()})</div>
                            <ImagePreview
                              src={monitorPanel.trafficGraphUrl}
                              alt="Gráfico tráfico"
                              className="h-44 rounded-lg border border-gray-200 cursor-zoom-in"
                              onClick={() => { setZoomImageUrl(monitorPanel.trafficGraphUrl || null); setIsZoomed(true); }}
                              onDownload={() => monitorPanel.trafficGraphUrl && downloadImage(monitorPanel.trafficGraphUrl)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {monitorPanel.runningConfig && (
                      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-gray-600">Running config</div>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => setShowRunningConfig((prev) => !prev)}
                            className="h-6 px-2 text-[10px] bg-white hover:bg-gray-100 border border-gray-200 text-gray-700"
                          >
                            {showRunningConfig ? 'Ocultar' : 'Mostrar'}
                          </Button>
                        </div>
                        {showRunningConfig && (
                          <pre className="max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white p-2.5 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap break-words">{monitorPanel.runningConfig}</pre>
                        )}
                      </div>
                    )}

                    {monitorPanel.fullStatusInfo && (
                      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-gray-600">Estado óptico detallado</div>
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => setShowFullStatusInfo((prev) => !prev)}
                            className="h-6 px-2 text-[10px] bg-white hover:bg-gray-100 border border-gray-200 text-gray-700"
                          >
                            {showFullStatusInfo ? 'Ocultar' : 'Mostrar'}
                          </Button>
                        </div>
                        {showFullStatusInfo && (
                          <pre className="max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white p-2.5 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap break-words">{monitorPanel.fullStatusInfo}</pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* --- TABLA INSTALACIONES (RESPONSIVE) --- */}
              {hasInstallationsTable && (
                <div className="mt-4 w-full flex flex-col items-center md:items-stretch px-1 sm:px-0">
                  <div className="w-full max-w-[22rem] md:max-w-none mx-auto space-y-3">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-[#1e3a8a] shadow-[0_0_0_3px_rgba(30,58,138,0.15)]" />
                      {hasClientSelectActions ? 'Clientes encontrados' : 'Instalaciones Pendientes'}
                    </div>
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 overflow-hidden shadow-sm w-full">
                      <div className="hidden md:grid grid-cols-12 px-4 py-2.5 text-[11px] uppercase text-neutral-500 border-b border-neutral-800/70 bg-neutral-950/30">
                        <div className="col-span-1">ID</div>
                        <div className="col-span-4">Cliente</div>
                        <div className="col-span-5">Dirección</div>
                        <div className="col-span-2 text-right">Acción</div>
                      </div>
                      
                      <div className="divide-y divide-neutral-800/60">
                        {installations.map((inst) => (
                          <div key={inst.id} className="flex flex-col md:grid md:grid-cols-12 md:items-center px-3 sm:px-4 py-4 md:py-3 gap-3 md:gap-2 text-sm text-neutral-100 hover:bg-neutral-800/40 transition-colors">
                            <div className="flex justify-between items-center md:hidden pb-2 border-b border-neutral-800/50">
                               <span className="text-xs font-mono text-neutral-500">#{inst.id}</span>
                               <span className="text-[10px] text-neutral-500 uppercase font-medium">Instalación</span>
                            </div>
                            <div className="md:col-span-1 font-mono text-xs text-neutral-500 hidden md:block">{inst.id}</div>
                            <div className="md:col-span-4 font-medium flex flex-col">
                              <span className="md:hidden text-[10px] text-neutral-500 uppercase mb-0.5">Cliente</span>
                              <span title={inst.clientName} className="break-words">{inst.clientName}</span>
                            </div>
                            <div className="md:col-span-5 text-xs text-neutral-400 flex flex-col md:flex-row md:items-center gap-1.5">
                              <span className="md:hidden text-[10px] text-neutral-500 uppercase mt-2 mb-0.5">Dirección</span>
                              <div className="flex items-start gap-1.5">
                                <MapPin className="size-3.5 shrink-0 mt-0.5 md:mt-0" /> 
                                <span className="break-words">{inst.address}</span>
                              </div>
                            </div>
                            <div className="md:col-span-2 md:text-right mt-2 md:mt-0">
                              <Button 
                                size="sm" 
                                onClick={() => inst.actionPayload && invokeAction(inst.actionPayload, inst.clientName)} 
                                disabled={disableActionButtons || isActionLocked(undefined, inst.actionPayload, inst.clientName)}
                                className="w-full md:w-auto h-9 md:h-7 text-xs font-semibold bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md rounded-lg active:scale-95 transition-all"
                              >
                                {(inst.actionPayload || '').toLowerCase().includes('seleccionar cliente') ? 'Seleccionar' : 'Autorizar'}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- TABLA SMARTOLT (RESPONSIVE) --- */}
              {hasSmartoltTable && (
                <div className="mt-4 w-full flex flex-col items-center md:items-stretch px-1 sm:px-0">
                  <div className="w-full max-w-[22rem] md:max-w-none mx-auto space-y-4">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Disponibilidad SmartOLT
                    </div>
                    {smartoltAvailability?.olts?.map((olt) => (
                      <div key={olt.oltId} className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 shadow-sm w-full">
                          <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
                          <div className="flex items-center gap-2">
                             <Server className="size-4 text-emerald-600"/>
                             <div className="text-sm font-bold text-emerald-500 uppercase tracking-wider">
                               {olt.oltName || 'OLT'}
                             </div>
                          </div>
                          <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2.5 py-1 rounded-full border border-neutral-700/50">
                            {(olt.onus || []).length} ONUs
                          </span>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-neutral-800/70 bg-black/20">
                          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-neutral-800/50 text-[11px] font-bold text-neutral-500 uppercase">
                            <div className="col-span-2">SN / Label</div>
                            <div className="col-span-1">Tipo</div>
                            <div className="col-span-2 text-center">Board/Port/Pon</div>
                            <div className="col-span-4">Descripción</div>
                            <div className="col-span-2 text-center">Modelo</div>
                            <div className="col-span-1 text-right">Acción</div>
                          </div>
                          <div className="divide-y divide-neutral-800">
                            {(olt.onus || []).map((onu) => (
                              <div key={onu.id} className="flex flex-col md:grid md:grid-cols-12 md:items-center gap-3 md:gap-2 px-3 sm:px-4 py-4 md:py-3 text-[13px] hover:bg-neutral-800/30 transition-colors">
                                 <div className="col-span-12 md:col-span-2 flex flex-row md:flex-col justify-between items-start md:justify-center">
                                  <div className="flex flex-col">
                                      <span className="font-medium text-neutral-200 truncate">{onu.label}</span>
                                      <span className="text-[11px] font-mono text-neutral-500 uppercase bg-neutral-900/50 px-1 rounded w-fit mt-0.5">{onu.sn || 'Sin SN'}</span>
                                  </div>
                                  <span className="md:hidden px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20">
                                    {onu.ponType || 'GPON'}
                                  </span>
                                </div>
                                <div className="hidden md:block col-span-4 md:col-span-1">
                                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20">
                                    {onu.ponType || 'GPON'}
                                  </span>
                                </div>
                                <div className="col-span-4 md:col-span-2 flex items-center md:justify-center gap-2 text-neutral-300">
                                  <Network className="size-3.5 md:hidden text-neutral-500" />
                                  <span className="md:hidden text-neutral-500 text-xs">Puerto:</span>
                                  <span className="font-mono bg-neutral-800/40 px-1.5 py-0.5 rounded">{onu.board}/{onu.port}/{onu.ponPort}</span>
                                </div>
                                <div className="col-span-12 md:col-span-4 text-xs text-neutral-400 italic truncate flex items-center gap-2">
                                  <span className="md:hidden not-italic font-semibold text-neutral-500">Desc:</span>
                                  {onu.description || 'Sin descripción'}
                                </div>
                                <div className="col-span-4 md:col-span-2 md:text-center text-neutral-400 flex items-center md:justify-center gap-2">
                                  <HardDrive className="size-3.5 md:hidden text-neutral-500" />
                                  <span className="md:hidden text-neutral-500 text-xs">Modelo:</span>
                                  {onu.type || onu.model || 'N/A'}
                                </div>
                                <div className="col-span-12 md:col-span-1 text-right mt-1 md:mt-0">
                                  <Button 
                                    size="sm" 
                                    onClick={() => handleOnuSelect(onu, olt)} 
                                    disabled={disableActionButtons || isActionLocked(onu.id, onu.actionPayload, onu.label)}
                                    className="w-full md:w-auto h-10 md:h-8 px-4 text-xs font-semibold bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md rounded-lg active:scale-95 transition-transform"
                                  >
                                    Usar
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* --- BOTONES Y ACCIONES --- */}
                <div className="mt-2 space-y-4 px-1 sm:px-0">
                {selectionButtonsToRender.length > 0 && (
                  <div className="w-full flex justify-start">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full md:max-w-none">
                      {selectionButtonsToRender.map(a => (
                        <Button
                          key={a.id}
                          size="sm"
                          variant="secondary"
                          disabled={disableActionButtons || isActionLocked(a.id, a.payload, a.label)}
                          onClick={() => invokeAction(a.payload, a.label, a.id)}
                          className="h-10 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white truncate border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md transition-all font-medium rounded-lg"
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                {nonMonitorButtons.length > 0 && (
                  <div className="w-full flex justify-start">
                    <div className="flex flex-wrap gap-2 w-full md:max-w-none justify-start">
                       {nonMonitorButtons.map((a) => {
                         if (a.type === 'link' && a.url) {
                          const href = a.url.startsWith('http') ? a.url : `${API_BASE}${a.url}`;
                          if (disableActionButtons) {
                            return (
                              <span
                                key={a.id}
                                className="inline-flex items-center justify-center rounded-lg text-sm font-medium h-9 bg-gray-200 text-gray-500 px-4 border border-gray-200 cursor-not-allowed select-none"
                                aria-disabled="true"
                              >
                                {a.label}
                              </span>
                            );
                          }
                          return (
                            <a 
                              key={a.id} href={href} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-lg text-sm font-medium h-9 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white px-4 transition-colors no-underline border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md"
                            >
                              {a.label}
                            </a>
                          );
                        }
                        return (
                          <Button
                            key={a.id}
                            size="sm"
                            variant="secondary"
                            disabled={disableActionButtons || isActionLocked(a.id, a.payload, a.label)}
                            onClick={() => invokeAction(a.payload, a.label, a.id)}
                            className="h-9 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md"
                          >
                            {a.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {inputActions.length > 0 && (
                  <div className="w-full flex justify-center md:justify-start">
                    <div className="space-y-4 bg-neutral-900/60 p-4 sm:p-5 rounded-2xl border border-neutral-800/80 shadow-inner ring-1 ring-neutral-800/50 w-full max-w-[22rem] md:max-w-none mx-auto">
                      {inputActions.map(action => {
                        // Determinar si es Read-Only
                        const isReadOnly = READ_ONLY_FIELDS.includes(action.id);
                        
                        return (
                          <div key={action.id} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-neutral-400 font-medium ml-1">{action.label}</div>
                              {isReadOnly && <Lock className="size-3 text-neutral-600" />}
                            </div>
                            
                            {action.options?.length ? (
                              <SearchableSelect 
                                action={action} 
                                value={inputValues[action.id] || ''} 
                                disabled={disableActions || isReadOnly || action.disabled}
                                onChange={(val) => {
                                  setInputValues(p => ({ ...p, [action.id]: val }));
                                  if (action.id === 'auth-zone') fetchOdbOptionsForZone(val);
                                  if (action.id === 'auth-odb') fetchPortsForOdb(val);
                                }} 
                              />
                            ) : (
                              <div className="relative">
                                <Input 
                                  value={inputValues[action.id] || ''} 
                                  type={action.id === 'wifi_pass' && !showWifiPass ? 'password' : 'text'}
                                  readOnly={isReadOnly}
                                  disabled={disableActions || isReadOnly || action.disabled}
                                  onChange={(e) => {
                                    setInputValues(p => ({ ...p, [action.id]: e.target.value }));
                                    if (action.id === 'wifi_pass') setWifiError(null);
                                  }} 
                                  placeholder={action.placeholder} 
                                  className={`h-10 bg-neutral-950 border-neutral-700 text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-500/70 focus-visible:ring-2 focus-visible:ring-emerald-500/25 focus-visible:outline-none ${action.id === 'wifi_pass' ? 'pr-10' : ''} ${action.id === 'wifi_pass' && wifiError ? 'border-red-500 focus-visible:ring-red-500/30' : ''} ${isReadOnly ? 'opacity-60 cursor-not-allowed bg-neutral-900 text-neutral-400 select-none' : ''}`} 
                                />
                                
                                {action.id === 'wifi_pass' && (
                                  <button
                                    type="button"
                                    onClick={() => setShowWifiPass(!showWifiPass)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1e3a8a] hover:text-[#f5831f] transition-colors focus:outline-none"
                                    tabIndex={-1}
                                  >
                                    {showWifiPass ? (
                                      <EyeOff className="size-4" />
                                    ) : (
                                      <Eye className="size-4" />
                                    )}
                                  </button>
                                )}

                                {action.helperText && !wifiError && <div className="text-[10px] text-neutral-600 mt-1 ml-1">{action.helperText}</div>}
                              </div>
                            )}
                            {action.id === 'wifi_pass' && wifiError && (
                              <span className="text-[10px] text-red-500 mt-1 block animate-in slide-in-from-top-1 ml-1">{wifiError}</span>
                            )}
                          </div>
                        );
                      })}
                      {submitAction && !disableActions && (
                        <Button 
                          className={`w-full h-11 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white font-semibold mt-2 border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md transition-all ${submitAction.id === 'wifi_submit' && wifiError ? 'opacity-50 cursor-not-allowed' : ''}`}
                          onClick={handleBulkSubmit}
                          disabled={disableActionButtons || (submitAction.id === 'wifi_submit' && !!wifiError)}
                        >
                          {submitAction.label}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* FOOTER */}
              {hasVersions && (
                <div className="flex items-center gap-1 mt-4 bg-neutral-800/50 rounded-lg px-1.5 py-1 border border-neutral-800">
                  <Button variant="ghost" size="sm" onClick={() => onVersionChange?.(messageId, 'prev')} disabled={currentIdx === 0} className="h-6 w-6 p-0 hover:bg-[#1e3a8a]/10 hover:text-[#f5831f]"><ChevronLeft className="size-3.5" /></Button>
                  <span className="text-[10px] text-neutral-400 font-mono w-6 text-center">{currentIdx + 1}/{versions.length}</span>
                  <Button variant="ghost" size="sm" onClick={() => onVersionChange?.(messageId, 'next')} disabled={currentIdx === versions.length - 1} className="h-6 w-6 p-0 hover:bg-[#1e3a8a]/10 hover:text-[#f5831f]"><ChevronRight className="size-3.5" /></Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- MODAL PROCESAMIENTO --- */}
      <ProcessingModal
        isOpen={isProcessing}
        status={processingStatus}
        title={processingTitle}
        description={processingDescription}
      />

      <Dialog
        open={confirmBajaOpen}
        onOpenChange={(open) => {
          setConfirmBajaOpen(open);
          if (!open) setPendingConfirmAction(null);
        }}
      >
        <DialogContent className="max-w-lg overflow-hidden border-[#1e3a8a]/15 bg-white p-0 shadow-[0_30px_90px_rgba(30,58,138,0.18)]">
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-white" />
            <div className="relative border-b border-[#1e3a8a]/10 px-6 py-6 md:px-7">
              <div className="flex items-start gap-4 pr-8">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#fff4eb] text-[#f5831f] ring-1 ring-[#f5831f]/20 shadow-sm">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#f5831f]/25 bg-[#fff4eb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1e3a8a]">
                    <ShieldAlert className="size-3.5" />
                    Acción irreversible
                  </div>
                  <DialogHeader className="items-start text-left">
                    <DialogTitle className="text-2xl font-bold tracking-tight text-[#1e3a8a]">
                      Confirmar baja de cliente
                    </DialogTitle>
                    <DialogDescription className="max-w-[34rem] text-sm leading-relaxed text-slate-600">
                      Vas a ejecutar la baja en WispHub para <span className="font-semibold text-[#1e3a8a]">{confirmBajaTarget}</span>. Revisa el nombre antes de continuar.
                    </DialogDescription>
                  </DialogHeader>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[#1e3a8a]/12 bg-white p-4 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#1e3a8a] text-white shadow-sm">
                    <Info className="size-4" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-[#1e3a8a]">Cliente seleccionado</p>
                    <p className="break-words text-sm text-slate-700">{confirmBajaTarget}</p>
                    <p className="text-xs leading-relaxed text-slate-500">
                      Si el cliente no coincide con lo esperado, cancela y vuelve a seleccionar el registro correcto.
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6 gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setConfirmBajaOpen(false);
                    setPendingConfirmAction(null);
                  }}
                  className="h-11 border-[#1e3a8a]/20 bg-white text-[#1e3a8a] hover:bg-[#f8fbff] hover:text-[#142a66]"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const action = pendingConfirmAction;
                    setConfirmBajaOpen(false);
                    setPendingConfirmAction(null);
                    if (!action) return;
                    executeResolvedAction(action.resolved, action.actionPayload, action.value, action.actionId, action.showProcessing);
                  }}
                  className="h-11 bg-[#f5831f] text-white shadow-[0_14px_28px_rgba(245,131,31,0.28)] hover:bg-[#e77712]"
                >
                  <Trash2 className="size-4" />
                  Confirmar baja
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- MODAL ZOOM --- */}
      {isZoomed && (zoomImageUrl || imageDataUrl) && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-200 backdrop-blur-sm"
          onClick={() => { setIsZoomed(false); setZoomImageUrl(null); }}
        >
          <Button 
            className="absolute top-4 right-4 rounded-full bg-gradient-to-b from-[#2f3fa0]/90 to-[#1f2a6d]/90 hover:from-[#3a4ec0]/95 hover:to-[#24317c]/95 text-orange-200 hover:text-orange-100 z-[101] size-10 border border-white/15 shadow-[0_10px_20px_rgba(31,42,109,0.25)] backdrop-blur-md"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setIsZoomed(false); setZoomImageUrl(null); }}
          >
            <X className="size-5" />
          </Button>
          
          <img 
            src={resolveImageUrl(zoomImageUrl || imageDataUrl || undefined) || zoomImageUrl || imageDataUrl || ''} 
            className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
            alt="Zoom"
            onClick={(e) => e.stopPropagation()} 
          />
          
          <div className="absolute bottom-8 flex gap-4 z-[101]">
            <Button 
              onClick={(e) => { e.stopPropagation(); downloadImage(zoomImageUrl || imageDataUrl || ''); }}
              className="bg-gradient-to-b from-[#2f3fa0]/90 to-[#1f2a6d]/90 hover:from-[#3a4ec0]/95 hover:to-[#24317c]/95 text-orange-200 hover:text-orange-100 border border-white/15 shadow-[0_10px_20px_rgba(31,42,109,0.25)] backdrop-blur-md"
            >
              <Download className="size-4 mr-2" /> Descargar Original
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}