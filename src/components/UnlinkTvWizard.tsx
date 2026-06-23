import { useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, X, Search, Tv2, Monitor,
  ChevronRight, AlertCircle, RefreshCw, Wifi,
  UserCircle2, Circle, Trash2, Loader2,
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

interface UnlinkResult {
  mac: string;
  ok: boolean;
  was_linked_to: string | null;
}

interface UnlinkTvWizardProps {
  apiBase: string;
  onClose: () => void;
}

type WizardStep = 0 | 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Buscar' },
  { label: 'Dispositivos' },
  { label: 'Confirmar' },
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
              ${active ? 'bg-red-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}
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

export function UnlinkTvWizard({ apiBase, onClose }: UnlinkTvWizardProps) {
  const [step, setStep] = useState<WizardStep>(0);

  // Step 0 – search
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<WisphubClient[] | null>(null);
  const [selectedClient, setSelectedClient] = useState<WisphubClient | null>(null);

  // Step 1 – devices
  const [devices, setDevices] = useState<ApptvDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [selectedMacs, setSelectedMacs] = useState<Set<string>>(new Set());

  // Step 2→3 – unlink execution
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkResults, setUnlinkResults] = useState<UnlinkResult[]>([]);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // Derived
  const selectedDevices = devices.filter(d => selectedMacs.has(d.mac));
  const allSelected = devices.length > 0 && selectedMacs.size === devices.length;

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

  // ── Select client → go to step 1 and auto-fetch devices
  const handleSelectClient = useCallback((client: WisphubClient) => {
    setSelectedClient(client);
    setStep(1);
    if (client.ip) fetchDevices(client.ip);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch IPTV devices
  const fetchDevices = useCallback(async (ip: string) => {
    setLoadingDevices(true);
    setDevicesError(null);
    setDevices([]);
    setSelectedMacs(new Set());
    try {
      const res = await apiCall(apiBase, `/wizard/iptv/devices?ip=${encodeURIComponent(ip)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error obteniendo dispositivos');
      const list = (data.devices as ApptvDevice[]) ?? [];
      setDevices(list);
      // Pre-select devices already linked (userid != null), or all if none are linked
      const linked = list.filter(d => d.userid !== null).map(d => d.mac);
      setSelectedMacs(new Set(linked.length ? linked : list.map(d => d.mac)));
    } catch (e: any) {
      setDevicesError(e.message || 'Error de conexión');
    } finally {
      setLoadingDevices(false);
    }
  }, [apiBase, selectedClient]);

  // ── Toggle device selection
  const toggleMac = useCallback((mac: string) => {
    setSelectedMacs(prev => {
      const next = new Set(prev);
      if (next.has(mac)) next.delete(mac);
      else next.add(mac);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedMacs(new Set());
    } else {
      setSelectedMacs(new Set(devices.map(d => d.mac)));
    }
  }, [allSelected, devices]);

  // ── Execute unlink
  const handleUnlink = useCallback(async () => {
    if (!selectedDevices.length) return;
    setUnlinking(true);
    setUnlinkError(null);
    try {
      const res = await apiCall(apiBase, '/wizard/iptv/unlink', {
        method: 'POST',
        body: JSON.stringify({ macs: selectedDevices.map(d => d.mac), id_servicio: selectedClient?.id_servicio }),
      });
      const data = await res.json();
      if (!data.ok && !data.results) throw new Error(data.error || 'Error desvinculando');
      setUnlinkResults(data.results ?? []);
      setStep(3);
    } catch (e: any) {
      setUnlinkError(e.message || 'Error de conexión');
    } finally {
      setUnlinking(false);
    }
  }, [apiBase, selectedDevices]);

  // ── Reset
  const reset = useCallback(() => {
    setStep(0);
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
    setSelectedClient(null);
    setDevices([]);
    setDevicesError(null);
    setSelectedMacs(new Set());
    setUnlinkResults([]);
    setUnlinkError(null);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-red-50 rounded-lg flex items-center justify-center">
            <Tv2 className="size-4 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Desvincular IPTV</h2>
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
                            className="w-full h-9 rounded-lg border border-gray-200 bg-white pl-3 pr-10 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
                          />
                          <button
                            onClick={handleSearch}
                            disabled={!searchQuery.trim() || searching}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-6 flex items-center justify-center rounded-md bg-red-600 text-white disabled:opacity-30 hover:bg-red-700 transition-colors"
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
                              className="w-full text-left px-4 py-3 hover:bg-red-50/60 transition-colors group"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800 truncate group-hover:text-red-600">
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
                                <ChevronRight className="size-4 text-gray-300 group-hover:text-red-500 flex-shrink-0" />
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

            {/* ── Step 1: dispositivos vinculados ── */}
            {step === 1 && selectedClient && (
              <motion.div key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  {/* Client card */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Wifi className="size-5 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">{clientFullName(selectedClient)}</p>
                        <EstadoBadge estado={selectedClient.estado} />
                      </div>
                      <p className="text-xs text-gray-400">{selectedClient.cedula} · {selectedClient.plan_internet}</p>
                      {selectedClient.ip && <p className="text-xs font-mono text-red-500 mt-0.5">IP: {selectedClient.ip}</p>}
                    </div>
                    {selectedClient.usuario && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                        <UserCircle2 className="size-3.5 text-gray-400" />
                        <span className="font-mono">{selectedClient.usuario}</span>
                      </div>
                    )}
                  </div>

                  {/* Device list */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          Dispositivos IPTV
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">Selecciona los que deseas desvincular</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!loadingDevices && devices.length > 0 && (
                          <button
                            onClick={toggleAll}
                            className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                          >
                            {allSelected ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
                            {allSelected ? 'Quitar todos' : 'Todos'}
                          </button>
                        )}
                        <button
                          onClick={() => selectedClient.ip && fetchDevices(selectedClient.ip)}
                          disabled={loadingDevices}
                          title="Refrescar dispositivos"
                          className="size-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 disabled:opacity-40 transition-colors"
                        >
                          <RefreshCw className={`size-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {loadingDevices ? (
                      <div className="p-8 flex flex-col items-center gap-2 text-center">
                        <Loader2 className="size-8 text-red-400/60 animate-spin" />
                        <p className="text-sm text-gray-400">Consultando dispositivos…</p>
                      </div>
                    ) : devicesError ? (
                      <div className="p-6 flex flex-col items-center gap-2 text-center">
                        <AlertCircle className="size-7 text-red-300" />
                        <p className="text-sm font-medium text-gray-500">No se pudo obtener los dispositivos</p>
                        <p className="text-xs text-gray-400">{devicesError}</p>
                        <button
                          onClick={() => selectedClient.ip && fetchDevices(selectedClient.ip)}
                          className="mt-2 flex items-center gap-1.5 text-xs text-red-600 hover:underline"
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
                          className="mt-2 flex items-center gap-1.5 text-xs text-red-600 hover:underline"
                        >
                          <RefreshCw className="size-3.5" />Refrescar
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {devices.map((dev) => {
                          const checked = selectedMacs.has(dev.mac);
                          return (
                            <button
                              key={dev.mac}
                              onClick={() => toggleMac(dev.mac)}
                              className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors
                                ${checked ? 'bg-red-50/60' : 'hover:bg-gray-50'}`}
                            >
                              <div className={`size-5 rounded flex items-center justify-center flex-shrink-0 transition-colors border
                                ${checked ? 'bg-red-600 border-red-600' : 'border-gray-300 bg-white'}`}>
                                {checked && <CheckCircle2 className="size-3 text-white" />}
                              </div>
                              <div className={`size-9 rounded-lg flex items-center justify-center flex-shrink-0
                                ${checked ? 'bg-red-100' : 'bg-gray-100'}`}>
                                <Monitor className={`size-4 ${checked ? 'text-red-600' : 'text-gray-400'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className={`text-sm font-semibold ${checked ? 'text-red-700' : 'text-gray-700'}`}>
                                    {dev.serial}
                                  </p>
                                  {dev.userid && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                                      Usuario {dev.userid}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 font-mono">{dev.mac}</p>
                                <p className="text-xs text-gray-400">Última conexión: {dev.last_connection}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selectedMacs.size > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                      <Trash2 className="size-3.5 flex-shrink-0" />
                      Se desvincularán <span className="font-bold mx-1">{selectedMacs.size}</span>
                      dispositivo{selectedMacs.size !== 1 ? 's' : ''} de <span className="font-semibold ml-1">{clientFullName(selectedClient)}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 2: confirmación ── */}
            {step === 2 && selectedClient && (
              <motion.div key="s2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="size-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Confirma la desvinculación</p>
                      <p className="text-xs text-red-600 mt-0.5">
                        Los dispositivos seleccionados quedarán sin usuario asignado y podrán vincularse a otro cliente en el futuro.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Wifi className="size-5 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">{clientFullName(selectedClient)}</p>
                        <EstadoBadge estado={selectedClient.estado} />
                      </div>
                      <p className="text-xs text-gray-400">{selectedClient.cedula} · {selectedClient.plan_internet}</p>
                      {selectedClient.usuario && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Usuario IPTV: <span className="font-mono text-gray-600">{selectedClient.usuario}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                        Dispositivos a desvincular
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold border border-red-200">
                        {selectedDevices.length} seleccionado{selectedDevices.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {selectedDevices.map((dev) => (
                        <div key={dev.mac} className="flex items-center gap-3 px-4 py-3">
                          <div className="size-9 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                            <Monitor className="size-4 text-red-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{dev.serial}</p>
                            <p className="text-xs text-gray-400 font-mono">{dev.mac}</p>
                          </div>
                          <Trash2 className="size-4 text-red-400 flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {devices.length > selectedDevices.length && (
                    <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
                      <p className="text-xs font-semibold text-gray-600 mb-2">Permanecen vinculados</p>
                      <div className="space-y-2">
                        {devices
                          .filter(d => !selectedMacs.has(d.mac))
                          .map(dev => (
                            <div key={dev.mac} className="flex items-center gap-2">
                              <div className="size-6 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Monitor className="size-3.5 text-gray-400" />
                              </div>
                              <span className="text-xs text-gray-500">{dev.serial}</span>
                              <span className="text-xs font-mono text-gray-400">{dev.mac}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {unlinkError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                      <AlertCircle className="size-3.5 flex-shrink-0" />{unlinkError}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 3: resultado ── */}
            {step === 3 && selectedClient && (
              <motion.div key="s3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
                <div className="space-y-4">
                  {(() => {
                    const allOk = unlinkResults.every(r => r.ok);
                    const someOk = unlinkResults.some(r => r.ok);
                    return (
                      <div className={`rounded-xl border p-5 text-center space-y-2
                        ${allOk ? 'bg-emerald-50 border-emerald-200' : someOk ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                        <div className={`size-12 mx-auto rounded-full flex items-center justify-center
                          ${allOk ? 'bg-emerald-100' : someOk ? 'bg-amber-100' : 'bg-red-100'}`}>
                          <CheckCircle2 className={`size-6 ${allOk ? 'text-emerald-600' : someOk ? 'text-amber-600' : 'text-red-600'}`} />
                        </div>
                        <p className={`text-base font-bold ${allOk ? 'text-emerald-800' : someOk ? 'text-amber-800' : 'text-red-800'}`}>
                          {allOk ? 'Desvinculación completada' : someOk ? 'Desvinculación parcial' : 'Error al desvincular'}
                        </p>
                        <p className={`text-xs ${allOk ? 'text-emerald-600' : someOk ? 'text-amber-600' : 'text-red-600'}`}>
                          {unlinkResults.filter(r => r.ok).length} de {unlinkResults.length} dispositivo{unlinkResults.length !== 1 ? 's' : ''} desvinculado{unlinkResults.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    );
                  })()}

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Resultado por dispositivo</h3>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {unlinkResults.map((r) => {
                        const dev = selectedDevices.find(d => d.mac === r.mac);
                        return (
                          <div key={r.mac} className="flex items-center gap-3 px-4 py-3">
                            <div className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0
                              ${r.ok ? 'bg-gray-100' : 'bg-red-50'}`}>
                              <Tv2 className={`size-4 ${r.ok ? 'text-gray-400' : 'text-red-400'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-700">
                                {dev?.serial ?? r.mac}
                              </p>
                              <p className="text-xs text-gray-400 font-mono">{r.mac}</p>
                            </div>
                            {r.ok
                              ? <CheckCircle2 className="size-4 text-emerald-500 flex-shrink-0" />
                              : <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                            }
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <Button onClick={onClose} className="bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white">
                      Finalizar
                    </Button>
                    <Button variant="outline" onClick={reset}>
                      <RefreshCw className="size-3.5 mr-1.5" />
                      Nueva desvinculación
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
            disabled={unlinking}
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
              disabled={selectedMacs.size === 0 || loadingDevices}
              onClick={() => setStep(2)}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
            >
              <Trash2 className="size-3.5 mr-1.5" />
              Revisar selección →
            </Button>
          )}

          {step === 2 && (
            <Button
              size="sm"
              disabled={selectedDevices.length === 0 || unlinking}
              onClick={handleUnlink}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
            >
              {unlinking
                ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Desvinculando…</>
                : <><Trash2 className="size-3.5 mr-1.5" />Desvincular ({selectedDevices.length})</>
              }
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
