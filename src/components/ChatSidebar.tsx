import { useMemo, memo } from 'react';
import { Plus, MessageSquare, LogOut, User, Shield, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// --- Interfaces ---
interface Chat {
  id: string;
  title: string;
  timestamp: string; // Se mantiene en la interfaz por si viene del backend, pero no se muestra
  preview: string;
  isAdminHistory?: boolean;
  ownerUserId?: number;
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
}

// --- Componente ChatItem (Optimizado con memo) ---
const ChatItem = memo(({ 
  chat, 
  isActive, 
  onClick, 
   
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
      className={`group relative flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200 border ${
        isActive 
          ? 'bg-neutral-900 border-neutral-800/50' 
          : 'border-transparent hover:bg-neutral-900/50 hover:border-neutral-800/30'
      }`}
      onClick={() => onClick(chat.id)}
    >
      <MessageSquare className={`size-3.5 flex-shrink-0 mt-0.5 transition-colors ${
        isActive ? 'text-neutral-400' : 'text-neutral-600 group-hover:text-neutral-500'
      }`} />
      
      <div className="flex-1 min-w-0 pr-6">
        {/* MODIFICACIÓN: Se eliminó el div del timestamp y el justify-between */}
        <div className="flex items-center gap-2">
          <div className={`text-[13px] truncate transition-colors leading-tight font-medium ${
            isActive ? 'text-neutral-200' : 'text-neutral-400 group-hover:text-neutral-300'
          }`}>
            {chat.title}
          </div>
        </div>
        
        <div className="text-[12px] text-neutral-500 truncate mt-0.5">
          {chat.preview}
        </div>
        
        {chat.isAdminHistory && (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium">
            Historial de usuario
          </div>
        )}
      </div>
    </div>
  );
});

// Necesario para debugging en React DevTools cuando usamos memo
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
}: ChatSidebarProps) {
  const { user, logout, isAdmin } = useAuth();

  // Optimización de filtros
  const { personalChats, adminHistories } = useMemo(() => {
    return {
      personalChats: chats.filter((c) => !c.isAdminHistory),
      adminHistories: isAdmin ? chats.filter((c) => c.isAdminHistory) : []
    };
  }, [chats, isAdmin]);

  // Helper de renderizado
  const renderList = (list: Chat[], emptyLabel: string) => {
    if (list.length === 0) {
      return (
        <div className="p-8 text-center text-neutral-600 text-xs">
          {emptyLabel}
        </div>
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
            onDelete={onDeleteChat}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${
          !sidebarCollapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onToggleSidebar}
        aria-hidden="true"
      />
      
      {/* Sidebar Container */}
      <aside 
        className={`fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex-shrink-0 h-full bg-neutral-950 border-r border-neutral-800/30 overflow-hidden transition-all duration-300 ease-in-out ${
          sidebarCollapsed 
            ? '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0' 
            : 'translate-x-0 w-[85vw] md:w-64 md:opacity-100'
        }`}
      >
        <div className="flex flex-col h-full w-full md:min-w-[16rem]">
          
          {/* Header */}
          <div className="p-2.5 border-b border-neutral-800/30">
            <button 
              onClick={onNewChat}
              className="flex items-center w-full h-10 bg-transparent hover:bg-neutral-900 text-neutral-300 hover:text-white text-sm font-medium transition-all duration-200 rounded-lg border border-neutral-800/50 hover:border-neutral-700 justify-start px-3 shadow-sm hover:shadow-md"
            >
              <Plus className="mr-2 size-4 text-neutral-400" />
              Nuevo chat
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar">
            {isAdmin ? (
              <div className="space-y-3 pb-4">
                <div>
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-neutral-500 font-bold opacity-80">
                    Mis chats
                  </div>
                  {renderList(personalChats, 'Aún no hay conversaciones propias')}
                </div>
                
                {adminHistories.length > 0 && (
                  <div>
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-neutral-500 font-bold opacity-80 flex items-center justify-between group">
                      <span>Historiales usuarios</span>
                      <span className="bg-neutral-900 text-neutral-500 px-1.5 py-0.5 rounded text-[9px] group-hover:text-neutral-300 transition-colors">
                        {adminHistories.length}
                      </span>
                    </div>
                    {renderList(adminHistories, 'No se han cargado historiales')}
                  </div>
                )}
              </div>
            ) : (
              renderList(personalChats, 'Aún no hay conversaciones')
            )}
          </div>

          {/* User Profile - Fixed at Bottom */}
          <div className="p-2.5 border-t border-neutral-800/30 bg-neutral-950 z-10">
            <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg bg-neutral-900/40 hover:bg-neutral-900/80 border border-neutral-800/30 transition-colors duration-200 group">
              <div className="flex-shrink-0 size-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-inner">
                <User className="size-4 text-white" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-200 truncate group-hover:text-white transition-colors">
                  {user?.name || user?.email || 'Usuario'}
                </div>
                <div className="text-xs text-neutral-500 truncate group-hover:text-neutral-400 transition-colors">
                  {isAdmin ? 'Administrador' : 'Operador'}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center gap-0.5">
                {isAdmin && (
                  <button
                    onClick={onOpenAdmin}
                    className="size-7 flex items-center justify-center hover:bg-neutral-800 hover:text-emerald-400 text-neutral-500 transition-all rounded-md"
                    title="Panel Admin"
                  >
                    <Shield className="size-3.5" />
                  </button>
                )}
                
                {!isAdmin && (
                  <button
                    onClick={onOpenProfile}
                    className="size-7 flex items-center justify-center hover:bg-neutral-800 hover:text-neutral-200 text-neutral-500 transition-all rounded-md"
                    title="Mi cuenta"
                  >
                    <Settings className="size-3.5" />
                  </button>
                )}
                
                <button
                  onClick={logout}
                  className="size-7 flex items-center justify-center hover:bg-red-950/30 hover:text-red-400 text-neutral-500 transition-all rounded-md"
                  title="Cerrar sesión"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}