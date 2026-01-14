import { useState, useEffect } from 'react';
import { Bot, User, Copy, Check, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isLatest?: boolean;
  onRetry?: () => void;
  shouldAnimate?: boolean;
  messageId?: string;
  versions?: string[];
  currentVersion?: number;
  onVersionChange?: (messageId: string, direction: 'prev' | 'next') => void;
}

export function ChatMessage({ 
  role, 
  content, 
  isLatest = false, 
  onRetry,
  shouldAnimate = false,
  messageId = '',
  versions,
  currentVersion,
  onVersionChange
}: ChatMessageProps) {
  const { user } = useAuth();
  const isUser = role === 'user';
  const [copied, setCopied] = useState(false);

  // Use shouldAnimate directly to control typing effect
  const [displayedContent, setDisplayedContent] = useState(shouldAnimate && !isUser ? '' : content);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    // Animate only when shouldAnimate is true and it's an assistant message
    if (shouldAnimate && !isUser) {
      setDisplayedContent('');
      setIsTyping(true);
      let index = 0;
      const interval = setInterval(() => {
        if (index < content.length) {
          setDisplayedContent(content.slice(0, index + 1));
          index++;
        } else {
          setIsTyping(false);
          clearInterval(interval);
        }
      }, 10);
      return () => clearInterval(interval);
    } else {
      // For version changes or user messages, show instantly
      setDisplayedContent(content);
      setIsTyping(false);
    }
  }, [content, shouldAnimate, isUser]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      // Fallback method for older browsers or when clipboard API fails
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  const hasVersions = versions && versions.length > 1;
  const currentIdx = currentVersion ?? 0;

  return (
    <div className={`group py-6 px-4 transition-colors duration-200 ${isUser ? 'bg-transparent' : 'bg-neutral-900/30'}`}>
      <div className="max-w-3xl mx-auto flex gap-3 sm:gap-4">
        {!isUser && (
          /* Avatar - Only for assistant */
          <div className="flex-shrink-0 size-7 sm:size-8 rounded-lg flex items-center justify-center transition-all duration-200 shadow-lg bg-gradient-to-br from-emerald-500 to-green-600 shadow-green-500/20">
            <Bot className="size-3.5 sm:size-4 text-white" />
          </div>
        )}

        {/* Content */}
        <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
          {isUser ? (
            /* User message with username */
            <>
              <div className="text-xs text-neutral-500 mb-1.5 mr-1 font-medium">
                {user?.username || 'Tú'}
              </div>
              <div className="inline-block max-w-[90%] sm:max-w-[85%] bg-neutral-800 text-neutral-50 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl shadow-sm text-sm sm:text-[15px] leading-[1.7] whitespace-pre-wrap break-words">
                {displayedContent}
              </div>
            </>
          ) : (
            /* Assistant message with actions */
            <>
              <div className="text-neutral-50 text-sm sm:text-[15px] leading-[1.7] whitespace-pre-wrap break-words">
                {displayedContent}
                {isTyping && <span className="inline-block w-1.5 h-5 bg-emerald-400 ml-1 animate-pulse rounded-sm" />}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4 flex-wrap">
                {/* Version Navigation */}
                {hasVersions && (
                  <div className="flex items-center gap-1 sm:gap-1.5 mr-2 bg-neutral-800/50 rounded-lg px-1.5 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onVersionChange?.(messageId, 'prev')}
                      disabled={currentIdx === 0}
                      className="h-6 w-6 p-0 text-neutral-400 hover:text-white hover:bg-neutral-700/70 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-all duration-200"
                    >
                      <ChevronLeft className="size-3.5" />
                    </Button>
                    <span className="text-xs text-neutral-400 px-1 min-w-[30px] sm:min-w-[35px] text-center font-medium">
                      {currentIdx + 1}/{versions.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onVersionChange?.(messageId, 'next')}
                      disabled={currentIdx === versions.length - 1}
                      className="h-6 w-6 p-0 text-neutral-400 hover:text-white hover:bg-neutral-700/70 disabled:opacity-30 disabled:hover:bg-transparent rounded-md transition-all duration-200"
                    >
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                )}

                {/* Copy and Retry buttons */}
                <div className="flex items-center gap-1 sm:gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 px-2 sm:px-2.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800/70 rounded-lg transition-all duration-200 font-medium"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 mr-1 sm:mr-1.5 text-emerald-400" />
                        <span className="text-emerald-400 hidden sm:inline">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Copy</span>
                      </>
                    )}
                  </Button>
                  {isLatest && onRetry && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onRetry}
                      className="h-7 px-2 sm:px-2.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800/70 rounded-lg transition-all duration-200 font-medium"
                    >
                      <RotateCcw className="size-3.5 sm:mr-1.5" />
                      <span className="hidden sm:inline">Retry</span>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}