import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Bot, Lock, Mail, ShieldCheck, AlertCircle } from 'lucide-react';

export function LoginPage() {
  const { login, setup2fa, verify2faSetup, verify2faLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'credentials' | 'setup2fa' | 'verify2fa'>('credentials');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login(email, password);

    if (!result.ok) {
      setError(result.error || 'Credenciales inválidas. Intenta de nuevo.');
      setIsLoading(false);
      return;
    }

    if (result.requires2faSetup) {
      setPendingUserId(result.userId ?? null);
      const setup = await setup2fa();

      if ('error' in setup) {
        setError(setup.error || 'No se pudo iniciar la configuración de 2FA.');
        setIsLoading(false);
        return;
      }

      setQrImage(setup.qr);
      setStep('setup2fa');
      setIsLoading(false);
      return;
    }

    if (result.requires2faVerify) {
      setPendingUserId(result.userId ?? null);
      setStep('verify2fa');
      setIsLoading(false);
      return;
    }

    // Login completo sin 2FA adicional
    setIsLoading(false);
  };

  const handleSubmit2faSetup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const ok = await verify2faSetup(twoFactorToken);
    if (!ok) {
      setError('Código 2FA inválido. Intenta de nuevo.');
      setIsLoading(false);
      return;
    }

    setTwoFactorToken('');
    setQrImage(null);
    setPendingUserId(null);
    setStep('credentials');
    setIsLoading(false);
  };

  const handleSubmit2faLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!pendingUserId) {
      setError('Sesión inválida. Vuelve a iniciar sesión.');
      setIsLoading(false);
      setStep('credentials');
      return;
    }

    const ok = await verify2faLogin(pendingUserId, twoFactorToken);
    if (!ok) {
      setError('Código 2FA inválido. Intenta de nuevo.');
      setIsLoading(false);
      return;
    }

    setTwoFactorToken('');
    setPendingUserId(null);
    setStep('credentials');
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/50">
            <Bot className="text-emerald-400 size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">ISP Service Assistant</h1>
            <p className="text-xs text-neutral-400">
              Verifica disponibilidad de servicios y gestiona clientes
            </p>
          </div>
        </div>

        <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-2xl p-6 sm:p-8 backdrop-blur-xl">
          {step === 'credentials' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm text-neutral-300">
                  Correo electrónico
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-neutral-800/50 border-neutral-700/50 text-white placeholder:text-neutral-500 focus:border-emerald-500 h-11"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm text-neutral-300">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-neutral-800/50 border-neutral-700/50 text-white placeholder:text-neutral-500 focus:border-emerald-500 h-11"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-medium shadow-lg shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>
          ) : (
            <form
              onSubmit={step === 'setup2fa' ? handleSubmit2faSetup : handleSubmit2faLogin}
              className="space-y-5"
            >
              <div className="flex items-center gap-2 text-sm text-neutral-300">
                <ShieldCheck className="size-4 text-emerald-400" />
                <span>
                  {step === 'setup2fa'
                    ? 'Configura tu segundo factor de autenticación'
                    : 'Introduce tu código de autenticación 2FA'}
                </span>
              </div>

              {step === 'setup2fa' && qrImage && (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={qrImage}
                    alt="Código QR 2FA"
                    className="w-40 h-40 rounded-lg border border-neutral-800 bg-neutral-900"
                  />
                  <p className="text-xs text-neutral-400 text-center">
                    Escanea el código QR con tu app de autenticación (Google
                    Authenticator, Authy, etc.) y luego introduce el código de 6
                    dígitos para finalizar la configuración.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="token" className="text-sm text-neutral-300">
                  Código 2FA
                </Label>
                <Input
                  id="token"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value)}
                  className="bg-neutral-800/50 border-neutral-700/50 text-white placeholder:text-neutral-500 focus:border-emerald-500 h-11 text-center tracking-[0.3em]"
                  required
                  disabled={isLoading}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-medium shadow-lg shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isLoading
                  ? 'Verificando código...'
                  : step === 'setup2fa'
                    ? 'Activar 2FA y acceder'
                    : 'Verificar y acceder'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-xs text-neutral-600 text-center mt-2">
          Autenticación integrada con backend (incluye 2FA obligatorio)
        </p>
      </div>
    </div>
  );
}
