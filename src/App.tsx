import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { EmptyChat } from './components/EmptyChat';
import { SearchModal } from './components/SearchModal';
import { ScrollArea } from './components/ui/scroll-area';
import { Search, PanelLeft, Loader2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { AdminUserPanel } from './components/AdminUserPanel';
import { UserAccountPanel } from './components/UserAccountPanel';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';

// --- TIPOS DE DATOS ---

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
  versions?: string[]; 
  currentVersion?: number; 
  timestamp?: number; 
  createdAt?: string; 
  imageDataUrl?: string; 
  actions?: SuggestedAction[];
  metadata?: Record<string, unknown> | null;
}

interface Chat {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
  messages: Message[];
  isAdminHistory?: boolean;
  ownerUserId?: number;
  messagesLoaded?: boolean; 
  hasMoreMessages?: boolean; 
  isLoadingMore?: boolean;
}

type IntegrationStatus = {
  wisphub: { ok: boolean; latencyMs?: number; error?: string };
  smartolt: { ok: boolean; latencyMs?: number; error?: string };
  meta?: { wisphubLastFullSyncAt?: string | null };
};

type AdminHistoryMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  imageUrl?: string | null;
  actions?: SuggestedAction[];
  metadata?: Record<string, unknown> | null;
};

// --- CONFIGURACIÓN API CORREGIDA ---

