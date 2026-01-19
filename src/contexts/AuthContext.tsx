import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: number;
  email: string;
  name?: string;
  isTwoFactorEnabled?: boolean;
}

interface LoginResult {
  ok: boolean;
  requires2faSetup?: boolean;
  requires2faVerify?: boolean;
  userId?: number;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  setup2fa: () => Promise<{ qr: string } | { error: string }>;
  verify2faSetup: (token: string) => Promise<boolean>;
  verify2faLogin: (userId: number, token: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const isAuthenticated = !!user;

  const fetchWithTimeout = async (
    url: string,
    options: RequestInit & { timeoutMs?: number } = {}
  ) => {
    const { timeoutMs = 8000, ...rest } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  const refreshUser = async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/auth/me`, {
        credentials: 'include',
        timeoutMs: 8000,
      });
      if (!res.ok) {
        setUser(null);
        setIsAdmin(false);
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
    } catch (error) {
      console.error('Error fetching current user:', error);
      setUser(null);
      setIsAdmin(false);
    }
  };

  const refreshAdminFlag = async () => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    try {
      const res = await fetchWithTimeout(`${API_BASE}/admin/users`, {
        method: 'GET',
        credentials: 'include',
        timeoutMs: 8000,
      });
      if (res.ok) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('Error checking admin role:', error);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setIsLoading(true);
      // Run refresh with a hard cap to avoid indefinite loading when API is unreachable
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 9000));
      await Promise.race([refreshUser(), timeout]);
      if (isMounted) setIsLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      refreshAdminFlag();
    } else {
      setIsAdmin(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { ok: false, error: data.error || 'Error al iniciar sesión' };
      }

      if (data.requires2fa_setup) {
        return { ok: true, requires2faSetup: true, userId: data.userId };
      }

      if (data.requires2fa_verify) {
        return { ok: true, requires2faVerify: true, userId: data.userId };
      }

      await refreshUser();
      await refreshAdminFlag();
      return { ok: true };
    } catch (error) {
      console.error('Login error:', error);
      return { ok: false, error: 'No se pudo conectar con el servidor' };
    }
  };

  const setup2fa = async (): Promise<{ qr: string } | { error: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/setup`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'No se pudo iniciar la configuración de 2FA' };
      }
      return { qr: data.qr as string };
    } catch (error) {
      console.error('2FA setup error:', error);
      return { error: 'No se pudo conectar con el servidor' };
    }
  };

  const verify2faSetup = async (token: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/2fa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.ok) return false;
      await refreshUser();
      await refreshAdminFlag();
      return true;
    } catch (error) {
      console.error('2FA verify error:', error);
      return false;
    }
  };

  const verify2faLogin = async (userId: number, token: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login/2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ userId, token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.ok) return false;
      await refreshUser();
      await refreshAdminFlag();
      return true;
    } catch (error) {
      console.error('2FA login verify error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setIsAdmin(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        isAdmin,
        login,
        setup2fa,
        verify2faSetup,
        verify2faLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
