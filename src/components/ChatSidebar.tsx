import { useMemo, memo, useState, useEffect, useCallback, type ElementType } from 'react';
import {
  Plus, MessageSquare, LogOut, User, Shield, Settings, Trash2, AlertTriangle,
  Activity, Wifi, Server, UserX, ImageIcon, Loader2, Search, RotateCcw, RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { useAuth } from '../contexts/AuthContext';

// --- Interfaces ---
interface Chat {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
  isAdminHistory?: boolean;
  ownerUserId?: number;
}

interface WizardSessionSummary {
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
}

interface ChatSidebarProps {
  chats: Chat[];
  activeChat: string | null;
  sidebarCollapsed: boolean;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onOpenAdmin?: () => void;
  onOpenProfile?: () => void;
  apiBase?: string;
  onOpenReplay?: (sessionId: string) => void;
}

// --- Wizard meta ---
const WIZARD_META: Record<string, { label: string; Icon: ElementType; color: string; bg: string }> = {
  auth:           { label: 'Autorizar ONU',  Icon: Shield,    color: 'text-[#1e3a8a]',    bg: 'bg-blue-50' },
  'change-onu':   { label: 'Cambiar ONU',    Icon: Server,    color: 'text-purple-600',   bg: 'bg-purple-50' },
  wifi:           { label: 'Cambiar WiFi',   Icon: Wifi,      color: 'text-sky-600',      bg: 'bg-sky-50' },
  monitor:        { label: 'Monitoreo',      Icon: Activity,  color: 'text-emerald-600',  bg: 'bg-emerald-50' },
  baja:           { label: 'Dar de baja',    Icon: UserX,     color: 'text-red-600',      bg: 'bg-red-50' },
  fotos:          { label: 'Agregar fotos',  Icon: ImageIcon, color: 'text-orange-500',   bg: 'bg-orange-50' },
};

const STATUS_META: Record<string, { label: string; dot: string; pill: string }> = {
  completed:     { label: 'Completado',  dot: 'bg-emerald-400', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  failed:        { label: 'Fallido',     dot: 'bg-red-400',     pill: 'bg-red-100 text-red-600 border-red-200' },
  abandoned:     { label: 'Abandonado',  dot: 'bg-gray-300',    pill: 'bg-gray-100 text-gray-500 border-gray-200' },
  'in-progress': { label: 'En progreso', dot: 'bg-amber-400',   pill: 'bg-amber-100 text-amber-700 border-amber-200' },
};

// --- WizardSessionItem: ítem compacto en la lista ---
function WizardSessionItem({
  session, isAdmin, onOpen,
}: {
  session: WizardSessionSummary;
  isAdmin: boolean;
  onOpen: (sessionId: string) => void;
}) {
  const meta = WIZARD_META[session.type] ?? { label: session.type, Icon: Activity, color: 'text-gray-500', bg: 'bg-gray-50' };
  const statusMeta = STATUS_META[session.status] ?? { label: session.status, dot: 'bg-gray-300', pill: 'bg-gray-100 text-gray-500 border-gray-200' };
  const { Icon } = meta;

  const date = session.startedAt
    ? new Date(session.startedAt).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
    : '';

  return (
    <button
      onClick={() => onOpen(session.id)}
      className="w-full flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-left group"
    >
      <div className={`flex-shrink-0 mt-0.5 size-6 rounded-md ${meta.bg} flex items-center justify-center`}>
        <Icon className={`size-3 ${meta.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-semibold text-gray-800 truncate">{meta.label}</span>
          <span className={`text-[9px] font-semibold px-1 py-px rounded-full border ${statusMeta.pill}`}>
            {statusMeta.label}
          </span>
        </div>
        {session.clientName && (
          <p className="text-[11px] text-gray-500 truncate leading-tight">{session.clientName}</p>
        )}
        {isAdmin && session.userName && (
          <p className="text-[10px] text-gray-400 truncate leading-tight">@ {session.userName}</p>
        )}
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-1 mt-0.5">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">{date}</span>
        <ChevronRight className="size-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </button>
  );
}

// --- ChatItem (Optimizado con memo) ---
const ChatItem = memo(({
  chat,
  isActive,
  onClick,
  onDelete
}: {
  chat: Chat;
  isActive: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer border transition-all duration-150 ${
        isActive
          ? 'bg-orange-50 border-orange-200/60'
          : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
      }`}
      onClick={() => onClick(chat.id)}
    >
      {isActive && (
        <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] bg-orange-400 rounded-r-full" />
      )}
      <MessageSquare className={`size-3.5 flex-shrink-0 mt-0.5 transition-colors ${
        isActive ? 'text-orange-600' : 'text-gray-300 group-hover:text-gray-500'
      }`} />

      <div className="flex-1 min-w-0">
        <div className={`text-[13px] truncate transition-colors leading-tight font-semibold ${
          isActive ? 'text-gray-900' : 'text-gray-700 group-hover:text-gray-900'
        }`}>
          {chat.title}
        </div>

        <div className="text-[12px] text-gray-500 truncate mt-0.5 leading-relaxed">
          {chat.preview}
        </div>

        {chat.isAdminHistory && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200/70 px-2 py-0.5 text-[10px] font-semibold">
            Historial de usuario
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={(e: any) => {
          e.stopPropagation();
          onDelete(chat.id);
        }}
        onMouseDown={(e: any) => e.stopPropagation()}
        className={`size-7 flex-shrink-0 rounded-md flex items-center justify-center transition-colors ${
          isActive
            ? 'text-orange-600 hover:bg-orange-100 hover:text-orange-700'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
        }`}
        title="Eliminar chat"
        aria-label={`Eliminar chat ${chat.title}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
});

ChatItem.displayName = 'ChatItem';

// --- Componente Principal ---
export function ChatSidebar({
  chats,
  activeChat,
  sidebarCollapsed,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onToggleSidebar,
  onOpenAdmin,
  onOpenProfile,
  apiBase,
  onOpenReplay,
}: ChatSidebarProps) {
  const { user, logout, isAdmin } = useAuth();
  const [chatPendingDelete, setChatPendingDelete] = useState<Chat | null>(null);

  // Wizard view state
  const [sidebarView, setSidebarView] = useState<'chats' | 'wizards'>('chats');
  const [wizardSessions, setWizardSessions] = useState<WizardSessionSummary[]>([]);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardSearch, setWizardSearch] = useState('');
  const [wizardFilterStatus, setWizardFilterStatus] = useState('');

  const loadWizardSessions = useCallback(async () => {
    if (!apiBase) return;
    setWizardLoading(true);
    try {
      const params = new URLSearchParams({ limit: '60' });
      if (wizardFilterStatus) params.set('status', wizardFilterStatus);
      const res = await fetch(`${apiBase}/wizard/sessions?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.ok) setWizardSessions(data.sessions || []);
    } catch {}
    finally { setWizardLoading(false); }
  }, [apiBase, wizardFilterStatus]);

  useEffect(() => {
    if (sidebarView === 'wizards') loadWizardSessions();
  }, [sidebarView, loadWizardSessions]);

  const filteredSessions = useMemo(() => {
    const q = wizardSearch.trim().toLowerCase();
    if (!q) return wizardSessions;
    return wizardSessions.filter(s => {
      const meta = WIZARD_META[s.type];
      return (
        meta?.label.toLowerCase().includes(q) ||
        s.clientName?.toLowerCase().includes(q) ||
        s.userName?.toLowerCase().includes(q) ||
        STATUS_META[s.status]?.label.toLowerCase().includes(q)
      );
    });
  }, [wizardSessions, wizardSearch]);

  const handleDeleteChat = (id: string) => {
    const chat = chats.find((c) => c.id === id) || null;
    setChatPendingDelete(chat);
  };

  const confirmDeleteChat = () => {
    if (!chatPendingDelete) return;
    onDeleteChat(chatPendingDelete.id);
    onNewChat();
    setChatPendingDelete(null);
  };

  const handleOpenReplay = useCallback((sessionId: string) => {
    if (window.innerWidth < 768) onToggleSidebar();
    onOpenReplay?.(sessionId);
  }, [onOpenReplay, onToggleSidebar]);

  const { personalChats, adminHistories } = useMemo(() => ({
    personalChats: chats.filter((c) => !c.isAdminHistory),
    adminHistories: isAdmin ? chats.filter((c) => c.isAdminHistory) : [],
  }), [chats, isAdmin]);

  const renderChatList = (list: Chat[], emptyLabel: string) => {
    if (!Array.isArray(list) || list.length === 0) {
      return (
        <div className="p-8 text-center text-gray-400 text-xs">{emptyLabel}</div>
      );
    }
    return (
      <div className="px-2 py-3 space-y-0.5">
        {list.map((chat) => (
          <ChatItem
            key={chat.id}
            chat={chat}
            isActive={activeChat === chat.id}
            onClick={onSelectChat}
            onDelete={handleDeleteChat}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${
          !sidebarCollapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onToggleSidebar}
        aria-hidden="true"
      />

      {/* Sidebar Container */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-70 flex-shrink-0 h-full bg-white border-r border-gray-100 overflow-hidden transition-all duration-300 ease-in-out ${
          sidebarCollapsed
            ? '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0'
            : 'translate-x-0 w-[85vw] md:w-64 md:opacity-100'
        }`}
      >
        <div className="flex flex-col h-full w-full md:min-w-[16rem]">

          {/* Header */}
          <div className="px-3 flex flex-col gap-1.5 border-b border-gray-100 bg-white pb-2" style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
          }}>
            <button
              onClick={onNewChat}
              className="flex items-center w-full h-9 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] active:scale-[0.98] text-white hover:text-white text-sm font-semibold tracking-tight transition-all duration-150 rounded-lg justify-center gap-2 px-4 border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md"
            >
              <Plus className="size-4" />
              Nuevo chat
            </button>

            {/* View toggle tabs */}
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
              <button
                onClick={() => setSidebarView('chats')}
                className={`flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-[12px] font-semibold transition-all ${
                  sidebarView === 'chats'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <MessageSquare className="size-3" />
                Chats
              </button>
              <button
                onClick={() => setSidebarView('wizards')}
                className={`flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-[12px] font-semibold transition-all ${
                  sidebarView === 'wizards'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <RotateCcw className="size-3" />
                Flujos
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden min-h-0">
            {sidebarView === 'chats' ? (
              <div className="h-full overflow-y-auto overflow-x-hidden custom-scrollbar">
                {isAdmin ? (
                  <div className="space-y-3 pb-4">
                    <div>
                      <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                        Mis chats
                      </div>
                      {renderChatList(personalChats, 'Aún no hay conversaciones propias')}
                    </div>

                    {adminHistories.length > 0 && (
                      <div>
                        <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center justify-between group">
                          <span>Historiales usuarios</span>
                          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[9px] group-hover:text-gray-700 transition-colors">
                            {adminHistories.length}
                          </span>
                        </div>
                        {renderChatList(adminHistories, 'No se han cargado historiales')}
                      </div>
                    )}
                  </div>
                ) : (
                  renderChatList(personalChats, 'Aún no hay conversaciones')
                )}
              </div>
            ) : (
              /* Wizard sessions list */
              <div className="flex flex-col h-full">
                {/* Search + filter bar */}
                <div className="px-3 pt-2 pb-2 space-y-1.5 border-b border-gray-100 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar flujos..."
                      value={wizardSearch}
                      onChange={e => setWizardSearch(e.target.value)}
                      className="w-full h-7 pl-7 pr-2 rounded-lg border border-gray-200 text-xs text-gray-700 placeholder:text-gray-400 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#1e3a8a]/30 focus:bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(['', 'in-progress', 'completed', 'failed', 'abandoned'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setWizardFilterStatus(s)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                          wizardFilterStatus === s
                            ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                      >
                        {s === '' ? 'Todos' : STATUS_META[s]?.label ?? s}
                      </button>
                    ))}
                    <button
                      onClick={loadWizardSessions}
                      className="ml-auto size-5 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title="Actualizar"
                    >
                      <RefreshCw className={`size-3 ${wizardLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Sessions list */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                  {wizardLoading && filteredSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                      <Loader2 className="size-5 animate-spin text-[#1e3a8a]/40" />
                      <p className="text-xs text-gray-400">Cargando flujos...</p>
                    </div>
                  ) : filteredSessions.length === 0 ? (
                    <div className="text-center py-12">
                      <RotateCcw className="size-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">
                        {wizardSearch ? 'Sin resultados' : 'No hay flujos registrados'}
                      </p>
                    </div>
                  ) : (
                    filteredSessions.map(session => (
                      <WizardSessionItem
                        key={session.id}
                        session={session}
                        isAdmin={isAdmin}
                        onOpen={handleOpenReplay}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile - Fixed at Bottom */}
          <div className="px-3 py-3 border-t border-gray-100 bg-white z-10 flex-shrink-0">
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300 transition-colors duration-200 group shadow-[0_1px_2px_rgba(17,29,72,0.06)]">
              <div className="flex-shrink-0 size-7 rounded-lg bg-orange-100 flex items-center justify-center">
                <User className="size-3.5 text-orange-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900 truncate leading-tight">
                  {user?.name || user?.email || 'Usuario'}
                </div>
                <div className="text-[11px] text-gray-500 truncate leading-tight">
                  {isAdmin ? 'Administrador' : 'Operador'}
                </div>
              </div>

              <div className="flex items-center gap-0.5">
                {isAdmin && (
                  <button
                    onClick={onOpenAdmin}
                    className="size-6 flex items-center justify-center hover:bg-[#1e3a8a]/10 hover:text-[#f5831f] text-[#1e3a8a] transition-all rounded-md"
                    title="Panel Admin"
                  >
                    <Shield className="size-3.5" />
                  </button>
                )}

                {!isAdmin && (
                  <button
                    onClick={onOpenProfile}
                    className="size-6 flex items-center justify-center hover:bg-[#1e3a8a]/10 hover:text-[#f5831f] text-[#1e3a8a] transition-all rounded-md"
                    title="Mi cuenta"
                  >
                    <Settings className="size-3.5" />
                  </button>
                )}

                <button
                  onClick={logout}
                  className="size-6 flex items-center justify-center hover:bg-[#1e3a8a]/10 hover:text-[#f5831f] text-[#1e3a8a] transition-all rounded-md"
                  title="Cerrar sesión"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <Dialog open={!!chatPendingDelete} onOpenChange={(open) => !open && setChatPendingDelete(null)}>
        <DialogContent className="max-w-md border border-gray-200 bg-white p-5">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-orange-100 border border-orange-200">
                <AlertTriangle className="size-4 text-orange-600" />
              </span>
              <DialogTitle className="text-base font-semibold text-gray-900">Eliminar chat</DialogTitle>
            </div>
            <DialogDescription className="text-sm text-gray-600">
              Esta acción eliminará la conversación seleccionada.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span className="text-gray-500">Chat: </span>
            <span className="font-semibold text-gray-900">{chatPendingDelete?.title || 'Sin título'}</span>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setChatPendingDelete(null)}
              className="border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmDeleteChat}
              className="bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white"
            >
              Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
