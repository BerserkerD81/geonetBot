import { Send, Camera, Image as ImageIcon, X, Loader2, Paperclip, FileImage } from 'lucide-react';
import { Button } from './ui/button'; 
import { Textarea } from './ui/textarea'; 
import { useRef, useState, useEffect, type KeyboardEvent, type ChangeEvent, type ClipboardEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string, imageDataUrl?: string) => void;
  isLoading?: boolean;
}

// --- UTILIDAD: Compresión (Sin cambios en lógica) ---
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280; 
        const MAX_HEIGHT = 1280;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export function ChatInput({ onSendMessage, isLoading = false }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isProcessingImg, setIsProcessingImg] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false); // Nuevo estado para estilos
  
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputFileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // --- EFECTO: Auto-resize del Textarea ---
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Resetear altura
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`; // Ajustar al contenido (max 200px)
    }
  }, [message]);

  const processFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten archivos de imagen');
      return;
    }

    setIsProcessingImg(true);
    try {
      const compressedBase64 = await compressImage(file);
      setImageDataUrl(compressedBase64);
    } catch (error) {
      console.error("Error procesando imagen", error);
      alert("Error al procesar la imagen");
    } finally {
      setIsProcessingImg(false);
      // Foco al input tras cargar imagen para seguir escribiendo rápido
      setTimeout(() => textareaRef.current?.focus(), 100); 
    }
  };

  const handleSubmit = () => {
    if ((!message.trim() && !imageDataUrl) || isLoading || isProcessingImg) return;
    onSendMessage(message, imageDataUrl ?? undefined);
    setMessage('');
    setImageDataUrl(null);
    if (fileInputCameraRef.current) fileInputCameraRef.current.value = '';
    if (fileInputFileRef.current) fileInputFileRef.current.value = '';
    
    // Reset altura manual
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    processFile(e.target.files?.[0]);
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) processFile(file);
        return;
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const clearImage = () => {
    setImageDataUrl(null);
    if (fileInputCameraRef.current) fileInputCameraRef.current.value = '';
    if (fileInputFileRef.current) fileInputFileRef.current.value = '';
  };

  const isDisabled = (!message.trim() && !imageDataUrl) || isLoading || isProcessingImg;

  return (
    <div className="w-full bg-neutral-950 px-4 pb-6 pt-2">
      <div className="max-w-3xl mx-auto space-y-4">
        
        {/* Previsualización de Imagen (Estilo Card) */}
        {imageDataUrl && (
          <div className="group relative flex items-center gap-4 bg-neutral-900/40 p-3 rounded-xl border border-neutral-800 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-700 shadow-sm">
               <img src={imageDataUrl} alt="Preview" className="h-full w-full object-cover" />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-200 truncate flex items-center gap-2">
                <FileImage className="size-4 text-emerald-500" /> Imagen adjunta
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">Lista para enviar (Comprimida)</p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearImage}
              className="text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors h-8 w-8 rounded-full"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        {/* Input Container Principal */}
        <div 
          className={`
            relative flex flex-col sm:flex-row items-end gap-2 p-2 sm:p-3 rounded-3xl transition-all duration-300 ease-out border shadow-sm
            ${isDragging 
              ? 'border-emerald-500/50 bg-emerald-950/10 ring-4 ring-emerald-500/10' 
              : isFocused 
                ? 'border-neutral-700 bg-neutral-900 ring-2 ring-neutral-800/50 shadow-lg shadow-black/20' 
                : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          
          {/* Overlay Drag & Drop */}
          <div className={`absolute inset-0 z-20 rounded-3xl bg-neutral-900/90 backdrop-blur-sm border-2 border-dashed border-emerald-500 flex flex-col items-center justify-center transition-opacity duration-200 pointer-events-none ${isDragging ? 'opacity-100' : 'opacity-0'}`}>
             <Paperclip className="size-8 text-emerald-500 mb-2 animate-bounce" />
             <p className="text-emerald-400 font-medium">Suelta la imagen aquí</p>
          </div>

          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Escribe un mensaje..."
            className="flex-1 min-h-[44px] max-h-[200px] w-full bg-transparent border-0 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0 text-[15px] resize-none py-3 px-3 sm:py-2.5"
            rows={1}
            disabled={isLoading || isProcessingImg}
          />

          <div className="flex items-center gap-2 pb-1 pr-1 w-full sm:w-auto justify-between sm:justify-end">
            
            {/* Botones de acción (Izquierda en móvil, agrupados en desktop) */}
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isLoading || isProcessingImg}
                onClick={() => fileInputFileRef.current?.click()}
                className="h-9 w-9 rounded-full text-neutral-400 hover:text-emerald-400 hover:bg-emerald-400/10 transition-all active:scale-95"
                title="Galería"
              >
                <ImageIcon className="size-5" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isLoading || isProcessingImg}
                onClick={() => fileInputCameraRef.current?.click()}
                className="h-9 w-9 rounded-full text-neutral-400 hover:text-emerald-400 hover:bg-emerald-400/10 transition-all active:scale-95"
                title="Cámara"
              >
                <Camera className="size-5" />
              </Button>
            </div>

            {/* Botón de Enviar */}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isDisabled}
              className={`
                h-9 px-4 rounded-full font-medium transition-all duration-300 shadow-md
                ${isDisabled 
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20 hover:shadow-emerald-500/20 active:scale-95 w-auto'
                }
              `}
            >
              {isLoading || isProcessingImg ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-sm">Enviar</span>
                  <Send className="size-4" />
                </div>
              )}
            </Button>
          </div>

          {/* Inputs ocultos */}
          <input ref={fileInputCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          <input ref={fileInputFileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>

        {/* Hints Footer */}
        <div className="hidden sm:flex justify-center gap-6 text-[11px] text-neutral-600 font-medium select-none opacity-60 hover:opacity-100 transition-opacity">
          <span className="flex items-center gap-1.5"><kbd className="font-sans bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-400">↵</kbd> enviar</span>
          <span className="flex items-center gap-1.5"><kbd className="font-sans bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-400">shift + ↵</kbd> nueva línea</span>
          <span className="flex items-center gap-1.5">Arrastra o pega imágenes</span>
        </div>

      </div>
    </div>
  );
}