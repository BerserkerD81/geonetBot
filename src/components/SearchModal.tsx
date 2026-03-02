import { Search, X, MessageSquare, User, Bot, CornerDownLeft, Shield, Cloud, Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const API_BASE = (() => {
  const envApi = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
  const raw = (envApi || '').trim();
  if (raw) {
    if (raw.startsWith('/')) return raw;
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw === 'api') return '/api';
    if (raw.startsWith('api/')) return `/${raw}`;
    if (raw.includes('.') || raw.includes(':') || raw === 'localhost') {
      return `${window.location.protocol}//${raw}`;
    }
    return `/${raw}`;
  }
  return '/api';
})();

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  createdAt?: string;
}

interface Chat {
  id: string;
  title: string;
  timestamp: string;
  messages: Message[];
  isAdminHistory?: boolean;
}

interface SearchResult {
  source: 'local' | 'server';
  chatId: string;
  chatTitle: string;
  chatTimestamp: string;
  messageId?: string;
  messageRole?: 'user' | 'assistant';
  messageContent?: string;
  matchType: 'title' | 'message';
  snippet?: string;
  isContextAdmin?: boolean;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChat: (id: string, messageId?: string, metadata?: { title: string; timestamp: string; [key: string]: unknown }) => void;
  chats: Chat[];
  isAdmin?: boolean; 
}

