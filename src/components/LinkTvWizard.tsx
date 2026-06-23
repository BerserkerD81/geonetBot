import { useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, X, Search, Tv2, Monitor, Link2,
  ChevronRight, AlertCircle, RefreshCw, Wifi,
  UserCircle2, Loader2,
} from 'lucide-react';
import { Button } from './ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WisphubClient {
  id_servicio: number;
  nombre?: string | null;
  apellidos?: string | null;
  cedula?: string | null;
  plan_internet?: string | null;
  ip?: string | null;
  estado?: string | null;
  usuario?: string | null;
}

interface ApptvDevice {
  mac: string;
  serial: string;
  userid: string | null;
  last_ip: string;
  last_connection: string;
  created: string;
}

interface LinkTvWizardProps {
  apiBase: string;
  onClose: () => void;
}

type WizardStep = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Buscar' },
  { label: 'Perfil' },
  { label: 'Dispositivos' },
  { label: 'Resultado' },
];

function clientFullName(c: WisphubClient) {
  return `${c.nombre || ''} ${c.apellidos || ''}`.trim() || c.usuario || `ID ${c.id_servicio}`;
}

function apiCall(base: string, path: string, opts?: RequestInit) {
  return fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={i} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
              ${active ? 'bg-[#1e3a8a] text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}
            >
              {done ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <span className="size-4 flex items-center justify-center">{i + 1}</span>
              )}
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

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function EstadoBadge({ estado }: { estado?: string | null }) {
  const raw = (estado || '').toLowerCase();
  const ok = raw.includes('activ') || raw === '1';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0
      ${ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}
    >
      {estado || '—'}
    </span>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LinkTvWizard({ apiBase, onClose }: LinkTvWizardProps) {
  const [step, setStep] = useState<WizardStep>(0);

  // Step 0 – search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WisphubClient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<WisphubClient | null>(null);

  // Step 2 – devices
  const [devices, setDevices] = useState<ApptvDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  // Step 2 → 3 – linking
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkResult, setLinkResult] = useState<{ linked: number; skiped: number } | null>(null);

  // ── Search WispHub clients
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const isRut = /\d/.test(q);
      const body = isRut ? { rut: q } : { nombre: q };
      const res = await apiCall(apiBase, '/wizard/change-onu/search', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error buscando clientes');
      setSearchResults(data.clients as WisphubClient[]);
    } catch (e: any) {
      setSearchError(e.message || 'Error de conexión');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [apiBase, searchQuery]);

  const handleKeyDown = useCallback(
    (e: { key: string }) => { if (e.key === 'Enter') handleSearch(); },
    [handleSearch]
  );

  // ── Select client → go to step 1
  const handleSelectClient = useCallback((client: WisphubClient) => {
    setSelectedClient(client);
    setStep(1);
  }, []);

  // ── Fetch IPTV devices for the client IP
  const fetchDevices = useCallback(async (ip: string) => {
    setLoadingDevices(true);
    setDevicesError(null);
    setDevices([]);
    try {
      const res = await apiCall(apiBase, `/wizard/iptv/devices?ip=${encodeURIComponent(ip)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error obteniendo dispositivos');
      setDevices((data.devices as ApptvDevice[]) ?? []);
    } catch (e: any) {
      setDevicesError(e.message || 'Error de conexión');
    } finally {
      setLoadingDevices(false);
    }
  }, [apiBase]);

  // ── Proceed to step 2 and auto-fetch devices
  const handleProceedToDevices = useCallback(() => {
    if (!selectedClient?.ip) return;
    setStep(2);
    fetchDevices(selectedClient.ip);
  }, [selectedClient, fetchDevices]);

  // ── Call link API and advance to result step
  const handleLink = useCallback(async () => {
    if (!selectedClient) return;
    const ip_address = selectedClient.ip || '';
    setLinking(true);
    setLinkError(null);
    try {
      const res = await apiCall(apiBase, '/wizard/iptv/link', {
        method: 'POST',
        body: JSON.stringify({ id_servicio: selectedClient.id_servicio, ip_address }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al vincular');
      setLinkResult({ linked: data.linked ?? 0, skiped: data.skiped ?? 0 });
      setStep(3);
    } catch (e: any) {
      setLinkError(e.message || 'Error de conexión');
    } finally {
      setLinking(false);
    }
  }, [apiBase, selectedClient]);

  // ── Reset
  const reset = useCallback(() => {
    setStep(0);
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
    setSelectedClient(null);
    setDevices([]);
    setDevicesError(null);
    setLinking(false);
    setLinkError(null);
    setLinkResult(null);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-[#1e3a8a]/10 rounded-lg flex items-center justify-center">
            <Tv2 className="size-4 text-[#1e3a8a]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Vincular IPTV</h2>
            {selectedClient && (
              <p className="text-xs text-gray-400">
                {clientFullName(selectedClient)} · <span className="font-mono">{selectedClient.ip ?? '—'}</span>
              </p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <X className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-6">
          <StepIndicator step={step} />

          <AnimatePresence mode="wait">

            {/* ── Step 0: buscar cliente ── */}
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Buscar cliente WispHub</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      <FieldGroup label="Nombre o RUT">
                        <div className="relative">
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ej: Carlos Mendoza o 12345678-9"
                            className="w-full h-9 rounded-lg border border-gray-200 bg-white pl-3 pr-10 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]/30 focus:border-[#1e3a8a] transition-colors"
                          />
                          <button
                            onClick={handleSearch}
                            disabled={!searchQuery.trim() || searching}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 flex items-center justify-center rounded-md bg-[#1e3a8a] text-white disabled:opacity-30 hover:bg-[#1e3a8a]/90 transition-colors"
                          >
                            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                          </button>
                        </div>
                      </FieldGroup>
                      {searchError && (
                        <p className="flex items-center gap-1.5 text-xs text-red-500">
                          <AlertCircle className="size-3.5 flex-shrink-0" />{searchError}
                        </p>
                      )}
                    </div>
                  </div>

                  {searchResults !== null && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                            <button
                              key={client.id_servicio}
                              onClick={() => handleSelectClient(client)}
                              className="w-full text-left px-4 py-3 hover:bg-[#1e3a8a]/5 transition-colors group"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-[#1e3a8a]">
                                      {clientFullName(client)}
                                    </span>
                                    <EstadoBadge estado={client.estado} />
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                                    {client.cedula && <span>{client.cedula}</span>}
                                    {client.plan_internet && <span>{client.plan_internet}</span>}
                                    {client.ip && <span className="font-mono">IP: {client.ip}</span>}
                                  </div>
                                </div>
                                <ChevronRight className="size-4 text-gray-300 group-hover:text-[#1e3a8a] flex-shrink-0" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 1: perfil del cliente ── */}
            {step === 1 && selectedClient && (
              <motion.div key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-[#1e3a8a]/10 flex items-center justify-center flex-shrink-0">
                      <Wifi className="size-5 text-[#1e3a8a]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">{clientFullName(selectedClient)}</p>
                        <EstadoBadge estado={selectedClient.estado} />
                      </div>
                      <p className="text-xs text-gray-400">{selectedClient.cedula} · {selectedClient.plan_internet}</p>
                      {selectedClient.ip && (
                        <p className="text-xs font-mono text-[#1e3a8a] mt-0.5">IP: {selectedClient.ip}</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <UserCircle2 className="size-4 text-gray-400" />
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Datos WispHub</h3>
                    </div>
                    <div className="px-4 py-3">
                      <ProfileRow label="Nombre" value={clientFullName(selectedClient)} />
                      <ProfileRow label="ID servicio" value={String(selectedClient.id_servicio)} />
                      {selectedClient.cedula && <ProfileRow label="RUT / Cédula" value={selectedClient.cedula} />}
                      {selectedClient.usuario && <ProfileRow label="Usuario" value={selectedClient.usuario} />}
                      {selectedClient.ip
                        ? <ProfileRow label="IP asignada" value={selectedClient.ip} />
                        : (
                          <div className="flex items-center gap-2 py-2 text-xs text-amber-600">
                            <AlertCircle className="size-3.5 flex-shrink-0" />
                            Este cliente no tiene IP asignada en WispHub.
                          </div>
                        )
                      }
                    </div>
                  </div>

                  {!selectedClient.ip && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                      <AlertCircle className="size-3.5 flex-shrink-0" />
                      Sin IP no es posible detectar dispositivos IPTV.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 2: dispositivos IPTV ── */}
            {step === 2 && selectedClient && (
              <motion.div key="s2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Dispositivos IPTV detectados
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          IP del cliente · <span className="font-mono">{selectedClient.ip}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!loadingDevices && devices.length > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a] font-semibold">
                            {devices.length} encontrado{devices.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <button
                          onClick={() => selectedClient.ip && fetchDevices(selectedClient.ip)}
                          disabled={loadingDevices}
                          title="Refrescar dispositivos"
                          className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-[#1e3a8a] hover:border-[#1e3a8a]/30 disabled:opacity-40 transition-colors"
                        >
                          <RefreshCw className={`size-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {loadingDevices ? (
                      <div className="p-8 flex flex-col items-center gap-2 text-center">
                        <Loader2 className="size-8 text-[#1e3a8a]/40 animate-spin" />
                        <p className="text-sm text-gray-400">Consultando dispositivos…</p>
                      </div>
                    ) : devicesError ? (
                      <div className="p-6 flex flex-col items-center gap-2 text-center">
                        <AlertCircle className="size-7 text-red-300" />
                        <p className="text-sm font-medium text-gray-500">No se pudo obtener los dispositivos</p>
                        <p className="text-xs text-gray-400">{devicesError}</p>
                        <button
                          onClick={() => selectedClient.ip && fetchDevices(selectedClient.ip)}
                          className="mt-2 flex items-center gap-1.5 text-xs text-[#1e3a8a] hover:underline"
                        >
                          <RefreshCw className="size-3.5" />Reintentar
                        </button>
                      </div>
                    ) : devices.length === 0 ? (
                      <div className="p-8 flex flex-col items-center gap-2 text-center">
                        <AlertCircle className="size-8 text-gray-300" />
                        <p className="text-sm font-medium text-gray-500">Sin dispositivos detectados</p>
                        <p className="text-xs text-gray-400">
                          No hay dispositivos IPTV en <span className="font-mono">{selectedClient.ip}</span>
                        </p>
                        <button
                          onClick={() => selectedClient.ip && fetchDevices(selectedClient.ip)}
                          className="mt-2 flex items-center gap-1.5 text-xs text-[#1e3a8a] hover:underline"
                        >
                          <RefreshCw className="size-3.5" />Refrescar
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {devices.map((dev) => (
                          <div key={dev.mac} className="flex items-center gap-3 px-4 py-3">
                            <div className="size-9 rounded-lg bg-[#1e3a8a]/10 flex items-center justify-center flex-shrink-0">
                              <Monitor className="size-4 text-[#1e3a8a]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-800">{dev.serial}</p>
                                {dev.userid && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-semibold">
                                    Usuario {dev.userid}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 font-mono">{dev.mac}</p>
                              <p className="text-xs text-gray-400">Última conexión: {dev.last_connection}</p>
                            </div>
                            <CheckCircle2 className="size-4 text-[#1e3a8a] flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {devices.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[#1e3a8a]/5 border border-[#1e3a8a]/15 rounded-lg text-xs text-[#1e3a8a]">
                      <Link2 className="size-3.5 flex-shrink-0" />
                      Se vincularán {devices.length} dispositivo{devices.length !== 1 ? 's' : ''} al perfil de{' '}
                      <span className="font-semibold ml-1">{clientFullName(selectedClient)}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 3: resultado ── */}
            {step === 3 && selectedClient && (
              <motion.div key="s3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
                    <div className="size-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="size-6 text-emerald-600" />
                    </div>
                    <p className="text-base font-bold text-emerald-800">IPTV vinculado correctamente</p>
                    <p className="text-xs text-emerald-600">
                      {linkResult
                        ? `${linkResult.linked} vinculado${linkResult.linked !== 1 ? 's' : ''}${linkResult.skiped ? `, ${linkResult.skiped} omitido${linkResult.skiped !== 1 ? 's' : ''}` : ''}`
                        : `${devices.length} dispositivo${devices.length !== 1 ? 's vinculados' : ' vinculado'}`
                      } a {clientFullName(selectedClient)}
                    </p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</h3>
                    </div>
                    <div className="px-4 py-3">
                      <ProfileRow label="Nombre" value={clientFullName(selectedClient)} />
                      <ProfileRow label="ID servicio" value={String(selectedClient.id_servicio)} />
                      {selectedClient.usuario && <ProfileRow label="Usuario" value={selectedClient.usuario} />}
                      {selectedClient.ip && <ProfileRow label="IP" value={selectedClient.ip} />}
                    </div>
                  </div>

                  {devices.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Dispositivos vinculados
                        </h3>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {devices.map((dev) => (
                          <div key={dev.mac} className="flex items-center gap-3 px-4 py-3">
                            <div className="size-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                              <Tv2 className="size-4 text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800">{dev.serial}</p>
                              <p className="text-xs text-gray-400 font-mono">{dev.mac}</p>
                            </div>
                            <CheckCircle2 className="size-4 text-emerald-500 flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={onClose} className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">
                      Finalizar
                    </Button>
                    <Button variant="outline" onClick={reset}>
                      <RefreshCw className="size-3.5 mr-1.5" />
                      Nueva vinculación
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      {step < 3 && (
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-t border-gray-200">
          <Button
            variant="outline" size="sm"
            onClick={() => { if (step === 0) onClose(); else setStep((step - 1) as WizardStep); }}
            className="text-gray-600"
          >
            {step === 0 ? 'Cancelar' : '← Anterior'}
          </Button>

          {step === 0 && (
            <span className="text-xs text-gray-400">
              {searchResults !== null ? `${searchResults.length} resultado(s)` : 'Busca por nombre o RUT'}
            </span>
          )}

          {step === 1 && (
            <Button
              size="sm"
              disabled={!selectedClient?.ip}
              onClick={handleProceedToDevices}
              className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white disabled:opacity-50"
            >
              Detectar dispositivos →
            </Button>
          )}

          {step === 2 && (
            <div className="flex flex-col items-end gap-1">
              {linkError && (
                <p className="flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle className="size-3.5 flex-shrink-0" />{linkError}
                </p>
              )}
              <Button
                size="sm"
                disabled={devices.length === 0 || loadingDevices || linking}
                onClick={handleLink}
                className="bg-[#f5831f] hover:bg-[#f5831f]/90 text-white font-semibold disabled:opacity-50"
              >
                {linking
                  ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Vinculando…</>
                  : <><Link2 className="size-3.5 mr-1.5" />Vincular IPTV</>
                }
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
