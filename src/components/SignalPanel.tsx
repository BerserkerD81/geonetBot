import { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

interface MonitorData {
  statusSummary: string;
  rx?: string;
  tx?: string;
  signal1490?: string;
  signal1310?: string;
  signalValue?: string;
  onlineUptime?: string;
}

interface Quality {
  label: string;
  tone: string;
  detail?: string;
}

interface SignalPanelProps {
  apiBase: string;
  clientId: number;
  sn?: string;
  refreshTrigger?: number;
}

function qualityColor(label: string) {
  if (label === 'Excelente' || label === 'Buena') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (label === 'Regular') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (label === 'Mala') return 'text-red-700 bg-red-50 border-red-200';
  return 'text-gray-500 bg-gray-100 border-gray-200';
}

function Metric({ label, value }: { label: string; value?: string }) {
  if (!value || value === 'N/D') return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

export function SignalPanel({ apiBase, clientId, sn, refreshTrigger }: SignalPanelProps) {
  const [loading, setLoading] = useState(true);
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [error, setError] = useState('');
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchSignal = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let data: any;
      if (sn) {
        const res = await fetch(`${apiBase}/wizard/signal?sn=${encodeURIComponent(sn)}`, {
          credentials: 'include',
        });
        data = await res.json();
        if (data.ok) {
          setMonitor({
            statusSummary: data.statusSummary || '',
            signal1490: data.signal1490,
            signal1310: data.signal1310,
            signalValue: data.signalValue,
          });
          setQuality(data.quality ?? null);
        } else {
          setError(data.error || 'Error consultando señal');
        }
      } else {
        const res = await fetch(`${apiBase}/wizard/monitor/prepare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ clientId }),
        });
        data = await res.json();
        if (data.ok) {
          setMonitor(data.monitor ?? null);
          setQuality(data.quality ?? null);
        } else {
          setError(data.error || 'Error consultando señal');
        }
      }
      setLastFetched(new Date());
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [apiBase, clientId, sn]);

  useEffect(() => { fetchSignal(); }, [fetchSignal, refreshTrigger]);

  const rxValue = monitor?.signal1490 || monitor?.signalValue || monitor?.rx;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Nivel de señal</h3>
          {sn && <p className="text-xs text-gray-400 mt-0.5">SN: {sn}</p>}
        </div>
        <div className="flex items-center gap-2">
          {quality && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${qualityColor(quality.label)}`}>
              {quality.tone} {quality.label}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchSignal}
            disabled={loading}
            className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="size-4 animate-spin text-orange-400" />
            Consultando SmartOLT...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-xs text-red-600">
            <AlertCircle className="size-3.5 flex-shrink-0" />
            {error}
          </div>
        ) : !monitor ? (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <AlertCircle className="size-3.5 flex-shrink-0" />
            ONU aún no visible en SmartOLT. Refresca en unos segundos.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Metric label="RX 1490nm" value={rxValue} />
              {monitor.signal1310 && <Metric label="TX 1310nm" value={monitor.signal1310} />}
              {!monitor.signal1310 && <Metric label="TX" value={monitor.tx} />}
              <Metric label="Uptime" value={monitor.onlineUptime} />
            </div>
            {monitor.statusSummary && monitor.statusSummary !== 'N/D' && (
              <p className="text-xs text-gray-500 font-mono leading-relaxed line-clamp-2">{monitor.statusSummary}</p>
            )}
            {quality?.detail && (
              <p className="text-xs text-gray-400">{quality.detail}</p>
            )}
            {lastFetched && (
              <p className="text-[10px] text-gray-300">Actualizado: {lastFetched.toLocaleTimeString()}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
