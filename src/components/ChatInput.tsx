import { Send, Camera, Image as ImageIcon, X, Loader2, Paperclip } from 'lucide-react';
import { Button } from './ui/button'; 
import { Textarea } from './ui/textarea'; 
import { useRef, useState, type KeyboardEvent, type ChangeEvent, type ClipboardEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string, imageDataUrl?: string) => void;
  isLoading?: boolean;
}

// --- UTILIDAD: Compresión de Imágenes (Crucial para no saturar el servidor) ---
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280; // Max ancho HD
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
        
        // Comprimir a JPEG calidad 0.8 (reduce de 5MB a ~300KB)
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
  const [isProcessingImg, setIsProcessingImg] = useState(false); // Estado de carga local
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  const fileInputFileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const processFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten archivos de imagen');
      return;
    }

    setIsProcessingImg(true);
    try {
      // Comprimimos antes de setear el estado
      const compressedBase64 = await compressImage(file);
      setImageDataUrl(compressedBase64);
    } catch (error) {
      console.error("Error procesando imagen", error);
      alert("Error al procesar la imagen");
    } finally {
      setIsProcessingImg(false);
    }
  };

  const handleSubmit = () => {
    if ((!message.trim() && !imageDataUrl) || isLoading || isProcessingImg) return;

    onSendMessage(message, imageDataUrl ?? undefined);

    setMessage('');
    setImageDataUrl(null);
    if (fileInputCameraRef.current) fileInputCameraRef.current.value = '';
    if (fileInputFileRef.current) fileInputFileRef.current.value = '';
    
    // Devolver foco al input (mejora UX en escritorio)
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

  // --- NUEVO: Soporte para Pegar (Ctrl+V) ---
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault(); // Evitar pegar el nombre del archivo si es texto
        const file = item.getAsFile();
        if (file) processFile(file);
        return;
      }
    }
  };

  // --- NUEVO: Drag & Drop ---
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
    <div className="bg-neutral-950 p-4 sm:p-6 pb-8">
      <div className="max-w-3xl mx-auto">
        
        <div 
          className={`relative flex items-end gap-3 bg-neutral-900/50 border rounded-2xl p-3 shadow-lg transition-all duration-200 
            ${isDragging ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20' : 'border-neutral-800 focus-within:border-neutral-700'}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isDragging ? "Suelta la imagen aquí..." : "Escribe un mensaje..."}
            className="flex-1 min-h-[48px] max-h-[200px] resize-none bg-transparent border-0 text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-0 text-[15px] px-2 py-3"
            rows={1}
            disabled={isLoading || isProcessingImg}
          />

          <div className="flex flex-col gap-2 items-end">
            <div className="flex gap-1.5">
              
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isLoading || isProcessingImg}
                onClick={() => fileInputFileRef.current?.click()}
                className="h-9 w-9 p-0 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors"
                title="Adjuntar imagen"
              >
                <ImageIcon className="size-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isLoading || isProcessingImg}
                onClick={() => fileInputCameraRef.current?.click()}
                className="h-9 w-9 p-0 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition-colors"
                title="Tomar foto"
              >
                <Camera className="size-4" />
              </Button>

              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isDisabled}
                className="flex-shrink-0 h-9 w-9 p-0 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 disabled:from-neutral-800 disabled:to-neutral-800 disabled:opacity-40 transition-all duration-200 shadow-lg shadow-emerald-500/20 disabled:shadow-none"
              >
                {isLoading || isProcessingImg ? (
                  <Loader2 className="size-4.5 animate-spin text-neutral-400" />
                ) : (
                  <Send className={`size-4.5 ${!isDisabled ? 'text-white' : 'text-neutral-600'}`} />
                )}
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
          
          {/* Overlay Drag & Drop */}
          {isDragging && (
             <div className="absolute inset-0 z-10 bg-neutral-900/90 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-emerald-500/50">
               <div className="text-emerald-400 font-medium flex items-center gap-2 animate-pulse">
                 <Paperclip className="size-5" /> Suelta la imagen para adjuntar
               </div>
             </div>
          )}
        </div>

        {/* Previsualización de Imagen */}
        {imageDataUrl && (
          <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-3">
            <div className="relative inline-block group">
              <img
                src={imageDataUrl}
                alt="Previsualización"
                className="h-20 w-auto rounded-lg border border-neutral-800 object-cover bg-neutral-900 shadow-md"
              />
              <button
                type="button"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-red-500/20 hover:border-red-500 transition-all shadow-sm z-10"
                onClick={clearImage}
                title="Eliminar imagen"
              >
                <X className="size-3" />
              </button>
              {/* Badge de tamaño optimizado */}
              <div className="absolute bottom-1 right-1 bg-black/60 text-[9px] text-white px-1.5 py-0.5 rounded backdrop-blur-md">
                Listo para enviar
              </div>
            </div>
            <div className="text-xs text-neutral-500">
               <p className="font-medium text-neutral-300">Imagen adjuntada</p>
               <p>Se enviará junto con tu mensaje.</p>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-neutral-600 mt-3 hidden sm:block">
          <kbd className="px-2 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 font-medium font-mono">Enter</kbd> enviar 
          <span className="mx-2">•</span>
          <kbd className="px-2 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 font-medium font-mono">Shift + Enter</kbd> salto de línea
          <span className="mx-2">•</span>
          <kbd className="px-2 py-1 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-500 font-medium font-mono">Ctrl + V</kbd> pegar imagen
        </div>
      </div>
    </div>
  );
}