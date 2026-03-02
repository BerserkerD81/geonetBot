import { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Bot, Check as CheckIcon, ChevronLeft, ChevronRight, ChevronsUpDown, 
  MapPin, Maximize2, Download, Eye, EyeOff, X, ImageOff, Loader2,
  Server, HardDrive, Network, Lock
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
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

type MessageMetadata = {
  smartoltAvailability?: SmartoltAvailability;
  installations?: InstallationEntry[];
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
  onActionSelect?: (payload: string) => void;
  onReplaceMessage?: (messageId: string, payload: string) => void;
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
  
  // Estado para la animación
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const disableActionButtons = disableActions || (!isUser && isLatest && (isAwaitingResponse || isSubmitting));

  // Estado de procesamiento para el modal
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<'loading' | 'success' | 'error'>('loading');

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
  
  const hasInstallationsTable = Boolean(installations.length);

  // --- LÓGICA DE ANIMACIÓN ---
  
  const finalCleanText = useMemo(() => {
    if (isUser) return content;
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
  }, [content, isUser, hasInstallationsTable, hasSmartoltTable, hasOnuTableInContent]);

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
  const invokeAction = (actionPayload?: string, value?: string, actionId?: string) => {
    const resolved = resolvePayload(actionPayload, value);
    if (!resolved) return;

    const lowSource = ((actionId || actionPayload || value) || '').toString().toLowerCase();
    const replacePattern = /refresh\s*onu|refresh\s*onu-list|refrescar\s*onu|refrescar\s*onus|refrescar\s*onu-list|^refresh/i;
    const shouldReplace = replacePattern.test(lowSource) || (actionId || '').toLowerCase().includes('refresh');

    if (shouldReplace && onReplaceMessage && messageId) {
      onReplaceMessage(messageId, resolved);
    } else {
      onActionSelect?.(resolved);
    }
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
  
const handleBulkSubmit = async () => {
  if (disableActionButtons || submitInFlightRef.current) return;
  submitInFlightRef.current = true;
  setIsSubmitting(true);

  try {
    // 1. Identificar el tipo de acción
    const sid = String(submitAction?.id || '').toLowerCase();
    const isWanFlow = sid === 'wan-apply' || sid.endsWith('wan-apply');
    const isWifiFlow = /^wifi(?:[_-]?)(?:apply|submit)$/i.test(sid);
    const isAuth = sid === 'auth-submit';
    const isChangeOnuFlow = /^(?:change[_-]?onu|cambio[_-]?onu)/i.test(sid);

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

    // 3. Preparación del Modal para flujo de Autorización
    if (isAuth) {
      setProcessingStatus('loading');
      setIsProcessing(true);
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
        setIsProcessing(false);

      } 
      else if (isChangeOnuFlow) {
        if (onSubmitAction) await onSubmitAction(finalPayload, collected);
        else if (onActionSelect) onActionSelect(finalPayload);
      }
      else if (isWifiFlow) {
        // B) FLUJO WIFI
        if (onSubmitAction) await onSubmitAction(finalPayload, collected);
        else if (onActionSelect) onActionSelect(finalPayload);
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
        setIsProcessing(false);
      }
      // Nota: Para otros flujos (Wifi/Wan) podrías poner un toast de error aquí si quisieras.
    }
    } finally {
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
                      onClick={() => setIsZoomed(true)}
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
                                        // try to extract numeric OLT id from bracketed label (e.g. "... [3]")
                                        const oltRaw = String(o.olt || '').trim();
                                        const oltMatch = oltRaw.match(/\[(\d+)\]/);
                                        const oltPart = oltMatch ? ` olt ${oltMatch[1]}` : (/^\d+$/.test(oltRaw) ? ` olt ${oltRaw}` : '');
                                        const ponPart = o.pon ? ` pon ${o.pon}` : '';
                                        const portPart = o.port ? ` port ${o.port}` : '';
                                        const modelPart = o.model ? ` model ${o.model}` : '';
                                        invokeAction(`seleccionar onu ${sn}${oltPart}${ponPart}${portPart}${modelPart}`, sn);
                                      }
                                    }}
                                    disabled={disableActionButtons}
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
                          onClick={() => setIsZoomed(true)}
                          onDownload={() => downloadImage(imageDataUrl)}
                          className="h-auto max-h-[350px] object-cover"
                        />
                    </div>
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
                                disabled={disableActionButtons}
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
                            {olt.onus.length} ONUs
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
                            {olt.onus.map((onu) => (
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
                                    disabled={disableActionButtons}
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
                          disabled={disableActionButtons}
                          onClick={() => invokeAction(a.payload, a.label, a.id)}
                          className="h-10 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white truncate border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md transition-all font-medium rounded-lg"
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                {otherButtons.length > 0 && (
                  <div className="w-full flex justify-start">
                    <div className="flex flex-wrap gap-2 w-full md:max-w-none justify-start">
                       {otherButtons.map((a) => {
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
                            disabled={disableActionButtons}
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
      <ProcessingModal isOpen={isProcessing} status={processingStatus} />

      {/* --- MODAL ZOOM --- */}
      {isZoomed && imageDataUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-200 backdrop-blur-sm"
          onClick={() => setIsZoomed(false)}
        >
          <Button 
            className="absolute top-4 right-4 rounded-full bg-gradient-to-b from-[#2f3fa0]/90 to-[#1f2a6d]/90 hover:from-[#3a4ec0]/95 hover:to-[#24317c]/95 text-orange-200 hover:text-orange-100 z-[101] size-10 border border-white/15 shadow-[0_10px_20px_rgba(31,42,109,0.25)] backdrop-blur-md"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setIsZoomed(false); }}
          >
            <X className="size-5" />
          </Button>
          
          <img 
            src={resolveImageUrl(imageDataUrl) || imageDataUrl} 
            className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
            alt="Zoom"
            onClick={(e) => e.stopPropagation()} 
          />
          
          <div className="absolute bottom-8 flex gap-4 z-[101]">
            <Button 
              onClick={(e) => { e.stopPropagation(); downloadImage(imageDataUrl); }}
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