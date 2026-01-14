import { Search, X, MessageSquare, User, Bot } from 'lucide-react';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { useState, useEffect, useRef } from 'react';

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
  onSelectChat: (id: string) => void;
}

export function SearchModal({ isOpen, onClose, chats, onSelectChat }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Search in both chat titles and message contents
  const searchResults: SearchResult[] = [];
  
  if (query.trim()) {
    const lowerQuery = query.toLowerCase();
    
    chats.forEach((chat) => {
      // Search in chat title
      if (chat.title.toLowerCase().includes(lowerQuery)) {
        searchResults.push({
          chatId: chat.id,
          chatTitle: chat.title,
          chatTimestamp: chat.timestamp,
          matchType: 'title',
          snippet: chat.preview,
        });
      }
      
      // Search in messages
      chat.messages.forEach((message) => {
        if (message.content.toLowerCase().includes(lowerQuery)) {
          // Create a snippet with context
          const index = message.content.toLowerCase().indexOf(lowerQuery);
          const start = Math.max(0, index - 40);
          const end = Math.min(message.content.length, index + query.length + 40);
          let snippet = message.content.slice(start, end);
          
          if (start > 0) snippet = '...' + snippet;
          if (end < message.content.length) snippet = snippet + '...';
          
          searchResults.push({
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
  }

  if (!isOpen) return null;

  const handleSelect = (chatId: string) => {
    onSelectChat(chatId);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-emerald-500/30 text-emerald-300 rounded px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 pt-8 sm:pt-12 md:pt-20 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300 flex flex-col max-h-[85vh] sm:max-h-[80vh]">
        {/* Search Input */}
        <div className="relative border-b border-neutral-800/50 flex-shrink-0">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 size-4 sm:size-5 text-neutral-500" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations and messages..."
            className="h-12 sm:h-14 md:h-16 pl-10 sm:pl-12 pr-10 sm:pr-12 text-sm sm:text-base bg-transparent border-0 text-white placeholder:text-neutral-500 focus-visible:ring-0"
          />
          <button
            onClick={onClose}
            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors p-1.5 sm:p-2 rounded-lg hover:bg-neutral-800"
          >
            <X className="size-4 sm:size-5" />
          </button>
        </div>

        {/* Results - with proper scrolling */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="h-full overflow-y-auto">
              {!query.trim() ? (
                <div className="p-8 sm:p-12 text-center">
                  <Search className="size-10 sm:size-12 text-neutral-700 mx-auto mb-3 sm:mb-4" />
                  <p className="text-neutral-500 text-sm">
                    Search across all your conversations
                  </p>
                  <p className="text-neutral-600 text-xs mt-2">
                    Find chats by title or message content
                  </p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-8 sm:p-12 text-center">
                  <div className="size-10 sm:size-12 rounded-full bg-neutral-800/50 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <Search className="size-5 sm:size-6 text-neutral-600" />
                  </div>
                  <p className="text-neutral-400 text-sm font-medium">No results found</p>
                  <p className="text-neutral-600 text-xs mt-1">
                    Try a different search term
                  </p>
                </div>
              ) : (
                <div className="p-2">
                  {searchResults.map((result, index) => (
                    <button
                      key={`${result.chatId}-${result.messageId || 'title'}-${index}`}
                      onClick={() => handleSelect(result.chatId)}
                      className="w-full text-left p-2.5 sm:p-3 rounded-xl hover:bg-neutral-800/70 transition-all duration-200 mb-1 group"
                    >
                      <div className="flex items-start gap-2 sm:gap-3">
                        {/* Icon */}
                        <div className={`flex-shrink-0 size-7 sm:size-8 rounded-lg flex items-center justify-center mt-0.5 ${
                          result.matchType === 'title' 
                            ? 'bg-neutral-800 text-neutral-400' 
                            : result.messageRole === 'user'
                            ? 'bg-neutral-800 text-neutral-400'
                            : 'bg-gradient-to-br from-emerald-500/20 to-green-600/20 text-emerald-400'
                        }`}>
                          {result.matchType === 'title' ? (
                            <MessageSquare className="size-3.5 sm:size-4" />
                          ) : result.messageRole === 'user' ? (
                            <User className="size-3.5 sm:size-4" />
                          ) : (
                            <Bot className="size-3.5 sm:size-4" />
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                            <div className="text-xs sm:text-sm text-white font-medium truncate">
                              {highlightMatch(result.chatTitle, query)}
                            </div>
                            <div className="text-[10px] sm:text-xs text-neutral-600 flex-shrink-0">
                              {result.chatTimestamp}
                            </div>
                          </div>
                          
                          {result.matchType === 'message' && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                result.messageRole === 'user' 
                                  ? 'bg-neutral-800 text-neutral-400' 
                                  : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                                {result.messageRole === 'user' ? 'You' : 'Assistant'}
                              </span>
                            </div>
                          )}
                          
                          <div className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                            {highlightMatch(result.snippet || '', query)}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-800/50 px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 bg-neutral-900/50 flex items-center justify-between text-xs flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 text-neutral-600">
            <span className="hidden sm:inline">
              <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-500 font-medium">ESC</kbd> to close
            </span>
            {searchResults.length > 0 && (
              <span className="text-neutral-500 text-[10px] sm:text-xs">
                {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
              </span>
            )}
          </div>
          <span className="text-neutral-700 hidden sm:inline text-xs">⌘K</span>
        </div>
      </div>
    </div>
  );
}