const API_BASE = (() => {
  const envApi = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
  
  if (envApi && envApi.trim()) {
    if (envApi.startsWith('/') || envApi.startsWith('http')) {
      return envApi;
    }
    return `http://${envApi}`;
  }
  
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000`;
})();

// --- COMPONENTE PRINCIPAL ---

function ChatApp() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Derive sessionId directly from the URL – useParams() would return {} here
  // because ChatApp wraps <Routes> itself and is not rendered by a parent route.
  const sessionId = location.pathname.match(/^\/chat\/([^/]+)/)?.[1];
  
  // Estado Principal
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  const requestInFlightRef = useRef(false);
  
  // UI States
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 768);
  const [searchOpen, setSearchOpen] = useState(false);
  const [animatingMessageId, setAnimatingMessageId] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showUserPanel, setShowUserPanel] = useState(false);
  
  // Scroll & Highlights
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null); 
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [scrollViewportElement, setScrollViewportElement] = useState<HTMLElement | null>(null);

  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);
  const [scrollRequestNonce, setScrollRequestNonce] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  
  // Retry Logic
  const retryNonceRef = useRef(0);

  // Status Polling
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const prevStatusRef = useRef<IntegrationStatus | null>(null);

  const refreshChatTitles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/sessions`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) return;
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessions: any[] = data.sessions || [];

      setChats((prev) => {
        const adminChats = prev.filter((c) => c.isAdminHistory);
        const personalChats = prev.filter((c) => !c.isAdminHistory);
        const existingById = new Map(personalChats.map((c) => [c.id, c]));
        const sessionById = new Map(sessions.map((s) => [String(s.id), s]));

        const orderedFromSessions: Chat[] = sessions.map((s) => {
          const id = String(s.id);
          const existing = existingById.get(id);
          return {
            ...(existing || {
              id,
              preview: 'Cargar mensajes...',
              messages: [],
              messagesLoaded: false,
              hasMoreMessages: true,
              isAdminHistory: false,
            }),
            title: s.title || existing?.title || 'Conversación',
            timestamp: s.createdAt ? new Date(s.createdAt).toLocaleDateString() : existing?.timestamp || '...',
          };
        });

        const missingPersonal = personalChats.filter((c) => !sessionById.has(c.id));

        return [...orderedFromSessions, ...missingPersonal, ...adminChats];
      });
    } catch (error) {
      console.error('Error refrescando títulos de chats:', error);
    }
  }, []);

  // -------------------------------------------------------------------------
  // 1. CARGA INICIAL + REFRESCO DINÁMICO (SESIONES LISTA LIGERA)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    void refreshChatTitles();

    const id = setInterval(() => {
      void refreshChatTitles();
    }, 30000);

    return () => clearInterval(id);
  }, [user, refreshChatTitles]);

  useEffect(() => {
    if (searchOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [searchOpen]);

  // -------------------------------------------------------------------------
  const loadSessionMessages = useCallback(async (sessionId: string, options?: { aroundId?: string; beforeId?: string }) => {
    const { aroundId, beforeId } = options || {};
    
    const targetChat = chats.find(c => c.id === sessionId);
    
    // Evitamos peticiones dobles o innecesarias
    if (targetChat?.isAdminHistory) return;
    if (targetChat?.isLoadingMore && !aroundId) return;
    if (targetChat?.messagesLoaded && !aroundId && !beforeId) return;

    const isGlobalLoad = !beforeId; 
    if (isGlobalLoad) setLoadingMessages(true);

    // Inyectamos el placeholder dinámicamente o marcamos que está cargando
    setChats(prev => {
      const exists = prev.find(c => c.id === sessionId);
      if (!exists) {
        return [{
          id: sessionId,
          title: 'Cargando conversación...',
          timestamp: '...',
          preview: 'Recuperando historial...',
          messages: [],
          messagesLoaded: false,
          isAdminHistory: false,
          hasMoreMessages: true,
          isLoadingMore: true 
        }, ...prev];
      }
      return prev.map(c => c.id === sessionId ? { ...c, isLoadingMore: true } : c);
    });

    try {
      const url = new URL(
        `${API_BASE}/chat/sessions/${sessionId}/messages`, 
        window.location.origin
      );

      if (aroundId) {
        const val = String(aroundId);
        const cleanId = val.replace('msg-', '');
        if (cleanId && cleanId !== 'undefined') url.searchParams.append('aroundId', cleanId);
      }
      if (beforeId) {
        const val = String(beforeId);
        const cleanId = val.replace('msg-', '');
        if (cleanId && cleanId !== 'undefined') url.searchParams.append('beforeId', cleanId);
      }

      const res = await fetch(url.toString(), { credentials: 'include' });
      
      if (!res.ok) {
          throw new Error(`Error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadedMessages: Message[] = (data.messages || []).map((m: any) => ({
        id: `msg-${m.id}`, 
        role: m.role,
        content: m.content,
        imageDataUrl: m.imageUrl,
        createdAt: m.createdAt,
        actions: m.actions,
        metadata: m.metadata
      }));

      setChats(prev => prev.map(c => {
        if (c.id === sessionId) {
          let newMessages = c.messages;

          if (aroundId) {
              newMessages = loadedMessages;
          } 
          else if (beforeId) {
              const existingIds = new Set(c.messages.map(m => m.id));
              const uniqueNew = loadedMessages.filter(m => !existingIds.has(m.id));
              newMessages = [...uniqueNew, ...c.messages];
          } 
          else {
              newMessages = loadedMessages;
          }

          const hasMore = loadedMessages.length >= 20;
          const lastMsg = newMessages[newMessages.length - 1];

          return {
            ...c,
            messages: newMessages,
            preview: lastMsg ? lastMsg.content.substring(0, 50) : c.preview,
            timestamp: lastMsg ? new Date(lastMsg.createdAt || '').toLocaleDateString() : c.timestamp,
            messagesLoaded: true,
            isLoadingMore: false,
            hasMoreMessages: hasMore
          };
        }
        return c;
      }));

    } catch (error) {
      console.error("Error en loadSessionMessages:", error);
      toast.error("No se pudo cargar el mensaje.");
      setChats(prev => prev.map(c => c.id === sessionId ? { ...c, isLoadingMore: false } : c));
    } finally {
      if (isGlobalLoad) setLoadingMessages(false);
    }
  }, [chats]);

  // -------------------------------------------------------------------------
  // 3. SELECCIÓN DE CHAT Y SCROLL
  // -------------------------------------------------------------------------
  const handleSelectChat = async (id: string, messageId?: string) => {
    if (id && location.pathname !== `/chat/${id}`) {
      navigate(`/chat/${id}`);
    }
    setShowAdminPanel(false);
    setShowUserPanel(false);
    setActiveChat(id);
    
    if (window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }

    if (messageId) {
        setLoadingMessages(true);
        try {
            await loadSessionMessages(id, { aroundId: messageId });
            setTimeout(() => {
                setScrollToMessageId(messageId);
                setScrollRequestNonce((n) => n + 1);
                setHighlightedMessageId(messageId);
            }, 500); 
        } finally {
            setLoadingMessages(false);
        }
    } else {
        await loadSessionMessages(id);
    }
    
    void refreshChatTitles();
    setAnimatingMessageId(null);
  };

  const handleNewChat = useCallback(() => {
    setActiveChat(null);
    setAnimatingMessageId(null);
    setShowAdminPanel(false);
    setShowUserPanel(false);
    navigate('/chat');
    if (window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }
  }, [navigate]);

  const handleDeleteChat = useCallback((id: string) => {
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    if (activeChat === id) {
      setActiveChat(null);
      setAnimatingMessageId(null);
    }
  }, [activeChat]);

  // -------------------------------------------------------------------------
  // 4. ENVÍO DE MENSAJES
  // -------------------------------------------------------------------------
  const handleSendMessage = async (content: string, imageDataUrl?: string) => {
    if (!content.trim() && !imageDataUrl) return;
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setIsAwaitingResponse(true);

    try {
      const currentSessionId = (activeChat && !activeChat.startsWith('admin-')) ? activeChat : undefined;

      const res = await fetch(`${API_BASE}/chat/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
            content, 
            imageDataUrl,
            sessionId: currentSessionId
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Error obteniendo respuesta del backend', data?.error || res.statusText);
        toast.error('Error al enviar mensaje');
        return;
      }

      const userMsg: Message | undefined = data.userMessage
        ? {
            id: `m${data.userMessage.id || Date.now()}`,
            role: 'user',
            content: data.userMessage.content,
            imageDataUrl: data.userMessage.imageUrl ?? undefined,
            createdAt: data.userMessage.createdAt || new Date().toISOString(),
          }
        : undefined;

      const assistantMsg: Message = {
        id: `m${data.assistantMessage.id || Date.now() + 1}`,
        role: 'assistant',
        content: data.assistantMessage.content,
        actions: data.assistantMessage.actions ?? [],
        metadata: data.assistantMessage.metadata ?? null,
        timestamp: Date.now(),
        createdAt: data.assistantMessage.createdAt || new Date().toISOString(),
      };

      setAnimatingMessageId(assistantMsg.id);
      const returnedSessionId = String(data.sessionId);

      const isUpdate = Boolean(data.assistantMessage?.isUpdate);

      if (currentSessionId) {
        setChats((prev) =>
          prev.map((chat) => {
            if (chat.id !== currentSessionId) return chat;

            if (isUpdate) {
              const msgs = [...chat.messages];
              let idx = -1;
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === 'assistant') { idx = i; break; }
              }
              if (idx >= 0) {
                const updated = { ...msgs[idx], content: assistantMsg.content, actions: assistantMsg.actions, metadata: assistantMsg.metadata, timestamp: assistantMsg.timestamp };
                msgs[idx] = updated;
              } else {
                msgs.push(assistantMsg);
              }

              if (userMsg) msgs.push(userMsg);

              return { ...chat, messages: msgs, preview: (userMsg ? userMsg.content : assistantMsg.content).substring(0, 50), timestamp: new Date().toLocaleTimeString() };
            }

            const newMessages = [...chat.messages];
            if (userMsg) newMessages.push(userMsg);
            newMessages.push(assistantMsg);
            return { ...chat, messages: newMessages, preview: (userMsg || assistantMsg).content.substring(0, 50), timestamp: new Date().toLocaleTimeString() };
          })
        );
        void refreshChatTitles();
      } else {
        const msgs: Message[] = [];
        if (userMsg) msgs.push(userMsg);
        msgs.push(assistantMsg);

        const newChat: Chat = {
          id: returnedSessionId,
          title: (content || 'Nueva conversación').substring(0, 50),
          timestamp: 'Ahora',
          preview: (content || '[Imagen enviada]').substring(0, 50),
          messages: msgs,
          messagesLoaded: true,
          hasMoreMessages: false 
        };
        setChats((prev) => [newChat, ...prev]);
        setActiveChat(returnedSessionId);
        navigate(`/chat/${returnedSessionId}`);
        void refreshChatTitles();
      }
    } catch (err) {
      console.error('Fallo al contactar backend', err);
      toast.error('Error de conexión');
    } finally {
      requestInFlightRef.current = false;
      setIsAwaitingResponse(false);
    }
  };

  // -------------------------------------------------------------------------
  // 5. ACCIONES ESPECÍFICAS
  // -------------------------------------------------------------------------
  const handleActionSelect = async (payload: string) => {
    if (!payload.trim()) return;
    await handleSendMessage(payload.trim());
  };

  const handleReplaceMessage = async (messageId: string, payload: string) => {
    if (!payload.trim()) return;
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setIsAwaitingResponse(true);

    try {
      const currentSessionId = (activeChat && !activeChat.startsWith('admin-')) ? activeChat : undefined;

      const res = await fetch(`${API_BASE}/chat/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: payload, sessionId: currentSessionId, replaceMessageId: messageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('Error obteniendo respuesta del backend (replace)', data?.error || res.statusText);
        toast.error('Error al refrescar');
        return;
      }

      const userMsg: Message | undefined = data.userMessage
        ? {
            id: `m${data.userMessage.id || Date.now()}`,
            role: 'user',
            content: data.userMessage.content,
            imageDataUrl: data.userMessage.imageUrl ?? undefined,
            createdAt: data.userMessage.createdAt || new Date().toISOString(),
          }
        : undefined;

      const assistantMsg: Message = {
        id: `m${data.assistantMessage.id || Date.now() + 1}`,
        role: 'assistant',
        content: data.assistantMessage.content,
        actions: data.assistantMessage.actions ?? [],
        metadata: data.assistantMessage.metadata ?? null,
        timestamp: Date.now(),
        createdAt: data.assistantMessage.createdAt || new Date().toISOString(),
      };

      if (currentSessionId) {
        setChats((prev) =>
          prev.map((chat) => {
            if (chat.id !== currentSessionId) return chat;

            const msgs = [...chat.messages];
            const idx = msgs.findIndex(m => m.id === messageId);
            if (idx >= 0) {
              const shouldKeepContent = String(assistantMsg.content || '').trim() === String(payload || '').trim();
              msgs[idx] = {
                ...msgs[idx],
                content: shouldKeepContent ? msgs[idx].content : assistantMsg.content,
                actions: assistantMsg.actions || msgs[idx].actions,
                metadata: assistantMsg.metadata || msgs[idx].metadata,
                timestamp: assistantMsg.timestamp,
              };
            } else {
              let lastIdx = -1;
              for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant') { lastIdx = i; break; }
              if (lastIdx >= 0) msgs[lastIdx] = { ...msgs[lastIdx], content: assistantMsg.content, actions: assistantMsg.actions, metadata: assistantMsg.metadata, timestamp: assistantMsg.timestamp };
              else msgs.push(assistantMsg);
            }

            if (userMsg) msgs.push(userMsg);

            return { ...chat, messages: msgs, preview: (userMsg ? userMsg.content : assistantMsg.content).substring(0, 50), timestamp: new Date().toLocaleTimeString() };
          })
        );
      }
    } catch (err) {
      console.error('handleReplaceMessage error', err);
      toast.error('Fallo al refrescar');
    } finally {
      requestInFlightRef.current = false;
      setIsAwaitingResponse(false);
    }
  };

  const handleSubmitAuth = async (collected: Record<string, unknown>) => {
    const currentChat = chats.find(c => c.id === activeChat);
    if (!currentChat) return false;
    if (requestInFlightRef.current) return false;

    requestInFlightRef.current = true;
    setIsAwaitingResponse(true);

    try {
      const res = await fetch(`${API_BASE}/chat/submitAuth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
            collected,
            sessionId: currentChat.id 
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error('Error al autorizar: ' + (data?.error || res.statusText));
        return false;
      }

      if (data?.ok) {
        const userMsg: Message = {
          id: `m${Date.now()}-auth-user`,
          role: 'user',
          content: 'Autorizar SmartOLT',
          createdAt: new Date().toISOString(),
        };

        const assistantMsg: Message = {
          id: `m${Date.now()}-auth-assistant`,
          role: 'assistant',
          content: data.message || 'ONU autorizada correctamente.',
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
        toast.success('Autorización enviada');
        return true;
      } else {
        toast.error('Autorización fallida: ' + (data?.error || 'error desconocido'));
        return false;
      }
    } catch (err) {
      console.error('submitAuth error', err);
      toast.error('Fallo al autorizar');
      return false;
    } finally {
      requestInFlightRef.current = false;
      setIsAwaitingResponse(false);
    }
  };

  const handleSubmitWan = async (collected: Record<string, unknown>) => {
    const currentChat = chats.find(c => c.id === activeChat);
    if (!currentChat) return;
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setIsAwaitingResponse(true);

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
        content: data.message || 'WAN configurado correctamente.',
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
      toast.error('Fallo al configurar WAN');
    } finally {
      requestInFlightRef.current = false;
      setIsAwaitingResponse(false);
    }
  };

  const handleRetry = async () => {
    const currentChat = chats.find(c => c.id === activeChat);
    if (!currentChat || currentChat.messages.length < 2) return;
    const lastAssistantMessageIndex = currentChat.messages.length - 1;
    const lastAssistantMessage = currentChat.messages[lastAssistantMessageIndex];
    if (lastAssistantMessage.role !== 'assistant') return;

    const lastUserMessage = [...currentChat.messages]
      .slice(0, lastAssistantMessageIndex)
      .reverse()
      .find((msg) => msg.role === 'user');

    if (!lastUserMessage) return;

    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setIsAwaitingResponse(true);

    try {
      const res = await fetch(`${API_BASE}/chat/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
            content: lastUserMessage.content,
            sessionId: currentChat.id
        }),
      });
      const data = await res.json();
      if (!res.ok) { return; }

      const newContent: string = data.assistantMessage.content;
      const newActions: SuggestedAction[] = data.assistantMessage.actions ?? [];
      const newMetadata: Record<string, unknown> | null = data.assistantMessage.metadata ?? null;

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
    } finally {
      requestInFlightRef.current = false;
      setIsAwaitingResponse(false);
    }
  };

  const handleVersionChange = (messageId: string, direction: 'prev' | 'next') => {
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

  // -------------------------------------------------------------------------
  // 6. ADMIN HISTORY LOGIC
  // -------------------------------------------------------------------------
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
      if (!res.ok) return;

      const history: AdminHistoryMessage[] = data.messages ?? [];
      if (history.length === 0) return;

      const sortedHistory = [...history].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const THRESHOLD_MS = 60 * 60 * 1000;
      const groups: AdminHistoryMessage[][] = [];
      let currentGroup: AdminHistoryMessage[] = [];

      for (let i = 0; i < sortedHistory.length; i++) {
        const msg = sortedHistory[i];
        if (currentGroup.length === 0) {
          currentGroup.push(msg);
          continue;
        }
        const prev = currentGroup[currentGroup.length - 1];
        const diff = new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime();
        if (diff > THRESHOLD_MS) {
          groups.push(currentGroup);
          currentGroup = [msg];
        } else {
          currentGroup.push(msg);
        }
      }
      if (currentGroup.length > 0) groups.push(currentGroup);

      const newChats: Chat[] = groups.reverse().map((group, idx) => {
        const historyMessages: Message[] = group.map((m) => ({
          id: `admin-${userInfo.id}-${m.id}`,
          role: m.role,
          content: m.content,
          imageDataUrl: m.imageUrl ?? undefined,
          createdAt: m.createdAt,
          actions: m.actions ?? undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: (m as any).metadata ?? null,
        }));

        const latest = group[group.length - 1];
        return {
          id: `admin-history-${userInfo.id}-${idx + 1}`,
          title: `Historial · ${userInfo.name ?? userInfo.email}`,
          timestamp: latest ? new Date(latest.createdAt).toLocaleString() : 'Sin mensajes',
          preview: latest ? latest.content.slice(0, 80) : 'Sin mensajes',
          messages: historyMessages,
          isAdminHistory: true,
          ownerUserId: userInfo.id,
          messagesLoaded: true
        };
      });

      setChats((prev) => {
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
      if (closePanel) setShowAdminPanel(false);
    } catch (error) {
      console.error('Error al cargar historial admin', error);
    }
  }, [isAdmin]);

  const adminPreloadDoneRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || adminPreloadDoneRef.current) return;
    adminPreloadDoneRef.current = true;
    const preloadAllHistories = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) return;
        const users = (data.users ?? []) as { id: number; email: string; name?: string }[];
        await Promise.all(users.map((u) => openUserHistoryAsChat(u, { focus: false, closePanel: false })));
      } catch {
      }
    };
    void preloadAllHistories();
  }, [isAdmin, openUserHistoryAsChat]);

  // -------------------------------------------------------------------------
  // 7. EFECTOS UI: SCROLL INFINITO, AUTO-SCROLL Y SINCRONIZACIÓN DE RUTAS
  // -------------------------------------------------------------------------
  
  // ¡Este es el único useEffect que necesitamos ahora para sincronizar URL!
  useEffect(() => {
    if (sessionId && sessionId !== activeChat) {
      setActiveChat(sessionId);
      // Admin history chats are loaded via the admin preload effect, not the API endpoint.
      if (!sessionId.startsWith('admin-')) {
        loadSessionMessages(sessionId);
      }
    } else if (!sessionId && activeChat) {
      setActiveChat(null);
    }
  }, [sessionId, activeChat, loadSessionMessages]);

  const currentChat = chats.find((chat) => chat.id === activeChat);
  const currentMessages = currentChat?.messages ?? [];
  const shouldVirtualizeMessages = currentMessages.length > 120;

  const messageVirtualizer = useVirtualizer({
    count: currentMessages.length,
    getScrollElement: () => scrollViewportElement,
    estimateSize: () => 180,
    overscan: 12,
    getItemKey: (index) => currentMessages[index]?.id ?? index,
  });

  useEffect(() => {
    if (!scrollViewportRef.current) {
      setScrollViewportElement(null);
      return;
    }
    const viewport = scrollViewportRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    setScrollViewportElement(viewport);
  }, [activeChat, loadingMessages]);

  const renderMessageRow = (message: Message, index: number, messages: Message[]) => {
    const animationKey = message.id === animatingMessageId ||
      animatingMessageId?.startsWith(message.id + '-');
    const prevMsg = messages[index - 1];
    const currDate = message.createdAt ? new Date(message.createdAt) : null;
    const prevDate = prevMsg?.createdAt ? new Date(prevMsg.createdAt) : null;
    const showDateSeparator = currDate && (!prevDate || currDate.toDateString() !== prevDate.toDateString());

    return (
      <div data-message-id={message.id}>
        {showDateSeparator && (
          <div className="flex justify-center my-3">
            <div className="px-3 py-1 text-[11px] font-medium text-gray-400 bg-white border border-gray-200 rounded-full shadow-sm">
              {currDate?.toLocaleDateString()}
            </div>
          </div>
        )}
        <ChatMessage
          role={message.role}
          content={message.content}
          imageDataUrl={message.imageDataUrl}
          isLatest={index === messages.length - 1 && message.role === 'assistant'}
          isAwaitingResponse={isAwaitingResponse}
          onRetry={handleRetry}
          shouldAnimate={animationKey}
          messageId={message.id}
          versions={message.versions}
          currentVersion={message.currentVersion}
          onVersionChange={handleVersionChange}
          actions={message.actions}
          onActionSelect={handleActionSelect}
          onReplaceMessage={handleReplaceMessage}
          onSubmitAuth={handleSubmitAuth}
          onSubmitWan={handleSubmitWan}
          createdAt={message.createdAt}
          metadata={message.metadata}
          highlighted={message.id === highlightedMessageId}
          disableActions={!!currentChat?.isAdminHistory || isAwaitingResponse}
        />
      </div>
    );
  };

  // Observer para Scroll Infinito hacia arriba
  useEffect(() => {
    const chat = currentChat;
    if (!chat || !chat.hasMoreMessages || chat.isLoadingMore || chat.isAdminHistory) return;

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            const oldestMessage = chat.messages[0];
            if (oldestMessage) {
                const oldestId = oldestMessage.id.replace('msg-', ''); 
                
                if (scrollViewportRef.current) {
                    const scrollContainer = scrollViewportRef.current.querySelector('[data-radix-scroll-area-viewport]');
                    if (scrollContainer) {
                         // eslint-disable-next-line @typescript-eslint/no-explicit-any
                         (scrollContainer as any)._savedScrollHeight = scrollContainer.scrollHeight;
                         // eslint-disable-next-line @typescript-eslint/no-explicit-any
                         (scrollContainer as any)._savedScrollTop = scrollContainer.scrollTop;
                    }
                }

                loadSessionMessages(chat.id, { beforeId: oldestId });
            }
        }
    }, { threshold: 0.1, rootMargin: '100px 0px 0px 0px' }); 

    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    return () => observer.disconnect();
  }, [activeChat, currentChat, currentChat?.messages.length, currentChat?.isLoadingMore, loadSessionMessages]);

  // Restaurar scroll después de cargar historial antiguo
  useLayoutEffect(() => {
     if (scrollViewportRef.current && currentChat?.messages.length) {
         const scrollContainer = scrollViewportRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         if (scrollContainer && (scrollContainer as any)._savedScrollHeight) {
             const newHeight = scrollContainer.scrollHeight;
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const oldHeight = (scrollContainer as any)._savedScrollHeight;
             const diff = newHeight - oldHeight;
             
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             scrollContainer.scrollTop = diff + ((scrollContainer as any)._savedScrollTop || 0);
             
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             delete (scrollContainer as any)._savedScrollHeight;
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             delete (scrollContainer as any)._savedScrollTop;
         }
     }
  }, [currentChat?.messages]);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const collapsed = window.innerWidth < 768;
        setSidebarCollapsed((prev) => (prev === collapsed ? prev : collapsed));
      });
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Auto-scroll al fondo SOLO si NO estamos cargando historial antiguo
  useEffect(() => {
    if (!currentChat?.isLoadingMore) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentChat?.messages.length, activeChat, currentChat?.isLoadingMore]);

  // Detectar tamaño de pantalla para aplicar offset del header en desktop
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setIsDesktop(window.innerWidth >= 768);
      });
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  
  // Scroll a mensaje específico (Búsqueda)
  useEffect(() => {
    if (!scrollToMessageId) return;
    const el = document.querySelector<HTMLElement>(`[data-message-id="${scrollToMessageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(scrollToMessageId);
      setTimeout(() => setHighlightedMessageId(null), 2500);
      return;
    }

    if (shouldVirtualizeMessages && currentChat) {
      const targetIndex = currentChat.messages.findIndex((m) => m.id === scrollToMessageId);
      if (targetIndex >= 0) {
        messageVirtualizer.scrollToIndex(targetIndex, { align: 'center' });
        requestAnimationFrame(() => {
          const targetEl = document.querySelector<HTMLElement>(`[data-message-id="${scrollToMessageId}"]`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedMessageId(scrollToMessageId);
            setTimeout(() => setHighlightedMessageId(null), 2500);
          }
        });
      }
    }
  }, [scrollRequestNonce, scrollToMessageId, shouldVirtualizeMessages, currentChat, messageVirtualizer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Polling Integration Status
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
          if (t.to) toast.success(`${t.key} conectado`, { description: `Estado: OK` });
          else toast.error(`${t.key} desconectado`, { description: `El servicio no responde` });
        }
      } catch {
        const prev = prevStatusRef.current;
        if (prev && (prev.wisphub.ok || prev.smartolt.ok)) toast.error('Integraciones no disponibles');
        prevStatusRef.current = null;
        setIntegrationStatus(null);
      }
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 600000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

  function StatusDot({ label, ok }: { label: string; ok: boolean }) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.4)]' : 'bg-red-400 shadow-[0_0_8px_2px_rgba(239,68,68,0.3)]'}`}></span>
        <span className="hidden lg:inline font-medium">{label}</span>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/chat/:sessionId"
        element={
          <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">
            <SearchModal
              key={searchOpen ? "open" : "closed"}
              isOpen={searchOpen}
              onClose={() => setSearchOpen(false)}
              onSelectChat={handleSelectChat}
              chats={chats}
              isAdmin={isAdmin}
            />
            <ChatSidebar
              chats={chats}
              activeChat={activeChat}
              sidebarCollapsed={sidebarCollapsed}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewChat}
              onDeleteChat={handleDeleteChat}
              onToggleSidebar={useCallback(() => setSidebarCollapsed((p) => !p), [])}
              onOpenSearch={useCallback(() => setSearchOpen(true), [])}
              onOpenAdmin={useCallback(() => setShowAdminPanel(true), [])}
              onOpenProfile={useCallback(() => { if (!isAdmin) setShowUserPanel(true); }, [isAdmin])}
            />
            <div className="flex-1 flex flex-col min-w-0 relative">
              <AnimatePresence>
                {showAdminPanel && (
                  <motion.div
                    key="admin-panel"
                    className="absolute inset-0 z-30 overflow-hidden"
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <AdminUserPanel 
                      onClose={() => setShowAdminPanel(false)}
                      // @ts-expect-error: Propiedad onOpenUserHistory aún no definida en AdminUserPanel
                      onOpenUserHistory={openUserHistoryAsChat}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {showUserPanel && !isAdmin && (
                  <motion.div
                    key="user-panel"
                    className="absolute inset-0 z-30 overflow-hidden"
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <UserAccountPanel onClose={() => setShowUserPanel(false)} />
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Header */}
              <header
                className="fixed top-0 left-0 right-0 z-60 flex items-center justify-between px-4 bg-white/98 backdrop-blur-xl"
                style={{
                  height: 'calc(56px + env(safe-area-inset-top))',
                  paddingTop: 'env(safe-area-inset-top)',
                  paddingLeft: !sidebarCollapsed && isDesktop ? 'calc(16rem + 0.625rem)' : undefined,
                  transition: 'padding-left 200ms ease, padding-top 200ms ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 0 rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="h-9 w-9 p-0 text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 rounded-lg transition-all duration-200"
                  >
                    <PanelLeft className="size-4.5" />
                  </Button>
                  <div className="hidden sm:flex flex-col">
                    <h2 className="text-sm font-semibold text-gray-800 leading-tight">
                      {currentChat ? currentChat.title : 'Nuevo chat'}
                    </h2>
                    <p className="text-[11px] text-gray-400 leading-tight">
                      {currentChat 
                        ? (loadingMessages ? 'Cargando historial...' : currentChat.timestamp)
                        : 'Asistente SmartOLT'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="hidden md:flex items-center gap-3 mr-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                    <StatusDot label="WispHub" ok={!!integrationStatus?.wisphub?.ok} />
                    <div className="w-px h-3.5 bg-gray-200" />
                    <StatusDot label="SmartOLT" ok={!!integrationStatus?.smartolt?.ok} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchOpen(true)}
                    className="h-9 px-3 gap-2 text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 rounded-lg transition-all duration-200"
                  >
                    <Search className="size-4" />
                    <span className="hidden sm:inline text-xs font-medium">Buscar</span>
                    <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded-md bg-gray-100 border border-gray-200/80 px-1.5 font-mono text-[10px] font-medium text-gray-400">
                      <span className="text-[11px]">⌘</span>K
                    </kbd>
                  </Button>
                </div>
              </header>
              {/* Messages Area */}
              {currentChat ? (
                <ScrollArea className="flex-1 overflow-y-auto bg-gray-50 pt-14" ref={scrollViewportRef}>
                  {loadingMessages ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                    </div>
                  ) : (
                    <div className="pb-4 min-h-full flex flex-col justify-end">
                      {/* Spinner de carga de historial antiguo */}
                      {currentChat.hasMoreMessages && !currentChat.isAdminHistory && (
                        <div ref={topSentinelRef} className="h-10 flex w-full justify-center items-center py-2 shrink-0">
                          {currentChat.isLoadingMore && <Loader2 className="h-4 w-4 animate-spin text-orange-400" />}
                        </div>
                      )}
                      {shouldVirtualizeMessages ? (
                        <div
                          className="relative w-full"
                          style={{ height: `${messageVirtualizer.getTotalSize()}px` }}
                        >
                          {messageVirtualizer.getVirtualItems().map((virtualItem) => {
                            const message = currentChat.messages[virtualItem.index];
                            if (!message) return null;
                            return (
                              <div
                                key={message.id}
                                ref={messageVirtualizer.measureElement}
                                data-index={virtualItem.index}
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  transform: `translateY(${virtualItem.start}px)`,
                                }}
                              >
                                {renderMessageRow(message, virtualItem.index, currentChat.messages)}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        currentChat.messages.map((message, index) => (
                          <div key={message.id}>
                            {renderMessageRow(message, index, currentChat.messages)}
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>
              ) : (
                <div className="flex-1 overflow-y-auto bg-gray-50 pt-14">
                  <EmptyChat onSelectQuery={handleSendMessage} disabled={isAwaitingResponse} />
                </div>
              )}
              {/* Input */}
              <div className="flex-shrink-0">
                {currentChat && currentChat.isAdminHistory && isAdmin ? (
                  <div className="px-4 py-2 text-xs text-orange-600 text-center bg-orange-50 border-t border-orange-100 font-medium">
                    Vista de historial de usuario (solo lectura).
                  </div>
                ) : (
                  <ChatInput onSendMessage={handleSendMessage} isLoading={isAwaitingResponse} />
                )}
              </div>
            </div>
          </div>
        }
      />
      <Route
        path="/"
        element={<Navigate to={activeChat ? `/chat/${activeChat}` : '/chat'} replace />}
      />
      <Route
        path="/chat"
        element={
          <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden">
            <SearchModal
              key={searchOpen ? "open" : "closed"}
              isOpen={searchOpen}
              onClose={() => setSearchOpen(false)}
              onSelectChat={handleSelectChat}
              chats={chats}
              isAdmin={isAdmin}
            />
            <ChatSidebar
              chats={chats}
              activeChat={activeChat}
              sidebarCollapsed={sidebarCollapsed}
              onSelectChat={handleSelectChat}
              onNewChat={handleNewChat}
              onDeleteChat={handleDeleteChat}
              onToggleSidebar={useCallback(() => setSidebarCollapsed((p) => !p), [])}
              onOpenSearch={useCallback(() => setSearchOpen(true), [])}
              onOpenAdmin={useCallback(() => setShowAdminPanel(true), [])}
              onOpenProfile={useCallback(() => { if (!isAdmin) setShowUserPanel(true); }, [isAdmin])}
            />
            <div className="flex-1 flex flex-col min-w-0 relative">
              <AnimatePresence>
                {showAdminPanel && (
                  <motion.div
                    key="admin-panel"
                    className="absolute inset-0 z-30 overflow-hidden"
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <AdminUserPanel 
                      onClose={() => setShowAdminPanel(false)}
                      // @ts-expect-error: Propiedad onOpenUserHistory aún no definida en AdminUserPanel
                      onOpenUserHistory={openUserHistoryAsChat}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {showUserPanel && !isAdmin && (
                  <motion.div
                    key="user-panel"
                    className="absolute inset-0 z-30 overflow-hidden"
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <UserAccountPanel onClose={() => setShowUserPanel(false)} />
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Header */}
              <header
                className="fixed top-0 left-0 right-0 z-60 flex items-center justify-between px-4 bg-white/98 backdrop-blur-xl"
                style={{
                  height: 'calc(56px + env(safe-area-inset-top))',
                  paddingTop: 'env(safe-area-inset-top)',
                  paddingLeft: !sidebarCollapsed && isDesktop ? 'calc(16rem + 0.625rem)' : undefined,
                  transition: 'padding-left 200ms ease, padding-top 200ms ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 0 rgba(0,0,0,0.04)',
                }}
              >
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="h-9 w-9 p-0 text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 rounded-lg transition-all duration-200"
                  >
                    <PanelLeft className="size-4.5" />
                  </Button>
                  <div className="hidden sm:flex flex-col">
                    <h2 className="text-sm font-semibold text-gray-800 leading-tight">
                      Nuevo chat
                    </h2>
                    <p className="text-[11px] text-gray-400 leading-tight">
                      Asistente SmartOLT
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="hidden md:flex items-center gap-3 mr-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                    <StatusDot label="WispHub" ok={!!integrationStatus?.wisphub?.ok} />
                    <div className="w-px h-3.5 bg-gray-200" />
                    <StatusDot label="SmartOLT" ok={!!integrationStatus?.smartolt?.ok} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchOpen(true)}
                    className="h-9 px-3 gap-2 text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 rounded-lg transition-all duration-200"
                  >
                    <Search className="size-4" />
                    <span className="hidden sm:inline text-xs font-medium">Buscar</span>
                    <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded-md bg-gray-100 border border-gray-200/80 px-1.5 font-mono text-[10px] font-medium text-gray-400">
                      <span className="text-[11px]">⌘</span>K
                    </kbd>
                  </Button>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto bg-gray-50 pt-14">
                <EmptyChat onSelectQuery={handleSendMessage} disabled={isAwaitingResponse} />
              </div>
              <div className="flex-shrink-0">
                <ChatInput onSendMessage={handleSendMessage} isLoading={isAwaitingResponse} />
              </div>
            </div>
          </div>
        }
      />
    </Routes>
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm font-medium tracking-wide">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <span>Cargando sesión...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <ChatApp key={user?.id} />;
}