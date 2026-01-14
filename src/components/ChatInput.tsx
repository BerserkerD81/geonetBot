import { Send } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { useState, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
}

export function ChatInput({ onSendMessage }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = () => {
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-neutral-950 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-3 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-3 shadow-lg shadow-black/10 transition-all duration-200 focus-within:border-neutral-700 focus-within:shadow-emerald-500/10">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message ISP Assistant..."
            className="flex-1 min-h-[48px] max-h-[200px] resize-none bg-transparent border-0 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0 text-[15px] px-2 py-3"
            rows={1}
          />
          <Button
            onClick={handleSubmit}
            disabled={!message.trim()}
            className="flex-shrink-0 h-10 w-10 p-0 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 disabled:from-neutral-800 disabled:to-neutral-800 disabled:opacity-40 transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:shadow-none"
          >
            <Send className={`size-4.5 ${message.trim() ? 'text-white' : 'text-neutral-600'}`} />
          </Button>
        </div>
        <div className="text-center text-xs text-neutral-600 mt-3">
          <kbd className="px-2 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 font-medium">Enter</kbd> to send • <kbd className="px-2 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 font-medium">Shift + Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}