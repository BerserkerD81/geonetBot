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
      className={`group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer border transition-all duration-150 ${
        isActive 
          ? 'bg-orange-50 border-orange-200/60' 
          : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
      }`}
      onClick={() => onClick(chat.id)}
    >
      {/* Active left accent */}
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
        <div className="p-8 text-center text-gray-400 text-xs">
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
          <div className="px-3 flex items-center border-b border-gray-100 bg-white" style={{
            height: 'calc(56px + env(safe-area-inset-top))',
            paddingTop: 'env(safe-area-inset-top)'
          }}>
            <button 
              onClick={onNewChat}
              className="flex items-center w-full h-9 bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] active:scale-[0.98] text-white hover:text-white text-sm font-semibold tracking-tight transition-all duration-150 rounded-lg justify-center gap-2 px-4 border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md"
            >
              <Plus className="size-4" />
              Nuevo chat
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar">
            {isAdmin ? (
              <div className="space-y-3 pb-4">
                <div>
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                    Mis chats
                  </div>
                  {renderList(personalChats, 'Aún no hay conversaciones propias')}
                </div>
                
                {adminHistories.length > 0 && (
                  <div>
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold flex items-center justify-between group">
                      <span>Historiales usuarios</span>
                      <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[9px] group-hover:text-gray-700 transition-colors">
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
          <div className="px-3 py-3 border-t border-gray-100 bg-white z-10">
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

              {/* Action buttons */}
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
    </>
  );
}