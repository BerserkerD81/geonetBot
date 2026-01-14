import { useState, useEffect, useRef } from 'react';
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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  versions?: string[]; // Array of alternative versions for assistant messages
  currentVersion?: number; // Index of the currently displayed version
  timestamp?: number; // Timestamp to track new content generation
}

interface Chat {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
  messages: Message[];
}

// Mock chat history data
const initialChats: Chat[] = [
  {
    id: '1',
    title: 'Service Availability Check',
    timestamp: '2 hours ago',
    preview: 'Is service available in ZIP 12345?',
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Is our service available in ZIP code 12345?',
      },
      {
        id: 'm2',
        role: 'assistant',
        content: `Based on our coverage map (Zabbix API - Placeholder):\n\nZIP Code: 12345\nService Status: ✅ Available\nCoverage Type: Fiber Optic\nMax Speed: 1 Gbps\nNetwork Zone: Zone A\n\nAdditional Information:\n- Active nodes in area: 8\n- Average uptime: 99.8%\n- Estimated installation time: 3-5 business days\n\nWould you like me to check specific addresses or create a service order?`,
      },
    ],
  },
  {
    id: '2',
    title: 'Client Device Status',
    timestamp: '5 hours ago',
    preview: 'Show devices for client CL-2024-001',
    messages: [
      {
        id: 'm3',
        role: 'user',
        content: 'Show me all devices for client ID CL-2024-001',
      },
      {
        id: 'm4',
        role: 'assistant',
        content: `Client Information (Zabbix API - Placeholder):\n\nClient ID: CL-2024-001\nName: TechCorp Solutions\nAccount Status: Active\n\nRegistered Devices:\n\n1. Router - Cisco ASR 1001-X\n   - Status: ✅ Online\n   - Uptime: 45 days 12 hours\n   - CPU Usage: 23%\n   - Memory Usage: 41%\n   - Last Update: 2 minutes ago\n\n2. Switch - Juniper EX4300\n   - Status: ✅ Online\n   - Uptime: 45 days 12 hours\n   - Active Ports: 18/48\n   - Last Update: 2 minutes ago\n\n3. Access Point - UniFi AP-AC-Pro\n   - Status: ⚠️ Warning\n   - Uptime: 12 days 3 hours\n   - Connected Clients: 24\n   - Signal Strength: Degraded\n   - Last Update: 5 minutes ago\n\nRecommendation: Access Point #3 may need attention due to signal degradation.`,
      },
    ],
  },
  {
    id: '3',
    title: 'Network Monitoring Query',
    timestamp: 'Yesterday',
    preview: 'What is the current network status?',
    messages: [
      {
        id: 'm5',
        role: 'user',
        content: 'What is the current status of our network in the downtown area?',
      },
      {
        id: 'm6',
        role: 'assistant',
        content: `Network Status - Downtown Area (Zabbix API - Placeholder):\n\nOverall Status: ✅ Operational\n\nCore Infrastructure:\n- Main Router (DT-RTR-01): Online - 99.9% uptime\n- Backup Router (DT-RTR-02): Standby - Ready\n- Distribution Switch (DT-SW-01): Online - Normal load\n\nActive Connections: 1,247 clients\nBandwidth Usage: 68% (6.8 Gbps / 10 Gbps)\n\nRecent Alerts (Last 24h):\n- 3:45 AM - Minor latency spike (Resolved)\n- 11:20 AM - High bandwidth usage (Monitoring)\n\nAll systems operating within normal parameters. No immediate action required.`,
      },
    ],
  },
];

// Mock responses for new messages
const getMockResponse = (userMessage: string): string => {
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes('available') || lowerMessage.includes('zip') || lowerMessage.includes('coverage')) {
    return `Service Availability Check (Zabbix API - Placeholder):\n\nAnalyzing coverage for your request...\n\nStatus: ✅ Service Available\nConnection Type: Fiber Optic\nMax Speed: 1 Gbps\nEstimated Installation: 3-5 business days\n\nNetwork infrastructure in the area is fully operational with 99.8% uptime.`;
  }

  if (lowerMessage.includes('client') || lowerMessage.includes('customer')) {
    return `Client Lookup (Zabbix API - Placeholder):\n\nSearching client database...\n\nClient found:\n- Account Status: Active\n- Service Plan: Business Premium\n- Connected Devices: 4\n- Monthly Usage: 2.3 TB\n- Account Health: Excellent\n\nAll devices are online and functioning normally.`;
  }

  if (lowerMessage.includes('device') || lowerMessage.includes('monitor') || lowerMessage.includes('status')) {
    return `Device Monitoring (Zabbix API - Placeholder):\n\nQuerying device status...\n\nDevice Summary:\n1. Router: ✅ Online (Uptime: 30d 14h)\n2. Switch: ✅ Online (Uptime: 30d 14h)\n3. Firewall: ✅ Online (Uptime: 15d 8h)\n\nPerformance Metrics:\n- CPU: 18% average\n- Memory: 35% used\n- Network Traffic: Normal\n\nNo critical alerts detected.`;
  }

  return `Thank you for your query. I'm processing your request using the Zabbix API integration.\n\nI can help you with:\n- Service availability checks\n- Client account lookups\n- Device monitoring and status\n- Network performance metrics\n- Troubleshooting assistance\n\nCould you please provide more specific details about what you'd like to check?`;
};