export function SearchModal({ isOpen, onClose, onSelectChat, chats, isAdmin = false }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const serverSearchAbortRef = useRef<AbortController | null>(null);
  const serverCacheRef = useRef<Map<string, { at: number; results: SearchResult[] }>>(new Map());
  const rateLimitUntilRef = useRef(0);

  // 1. Focus al abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // 2. Lógica Híbrida (Local + Servidor)
  useEffect(() => {
    const q = query.trim().toLowerCase();

    if (q.length < 2) {
      serverSearchAbortRef.current?.abort();
      setResults([]);
      setSelectedIndex(0);
      setIsSearchingServer(false);
      return;
    }

    // Búsqueda Local
    const localResults: SearchResult[] = [];
    chats.forEach((chat) => {
      if (chat.title.toLowerCase().includes(q)) {
        localResults.push({
          source: 'local',
          chatId: chat.id,
          chatTitle: chat.title,
          chatTimestamp: chat.timestamp,
          matchType: 'title',
          isContextAdmin: chat.isAdminHistory
        });
      }
      chat.messages.forEach((msg) => {
        if (msg.content && msg.content.toLowerCase().includes(q)) {
          localResults.push({
            source: 'local',
            chatId: chat.id,
            chatTitle: chat.title,
            chatTimestamp: chat.timestamp,
            messageId: msg.id,
            messageRole: msg.role,
            messageContent: msg.content,
            matchType: 'message',
            snippet: msg.content,
            isContextAdmin: chat.isAdminHistory
          });
        }
      });
    });

    setResults(localResults);
    setSelectedIndex(0);

    // Búsqueda Servidor (Debounced + Abort + Cache + Cooldown 429)
    const serverTimer = setTimeout(async () => {
      if (q.length < 3) return;
      if (Date.now() < rateLimitUntilRef.current) return;

      const cacheKey = `${isAdmin ? 'admin' : 'user'}:${q}`;
      const cached = serverCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < 20000) {
        const mergedMap = new Map<string, SearchResult>();
        localResults.forEach((r) => {
          const key = `${r.chatId}-${r.messageId || 'title'}`;
          mergedMap.set(key, r);
        });
        cached.results.forEach((r) => {
          const key = `${r.chatId}-${r.messageId || 'title'}`;
          if (!mergedMap.has(key)) mergedMap.set(key, { ...r, source: 'server' });
        });
        setResults(Array.from(mergedMap.values()));
        return;
      }

      serverSearchAbortRef.current?.abort();
      const controller = new AbortController();
      serverSearchAbortRef.current = controller;

      setIsSearchingServer(true);
      try {
        const params = new URLSearchParams({ query: q });
        if (isAdmin) params.append('asAdmin', 'true');

        const res = await fetch(`${API_BASE}/chat/search?${params.toString()}`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });

        if (res.status === 429) {
          const retryAfterHeader = Number(res.headers.get('retry-after') || '4');
          const retryAfterSeconds = Number.isFinite(retryAfterHeader) ? retryAfterHeader : 4;
          rateLimitUntilRef.current = Date.now() + Math.max(3, retryAfterSeconds) * 1000;
          return;
        }

        if (res.ok) {
          const data = await res.json();
          const serverData = (data.results || []) as SearchResult[];
          serverCacheRef.current.set(cacheKey, { at: Date.now(), results: serverData });

          const mergedMap = new Map<string, SearchResult>();
          localResults.forEach((r) => {
            const key = `${r.chatId}-${r.messageId || 'title'}`;
            mergedMap.set(key, r);
          });
          serverData.forEach((r) => {
            const key = `${r.chatId}-${r.messageId || 'title'}`;
            if (!mergedMap.has(key)) {
              mergedMap.set(key, { ...r, source: 'server' });
            }
          });
          setResults(Array.from(mergedMap.values()));
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error("Error searching server", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingServer(false);
        }
      }
    }, 700);

    return () => {
      clearTimeout(serverTimer);
    };
  }, [query, chats, isAdmin]);

  // Agrupación
  const groupedResults = useMemo(() => {
    const groups = {
      personal: [] as SearchResult[],
      admin: [] as SearchResult[]
    };
    results.forEach(r => {
      if (r.isContextAdmin) groups.admin.push(r);
      else groups.personal.push(r);
    });
    return groups;
  }, [results]);

  const flatList = [...groupedResults.personal, ...groupedResults.admin];

  // Scroll "Follow"
  useEffect(() => {
    if (flatList.length > 0 && isOpen) {
        const activeElement = document.getElementById(`result-${selectedIndex}`);
        if (activeElement) {
            // block: 'nearest' asegura que solo scrollee lo necesario para que aparezca
            activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
  }, [selectedIndex, flatList.length, isOpen]);

  const handleSelect = useCallback((result: SearchResult) => {
    onSelectChat(
      result.chatId,
      result.messageId,
      {
        title: result.chatTitle,
        timestamp: result.chatTimestamp,
        isAdminHistory: result.isContextAdmin
      }
    );
    onClose();
  }, [onSelectChat, onClose]);

  // Teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (flatList.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % flatList.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + flatList.length) % flatList.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleSelect(flatList[selectedIndex]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, flatList, selectedIndex, handleSelect]);

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim() || !text) return text;
    // Limpieza básica de Markdown para la vista previa (quitar negritas/pipes de tablas si molestan mucho)
    const cleanText = text.replace(/\|/g, ' ').replace(/\*\*/g, ''); 
    try {
      const parts = cleanText.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
      return (
        <>
          {parts.map((part, i) => 
            part.toLowerCase() === query.toLowerCase() ? (
              <mark key={i} className="bg-orange-400/30 text-orange-400 rounded px-0.5 font-medium">
                {part}
              </mark>
            ) : ( part )
          )}
        </>
      );
    } catch { return cleanText; }
  };

  const renderGroup = (title: string, items: SearchResult[], startIndex: number, icon: React.ReactNode) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-2">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-3 py-2 text-[10px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-200 flex items-center gap-2">
          {icon}
          {title} <span className="opacity-50">({items.length})</span>
        </div>
        <div className="px-2 pt-1 space-y-1">
          {items.map((result, idx) => {
            const actualIndex = startIndex + idx;
            const isSelected = actualIndex === selectedIndex;
            return (
              <button
                key={`${result.chatId}-${result.messageId || 't'}-${actualIndex}`}
                id={`result-${actualIndex}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(actualIndex)}
                className={`w-full text-left p-2 rounded-lg transition-all duration-150 group flex items-start gap-3 border
                  ${isSelected 
                    ? 'bg-gray-100 border-gray-300 shadow-md ring-1 ring-gray-900/5' 
                    : 'border-transparent hover:bg-gray-100 text-gray-500'
                  }`}
              >
                <div className={`flex-shrink-0 size-8 rounded-md flex items-center justify-center mt-0.5 transition-colors ${
                   result.matchType === 'title' 
                      ? (isSelected ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-400')
                      : result.messageRole === 'user'
                          ? (isSelected ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-400')
                          : (isSelected ? 'bg-orange-400/20 text-orange-500' : 'bg-orange-50 text-orange-600')
                }`}>
                  {result.matchType === 'title' ? <MessageSquare className="size-4" /> : 
                   result.messageRole === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
                </div>

                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold truncate ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                      {highlightMatch(result.chatTitle, query)}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                      {result.chatTimestamp}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {result.matchType === 'message' && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide font-medium ${
                          result.messageRole === 'user' 
                            ? 'bg-gray-200/50 text-gray-500' 
                            : 'bg-orange-400/10 text-orange-500'
                        }`}>
                          {result.messageRole === 'user' ? 'Tú' : 'IA'}
                        </span>
                      )}
                      
                      {result.source === 'server' && (
                        <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                          <Cloud className="size-2.5" /> Cloud
                        </span>
                      )}
                  </div>

                  {/* AQUÍ ESTÁ LA MAGIA PARA QUE NO SE VEA FEO: line-clamp-2 y break-all */}
                  <p className={`text-xs mt-1.5 leading-relaxed line-clamp-2 break-words text-opacity-90 ${isSelected ? 'text-gray-700' : 'text-gray-400'}`}>
                    {highlightMatch(result.snippet || result.messageContent || '', query)}
                  </p>
                </div>
                
                {isSelected && (
                  <CornerDownLeft className="size-3.5 text-gray-400 self-center hidden sm:block flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center bg-gray-900/50 backdrop-blur-sm p-2 sm:p-4 pt-8 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* CONTENEDOR PRINCIPAL:
         - h-[500px]: Altura fija suficiente para ver ~3-4 items + header/footer.
         - flex-col: Para la estructura sandwich.
      */}
      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-xl shadow-2xl shadow-gray-200 overflow-hidden flex flex-col h-[500px] max-h-[80vh]">
        
        {/* 1. HEADER (FIJO) */}
        <div className="relative border-b border-gray-200 flex-shrink-0 bg-gray-50 z-20">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="h-14 pl-11 pr-12 bg-transparent border-0 text-gray-900 placeholder:text-gray-400 focus-visible:ring-0 text-base rounded-none"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {isSearchingServer && <Loader2 className="size-4 text-orange-500 animate-spin" />}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* 2. CUERPO (SCROLLABLE) - El 'flex-1 min-h-0' es clave aquí */}
        <div className="flex-1 min-h-0 bg-gray-50 relative">
          <ScrollArea className="h-full w-full">
            {!query.trim() ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-60">
                <Search className="size-10 text-gray-300 mb-4" />
                <p className="text-sm font-medium text-gray-500">Búsqueda Global</p>
                <p className="text-xs text-gray-400 mt-2 max-w-[250px]">
                  Tus chats y el historial del sistema.
                </p>
              </div>
            ) : flatList.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                  {isSearchingServer ? (
                     <div className="flex flex-col items-center gap-3">
                        <Loader2 className="size-8 text-orange-500 animate-spin" />
                        <span className="text-xs text-gray-400">Buscando en servidor...</span>
                     </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-500">Sin resultados</p>
                      <p className="text-xs text-gray-400 mt-1">Prueba con otro término</p>
                    </>
                  )}
               </div>
            ) : (
              <div className="py-2">
                {renderGroup(
                  "Mis Conversaciones", 
                  groupedResults.personal, 
                  0, 
                  <MessageSquare className="size-3" />
                )}

                {renderGroup(
                  "Historial de Usuarios", 
                  groupedResults.admin, 
                  groupedResults.personal.length, 
                  <Shield className="size-3 text-orange-500" />
                )}
                
                {isSearchingServer && (
                  <div className="py-3 text-center border-t border-gray-200 mx-4">
                     <span className="inline-flex items-center gap-2 text-[10px] text-orange-500/70 animate-pulse">
                        <Cloud className="size-3" /> Buscando más resultados...
                     </span>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
        
        {/* 3. FOOTER (FIJO) - Siempre visible abajo */}
        <div className="bg-white border-t border-gray-200 px-4 py-2 flex justify-between items-center text-[10px] text-gray-400 flex-shrink-0 z-20">
          <span>{flatList.length} coincidencias</span>
          <div className="flex gap-3">
             <span className="hidden sm:inline">↑↓ navegar</span>
             <span className="hidden sm:inline">↵ seleccionar</span>
             <span>Esc cerrar</span>
          </div>
        </div>

      </div>
    </div>
  );
}