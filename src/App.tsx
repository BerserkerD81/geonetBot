import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { EmptyChat } from './components/EmptyChat';
import { SearchModal } from './components/SearchModal';
import { ScrollArea } from './components/ui/scroll-area';
import {Search, PanelLeft } from 'lucide-react';
import { Button } from './components/ui/button';
import { AdminUserPanel } from './components/AdminUserPanel';
import { UserAccountPanel } from './components/UserAccountPanel';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

type SuggestedAction = {
  id: string;
  type: 'button' | 'input';
  label: string;
  payload?: string;
  placeholder?: string;
  helperText?: string;
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  versions?: string[]; // Array of alternative versions for assistant messages
  currentVersion?: number; // Index of the currently displayed version
  timestamp?: number; // Timestamp to track new content generation
  createdAt?: string; // Backend creation datetime
  imageDataUrl?: string; // Optional image attached to the message (user photo)
  actions?: SuggestedAction[];
  metadata?: Record<string, any> | null;
}

interface Chat {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
  messages: Message[];
  isAdminHistory?: boolean;
  ownerUserId?: number;
}

// La lógica de respuestas ahora vive en el backend.

// Normaliza la URL del backend para funcionar tanto en dev como en prod.
const API_BASE = (() => {
  const envApi = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
  if (envApi && envApi.trim()) {
    return envApi.startsWith('http') ? envApi : `http://${envApi}`;
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000`;
})();

// Títulos de chats de ejemplo antiguos que ya no deben mostrarse
const LEGACY_CHAT_TITLES = [
  'Service Availability Check',
  'Client Device Status',
  'Network Monitoring Query',
];

function ChatApp() {
  const { user, isAdmin } = useAuth();
  const [chats, setChats] = useState<Chat[]>(() => {
    if (user) {
      const storedChats = localStorage.getItem(`chats_${user.id}`);
      if (storedChats) {
        try {
          const parsedChats: Chat[] = JSON.parse(storedChats);
          return parsedChats.filter((chat) => !LEGACY_CHAT_TITLES.includes(chat.title));
        } catch (error) {
          console.error('Error parsing stored chats:', error);
          return [];
        }
      }
      return [];
    }
    return [];
  });
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [searchOpen, setSearchOpen] = useState(false);
  const [animatingMessageId, setAnimatingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showUserPanel, setShowUserPanel] = useState(false);
  const retryNonceRef = useRef(0);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);
  const [scrollRequestNonce, setScrollRequestNonce] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  type IntegrationStatus = {
    wisphub: { ok: boolean; latencyMs?: number; error?: string };
    smartolt: { ok: boolean; latencyMs?: number; error?: string };
    meta?: { wisphubLastFullSyncAt?: string | null };
  };
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const prevStatusRef = useRef<IntegrationStatus | null>(null);
  
  type AdminHistoryMessage = {
    id: number;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    imageUrl?: string | null;
    actions?: SuggestedAction[];
    metadata?: Record<string, any> | null;
  };

  const openUserHistoryAsChat = useCallback(async (
    userInfo: { id: number; email: string; name?: string },
    options?: { focus?: boolean; closePanel?: boolean }
  ) => {
    const { focus = true, closePanel = true } = options ?? {};

    if (!isAdmin) return;

    try {
      const res = await fetch(`${API_BASE}/admin/users/${userInfo.id}/messages`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('No se pudo cargar el historial de chats para admin', data.error);
        return;
      }

      const history: AdminHistoryMessage[] = data.messages ?? [];

      if (history.length === 0) {
        // Sin mensajes, no creamos chat en el sidebar
        return;
      }

      // Ordenar por fecha por seguridad
      const sortedHistory = [...history].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Separar historial en "chats" por usuario usando umbral de inactividad
      const THRESHOLD_MS = 30 * 60 * 1000; // 30 minutos
      const groups: AdminHistoryMessage[][] = [];
      let currentGroup: AdminHistoryMessage[] = [];

      for (let i = 0; i < sortedHistory.length; i++) {
        const msg = sortedHistory[i];
        if (currentGroup.length === 0) {
          currentGroup.push(msg);
          continue;
        }
        const prev = currentGroup[currentGroup.length - 1];
        const diff =
          new Date(msg.createdAt).getTime() -
          new Date(prev.createdAt).getTime();
        if (diff > THRESHOLD_MS) {
          groups.push(currentGroup);
          currentGroup = [msg];
        } else {
          currentGroup.push(msg);
        }
      }
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }

      const newChats: Chat[] = groups.map((group, idx) => {
        const historyMessages: Message[] = group.map((m) => ({
          id: `admin-${userInfo.id}-${m.id}`,
          role: m.role,
          content: m.content,
          imageDataUrl: m.imageUrl ?? undefined,
          createdAt: m.createdAt,
          actions: m.actions ?? undefined,
          metadata: (m as any).metadata ?? null,
        }));

        const latest = group[group.length - 1];
        const chatId = `admin-history-${userInfo.id}-${idx + 1}`;

        return {
          id: chatId,
          title: `Historial · ${userInfo.name ?? userInfo.email} · ${idx + 1}`,
          timestamp: latest ? new Date(latest.createdAt).toLocaleString() : 'Sin mensajes',
          preview: latest ? latest.content.slice(0, 80) : 'Sin mensajes registrados para este usuario',
          messages: historyMessages,
          isAdminHistory: true,
          ownerUserId: userInfo.id,
        };
      });

      setChats((prev) => {
        // Quitar historiales anteriores de este usuario y añadir los nuevos
        const withoutExisting = prev.filter(
          (c) => !c.isAdminHistory || c.ownerUserId !== userInfo.id
        );
        return [...newChats, ...withoutExisting];
      });

      if (focus) {
        const firstChatId = newChats[0]?.id;
        if (firstChatId) {
          setActiveChat(firstChatId);
          setAnimatingMessageId(null);
        }
      }
      if (closePanel) {
        setShowAdminPanel(false);
      }
    } catch (error) {
      console.error('Error al cargar historial de usuario para admin', error);
    }
  }, [isAdmin]);

  // Cuando el usuario es admin, precargar historiales de todos los usuarios como chats de solo lectura
  useEffect(() => {
    if (!isAdmin) return;

    const preloadAllHistories = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) {
          console.error('No se pudieron cargar los usuarios para historiales de admin', data.error);
          return;
        }

        const users = (data.users ?? []) as { id: number; email: string; name?: string }[];

        await Promise.all(
          users.map((u) =>
            openUserHistoryAsChat(u, { focus: false, closePanel: false })
          )
        );
      } catch (error) {
        console.error('Error al precargar historiales para admin', error);
      }
    };

    void preloadAllHistories();
  }, [isAdmin, openUserHistoryAsChat]);

  // Save chats to localStorage whenever they change
  useEffect(() => {
    if (user && chats.length > 0) {
      localStorage.setItem(`chats_${user.id}`, JSON.stringify(chats));
    }
  }, [chats, user]);

  const currentChat = chats.find((chat) => chat.id === activeChat);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768;
      setSidebarCollapsed(isMobile);
    };

    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages]);

  // Scroll to a specific message when requested from search
  useEffect(() => {
    if (!scrollToMessageId) return;
  
    const el = document.querySelector<HTMLElement>(`[data-message-id="${scrollToMessageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(scrollToMessageId);
      setTimeout(() => setHighlightedMessageId(null), 2500);
    }
  }, [scrollRequestNonce, scrollToMessageId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Poll backend integrations status and show alerts on transitions
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/integrations/status`, { credentials: 'include' });
        const data = (await res.json()) as IntegrationStatus;
        if (cancelled) return;

        const prev = prevStatusRef.current;
        setIntegrationStatus(data);

        const transitions: Array<{ key: 'WispHub' | 'SmartOLT'; from?: boolean; to?: boolean }> = [];
        if (prev) {
          if (prev.wisphub.ok !== data.wisphub.ok) transitions.push({ key: 'WispHub', from: prev.wisphub.ok, to: data.wisphub.ok });
          if (prev.smartolt.ok !== data.smartolt.ok) transitions.push({ key: 'SmartOLT', from: prev.smartolt.ok, to: data.smartolt.ok });
        }
        prevStatusRef.current = data;

        for (const t of transitions) {
          if (t.to) {
            toast.success(`${t.key} conectado de nuevo`, { description: `Estado: OK` });
          } else {
            toast.error(`${t.key} desconectado`, { description: `El servicio no responde` });
          }
        }
      } catch (e) {
        // network failure: only alert on transition to fully down
        const prev = prevStatusRef.current;
        if (prev && (prev.wisphub.ok || prev.smartolt.ok)) {
          toast.error('Integraciones no disponibles', { description: 'No se pudo consultar el estado de integraciones' });
        }
        prevStatusRef.current = null;
        setIntegrationStatus(null);
      }
    };
    fetchStatus();
    // Poll every 10 minutes (600000 ms) to reduce frequency
    const id = setInterval(fetchStatus, 600000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleNewChat = () => {
    setActiveChat(null);
    setAnimatingMessageId(null);
  };

  const handleDeleteChat = (id: string) => {
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    if (activeChat === id) {
      setActiveChat(null);
      setAnimatingMessageId(null);
    }
  };

  const handleSendMessage = async (content: string, imageDataUrl?: string) => {
    if (!content.trim() && !imageDataUrl) return;

    try {
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content, imageUrl: imageDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Error obteniendo respuesta del backend', data?.error || res.statusText);
        return;
      }

      const userMsg: Message = {
        id: `m${data.userMessage.id}`,
        role: 'user',
        content: data.userMessage.content,
        imageDataUrl: data.userMessage.imageUrl ?? undefined,
        createdAt: data.userMessage.createdAt,
      };

      const assistantMsg: Message = {
        id: `m${data.assistantMessage.id}`,
        role: 'assistant',
        content: data.assistantMessage.content,
        actions: data.assistantMessage.actions ?? [],
        metadata: data.assistantMessage.metadata ?? null,
        timestamp: Date.now(),
        createdAt: data.assistantMessage.createdAt,
      };

      setAnimatingMessageId(assistantMsg.id);

      if (activeChat) {
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === activeChat
              ? {
                  ...chat,
                  messages: [...chat.messages, userMsg, assistantMsg],
                  preview: (content || '[Imagen enviada]').substring(0, 50),
                  timestamp: 'Just now',
                }
              : chat
          )
        );
      } else {
        const newChat: Chat = {
          id: `chat${Date.now()}`,
          title: (content || 'Chat con imagen').substring(0, 50),
          timestamp: 'Justo ahora',
          preview: (content || '[Imagen enviada]').substring(0, 50),
          messages: [userMsg, assistantMsg],
        };
        setChats((prev) => [newChat, ...prev]);
        setActiveChat(newChat.id);
      }
    } catch (err) {
      console.error('Fallo al contactar backend', err);
    }
  };

  const handleRetry = async () => {
    if (!currentChat || currentChat.messages.length < 2) return;
    const lastAssistantMessageIndex = currentChat.messages.length - 1;
    const lastAssistantMessage = currentChat.messages[lastAssistantMessageIndex];
    if (lastAssistantMessage.role !== 'assistant') return;

    const lastUserMessage = [...currentChat.messages]
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!lastUserMessage) return;

    try {
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: lastUserMessage.content }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Error en reintento con backend', data?.error || res.statusText);
        return;
      }

      const newContent: string = data.assistantMessage.content;
      const newActions: SuggestedAction[] = data.assistantMessage.actions ?? [];
      const newMetadata: Record<string, any> | null = data.assistantMessage.metadata ?? null;

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChat
            ? {
                ...chat,
                messages: chat.messages.map((msg, idx) =>
                  idx === lastAssistantMessageIndex
                    ? {
                        ...msg,
                        versions: msg.versions ? [...msg.versions, newContent] : [msg.content, newContent],
                        currentVersion: msg.versions ? msg.versions.length : 1,
                        content: newContent,
                        actions: newActions,
                        metadata: newMetadata,
                        timestamp: Date.now(),
                      }
                    : msg
                ),
              }
            : chat
        )
      );

      retryNonceRef.current += 1;
      setAnimatingMessageId(`${lastAssistantMessage.id}-${retryNonceRef.current}`);
      setTimeout(() => {
        setAnimatingMessageId(null);
      }, newContent.length * 10 + 100);
    } catch (err) {
      console.error('Fallo en reintento', err);
    }
  };

  const handleVersionChange = (messageId: string, direction: 'prev' | 'next') => {
    if (!currentChat) return;
    
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChat
          ? {
              ...chat,
              messages: chat.messages.map((msg) => {
                if (msg.id === messageId && msg.versions) {
                  const currentIdx = msg.currentVersion ?? 0;
                  const newIdx = direction === 'next' 
                    ? Math.min(currentIdx + 1, msg.versions.length - 1)
                    : Math.max(currentIdx - 1, 0);
                  
                  return {
                    ...msg,
                    currentVersion: newIdx,
                    content: msg.versions[newIdx],
                  };
                }
                return msg;
              }),
            }
          : chat
      )
    );
  };

  const handleActionSelect = (payload: string) => {
    if (!payload.trim()) return;
    handleSendMessage(payload.trim());
  };

  const handleSubmitAuth = async (collected: Record<string, any>) => {
    if (!currentChat) return;
    try {
      const res = await fetch(`${API_BASE}/chat/submitAuth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ collected }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error('Error al autorizar: ' + (data?.error || res.statusText));
        return;
      }

      if (data?.ok) {
        // append a user message summarizing the action and the assistant result
        const userMsg: Message = {
          id: `m${Date.now()}-auth-user`,
          role: 'user',
          content: 'Autorizar SmartOLT',
          createdAt: new Date().toISOString(),
        };

        const assistantMsg: Message = {
          id: `m${Date.now()}-auth-assistant`,
          role: 'assistant',
          content:
            data.message ||
            'ONU autorizada correctamente. Ya estamos en el momento de configurar el WAN por IP estática. Completa los datos a continuación.',
          actions: Array.isArray(data.actions) ? data.actions : undefined,
          createdAt: new Date().toISOString(),
        };

        setChats((prev) =>
          prev.map((chat) =>
            chat.id === currentChat.id
              ? {
                  ...chat,
                  messages: [...chat.messages, userMsg, assistantMsg],
                  preview: assistantMsg.content.slice(0, 50),
                  timestamp: 'Just now',
                }
              : chat
          )
        );

        // show brief success toast
        toast.success('Autorización enviada, ahora configura el WAN');
      } else {
        toast.error('Autorización fallida: ' + (data?.error || 'error desconocido'));
      }
    } catch (err) {
      console.error('submitAuth error', err);
      toast.error('Fallo al autorizar (request)');
    }
  };

  const handleSubmitWan = async (collected: Record<string, any>) => {
    if (!currentChat) return;

    try {
      const res = await fetch(`${API_BASE}/chat/applyPendingWan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(collected),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        toast.error('Error al configurar WAN: ' + (data?.error || res.statusText));
        return;
      }

      const userMsg: Message = {
        id: `m${Date.now()}-wan-user`,
        role: 'user',
        content: 'Autorizar WAN estático',
        createdAt: new Date().toISOString(),
      };

      const assistantMsg: Message = {
        id: `m${Date.now()}-wan-assistant`,
        role: 'assistant',
        content: data.message || 'WAN configurado correctamente en SmartOLT.',
        createdAt: new Date().toISOString(),
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentChat.id
            ? {
                ...chat,
                messages: [...chat.messages, userMsg, assistantMsg],
                preview: assistantMsg.content.slice(0, 50),
                timestamp: 'Just now',
              }
            : chat
        )
      );

      toast.success('WAN estático configurado');
    } catch (err) {
      console.error('applyPendingWan error', err);
      toast.error('Fallo al configurar WAN (request)');
    }
  };

  const handleSelectChat = (id: string, messageId?: string) => {
    setActiveChat(id);
    if (messageId) {
      setScrollToMessageId(messageId);
      setScrollRequestNonce((n) => n + 1);
      setHighlightedMessageId(messageId);
    }
    setAnimatingMessageId(null);
    
    // Auto-hide sidebar on mobile when a chat is selected
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  };

  function StatusDot({ label, ok }: { label: string; ok: boolean }) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500 shadow-[0_0_10px_2px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_10px_2px_rgba(239,68,68,0.35)]'}`}></span>
        <span className="hidden lg:inline">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-neutral-950 text-white overflow-hidden">
      {/* Search Modal */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        chats={chats}
        onSelectChat={handleSelectChat}
      />

      {/* Sidebar */}
      <ChatSidebar
        chats={chats}
        activeChat={activeChat}
        sidebarCollapsed={sidebarCollapsed}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenAdmin={() => setShowAdminPanel(true)}
        onOpenProfile={() => {
          if (!isAdmin) setShowUserPanel(true);
        }}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {showAdminPanel && (
          <AdminUserPanel 
            onClose={() => setShowAdminPanel(false)}
            onOpenUserHistory={openUserHistoryAsChat}
          />
        )}
        {showUserPanel && !isAdmin && (
          <UserAccountPanel
            onClose={() => setShowUserPanel(false)}
          />
        )}
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="h-9 w-9 p-0 hover:bg-neutral-800/70 rounded-lg transition-all duration-200"
            >
              <PanelLeft className="size-5 text-neutral-400" />
            </Button>
            <div className="hidden sm:block">
              <h2 className="text-sm font-semibold text-white">
                {currentChat ? currentChat.title : 'Nuevo chat'}
              </h2>
              <p className="text-xs text-neutral-500">
                {currentChat ? currentChat.timestamp : 'Comienza una conversación con el asistente de SmartOLT'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 pr-2 border-r border-neutral-800/60">
              <StatusDot label="WispHub" ok={!!integrationStatus?.wisphub?.ok} />
              <StatusDot label="SmartOLT" ok={!!integrationStatus?.smartolt?.ok} />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchOpen(true)}
              className="h-9 px-3 gap-2 hover:bg-neutral-800/70 rounded-lg transition-all duration-200"
            >
              <Search className="size-4 text-neutral-400" />
              <span className="hidden sm:inline text-xs text-neutral-400">Buscar</span>
              <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded bg-neutral-800 px-1.5 font-mono text-[10px] font-medium text-neutral-400">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>
          </div>
        </header>

        {/* Messages */}
        {currentChat ? (
          <ScrollArea className="flex-1 overflow-y-auto bg-neutral-950">
            <div className="pb-4">
              {currentChat.messages.map((message, index) => {
                const animationKey = message.id === animatingMessageId || 
                  animatingMessageId?.startsWith(message.id + '-');
                const prevMsg = currentChat.messages[index - 1];
                const currDate = message.createdAt ? new Date(message.createdAt) : null;
                const prevDate = prevMsg?.createdAt ? new Date(prevMsg.createdAt) : null;
                const showDateSeparator = currDate && (!prevDate || currDate.toDateString() !== prevDate.toDateString());
                
                return (
                  <div key={message.id} data-message-id={message.id}>
                    {showDateSeparator && (
                      <div className="flex justify-center my-2">
                        <div className="px-3 py-1 text-[11px] text-neutral-400 bg-neutral-900/60 border border-neutral-800/60 rounded-full">
                          {currDate?.toLocaleDateString()}
                        </div>
                      </div>
                    )}
                    <ChatMessage 
                      role={message.role} 
                      content={message.content}
                      imageDataUrl={message.imageDataUrl}
                      isLatest={index === currentChat.messages.length - 1 && message.role === 'assistant'}
                      onRetry={handleRetry}
                      shouldAnimate={animationKey}
                      messageId={message.id}
                      versions={message.versions}
                      currentVersion={message.currentVersion}
                      onVersionChange={handleVersionChange}
                      actions={message.actions}
                      onActionSelect={handleActionSelect}
                      onSubmitAuth={handleSubmitAuth}
                      onSubmitWan={handleSubmitWan}
                      createdAt={message.createdAt}
                      metadata={message.metadata}
                      highlighted={message.id === highlightedMessageId}
                    />
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 overflow-y-auto bg-neutral-950">
            <EmptyChat onSelectQuery={handleSendMessage} />
          </div>
        )}

        {/* Input */}
        <div className="flex-shrink-0">
          {currentChat && currentChat.isAdminHistory && isAdmin ? (
            <div className="px-4 py-2 text-xs text-neutral-500 text-center bg-neutral-950 border-t border-neutral-800/60">
              Vista de historial de usuario (solo lectura).
            </div>
          ) : (
            <ChatInput onSendMessage={handleSendMessage} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster richColors position="top-right" />
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-300 text-sm">
        Cargando sesión...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <ChatApp key={user?.id} />;
}