function ChatApp() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>(() => {
    if (user) {
      const storedChats = localStorage.getItem(`chats_${user.id}`);
      if (storedChats) {
        try {
          return JSON.parse(storedChats);
        } catch (error) {
          console.error('Error parsing stored chats:', error);
          return [];
        }
      }
      return initialChats;
    }
    return [];
  });
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [animatingMessageId, setAnimatingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chats from localStorage for current user
  useEffect(() => {
    if (user) {
      const storedChats = localStorage.getItem(`chats_${user.id}`);
      if (storedChats) {
        try {
          const parsedChats = JSON.parse(storedChats);
          setChats(parsedChats);
        } catch (error) {
          console.error('Error parsing stored chats:', error);
          setChats([]);
        }
      } else {
        // Initialize with default chats for first time users
        setChats(initialChats);
      }
    }
  }, [user]);

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
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages]);

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

  const handleSendMessage = (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: `m${Date.now()}`,
      role: 'user',
      content,
    };

    const assistantMessage: Message = {
      id: `m${Date.now() + 1}`,
      role: 'assistant',
      content: getMockResponse(content),
      timestamp: Date.now(),
    };

    // Mark this message for animation
    setAnimatingMessageId(assistantMessage.id);

    if (activeChat) {
      // Add to existing chat
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChat
            ? {
                ...chat,
                messages: [...chat.messages, userMessage, assistantMessage],
                preview: content.substring(0, 50),
                timestamp: 'Just now',
              }
            : chat
        )
      );
    } else {
      // Create new chat
      const newChat: Chat = {
        id: `chat${Date.now()}`,
        title: content.substring(0, 50),
        timestamp: 'Just now',
        preview: content.substring(0, 50),
        messages: [userMessage, assistantMessage],
      };
      setChats((prev) => [newChat, ...prev]);
      setActiveChat(newChat.id);
    }
  };

  const handleRetry = () => {
    if (!currentChat || currentChat.messages.length < 2) return;
    
    const lastAssistantMessageIndex = currentChat.messages.length - 1;
    const lastAssistantMessage = currentChat.messages[lastAssistantMessageIndex];
    
    if (lastAssistantMessage.role !== 'assistant') return;
    
    const lastUserMessage = [...currentChat.messages]
      .reverse()
      .find(msg => msg.role === 'user');
    
    if (lastUserMessage) {
      // Generate new response
      const newContent = getMockResponse(lastUserMessage.content);
      
      // Update the message with versions
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChat
            ? {
                ...chat,
                messages: chat.messages.map((msg, idx) =>
                  idx === lastAssistantMessageIndex
                    ? {
                        ...msg,
                        versions: msg.versions 
                          ? [...msg.versions, newContent]
                          : [msg.content, newContent],
                        currentVersion: msg.versions 
                          ? msg.versions.length 
                          : 1,
                        content: newContent,
                        timestamp: Date.now(),
                      }
                    : msg
                ),
              }
            : chat
        )
      );
      
      // Mark for animation with new timestamp to force re-render
      setAnimatingMessageId(lastAssistantMessage.id + '-' + Date.now());
      
      // Clear animation flag after animation completes
      setTimeout(() => {
        setAnimatingMessageId(null);
      }, newContent.length * 10 + 100);
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

  const handleSelectChat = (id: string) => {
    setActiveChat(id);
    setAnimatingMessageId(null);
    
    // Auto-hide sidebar on mobile when a chat is selected
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  };

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
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
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
                {currentChat ? currentChat.title : 'New Chat'}
              </h2>
              <p className="text-xs text-neutral-500">
                {currentChat ? currentChat.timestamp : 'Start a conversation'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="h-9 px-3 gap-2 hover:bg-neutral-800/70 rounded-lg transition-all duration-200"
          >
            <Search className="size-4 text-neutral-400" />
            <span className="hidden sm:inline text-xs text-neutral-400">Search</span>
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded bg-neutral-800 px-1.5 font-mono text-[10px] font-medium text-neutral-400">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </header>

        {/* Messages */}
        {currentChat ? (
          <ScrollArea className="flex-1 overflow-y-auto bg-neutral-950">
            <div className="pb-4">
              {currentChat.messages.map((message, index) => {
                const animationKey = message.id === animatingMessageId || 
                  animatingMessageId?.startsWith(message.id + '-');
                
                return (
                  <ChatMessage 
                    key={message.id} 
                    role={message.role} 
                    content={message.content}
                    isLatest={index === currentChat.messages.length - 1 && message.role === 'assistant'}
                    onRetry={handleRetry}
                    shouldAnimate={animationKey}
                    messageId={message.id}
                    versions={message.versions}
                    currentVersion={message.currentVersion}
                    onVersionChange={handleVersionChange}
                  />
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
          <ChatInput onSendMessage={handleSendMessage} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <LoginPage />;
  }
  
  return <ChatApp />;
}