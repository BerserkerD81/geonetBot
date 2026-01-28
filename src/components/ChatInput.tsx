import { Send, Camera, Image as ImageIcon, X } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { useRef, useState } from 'react';
import type { KeyboardEvent, ChangeEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string, imageDataUrl?: string) => void;
}

export function ChatInput({ onSendMessage }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputFileRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = () => {
    if (!message.trim() && !imageDataUrl) return;

    onSendMessage(message, imageDataUrl ?? undefined);
    setMessage('');
    setImageDataUrl(null);
    if (fileInputCameraRef.current) fileInputCameraRef.current.value = '';
    if (fileInputFileRef.current) fileInputFileRef.current.value = '';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim() || imageDataUrl) {
        handleSubmit();
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      // Solo aceptamos imágenes
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-neutral-950 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-3 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-3 shadow-lg shadow-black/10 transition-all duration-200 focus-within:border-neutral-700 focus-within:shadow-emerald-500/10">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje para el asistente de SmartOLT..."
            className="flex-1 min-h-[48px] max-h-[200px] resize-none bg-transparent border-0 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0 text-[15px] px-2 py-3"
            rows={1}
          />
          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputFileRef.current?.click()}
                className="h-9 w-9 p-0 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors"
              >
                <ImageIcon className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputCameraRef.current?.click()}
                className="h-9 w-9 p-0 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors"
              >
                <Camera className="size-4" />
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!message.trim() && !imageDataUrl}
                className="flex-shrink-0 h-9 w-9 p-0 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 disabled:from-neutral-800 disabled:to-neutral-800 disabled:opacity-40 transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:shadow-none"
              >
                <Send className={`size-4.5 ${message.trim() || imageDataUrl ? 'text-white' : 'text-neutral-600'}`} />
              </Button>
            </div>
          </div>

          <input
            ref={fileInputCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={fileInputFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        {imageDataUrl && (
          <div className="mt-3 flex items-center gap-3">
            <div className="relative inline-block">
              <img
                src={imageDataUrl}
                alt="Foto seleccionada"
                className="max-h-32 rounded-xl border border-neutral-800 object-contain bg-neutral-900"
              />
              <button
                type="button"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800"
                onClick={() => {
                  setImageDataUrl(null);
                  if (fileInputCameraRef.current) fileInputCameraRef.current.value = '';
                  if (fileInputFileRef.current) fileInputFileRef.current.value = '';
                }}
              >
                <X className="size-3" />
              </button>
            </div>
            <p className="text-xs text-neutral-500">Foto lista para enviar junto con tu mensaje.</p>
          </div>
        )}
        <div className="text-center text-xs text-neutral-600 mt-3">
          <kbd className="px-2 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 font-medium">Enter</kbd> para enviar  <kbd className="px-2 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 font-medium">Shift + Enter</kbd> para nueva línea
        </div>
      </div>
    </div>
  );
}