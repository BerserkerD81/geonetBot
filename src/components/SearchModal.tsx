import { Search, X, MessageSquare, User, Bot, CornerDownLeft } from 'lucide-react';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { useState, useEffect, useRef, useMemo } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Chat {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
  messages: Message[];
}

interface SearchResult {
  chatId: string;
  chatTitle: string;
  chatTimestamp: string;
  messageId?: string;
  messageRole?: 'user' | 'assistant';
  messageContent?: string;
  matchType: 'title' | 'message';
  snippet?: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  onSelectChat: (id: string, messageId?: string) => void;
}

export function SearchModal({ isOpen, onClose, chats, onSelectChat }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Pequeño delay para asegurar que el DOM esté listo
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Lógica de búsqueda optimizada con useMemo para no bloquear el renderizado
  const searchResults = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];
    
    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];
    
    chats.forEach((chat) => {
      // Búsqueda en título
      if (chat.title.toLowerCase().includes(lowerQuery)) {
        results.push({
          chatId: chat.id,
          chatTitle: chat.title,
          chatTimestamp: chat.timestamp,
          matchType: 'title',
          snippet: chat.preview,
        });
      }
      
      // Búsqueda en mensajes
      chat.messages.forEach((message) => {
        if (message.content.toLowerCase().includes(lowerQuery)) {
          const index = message.content.toLowerCase().indexOf(lowerQuery);
          // Contexto inteligente: mostrar texto alrededor de la coincidencia
          const start = Math.max(0, index - 40);
          const end = Math.min(message.content.length, index + query.length + 40);
          let snippet = message.content.slice(start, end);
          
          if (start > 0) snippet = '...' + snippet;
          if (end < message.content.length) snippet = snippet + '...';
          
          results.push({
            chatId: chat.id,
            chatTitle: chat.title,
            chatTimestamp: chat.timestamp,
            messageId: message.id,
            messageRole: message.role,
            messageContent: message.content,
            matchType: 'message',
            snippet,
          });
        }
      });
    });

    return results;
  }, [query, chats]);

  // Resetear selección al cambiar la búsqueda
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Manejo de teclado (Navegación y cierre)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }

      if (searchResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % searchResults.length);
          // Auto-scroll logic could go here
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleSelect(searchResults[selectedIndex]);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, searchResults, selectedIndex]);

  const handleSelect = (result: SearchResult) => {
    onSelectChat(result.chatId, result.messageId);
    onClose();
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    // Escapar caracteres especiales en regex si fuera necesario, aquí simplificado
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-emerald-500/30 text-emerald-300 rounded px-0.5 font-medium">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 pt-4 sm:pt-20 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300 flex flex-col max-h-[90dvh] sm:max-h-[80vh]">
        
        {/* Search Input Area */}
        <div className="relative border-b border-neutral-800/50 flex-shrink-0 bg-neutral-900 z-10">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 size-4 sm:size-5 text-neutral-500" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversaciones..."
            className="h-12 sm:h-14 md:h-16 pl-10 sm:pl-12 pr-10 sm:pr-12 text-sm sm:text-base bg-transparent border-0 text-white placeholder:text-neutral-500 focus-visible:ring-0 rounded-none"
          />
          <button
            onClick={onClose}
            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1.5 sm:p-2 rounded-lg hover:bg-neutral-800"
          >
            <X className="size-4 sm:size-5" />
          </button>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-hidden bg-neutral-900/50" ref={resultsRef}>
          <ScrollArea className="h-full">
            {!query.trim() ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-0 animate-in fade-in duration-500 slide-in-from-bottom-2">
                <div className="size-12 rounded-xl bg-neutral-800/30 flex items-center justify-center mb-4">
                  <Search className="size-6 text-neutral-700" />
                </div>
                <p className="text-neutral-400 font-medium text-sm">Busca en tus chats</p>
                <p className="text-neutral-600 text-xs mt-1 max-w-[200px]">
                  Encuentra conversaciones por título o contenido específico
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <p className="text-neutral-400 text-sm font-medium">No se encontraron resultados</p>
                <p className="text-neutral-600 text-xs mt-1">Prueba con otra palabra clave</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {searchResults.map((result, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={`${result.chatId}-${result.messageId || 'title'}-${index}`}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full text-left p-3 rounded-lg transition-all duration-200 group flex items-start gap-3 border border-transparent
                        ${isSelected 
                          ? 'bg-neutral-800 border-neutral-700/50 shadow-sm' 
                          : 'hover:bg-neutral-800/50 text-neutral-400'
                        }`}
                    >
                      {/* Icon Container */}
                      <div className={`flex-shrink-0 size-8 rounded-md flex items-center justify-center mt-0.5 transition-colors duration-200 ${
                        result.matchType === 'title' 
                          ? (isSelected ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-500')
                          : result.messageRole === 'user'
                            ? (isSelected ? 'bg-neutral-700 text-white' : 'bg-neutral-800 text-neutral-500')
                            : (isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-900/20 text-emerald-600')
                      }`}>
                        {result.matchType === 'title' ? (
                          <MessageSquare className="size-4" />
                        ) : result.messageRole === 'user' ? (
                          <User className="size-4" />
                        ) : (
                          <Bot className="size-4" />
                        )}
                      </div>
                      
                      {/* Content Container */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className={`text-sm font-medium truncate transition-colors ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                            {highlightMatch(result.chatTitle, query)}
                          </span>
                          <span className="text-[10px] text-neutral-600 flex-shrink-0 font-mono">
                            {result.chatTimestamp}
                          </span>
                        </div>
                        
                        {result.matchType === 'message' && (
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              result.messageRole === 'user' 
                                ? 'bg-neutral-700/50 text-neutral-400' 
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}>
                              {result.messageRole === 'user' ? 'Tú' : 'IA'}
                            </span>
                          </div>
                        )}
                        
                        <p className={`text-xs line-clamp-2 leading-relaxed ${isSelected ? 'text-neutral-400' : 'text-neutral-500'}`}>
                          {highlightMatch(result.snippet || '', query)}
                        </p>
                      </div>

                      {/* Enter Hint (Only visible when selected) */}
                      {isSelected && (
                        <div className="hidden sm:flex self-center ml-2">
                          <CornerDownLeft className="size-4 text-neutral-500" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-800/50 px-3 py-2 bg-neutral-900/90 flex items-center justify-between text-[11px] sm:text-xs text-neutral-500 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 font-sans">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 font-sans">↓</kbd>
              <span className="ml-1">navegar</span>
            </span>
            <span className="hidden sm:flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 font-sans">↵</kbd>
              <span className="ml-1">seleccionar</span>
            </span>
            {searchResults.length > 0 && (
              <span className="text-emerald-500/80 sm:ml-2">
                {searchResults.length} resultados
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span>
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded border border-neutral-700 font-sans">Esc</kbd> cerrar
            </span>
            {/* Mostrar comando dinámico según OS */}
            <span className="hidden sm:inline opacity-50 ml-2">
               {'Ctrl+K'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}