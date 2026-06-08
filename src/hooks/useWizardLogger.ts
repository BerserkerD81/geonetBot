import { useEffect, useRef, useCallback } from 'react';

export type WizardType = 'auth' | 'change-onu' | 'wifi' | 'monitor' | 'baja' | 'fotos';

function apiCall(base: string, path: string, method: string, body?: object) {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export function useWizardLogger(apiBase: string, type: WizardType) {
  const sessionIdRef = useRef<string | null>(null);
  const completedRef = useRef(false);

  // Create session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiCall(apiBase, '/wizard/sessions', 'POST', { type });
        const data = await res.json();
        if (!cancelled && data.id) sessionIdRef.current = data.id;
      } catch {}
    })();

    return () => {
      cancelled = true;
      // Abandon if never completed — use keepalive fetch so it fires even as component unmounts
      if (sessionIdRef.current && !completedRef.current) {
        fetch(`${apiBase}/wizard/sessions/${sessionIdRef.current}/abandon`, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logStep = useCallback(async (
    stepName: string,
    stepLabel: string,
    status: 'ok' | 'error' | 'skipped',
    opts?: {
      inputData?: Record<string, any>;
      outputData?: Record<string, any>;
      errorMsg?: string;
      resumeData?: Record<string, any>;
      clientId?: number;
      clientName?: string;
    }
  ) => {
    if (!sessionIdRef.current) return;
    try {
      await apiCall(apiBase, `/wizard/sessions/${sessionIdRef.current}/step`, 'PATCH', {
        stepName, stepLabel, status, ...opts,
      });
    } catch {}
  }, [apiBase]);

  const updateResume = useCallback(async (resumeData: Record<string, any>, client?: { clientId?: number; clientName?: string }) => {
    if (!sessionIdRef.current) return;
    try {
      await apiCall(apiBase, `/wizard/sessions/${sessionIdRef.current}/resume-data`, 'PATCH', {
        resumeData, ...client,
      });
    } catch {}
  }, [apiBase]);

  const completeSession = useCallback(async (summary: string) => {
    if (!sessionIdRef.current) return;
    completedRef.current = true;
    try {
      await apiCall(apiBase, `/wizard/sessions/${sessionIdRef.current}/complete`, 'PATCH', { summary });
    } catch {}
  }, [apiBase]);

  const failSession = useCallback(async (errorMsg: string) => {
    if (!sessionIdRef.current) return;
    completedRef.current = true;
    try {
      await apiCall(apiBase, `/wizard/sessions/${sessionIdRef.current}/fail`, 'PATCH', { errorMsg });
    } catch {}
  }, [apiBase]);

  return { logStep, updateResume, completeSession, failSession, getSessionId: () => sessionIdRef.current };
}
