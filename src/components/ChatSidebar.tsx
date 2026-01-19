import { Plus, MessageSquare, Trash2, LogOut, User, Shield, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { useAuth } from '../contexts/AuthContext';

interface Chat {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
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

  return (
    <>
      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onToggleSidebar}
        />
      )}
      
      {/* Sidebar */}
      <div className={`fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex-shrink-0 h-full bg-neutral-950 border-r border-neutral-800/30 transition-all duration-300 ${
        sidebarCollapsed ? '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0' : 'translate-x-0 w-4/5 md:w-64 md:opacity-100'
      } overflow-hidden`}>
        <div className="flex flex-col h-full w-full md:w-64">
          {/* Header */}
          <div className="p-2.5 border-b border-neutral-800/30">
            <Button 
              onClick={onNewChat}
              className="w-full h-10 bg-transparent hover:bg-neutral-900 text-neutral-300 hover:text-white text-sm font-medium transition-all duration-200 rounded-lg border border-neutral-800/50 hover:border-neutral-700 justify-start px-3"
            >
              <Plus className="mr-2 size-4" />
              Nuevo chat
            </Button>
          </div>

          {/* Chat History */}
          <ScrollArea className="flex-1">
            <div className="px-2 py-3 space-y-0.5">
              {chats.length === 0 ? (
                <div className="p-8 text-center text-neutral-600 text-xs">
                  Aún no hay conversaciones
                </div>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group relative flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                      activeChat === chat.id
                        ? 'bg-neutral-900'
                        : 'hover:bg-neutral-900/50'
                    }`}
                    onClick={() => onSelectChat(chat.id)}
                  >
                    <MessageSquare className={`size-3.5 flex-shrink-0 mt-0.5 transition-colors ${
                      activeChat === chat.id ? 'text-neutral-400' : 'text-neutral-600'
                    }`} />
                    <div className="flex-1 min-w-0 pr-6">
                      <div className={`text-[13px] truncate transition-colors leading-tight ${
                        activeChat === chat.id ? 'text-neutral-200' : 'text-neutral-400'
                      }`}>
                        {chat.title}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 absolute right-1.5 top-1.5 size-6 p-0 hover:bg-neutral-800 hover:text-red-400 transition-all duration-200 rounded-md"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* User Profile - Fixed at Bottom */}
          <div className="p-2.5 border-t border-neutral-800/30 bg-neutral-950">
            <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg bg-neutral-900/50 border border-neutral-800/30">
              <div className="flex-shrink-0 size-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                <User className="size-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-200 truncate">
                  {user?.name ? `${user.name}` : user?.email ?? 'Usuario'}
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {isAdmin ? 'Administrador' : 'Operador'}
                </div>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenAdmin}
                  className="size-8 p-0 hover:bg-neutral-800 hover:text-emerald-400 transition-all duration-200 rounded-md flex-shrink-0"
                  title="Panel de administración"
                >
                  <Shield className="size-4" />
                </Button>
              )}
              {!isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenProfile}
                  className="size-8 p-0 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 rounded-md flex-shrink-0"
                  title="Mi cuenta"
                >
                  <Settings className="size-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="size-8 p-0 hover:bg-neutral-800 hover:text-red-400 transition-all duration-200 rounded-md flex-shrink-0"
                title="Cerrar sesión"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}