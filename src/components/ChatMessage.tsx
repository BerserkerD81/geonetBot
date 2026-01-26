import { useEffect, useState, useMemo } from 'react';
import { Check, Check as CheckIcon, ChevronLeft, ChevronRight, ChevronsUpDown, Copy, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useAuth } from '../contexts/AuthContext';

type ActionOption = {
  id: string;
  label: string;
  placeholder?: string;
  options?: string[];
  payload?: string;
  helperText?: string;
};

type SmartoltAvailability = {
  olts?: Array<{
    oltId: string;
    oltName?: string;
    availableCount?: number;
    onus: Array<{
      id: string;
      label: string;
      ponType?: string;
      port?: string;
      model?: string;
      actionPayload?: string;
    }>;
  }>;
  suggestedVlan?: string;
  suggestedZone?: string;
};

type MessageMetadata = {
  smartoltAvailability?: SmartoltAvailability;
};

const API_BASE = (() => {
  const envApi = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
  if (envApi && envApi.trim()) {
    return envApi.startsWith('http') ? envApi : `http://${envApi}`;
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000`;
})();

const normalizeSpeedProfile = (val: string) => {
  const raw = (val || '').trim();
  if (!raw) return '';
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return raw;
  const num = match[1].replace(/\.0+$/, '');
  return `${num}M`;
};

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
  actions?: Array<{
    id: string;
    type: 'button' | 'input';
    label: string;
    payload?: string;
    placeholder?: string;
    helperText?: string;
    options?: string[];
  }>;
  onActionSelect?: (payload: string) => void;
  onSubmitAuth?: (collected: Record<string, string>) => void | Promise<void>;
  onSubmitWan?: (collected: Record<string, string>) => void | Promise<void>;
  highlighted?: boolean;
  metadata?: MessageMetadata | null;
}

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
  highlighted = false,
  metadata,
}: ChatMessageProps) {
  const { user } = useAuth();
  const authUser = user as { username?: string | null; displayName?: string | null; email?: string | null } | null;
  const isUser = role === 'user';

  const [copied, setCopied] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
  const [parsedActionsFromContent, setParsedActionsFromContent] = useState<ChatMessageProps['actions'] | null>(null);
  const [cleanContent, setCleanContent] = useState<string | null>(null);
  const smartoltAvailability = (metadata?.smartoltAvailability as SmartoltAvailability | undefined) || null;

  // Al seleccionar zona, obtener ODBs; al seleccionar ODB, obtener puertos
  const fetchOdbOptionsForZone = async (zone: string) => {
    const trimmed = zone.trim();
    if (!trimmed) return;

    try {
      const res = await fetch(`${API_BASE}/smartolt/zones/${encodeURIComponent(trimmed)}/odbs`, {
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await res.json();
      console.log('[ODB fetch]', {
        zone: trimmed,
        url: `${API_BASE}/smartolt/zones/${encodeURIComponent(trimmed)}/odbs`,
        status: res.status,
        ok: res.ok,
        data
      });
      if (Array.isArray(data?.odbs)) {
        // Guardar mapeo nombre/id -> externalId para lookup posterior
        const odbMap: Record<string, string> = {};
        const options = data.odbs
          .map((o: { name?: string; id?: string; externalId?: string }) => {
            if (o?.name && o?.externalId) odbMap[o.name] = o.externalId;
            if (o?.id && o?.externalId) odbMap[o.id] = o.externalId;
            return o?.name || o?.id;
          })
          .filter((v: string | undefined) => v)
          .map((v: string | undefined) => String(v));
        if (options.length) {
          setDynamicOptions((prev) => ({ ...prev, 'auth-odb': options }));
          // Guardar el mapeo en un ref para uso posterior
          setOdbNameToExternalId(odbMap);
        }
      }
    } catch (err) {
      console.error('No se pudieron obtener CTOs por zona', err);
    }
  };

  // Guardar mapeo ODB nombre/id -> externalId
  const [odbNameToExternalId, setOdbNameToExternalId] = useState<Record<string, string>>({});

  // Al seleccionar una ODB, obtener puertos disponibles
  const fetchPortsForOdb = async (odbNameOrId: string) => {
    const externalId = odbNameToExternalId[odbNameOrId] || odbNameOrId;
    if (!externalId) return;
    try {
      const res = await fetch(`${API_BASE}/api/odbs/${encodeURIComponent(externalId)}/ports`, {
        credentials: 'include',
        cache: 'no-store'
      });
      const data = await res.json();
      console.log('[ODB ports fetch]', { odb: odbNameOrId, externalId, ports: data?.ports });
      if (Array.isArray(data?.ports)) {
        // Normalizar a string para el select
        const portOptions = data.ports.map((p: any) => (typeof p === 'object' && p.port ? String(p.port) : String(p)));
        setDynamicOptions((prev) => ({ ...prev, 'auth-odb-port': portOptions }));
      }
    } catch (err) {
      console.error('No se pudieron obtener puertos para ODB', odbNameOrId, err);
    }
  };
  const [displayedContent, setDisplayedContent] = useState(shouldAnimate && !isUser ? '' : content);
  const [isTyping, setIsTyping] = useState(false);

  // Small utility: parse text and convert URLs to anchor elements
  const parseLinks = (text: string) => {
    if (!text) return [] as Array<string | { href: string; text: string }>;
    const urlRe = /(https?:\/\/[\w\-./?=&%#:+,;~]+)|(www\.[\w\-./?=&%#:+,;~]+)/gi;
    const parts: Array<string | { href: string; text: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = urlRe.exec(text)) !== null) {
      const idx = match.index;
      if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
      const raw = match[0];
      const href = raw.startsWith('http') ? raw : `http://${raw}`;
      parts.push({ href, text: raw });
      lastIndex = idx + raw.length;
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts;
  };

  // Detect JSON content and render it in a friendly way
  const tryParseJSON = (text: string) => {
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed;
    } catch (e) {
      return null;
    }
  };

  const renderStructuredJSON = (obj: any) => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return <span>{String(obj)}</span>;
    }
    if (Array.isArray(obj)) {
      return (
        <ul className="list-disc pl-5 space-y-1">
          {obj.map((item, i) => (
            <li key={i} className="text-sm text-neutral-100">
              {renderStructuredJSON(item)}
            </li>
          ))}
        </ul>
      );
    }
    // Object: render key-value pairs
    return (
      <div className="space-y-2">
        {Object.keys(obj).map((k) => (
          <div key={k} className="text-sm">
            <div className="text-xs text-neutral-400">{k}</div>
            <div className="text-neutral-100 pl-2">{renderStructuredJSON(obj[k])}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderContent = (text: string) => {
    const parsed = tryParseJSON(text);
    if (parsed) return renderStructuredJSON(parsed);

    return parseLinks(text).map((p, i) =>
      typeof p === 'string' ? (
        <span key={i}>{p}</span>
      ) : (
        <a key={i} href={p.href} target="_blank" rel="noreferrer" className="underline text-emerald-300">
          {p.text}
        </a>
      )
    );
  };
  const parseActionsBlock = (raw: string) => {
    if (!raw) return { clean: raw, actions: [] as ChatMessageProps['actions'] };
    const linesAll = raw.split(/\r?\n/);
    const trimmedLines = linesAll.map((l) => l.trim());
    const idx = trimmedLines.findIndex((l) => l.toLowerCase() === 'actions');
    if (idx === -1) return { clean: raw, actions: [] as ChatMessageProps['actions'] };
    const before = linesAll.slice(0, idx).join('\n').trim();
    const afterLines = linesAll.slice(idx + 1).map((l) => l.trim()).filter((l) => l.length > 0);
    const actionsArr: ChatMessageProps['actions'] = [];
    let current: any = null;
    const takeKV = (line: string) => {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const k = line.slice(0, colonIdx).trim().toLowerCase();
        const v = line.slice(colonIdx + 1).trim();
        return [k, v];
      }
      const parts = line.split(/\s+/);
      if (parts.length === 2) return [parts[0].toLowerCase(), parts[1]];
      return [line.toLowerCase(), ''];
    };
    for (let i = 0; i < afterLines.length; i++) {
      const line = afterLines[i];
      let key = '';
      let val = '';
      if (['id', 'type', 'label', 'payload', 'options', 'placeholder', 'helpertext'].includes(line.toLowerCase())) {
        key = line.toLowerCase();
        val = (afterLines[i + 1] || '').trim();
        i += 1;
      } else {
        const [k, v] = takeKV(line) as [string, string];
        key = k;
        val = v;
      }
      if (key === 'id') {
        if (current && current.id) actionsArr.push(current);
        current = { id: val, type: 'button', label: val };
      } else if (key === 'type') {
        if (!current) continue;
        current.type = (val || 'button') as any;
      } else if (key === 'label') {
        if (!current) continue;
        current.label = val;
      } else if (key === 'payload') {
        if (!current) continue;
        current.payload = val;
      } else if (key === 'options') {
        if (!current) continue;
        current.options = val.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (key === 'placeholder') {
        if (!current) continue;
        current.placeholder = val;
      } else if (key === 'helpertext') {
        if (!current) continue;
        current.helperText = val;
      }
    }
    if (current && current.id) actionsArr.push(current);
    return { clean: before, actions: actionsArr };
  };

  useEffect(() => {
    if (Array.isArray(actions) && actions.length > 0) {
      setParsedActionsFromContent(null);
      setCleanContent(null);
      return;
    }

    // Primero, intentar detectar si el content es JSON que incluye { output, actions }
    try {
      const maybe = tryParseJSON(content || '');
      if (maybe) {
        // Manejar formatos: arreglo con primer elemento, o objeto directo
        const entry = Array.isArray(maybe) ? maybe[0] : maybe;
        const output = entry?.output ?? null;
        const actionsFromJson = entry?.actions ?? null;
        if (actionsFromJson && Array.isArray(actionsFromJson) && actionsFromJson.length > 0) {
          setParsedActionsFromContent(actionsFromJson as ChatMessageProps['actions']);
          setCleanContent(typeof output === 'string' ? output : null);
          console.debug('[ChatMessage] parsed actions from JSON content', { actionsFromJson, output });
          return;
        }
      }
    } catch (err) {
      console.debug('[ChatMessage] json parse attempt failed', err);
    }

    // Fallback: parse block style 'actions' inside content
    const { clean, actions: parsed } = parseActionsBlock(content || '');
    console.debug('[ChatMessage] parseActionsBlock result', { content, clean, parsed });
    if (parsed && parsed.length > 0) {
      setParsedActionsFromContent(parsed);
      setCleanContent(clean);
    } else {
      setParsedActionsFromContent(null);
      setCleanContent(null);
    }
  }, [content, actions]);

  useEffect(() => {
    const source = cleanContent ?? content;
    let interval: ReturnType<typeof setInterval> | null = null;
    let startTimeout: ReturnType<typeof setTimeout> | null = null;
    let settleTimeout: ReturnType<typeof setTimeout> | null = null;

    if (shouldAnimate && !isUser) {
      startTimeout = setTimeout(() => {
        setDisplayedContent('');
        setIsTyping(true);
        let index = 0;
        interval = setInterval(() => {
          if (index < source.length) {
            setDisplayedContent(source.slice(0, index + 1));
            index += 1;
          } else {
            setIsTyping(false);
            if (interval) clearInterval(interval);
          }
        }, 10);
      }, 0);
    } else {
      settleTimeout = setTimeout(() => {
        setDisplayedContent(source);
        setIsTyping(false);
      }, 0);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (startTimeout) clearTimeout(startTimeout);
      if (settleTimeout) clearTimeout(settleTimeout);
    };
  }, [content, cleanContent, shouldAnimate, isUser]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  const hasVersions = versions && versions.length > 1;
  const currentIdx = currentVersion ?? 0;

  const resolvePayload = (actionPayload?: string, value?: string) => {
    if (actionPayload && value) return actionPayload.replace('{input}', value);
    if (actionPayload) return actionPayload;
    if (value) return `${value}`;
    return '';
  };

  // Detectar si ya hay selección previa de OLT/ONU (por ejemplo, tras seleccionar una ONU de la tabla)
  // Se asume que si metadata.smartoltAvailability y hay una ONU seleccionada, se puede extraer oltId, board y port
  const [selectedOnu, setSelectedOnu] = useState<{
    oltId?: string;
    board?: string;
    port?: string;
    ponType?: string;
    onuId?: string;
  } | null>(null);

  // Si el usuario selecciona una ONU desde la tabla, guardar la selección
  type OltType = { oltId: string; oltName?: string };
  type OnuType = { id: string; board?: string; port?: string; ponType?: string; actionPayload?: string };
  const handleOnuSelect = (onu: OnuType, olt: OltType) => {
    setSelectedOnu({
      oltId: olt.oltId,
      board: onu.board,
      port: onu.port,
      ponType: onu.ponType,
      onuId: onu.id,
    });
    // Si hay un payload de acción, ejecutarlo
    if (onu.actionPayload) onActionSelect?.(onu.actionPayload);
  };

  // Filtrar los inputs para ocultar OLT ID, Board y Port si ya hay selección previa
  // Defensive: filter out null/undefined actions
  const mergedActions = Array.isArray(actions) && actions.length > 0 ? actions : parsedActionsFromContent || [];
  console.debug('[ChatMessage] mergedActions', { actionsProp: actions, parsedActionsFromContent, mergedActions });
  const safeActions = Array.isArray(mergedActions) ? mergedActions.filter((a) => a && typeof a === 'object' && a.type) : [];
  const rawInputActions = safeActions.filter((a) => a.type === 'input');
  // Unificar velocidad: mostrar solo un input 'auth-speed' si existen download/upload o si ya hay valores previos
  const inputActions = useMemo(() => {
    // Filter out OLT/ONU fields if already selected, and only keep one speed input
    let speedFiltered = false;
    const filtered = rawInputActions
      .filter((a) => {
        if (!selectedOnu) return true;
        if (["auth-olt_id", "auth-board", "auth-port"].includes(a.id)) return false;
        // Ocultar download/upload si hay ambos y mostrar solo uno custom
        if (["auth-download", "auth-upload"].includes(a.id)) {
          if (!speedFiltered) {
            speedFiltered = true;
            return false; // Ocultamos los originales, agregamos custom luego
          }
          return false;
        }
        return true;
      })
      .map((a) => {
        const dyn = dynamicOptions[a.id];
        if (dyn) return { ...a, options: dyn };
        return a;
      });
    // Agregar input custom de velocidad si corresponde (si hay download/upload o si ya hay valores previos)
    const hasDownload = rawInputActions.some(a => a.id === 'auth-download');
    const hasUpload = rawInputActions.some(a => a.id === 'auth-upload');
    const hasSpeedPrev = !!inputValues['auth-speed'] || !!inputValues['auth-download'] || !!inputValues['auth-upload'];
    const alreadyIn = filtered.some(a => a.id === 'auth-speed');
    if ((hasDownload || hasUpload || hasSpeedPrev) && !alreadyIn) {
      filtered.push({
        id: 'auth-speed',
        type: 'input',
        label: 'Velocidad (M)',
        placeholder: 'Ej: 300M',
        helperText: 'La velocidad se aplicará simétrica (bajada/subida)',
        options: ['200M', '400M', '600M', '800M'],
      });
    }
    return filtered;
  }, [rawInputActions, selectedOnu, dynamicOptions, inputValues]);
  const buttonActions = safeActions.filter((a) => a.type === 'button');
  const submitAction = buttonActions.find((a) => a.id === 'auth-submit' || a.id === 'wan-apply');
  const hasSmartoltTable = Boolean(smartoltAvailability?.olts?.length);
  const selectionButtons = buttonActions.filter(
    (a) => a.id.startsWith('select') || (a.payload || '').toLowerCase().includes('seleccionar')
  );
  const selectionButtonsToRender = hasSmartoltTable
    ? selectionButtons.filter((a) => !a.id.startsWith('select-onu-'))
    : selectionButtons;
  const selectionIds = new Set(selectionButtonsToRender.map((a) => a.id));
  const otherButtons = buttonActions.filter((a) => a.id !== (submitAction?.id || 'auth-submit') && !selectionIds.has(a.id));

  const handleInputAction = (actionId: string) => {
    const action = actions?.find((a) => a.id === actionId);
    if (!action) return;
    if (action.id === 'auth-sn' && !action.payload) return;

    const rawValue = inputValues[actionId] ?? '';
    const normalized =
      actionId === 'auth-download' || actionId === 'auth-upload'
        ? normalizeSpeedProfile(rawValue)
        : rawValue;
    const value = normalized.trim();
    if (!value) return;

    if (actionId === 'auth-zone') {
      fetchOdbOptionsForZone(value);
      // No enviar mensaje al chat para la zona; solo actualizamos CTOs disponibles
      setInputValues((prev) => ({ ...prev, [actionId]: value }));
      return;
    }

    const payload = resolvePayload(action.payload, value) || `${action.label}: ${value}`;
    onActionSelect?.(payload);
    setInputValues((prev) => ({ ...prev, [actionId]: normalized }));
  };



  const handleBulkSubmit = async () => {
    const isWanFlow = submitAction?.id === 'wan-apply';
    // Build collected object from inputs
    const collected: Record<string, string> = {};
    let speedValue = '';
    for (const action of inputActions) {
      // prefer explicit input value, otherwise use placeholder if available
      const rawInput = (inputValues[action.id] ?? '').toString().trim();
      const rawValue = rawInput || (action.placeholder ?? '').toString().trim();
      if (action.id === 'auth-sn' && !action.payload) continue;
      // Si es el campo de velocidad simétrica, guardar para ambos perfiles
      if (action.id === 'auth-speed') {
        speedValue = normalizeSpeedProfile(rawValue).trim();
        continue;
      }
      const normalized = action.id === 'auth-download' || action.id === 'auth-upload' ? normalizeSpeedProfile(rawValue) : rawValue;
      const value = normalized.trim();
      if (!value) continue;

      // fetch ODBs for zone but include zone in collected
      if (action.id === 'auth-zone') {
        fetchOdbOptionsForZone(value);
        collected['zone'] = value;
        setInputValues((prev) => ({ ...prev, [action.id]: normalized }));
        continue;
      }

      // map input ids to backend field names
      const keyMap: Record<string, string> = {
        // Autorización SmartOLT (alta)
        'auth-olt_id': 'olt_id',
        'auth-pon_type': 'pon_type',
        'auth-board': 'board',
        'auth-port': 'port',
        'auth-sn': 'sn',
        'auth-onu_type': 'onu_type',
        'auth-onu_mode': 'onu_mode',
        'auth-vlan': 'vlan',
        'auth-zone': 'zone',
        'auth-odb': 'odb',
        'auth-odb-port': 'odb_port',
        'auth-name': 'name',
        'auth-address': 'address_or_comment',
        // 'auth-download': 'download_speed_profile_name',
        // 'auth-upload': 'upload_speed_profile_name',
        // Configuración WAN estática
        'wan-sn': 'sn',
        'wan-onu_external_id': 'onu_external_id',
        'wan-ipv4': 'ipv4_address',
        'wan-subnet': 'subnet_mask',
        'wan-gateway': 'gateway',
        'wan-dns1': 'dns1',
        'wan-dns2': 'dns2',
      };

      const mapped = keyMap[action.id] || action.id.replace(/^auth-/, '');

      // Normalize VLAN: extract leading number if present
      if (mapped === 'vlan') {
        const m = String(value).match(/(\d{1,4})/);
        if (m) {
          const vlanNum = Number(m[1]);
          if (vlanNum >= 1 && vlanNum <= 4094) {
            collected[mapped] = String(vlanNum);
          } else {
            // invalid vlan number, still set numeric for backend validation
            collected[mapped] = String(vlanNum);
          }
        } else {
          // no numeric VLAN found, skip
        }
      } else {
        collected[mapped] = normalized;
      }

      setInputValues((prev) => ({ ...prev, [action.id]: normalized }));
    }

    // Si hay valor de velocidad simétrica, setear ambos perfiles
    if (speedValue) {
      collected['download_speed_profile_name'] = speedValue;
      collected['upload_speed_profile_name'] = speedValue;
    }

    // Si hay selección previa de ONU, rellenar automáticamente OLT ID, Board y Port
    if (selectedOnu) {
      if (selectedOnu.oltId) collected["olt_id"] = selectedOnu.oltId;
      if (selectedOnu.board) collected["board"] = selectedOnu.board;
      if (selectedOnu.port) collected["port"] = selectedOnu.port;
      if (selectedOnu.ponType) collected["pon_type"] = selectedOnu.ponType;
    }

    if (isWanFlow && onSubmitWan) {
      try {
        await onSubmitWan(collected);
      } catch (err) {
        console.error('submitWan failed', err);
      }
      return;
    }

    if (!isWanFlow && onSubmitAuth) {
      try {
        await onSubmitAuth(collected);
      } catch (err) {
        console.error('submitAuth failed', err);
      }
      return;
    }

    // Fallback solo para flujos basados en comandos de chat (autorización clásica)
    if (!isWanFlow) {
      inputActions.forEach((action) => {
        const rawValue = inputValues[action.id] ?? '';
        if (action.id === 'auth-sn' && !action.payload) return;
        const normalized =
          action.id === 'auth-download' || action.id === 'auth-upload'
            ? normalizeSpeedProfile(rawValue)
            : rawValue;
        const value = normalized.trim();
        if (!value) return;
        if (action.id === 'auth-zone') {
          fetchOdbOptionsForZone(value);
          return; // no enviamos la zona al chat en el submit masivo
        }
        const payload = resolvePayload(action.payload, value) || `${action.label}: ${value}`;
        onActionSelect?.(payload);
        setInputValues((prev) => ({ ...prev, [action.id]: normalized }));
      });

      if (submitAction) {
        const payload = resolvePayload(submitAction.payload) || submitAction.label;
        onActionSelect?.(payload);
      }
    }
  };

  const renderUserMessage = () => (
    <div className="flex flex-col items-end">
      <div className="text-xs text-neutral-500 mb-1.5 mr-1 font-medium">
        {authUser?.username ?? authUser?.displayName ?? authUser?.email ?? 'Tú'}
      </div>
      <div className="inline-block max-w-[90%] sm:max-w-[85%] bg-gradient-to-br from-neutral-800 to-neutral-850 text-neutral-50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl shadow-sm text-sm sm:text-[15px] leading-[1.7] whitespace-pre-wrap break-words border border-neutral-700/60">
        {/* Render text with link parsing or structured JSON for better UX */}
        {renderContent(displayedContent)}
        {imageDataUrl && (
          <div className="mt-3">
            <img
              src={imageDataUrl}
              alt="Imagen enviada"
              className="max-h-64 rounded-xl border border-neutral-700 object-contain bg-neutral-900 shadow-md"
            />
          </div>
        )}
      </div>
      {createdAt && (
        <div className="mt-1 mr-2 text-[11px] text-neutral-500">
          {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );

  const renderSmartoltAvailability = () => {
    const olts = smartoltAvailability?.olts || [];
    if (!olts.length) return null;

    return (
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-neutral-500 font-semibold">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
          Disponibilidad SmartOLT
        </div>

        <div className="grid grid-cols-1 gap-3">
          {olts.map((olt) => (
            <div
              key={olt.oltId}
              className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-3 sm:p-4 shadow-sm shadow-black/10"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-neutral-100">
                    {olt.oltName || 'OLT'}{olt.oltId ? ` [${olt.oltId}]` : ''}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {olt.availableCount ?? olt.onus.length} ONUs libres
                  </div>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-neutral-800/70 bg-neutral-950/70">
                <div className="grid grid-cols-12 px-3 py-2 text-[11px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800/70">
                  <div className="col-span-5 sm:col-span-6">ONU</div>
                  <div className="col-span-2 sm:col-span-2">PON</div>
                  <div className="col-span-2 sm:col-span-2">Puerto</div>
                  <div className="col-span-2 sm:col-span-1">Modelo</div>
                  <div className="col-span-1 sm:col-span-1 text-right">Acción</div>
                </div>

                <div className="divide-y divide-neutral-800/60">
                  {olt.onus.map((onu) => (
                    <div
                      key={`${olt.oltId}-${onu.id}`}
                      className="grid grid-cols-12 items-center px-3 py-2 gap-2 text-sm text-neutral-100"
                    >
                      <div className="col-span-5 sm:col-span-6 truncate" title={onu.label}>{onu.label}</div>
                      <div className="col-span-2 sm:col-span-2 text-neutral-400 uppercase">{onu.ponType || 'gpon'}</div>
                      <div className="col-span-2 sm:col-span-2 text-neutral-400">{onu.port || '-'}</div>
                      <div className="col-span-2 sm:col-span-1 text-neutral-400 truncate" title={onu.model || '-'}>{onu.model || '-'}</div>
                      <div className="col-span-1 sm:col-span-1 text-right">
                        <Button
                          size="sm"
                          onClick={() => handleOnuSelect(onu, olt)}
                          className="h-8 text-[12px] rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white shadow-sm hover:shadow-md px-3"
                        >
                          Activar
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
    );
  };

  const renderAssistantMessage = () => (
    <div className="flex flex-col gap-3">
      <div className="text-neutral-50 text-sm sm:text-[15px] leading-[1.8] whitespace-pre-wrap break-words">
        {renderContent(displayedContent)}
        {isTyping && <span className="inline-block w-1.5 h-5 bg-emerald-400 ml-1 animate-pulse rounded-sm" />}
        {imageDataUrl && (
          <div className="mt-3">
            <img
              src={imageDataUrl}
              alt="Imagen recibida"
              className="max-h-64 rounded-xl border border-neutral-700 object-contain bg-neutral-900 shadow-md"
            />
          </div>
        )}
      </div>

      {renderSmartoltAvailability()}

      {mergedActions && mergedActions.length > 0 && (
        <div className="mt-1 space-y-4">
          {selectionButtonsToRender.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {selectionButtonsToRender.map((action) => (
                <Button
                  key={action.id}
                  size="sm"
                  onClick={() => onActionSelect?.(resolvePayload(action.payload) || action.label)}
                  className="h-9 text-xs rounded-lg bg-neutral-100 text-neutral-900 hover:bg-white transition-colors shadow-sm hover:shadow-md truncate"
                  title={action.label}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          {otherButtons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {otherButtons.map((action) => (
                <Button
                  key={action.id}
                  size="sm"
                  onClick={() => onActionSelect?.(resolvePayload(action.payload) || action.label)}
                  className="h-8 text-xs rounded-lg bg-neutral-100 text-neutral-900 hover:bg-white transition-colors shadow-sm hover:shadow-md"
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          {inputActions.length > 0 && (
            <div className="space-y-3">
              {inputActions.map((action) => (
                <div key={action.id} className="space-y-1.5">
                  <div className="text-xs text-neutral-400 font-medium">{action.label}</div>

                  {action.options && action.options.length > 0 ? (
                    <SearchableSelect
                      action={action}
                      value={inputValues[action.id] ?? ''}
                      onChange={(val) => {
                        setInputValues((prev) => ({ ...prev, [action.id]: val }));

                        if (action.id === 'auth-zone') {
                          fetchOdbOptionsForZone(val);
                          // No enviamos mensaje automático; solo cargamos CTOs para la zona
                        }
                        if (action.id === 'auth-odb') {
                          fetchPortsForOdb(val);
                        }
                      }}
                    />
                  ) : (
                    <Input
                      value={
                        action.id === 'auth-sn' && !action.payload
                          ? inputValues[action.id] ?? action.placeholder ?? ''
                          : inputValues[action.id] ?? ''
                      }
                      disabled={action.id === 'auth-sn' && !action.payload}
                      onChange={(e) => setInputValues((prev) => ({ ...prev, [action.id]: e.target.value }))}
                      onBlur={(e) => {
                        const val = e.target.value;
                        if (action.id === 'auth-download' || action.id === 'auth-upload') {
                          setInputValues((prev) => ({ ...prev, [action.id]: normalizeSpeedProfile(val) }));
                        }
                      }}
                      placeholder={action.placeholder}
                      className="h-9 bg-neutral-900 border-neutral-800 text-neutral-50 text-sm focus-visible:ring-emerald-500/40"
                    />
                  )}

                  {action.helperText && (
                    <p className="text-[11px] text-neutral-500 leading-relaxed">{action.helperText}</p>
                  )}

                  {!submitAction && (
                    <Button
                      size="sm"
                      onClick={() => handleInputAction(action.id)}
                      className="h-8 text-xs rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white shadow-sm hover:shadow-md"
                    >
                      Enviar
                    </Button>
                  )}
                </div>
              ))}

              {submitAction && (
                <div className="pt-1">
                  <Button
                    size="sm"
                    className="w-full h-10 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white shadow-sm hover:shadow-md"
                    onClick={handleBulkSubmit}
                  >
                    Autorizar
                  </Button>
                  <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
                    Se enviarán los valores cargados y se confirmará la autorización en un solo paso.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3 flex-wrap">
        {hasVersions && (
          <div className="flex items-center gap-1 sm:gap-1.5 mr-2 bg-neutral-800/50 rounded-lg px-1.5 py-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onVersionChange?.(messageId, 'prev')}
              disabled={currentIdx === 0}
              className="h-6 w-6 p-0 text-neutral-400 hover:text-white hover:bg-neutral-700/70 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-all duration-200"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="text-xs text-neutral-400 px-1 min-w-[30px] sm:min-w-[35px] text-center font-medium">
              {currentIdx + 1}/{versions.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onVersionChange?.(messageId, 'next')}
              disabled={currentIdx === versions.length - 1}
              className="h-6 w-6 p-0 text-neutral-400 hover:text-white hover:bg-neutral-700/70 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-all duration-200"
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-1 sm:gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 sm:px-2.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800/70 rounded-lg transition-all duration-200 font-medium"
          >
            {copied ? (
              <>
                <Check className="size-3.5 mr-1 sm:mr-1.5 text-emerald-400" />
                <span className="text-emerald-400 hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </Button>
            {onRetry && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRetry}
                className="h-6 w-6 p-0 text-rose-400 hover:text-white hover:bg-neutral-700/70 rounded-md transition-all duration-200"
                title="Reintentar"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          {isLatest && onRetry && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="h-7 px-2 sm:px-2.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800/70 rounded-lg transition-all duration-200 font-medium"
            >
              <RotateCcw className="size-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Retry</span>
            </Button>
          )}
        </div>
      </div>

      {createdAt && (
        <div className="text-[11px] text-neutral-500">
          {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${highlighted ? 'bg-neutral-900/60' : ''}`}>
      <div className="w-full max-w-4xl flex gap-3 items-start py-2">
        {!isUser && (
          <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-400 shadow-sm">
            <span className="text-sm font-semibold">AI</span>
          </div>
        )}
        <div className="flex-1 group">
          {isUser ? renderUserMessage() : renderAssistantMessage()}
        </div>
      </div>
    </div>
  );
}