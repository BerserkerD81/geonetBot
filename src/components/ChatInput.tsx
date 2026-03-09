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
    <div className="w-full bg-white px-2 sm:px-4 pb-3 pt-2">
      <div className="max-w-3xl mx-auto space-y-2 sm:space-y-3">
        
        {/* Image Preview */}
        {imageDataUrl && (
          <div className="group relative flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200 shadow-sm">
               <img src={imageDataUrl} alt="Preview" className="h-full w-full object-cover" />
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate flex items-center gap-1.5">
                <FileImage className="size-3.5 text-orange-500" /> Imagen adjunta
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Lista para enviar (Comprimida)</p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearImage}
              className="text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 transition-colors h-7 w-7 rounded-lg"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        {/* Input Container */}
        <div 
          className={`
            relative flex flex-row items-end gap-1 sm:gap-2 p-2 sm:p-2.5 rounded-2xl transition-all duration-200 ease-out border
            ${isDragging 
              ? 'border-orange-400 bg-orange-50/80 ring-4 ring-orange-400/10' 
              : isFocused 
                ? 'border-orange-300 bg-white ring-2 ring-orange-100/80 shadow-md shadow-orange-100/40' 
                : 'border-gray-200 bg-white hover:border-gray-300 shadow-sm'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          
          {/* Overlay Drag & Drop */}
          <div className={`absolute inset-0 z-20 rounded-3xl bg-white/90 backdrop-blur-sm border-2 border-dashed border-orange-400 flex flex-col items-center justify-center transition-opacity duration-200 pointer-events-none ${isDragging ? 'opacity-100' : 'opacity-0'}`}>
             <Paperclip className="size-8 text-orange-500 mb-2 animate-bounce" />
             <p className="text-orange-500 font-medium">Suelta la imagen aquí</p>
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
            className="flex-1 min-h-[40px] max-h-[120px] w-full bg-transparent border-0 text-gray-800 placeholder:text-gray-400 focus-visible:ring-0 text-[15px] resize-none py-2 px-2 sm:py-2.5 sm:px-3 rounded-lg sm:rounded-2xl"
            rows={1}
            disabled={isLoading || isProcessingImg}
            style={{ WebkitOverflowScrolling: 'touch' }}
          />

          <div className="flex items-center gap-1 sm:gap-2 pb-0 pr-0 w-auto">
            {/* Botones de acción alineados horizontalmente */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isLoading || isProcessingImg}
              onClick={() => fileInputFileRef.current?.click()}
              className="h-9 w-9 sm:h-9 sm:w-9 rounded-full text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 transition-all active:scale-95"
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
              className="h-9 w-9 sm:h-9 sm:w-9 rounded-full text-[#1e3a8a] hover:text-[#f5831f] hover:bg-[#1e3a8a]/10 transition-all active:scale-95"
              title="Cámara"
            >
              <Camera className="size-5" />
            </Button>
            {/* Botón de Enviar */}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isDisabled}
              className={`
                h-10 sm:h-9 px-4 sm:px-4 rounded-xl font-semibold text-sm transition-all duration-200 shadow-md
                ${isDisabled 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' 
                  : 'bg-gradient-to-b from-[#234c9f] to-[#142a66] hover:from-[#2f5bbd] hover:to-[#19377e] text-white hover:text-white border border-white/15 shadow-[0_8px_20px_rgba(30,58,138,0.35)] backdrop-blur-md active:scale-[0.97]'
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

        {/* Hints Footer (solo en desktop) */}
        <div className="hidden sm:flex justify-center gap-5 text-[11px] text-gray-400 font-medium select-none pt-1 sm:pt-0 flex-wrap">
          <span className="flex items-center gap-1.5"><kbd>↵</kbd> enviar</span>
          <span className="flex items-center gap-1.5"><kbd>shift + ↵</kbd> nueva línea</span>
          <span>Arrastra o pega imágenes</span>
        </div>

      </div>
    </div>
  );
}