import { useEffect, useState, useMemo } from 'react';
import { 
  Check, Check as CheckIcon, ChevronLeft, ChevronRight, ChevronsUpDown, 
  Copy, RotateCcw, MapPin, Maximize2, Download, Eye, X, ImageOff, Loader2
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useAuth } from '../contexts/AuthContext';

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
  onRetry?: () => void;
  shouldAnimate?: boolean;
  messageId?: string;
  versions?: string[];
  currentVersion?: number;
  onVersionChange?: (messageId: string, direction: 'prev' | 'next') => void;
  actions?: ActionOption[];
  onActionSelect?: (payload: string) => void;
  onSubmitAuth?: (collected: Record<string, string>) => void | Promise<void>;
  onSubmitWan?: (collected: Record<string, string>) => void | Promise<void>;
  onSubmitAction?: (payload: string, collected: Record<string, string>) => void | Promise<void>;
  highlighted?: boolean;
  metadata?: MessageMetadata | null;
}

// --- UTILIDADES ---

// 1. Resolver API URL base
const API_BASE = (() => {
  const envApi = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
  if (envApi && envApi.trim()) {
    return envApi.startsWith('http') ? envApi : `http://${envApi}`;
  }
  const { protocol, hostname } = window.location;
  // Ajusta este puerto si tu backend corre en otro (ej: 3000, 4000)
  return `${protocol}//${hostname}:3000`; 
})();

// 2. Normalizar URL de imagen (SOLUCIÓN AL PROBLEMA DE IMÁGENES ROTAS)
const resolveImageUrl = (url?: string) => {
  if (!url) return null;
  // Si ya es absoluta (http...) o base64 (data:...), la dejamos igual
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Si es relativa (ej: /uploads/img.png), le pegamos el dominio del backend
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

const parseMarkdownTableToInstallations = (content: string, actions?: ActionOption[]): InstallationEntry[] => {
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

        parsed.push({
          id: installId,
          clientName,
          rut,
          address,
          actionPayload: relatedAction?.payload || `seleccionar instalación ${installId}`
        });
      }
    });
    return parsed;
  } catch (e) {
    console.error("Error parseando tabla markdown", e);
    return [];
  }
};

