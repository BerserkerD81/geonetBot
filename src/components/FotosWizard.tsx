import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, X, Search, Loader2, AlertCircle,
  ChevronRight, ImageIcon, Upload, Trash2, Camera,
} from 'lucide-react';
import { Button } from './ui/button';
import { useWizardLogger } from '../hooks/useWizardLogger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientResult {
  id_servicio: number;
  nombre?: string | null;
  apellidos?: string | null;
  cedula?: string | null;
  servicio?: string | null;
  plan_internet?: string | null;
  ip?: string | null;
  estado?: string | null;
}

export interface PhotoEntry {
  id: string;
  dataUrl: string;
  name: string;
  status: 'pending' | 'uploading' | 'ok' | 'error';
  errorMsg?: string;
}

interface FotosWizardProps {
  apiBase: string;
  onClose: () => void;
  initialData?: { clientId: number; clientName: string; step: number };
}

type WizardStep = 0 | 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientFullName(c: ClientResult) {
  return `${c.nombre || ''} ${c.apellidos || ''}`.trim() || c.servicio || `ID ${c.id_servicio}`;
}

function apiCall(base: string, path: string, opts?: RequestInit) {
  return fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const STEPS = [{ label: 'Buscar' }, { label: 'Cargar fotos' }];

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
              ${active ? 'bg-[#1e3a8a] text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
              {done ? <CheckCircle2 className="size-3.5" /> : <span className="size-4 flex items-center justify-center">{i + 1}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-px mx-1 ${i < step ? 'bg-emerald-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800
        focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors" />
  );
}

// ---------------------------------------------------------------------------
// PhotoUploadPanel — also exported for reuse in AuthWizard
// ---------------------------------------------------------------------------

export function PhotoUploadPanel({
  apiBase,
  clientId,
  clientLabel,
  onUploadComplete,
}: {
  apiBase: string;
  clientId: number;
  clientLabel?: string;
  onUploadComplete?: (count: number) => void;
}) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedCountRef = useRef(0);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!arr.length) return;

    const newEntries: PhotoEntry[] = await Promise.all(
      arr.map(async f => ({
        id: `${Date.now()}-${Math.random()}`,
        dataUrl: await readFileAsDataUrl(f),
        name: f.name,
        status: 'pending' as const,
      }))
    );

    setPhotos(prev => [...prev, ...newEntries]);

    // Upload each immediately
    for (const entry of newEntries) {
      setPhotos(prev => prev.map(p => p.id === entry.id ? { ...p, status: 'uploading' } : p));
      try {
        const res = await apiCall(apiBase, '/wizard/fotos/upload', {
          method: 'POST',
          body: JSON.stringify({ clientId, imageDataUrl: entry.dataUrl }),
        });
        const data = await res.json();
        setPhotos(prev => prev.map(p =>
          p.id === entry.id ? { ...p, status: data.ok ? 'ok' : 'error', errorMsg: data.ok ? undefined : (data.error || 'Error') } : p
        ));
        if (data.ok) {
          uploadedCountRef.current += 1;
          onUploadComplete?.(uploadedCountRef.current);
        }
      } catch (e: any) {
        setPhotos(prev => prev.map(p =>
          p.id === entry.id ? { ...p, status: 'error', errorMsg: e.message } : p
        ));
      }
    }
  }, [apiBase, clientId, onUploadComplete]);

  const removePhoto = useCallback((id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const okCount = photos.filter(p => p.status === 'ok').length;
  const errCount = photos.filter(p => p.status === 'error').length;
  const pendingCount = photos.filter(p => p.status === 'uploading').length;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all py-8 px-4
          ${dragging ? 'border-[#1e3a8a] bg-[#1e3a8a]/5' : 'border-gray-200 hover:border-[#1e3a8a]/40 hover:bg-gray-50'}`}
      >
        <Camera className={`size-8 ${dragging ? 'text-[#1e3a8a]' : 'text-gray-300'} transition-colors`} />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-600">Arrastra fotos o haz clic para seleccionar</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {clientLabel ? `Cliente: ${clientLabel}` : 'Imágenes JPG, PNG, HEIC'}
            {okCount > 0 && <span className="ml-2 text-emerald-600 font-semibold">· {okCount} subida{okCount !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }} />
      </div>

      {/* Upload status summary */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#1e3a8a]">
          <Loader2 className="size-3.5 animate-spin" />
          Subiendo {pendingCount} foto{pendingCount !== 1 ? 's' : ''}...
        </div>
      )}
      {errCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="size-3.5" />
          {errCount} foto{errCount !== 1 ? 's' : ''} con error — revisa los detalles abajo
        </div>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map(photo => (
            <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
              <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
              {/* Status overlay */}
              {photo.status === 'uploading' && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-white" />
                </div>
              )}
              {photo.status === 'ok' && (
                <div className="absolute top-1 left-1 bg-emerald-500 rounded-full p-0.5">
                  <CheckCircle2 className="size-3 text-white" />
                </div>
              )}
              {photo.status === 'error' && (
                <div className="absolute inset-0 bg-red-900/50 flex flex-col items-center justify-center gap-1 p-1">
                  <AlertCircle className="size-4 text-red-200" />
                  <p className="text-[9px] text-red-100 text-center leading-tight line-clamp-2">{photo.errorMsg}</p>
                </div>
              )}
              {/* Remove button */}
              {photo.status !== 'uploading' && (
                <button onClick={e => { e.stopPropagation(); removePhoto(photo.id); }}
                  className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="size-3 text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {okCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
          <CheckCircle2 className="size-3.5 flex-shrink-0" />
          {okCount} foto{okCount !== 1 ? 's' : ''} subida{okCount !== 1 ? 's' : ''} correctamente a Geonet
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FotosWizard({ apiBase, onClose, initialData }: FotosWizardProps) {
  const { logStep, updateResume, completeSession } = useWizardLogger(apiBase, 'fotos');

  const [step, setStep] = useState<WizardStep>((initialData?.step ?? 0) as WizardStep);

  // Step 0: search
  const [searchNombre, setSearchNombre] = useState('');
  const [searchRut, setSearchRut] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ClientResult[] | null>(null);
  const [searchError, setSearchError] = useState('');

  // Step 1
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(
    initialData ? { id_servicio: initialData.clientId, servicio: initialData.clientName } : null
  );
  const completedSessionRef = useRef(false);

  // ── Search
  const handleSearch = useCallback(async () => {
    if (!searchNombre.trim() && !searchRut.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults(null);
    try {
      const res = await apiCall(apiBase, '/wizard/change-onu/search', {
        method: 'POST',
        body: JSON.stringify({ nombre: searchNombre.trim(), rut: searchRut.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error buscando');
      setSearchResults(data.clients || []);
    } catch (e: any) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  }, [apiBase, searchNombre, searchRut]);

  const handleSelectClient = useCallback((client: ClientResult) => {
    setSelectedClient(client);
    setStep(1);
    const name = clientFullName(client);
    logStep('client-select', 'Cliente seleccionado', 'ok', {
      inputData: { clientId: client.id_servicio, name },
    });
    updateResume({ step: 1, clientId: client.id_servicio }, { clientId: client.id_servicio, clientName: name });
  }, [logStep, updateResume]);

  const reset = useCallback(() => {
    setStep(0); setSelectedClient(null);
    setSearchResults(null); setSearchNombre(''); setSearchRut(''); setSearchError('');
  }, []);

  // -------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-[#1e3a8a]/10 rounded-lg flex items-center justify-center">
            <ImageIcon className="size-4 text-[#1e3a8a]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Agregar fotos</h2>
            {selectedClient && (
              <p className="text-xs text-gray-400">{clientFullName(selectedClient)} · {selectedClient.plan_internet || ''}</p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <X className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto w-full px-4 py-6">
          <StepIndicator step={step} />

          <AnimatePresence mode="wait">

            {/* ── Step 0: search ── */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Buscar cliente</h3>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldGroup label="Nombre completo">
                        <TextInput value={searchNombre} onChange={setSearchNombre} placeholder="Juan Pérez" />
                      </FieldGroup>
                      <FieldGroup label="RUT">
                        <TextInput value={searchRut} onChange={setSearchRut} placeholder="12.345.678-9" />
                      </FieldGroup>
                    </div>
                    <div className="px-4 pb-4">
                      <Button disabled={searching || (!searchNombre.trim() && !searchRut.trim())} onClick={handleSearch}
                        className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white w-full sm:w-auto">
                        {searching
                          ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Buscando...</>
                          : <><Search className="size-3.5 mr-1.5" />Buscar</>}
                      </Button>
                    </div>
                  </div>

                  {searchError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      <AlertCircle className="size-3.5 flex-shrink-0" />{searchError}
                    </div>
                  )}

                  {searchResults !== null && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          {searchResults.length ? `${searchResults.length} resultado(s)` : 'Sin resultados'}
                        </h3>
                      </div>
                      {searchResults.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">No se encontraron clientes.</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {searchResults.map(client => (
                            <button key={client.id_servicio} onClick={() => handleSelectClient(client)}
                              className="w-full text-left px-4 py-3 hover:bg-[#1e3a8a]/5 transition-colors group">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#1e3a8a]">{clientFullName(client)}</span>
                                    {client.estado && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 flex-shrink-0">{client.estado}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                                    <span>{client.cedula || '—'}</span>
                                    {client.plan_internet && <span>{client.plan_internet}</span>}
                                    {client.ip && <span>IP: {client.ip}</span>}
                                  </div>
                                </div>
                                <ChevronRight className="size-4 text-gray-300 group-hover:text-[#1e3a8a] flex-shrink-0" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 1: upload panel ── */}
            {step === 1 && selectedClient && (
              <motion.div key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  {/* Client info */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Subir evidencias de instalación</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Las fotos se suben directamente a la ficha del cliente en Geonet</p>
                    </div>
                    <div className="p-4">
                      <PhotoUploadPanel
                        apiBase={apiBase}
                        clientId={selectedClient.id_servicio}
                        clientLabel={clientFullName(selectedClient)}
                        onUploadComplete={count => {
                          if (!completedSessionRef.current && count >= 1 && selectedClient) {
                            completedSessionRef.current = true;
                            completeSession(`${count} foto${count !== 1 ? 's' : ''} subida${count !== 1 ? 's' : ''} para ${clientFullName(selectedClient)}`);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={onClose} className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">
                      <Upload className="size-3.5 mr-1.5" />Finalizar
                    </Button>
                    <Button variant="outline" onClick={reset}>Otro cliente</Button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      {step === 0 && (
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-t border-gray-200">
          <Button variant="outline" size="sm" onClick={onClose} className="text-gray-600">Cancelar</Button>
          <span className="text-xs text-gray-400">
            {searchResults !== null ? `${searchResults.length} resultado(s)` : 'Busca por nombre o RUT'}
          </span>
        </div>
      )}
    </div>
  );
}
