import { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  useCallback, // Importamos useCallback
  type ReactNode 
} from 'react';

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

const _envApi = (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
const _mode = (import.meta.env as Record<string, string | undefined>).MODE ?? 'production';
const API_BASE = _envApi ?? (_mode === 'development' ? 'http://localhost:3000' : '/api');

// Movemos esta función fuera del componente ya que es una utilidad pura 
// y no depende del estado del componente.
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const isAuthenticated = !!user;

  // Usamos useCallback para estabilizar la función
  const refreshUser = useCallback(async () => {
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
  }, []); // Sin dependencias externas cambiantes

  // Usamos useCallback y pasamos 'user' como dependencia
  const refreshAdminFlag = useCallback(async () => {
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
  }, [user]); // Depende de user

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setIsLoading(true);
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 9000));
      // Ahora refreshUser es estable y seguro de añadir al array de dependencias
      await Promise.race([refreshUser(), timeout]);
      if (isMounted) setIsLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [refreshUser]); // Error de dependencias corregido

  useEffect(() => {
    if (user?.id) {
      refreshAdminFlag();
    } else {
      setIsAdmin(false);
    }
    // Añadimos refreshAdminFlag a las dependencias
  }, [user?.id, refreshAdminFlag]);

  // Envolvemos el resto de funciones en useCallback para evitar 
  // re-renderizados innecesarios en los consumidores del contexto
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
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
      // refreshAdminFlag se ejecutará automáticamente por el useEffect cuando cambie el usuario
      return { ok: true };
    } catch (error) {
      console.error('Login error:', error);
      return { ok: false, error: 'No se pudo conectar con el servidor' };
    }
  }, [refreshUser]);

  const setup2fa = useCallback(async (): Promise<{ qr: string } | { error: string }> => {
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
  }, []);

  const verify2faSetup = useCallback(async (token: string): Promise<boolean> => {
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
      return true;
    } catch (error) {
      console.error('2FA verify error:', error);
      return false;
    }
  }, [refreshUser]);

  const verify2faLogin = useCallback(async (userId: number, token: string): Promise<boolean> => {
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
      return true;
    } catch (error) {
      console.error('2FA login verify error:', error);
      return false;
    }
  }, [refreshUser]);

  const logout = useCallback(async () => {
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
  }, []);

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

// Solución al error "React Refresh only exports components".
// Esto permite mantener el hook en el mismo archivo sin romper el Hot Module Replacement.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}