// --- COMPONENTE SELECT ---
function SearchableSelect({
  action,
  value,
  onChange,
}: {
  action: ActionOption;
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const display = value || 'Selecciona una opción';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 bg-neutral-900 border-neutral-800 text-neutral-50 text-sm hover:bg-neutral-800"
        >
          <span className="truncate text-left">{display}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-neutral-900 border-neutral-800"
        align="start"
      >
        <Command>
          <CommandInput placeholder={action.placeholder || 'Buscar...'} className="text-sm" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {action.options?.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={(val) => {
                    onChange(val);
                    setOpen(false);
                  }}
                  className="text-sm"
                >
                  <CheckIcon className={`mr-2 h-4 w-4 ${value === opt ? 'opacity-100' : 'opacity-0'}`} />
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

// --- NUEVO COMPONENTE: PREVISUALIZACIÓN DE IMAGEN ---
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
      {/* Estado Loading */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50 z-10">
          <Loader2 className="h-6 w-6 text-emerald-500 animate-spin" />
        </div>
      )}
      
      {/* Estado Error */}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[150px] bg-neutral-900 text-neutral-500 gap-2 p-4 border border-neutral-800 rounded-lg">
          <ImageOff className="h-8 w-8 opacity-50" />
          <span className="text-xs text-center">No se pudo cargar la imagen</span>
        </div>
      )}

      {/* Imagen Real */}
      <img 
        src={finalSrc} 
        alt={alt}
        className={`w-full h-full transition-opacity duration-300 ${status === 'success' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('success')}
        onError={() => setStatus('error')}
        onClick={status === 'success' ? onClick : undefined}
      />

      {/* Overlay de acciones (solo si cargó bien) */}
      {status === 'success' && (
        <>
           <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-3 cursor-pointer" onClick={onClick}>
             <Button size="icon" variant="secondary" className="rounded-full bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20">
               <Maximize2 className="size-4 text-white" />
             </Button>
             {onDownload && (
               <Button 
                 size="icon" 
                 variant="secondary" 
                 className="rounded-full bg-white/10 backdrop-blur-md border-white/20 hover:bg-white/20"
                 onClick={(e) => { e.stopPropagation(); onDownload(); }}
               >
                 <Download className="size-4 text-white" />
               </Button>
             )}
           </div>
           {/* Etiqueta inferior */}
           <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-neutral-300 pointer-events-none">
             <Eye className="size-3" /> Click para ampliar
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
  onRetry,
  shouldAnimate = false,
  messageId = '',
  versions,
  currentVersion,
  onVersionChange,
  actions,
  onActionSelect,
  onSubmitAuth,
  onSubmitWan,
  onSubmitAction,
  highlighted = false,
  metadata,
}: ChatMessageProps) {
  const { user } = useAuth();
  const authUser = user as { username?: string | null; displayName?: string | null; email?: string | null } | null;
  const isUser = role === 'user';

  // Estados locales
  const [copied, setCopied] = useState(false);
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

  // Animación
  const [displayedContent, setDisplayedContent] = useState(shouldAnimate && !isUser ? '' : content);
  const [isTyping, setIsTyping] = useState(false);

  // Memoización
  const smartoltAvailability = (metadata?.smartoltAvailability as SmartoltAvailability | undefined) || null;
  const hasSmartoltTable = Boolean(smartoltAvailability?.olts?.length);
  
  const installations: InstallationEntry[] = useMemo(() => {
    if (metadata?.installations && metadata.installations.length > 0) return metadata.installations;
    if (!isUser && content.includes('|') && content.toLowerCase().includes('cliente')) {
      return parseMarkdownTableToInstallations(content, actions);
    }
    return [];
  }, [metadata, content, isUser, actions]);
  
  const hasInstallationsTable = Boolean(installations.length);

  const cleanContent = useMemo(() => {
    if (isUser || installations.length === 0) return displayedContent;
    const tableRegex = /^\|.*\|[\s\S]*?(\n(?![ \t]*\|)|$)/gm;
    const cleaned = displayedContent.replace(tableRegex, '').trim();
    return cleaned || (installations.length > 0 ? "He encontrado las siguientes instalaciones:" : "");
  }, [displayedContent, isUser, installations]);

  // Efecto de mecanografía
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let startTimeout: ReturnType<typeof setTimeout> | null = null;
    let settleTimeout: ReturnType<typeof setTimeout> | null = null;

    if (shouldAnimate && !isUser) {
      startTimeout = setTimeout(() => {
        setDisplayedContent('');
        setIsTyping(true);
        let index = 0;
        interval = setInterval(() => {
          if (index < content.length) {
            setDisplayedContent(content.slice(0, index + 1));
            index += 1;
          } else {
            setIsTyping(false);
            if (interval) clearInterval(interval);
          }
        }, 10);
      }, 0);
    } else {
      settleTimeout = setTimeout(() => {
        setDisplayedContent(content);
        setIsTyping(false);
      }, 0);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (startTimeout) clearTimeout(startTimeout);
      if (settleTimeout) clearTimeout(settleTimeout);
    };
  }, [content, shouldAnimate, isUser]);

  // Fetching dinámico
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
      const res = await fetch(`${API_BASE}/api/odbs/${encodeURIComponent(externalId)}/ports`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data?.ports)) {
        const portOptions = data.ports.map((p: PortApiResponseItem) => 
          typeof p === 'object' ? String(p.port) : String(p)
        );
        setDynamicOptions((prev) => ({ ...prev, 'auth-odb-port': portOptions }));
      }
    } catch (err) { console.error(err); }
  };

  // Helpers
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    if (actionPayload && value) return actionPayload.replace('{input}', value);
    return actionPayload || value || '';
  };

  const handleOnuSelect = (onu: OnuEntry, olt: OltEntry) => {
    setSelectedOnu({ oltId: olt.oltId, board: onu.board, port: onu.port, ponType: onu.ponType, onuId: onu.id });
    if (onu.actionPayload) onActionSelect?.(onu.actionPayload);
  };

  // Filtrado de acciones
  const safeActions = useMemo(() => (Array.isArray(actions) ? actions.filter((a) => a?.type) : []), [actions]);
  
  const inputActions = useMemo(() => {
    const rawInputs = safeActions.filter((a) => a.type === 'input');
    const hasSpeedPrev = !!inputValues['auth-speed'] || !!inputValues['auth-download'] || !!inputValues['auth-upload'];
    const filtered = rawInputs.filter((a) => {
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

  const submitAction = buttonActions.find((a) => a.id === 'auth-submit' || a.id === 'wan-apply' || a.id === 'wifi_submit');
  
  const selectionButtonsToRender = buttonActions.filter((a) => {
    const isSelection = a.id.startsWith('select') || (a.payload || '').toLowerCase().includes('seleccionar');
    if (!isSelection) return false;
    if (hasInstallationsTable && (a.id.startsWith('select-installation-') || installations.some(i => i.actionPayload === a.payload))) return false;
    return true;
  });

  const selectionIds = new Set(selectionButtonsToRender.map(a => a.id));
  const otherButtons = buttonActions.filter(a => a.id !== submitAction?.id && !selectionIds.has(a.id) && !a.id.startsWith('select-installation-'));
  
  const handleBulkSubmit = async () => {
    const isWanFlow = submitAction?.id === 'wan-apply';
    const isWifiFlow = submitAction?.id === 'wifi_submit'; 
    
    if (isWifiFlow) {
      const pass = inputValues['wifi_pass'] || '';
      const passRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
      
      if (!passRegex.test(pass)) {
        setWifiError("La contraseña debe tener mín. 8 caracteres, 1 mayúscula y 1 número.");
        return; 
      }
      setWifiError(null);
    }

    const collected: Record<string, string> = {};
    let speedValue = '';

    for (const action of inputActions) {
      const val = (inputValues[action.id] || action.placeholder || '').toString().trim();
      if (!val && action.id !== 'auth-sn' && !action.id.startsWith('wifi_')) continue;
      if (action.id === 'auth-speed') { speedValue = normalizeSpeedProfile(val); continue; }
      const key = action.id.startsWith('wifi_') ? action.id : action.id.replace(/^auth-|^wan-/, '');
      collected[key] = val;
    }

    if (speedValue) {
      collected['download_speed_profile_name'] = speedValue;
      collected['upload_speed_profile_name'] = speedValue;
    }
    if (selectedOnu) Object.assign(collected, selectedOnu);

    let finalPayload = submitAction?.payload || '';
    if (isWifiFlow && finalPayload) {
      Object.keys(collected).forEach((key) => {
        finalPayload = finalPayload.replace(new RegExp(`{${key}}`, 'g'), collected[key]);
      });
    }

    if (isWifiFlow) {
      if (onSubmitAction) await onSubmitAction(finalPayload, collected);
      else if (onActionSelect) onActionSelect(finalPayload);
    } else if (isWanFlow) await onSubmitWan?.(collected);
    else await onSubmitAuth?.(collected);
  };

  const hasVersions = versions && versions.length > 1;
  const currentIdx = currentVersion ?? 0;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${highlighted ? 'bg-neutral-900/40' : ''} px-2`}>
      <div className="w-full max-w-4xl flex gap-3 items-start py-4">
        {!isUser && (
          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-400">
            <span className="text-xs font-bold">AI</span>
          </div>
        )}
        
        <div className="flex-1 group min-w-0">
          {isUser ? (
            <div className="flex flex-col items-end">
              <div className="text-xs text-neutral-500 mb-1.5 mr-1 font-medium">{authUser?.username || 'Tú'}</div>
              <div className="inline-block max-w-[90%] bg-neutral-800 text-neutral-50 px-4 py-2.5 rounded-2xl border border-neutral-700/60 text-[15px] whitespace-pre-wrap">
                {displayedContent}
                
                {/* --- IMAGEN DEL USUARIO (Corregida) --- */}
                {imageDataUrl && (
                  <div className="mt-3 relative group/img overflow-hidden rounded-xl border border-neutral-700 max-w-xs">
                    <ImagePreview 
                      src={imageDataUrl}
                      alt="Enviada"
                      onClick={() => setIsZoomed(true)}
                      className="max-h-64 object-cover cursor-pointer"
                    />
                  </div>
                )}
              </div>
              {createdAt && <div className="mt-1 mr-2 text-[10px] text-neutral-500">{new Date(createdAt).toLocaleTimeString()}</div>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-neutral-50 text-sm sm:text-[15px] leading-[1.8] whitespace-pre-wrap break-words">
                {cleanContent}
                {isTyping && <span className="inline-block w-1.5 h-5 bg-emerald-400 ml-1 animate-pulse rounded-sm" />}
                
                {/* --- IMAGEN DEL BOT (Corregida) --- */}
                {imageDataUrl && (
                  <div className="mt-4 relative group/img max-w-sm sm:max-w-md">
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl transition-all hover:border-emerald-500/50 overflow-hidden">
                       <ImagePreview 
                         src={imageDataUrl}
                         alt="Evidencia técnica"
                         onClick={() => setIsZoomed(true)}
                         onDownload={() => downloadImage(imageDataUrl)}
                         className="h-auto max-h-[400px] object-cover"
                       />
                    </div>
                  </div>
                )}
              </div>

              {/* TABLAS Y ACCIONES */}
              {hasInstallationsTable && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]" />
                    Instalaciones Pendientes
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 overflow-hidden">
                    <div className="grid grid-cols-12 px-4 py-2.5 text-[11px] uppercase text-neutral-500 border-b border-neutral-800/70 bg-neutral-950/30">
                      <div className="col-span-1">ID</div>
                      <div className="col-span-4">Cliente</div>
                      <div className="col-span-5">Dirección</div>
                      <div className="col-span-2 text-right">Acción</div>
                    </div>
                    <div className="divide-y divide-neutral-800/60">
                      {installations.map((inst) => (
                        <div key={inst.id} className="grid grid-cols-12 items-center px-4 py-3 gap-2 text-sm text-neutral-100 hover:bg-neutral-800/40 transition-colors group">
                          <div className="col-span-1 font-mono text-xs text-neutral-500">{inst.id}</div>
                          <div className="col-span-4 font-medium truncate" title={inst.clientName}>{inst.clientName}</div>
                          <div className="col-span-5 text-xs text-neutral-400 truncate flex items-center gap-1.5">
                            <MapPin className="size-3 shrink-0" /> {inst.address}
                          </div>
                          <div className="col-span-2 text-right">
                            <Button size="sm" onClick={() => inst.actionPayload && onActionSelect?.(inst.actionPayload)} className="h-7 text-[11px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20">
                              Autorizar
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {hasSmartoltTable && (
                <div className="mt-4 space-y-3">
                   <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Disponibilidad SmartOLT
                  </div>
                  {smartoltAvailability?.olts?.map((olt) => (
                    <div key={olt.oltId} className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <div className="text-sm font-bold text-emerald-500 uppercase tracking-wider">
                          {olt.oltName || 'OLT'}
                        </div>
                        <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-1 rounded">
                          {olt.onus.length} ONUs detectadas
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-neutral-800/70 bg-black/20">
                        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-neutral-800/50 text-[11px] font-bold text-neutral-500 uppercase">
                          <div className="col-span-2">Label / SN</div>
                          <div className="col-span-1">Tipo</div>
                          <div className="col-span-2 text-center">Puerto (B/P/PON)</div>
                          <div className="col-span-4">Descripción</div>
                          <div className="col-span-2 text-center">Modelo</div>
                          <div className="col-span-1 text-right">Acción</div>
                        </div>
                        <div className="divide-y divide-neutral-800">
                          {olt.onus.map((onu) => (
                            <div key={onu.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-[13px] hover:bg-neutral-800/30 transition-colors">
                              <div className="col-span-12 md:col-span-2 flex flex-col">
                                <span className="font-medium text-neutral-200 truncate">{onu.label}</span>
                                <span className="text-[10px] font-mono text-neutral-500 uppercase">{onu.sn || 'Sin SN'}</span>
                              </div>
                              <div className="col-span-4 md:col-span-1">
                                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20">
                                  {onu.ponType || 'GPON'}
                                </span>
                              </div>
                              <div className="col-span-4 md:col-span-2 text-center font-mono text-neutral-300">
                                {onu.board}/{onu.port}/{onu.ponPort}
                              </div>
                              <div className="col-span-12 md:col-span-4 text-xs text-neutral-400 italic truncate">
                                {onu.description || 'Sin descripción'}
                              </div>
                              <div className="col-span-4 md:col-span-2 text-center text-neutral-400">
                                {onu.type || onu.model || 'N/A'}
                              </div>
                              <div className="col-span-12 md:col-span-1 text-right">
                                <Button 
                                  size="sm" 
                                  onClick={() => handleOnuSelect(onu, olt)} 
                                  className="w-full md:w-auto h-8 px-4 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow-lg shadow-emerald-900/20"
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
              )}

              <div className="mt-1 space-y-4">
                {selectionButtonsToRender.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectionButtonsToRender.map(a => (
                      <Button key={a.id} size="sm" onClick={() => onActionSelect?.(resolvePayload(a.payload, a.label))} className="h-9 bg-neutral-100 text-neutral-900 hover:bg-white truncate">
                        {a.label}
                      </Button>
                    ))}
                  </div>
                )}
                
                {otherButtons.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {otherButtons.map(a => {
                       if (a.type === 'link' && a.url) {
                        const href = a.url.startsWith('http') ? a.url : `${API_BASE}${a.url}`;
                        return (
                          <a 
                            key={a.id} href={href} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 px-3 no-underline"
                          >
                            {a.label}
                          </a>
                        );
                      }
                      return (
                        <Button key={a.id} size="sm" onClick={() => onActionSelect?.(resolvePayload(a.payload, a.label))} className="h-8 bg-neutral-800 text-neutral-300 hover:bg-neutral-700">
                          {a.label}
                        </Button>
                      );
                    })}
                  </div>
                )}

                {inputActions.length > 0 && (
                  <div className="space-y-3 bg-neutral-900/40 p-4 rounded-xl border border-neutral-800">
                    {inputActions.map(action => (
                      <div key={action.id} className="space-y-1.5">
                        <div className="text-xs text-neutral-400 font-medium">{action.label}</div>
                        {action.options?.length ? (
                          <SearchableSelect action={action} value={inputValues[action.id] || ''} onChange={(val) => {
                            setInputValues(p => ({ ...p, [action.id]: val }));
                            if (action.id === 'auth-zone') fetchOdbOptionsForZone(val);
                            if (action.id === 'auth-odb') fetchPortsForOdb(val);
                          }} />
                        ) : (
                          <>
                            <Input 
                              value={inputValues[action.id] || ''} 
                              type={action.id === 'wifi_pass' ? 'password' : 'text'}
                              onChange={(e) => {
                                setInputValues(p => ({ ...p, [action.id]: e.target.value }));
                                if (action.id === 'wifi_pass') setWifiError(null);
                              }} 
                              placeholder={action.placeholder} 
                              className={`h-9 bg-neutral-950 border-neutral-800 ${action.id === 'wifi_pass' && wifiError ? 'border-red-500 focus-visible:ring-red-500' : ''}`} 
                            />
                            {action.id === 'wifi_pass' && wifiError && (
                              <span className="text-[10px] text-red-500 mt-1 block">{wifiError}</span>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    {submitAction && (
                      <Button 
                        className={`w-full h-10 bg-emerald-500 hover:bg-emerald-400 text-white ${submitAction.id === 'wifi_submit' && wifiError ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleBulkSubmit}
                        disabled={submitAction.id === 'wifi_submit' && !!wifiError}
                      >
                        {submitAction.label}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* FOOTER */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {hasVersions && (
                  <div className="flex items-center gap-1 bg-neutral-800/50 rounded-lg px-1 py-1">
                    <Button variant="ghost" size="sm" onClick={() => onVersionChange?.(messageId, 'prev')} disabled={currentIdx === 0} className="h-6 w-6 p-0"><ChevronLeft className="size-3.5" /></Button>
                    <span className="text-[10px] text-neutral-400">{currentIdx + 1}/{versions.length}</span>
                    <Button variant="ghost" size="sm" onClick={() => onVersionChange?.(messageId, 'next')} disabled={currentIdx === versions.length - 1} className="h-6 w-6 p-0"><ChevronRight className="size-3.5" /></Button>
                  </div>
                )}
                
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 text-neutral-400 hover:text-white">
                    {copied ? <Check className="size-3.5 mr-1 text-emerald-400" /> : <Copy className="size-3.5 mr-1" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                  {isLatest && onRetry && (
                    <Button variant="ghost" size="sm" onClick={onRetry} className="h-7 text-neutral-400 hover:text-white">
                      <RotateCcw className="size-3.5 mr-1" /> Reintentar
                    </Button>
                  )}
                </div>
              </div>
              {createdAt && <div className="text-[10px] text-neutral-500">{new Date(createdAt).toLocaleTimeString()}</div>}
            </div>
          )}
        </div>
      </div>

      {/* --- MODAL DE ZOOM (Corregido) --- */}
      {isZoomed && imageDataUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-200"
          onClick={() => setIsZoomed(false)}
        >
          <Button 
            className="absolute top-6 right-6 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white z-[101]"
            size="icon"
            onClick={(e) => { e.stopPropagation(); setIsZoomed(false); }}
          >
            <X className="size-5" />
          </Button>
          
          <img 
            src={resolveImageUrl(imageDataUrl) || imageDataUrl} 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            alt="Zoom"
            onClick={(e) => e.stopPropagation()} 
          />
          
          <div className="absolute bottom-8 flex gap-4 z-[101]">
            <Button 
              onClick={(e) => { e.stopPropagation(); downloadImage(imageDataUrl); }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Download className="size-4 mr-2" /> Descargar Original
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}