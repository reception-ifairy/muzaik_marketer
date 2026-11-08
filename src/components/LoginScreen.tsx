import React from 'react';
import { motion } from 'motion/react';
import { Bot, Lock, User, LogIn, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { type OwnerUser } from '../types';
import { APP } from '../config';

interface LoginScreenProps {
  onLoggedIn: (user: OwnerUser) => void;
}

export default function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ login, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.user) {
        throw new Error(data.error || 'Nie udało się zalogować.');
      }

      setPassword('');
      onLoggedIn(data.user);
    } catch (err: any) {
      setError(err.message || 'Nie udało się zalogować.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto flex items-center justify-center bg-brand-bg text-slate-100 p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md panel p-8 space-y-7"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <span className="w-20 h-20 rounded-2xl bg-cyan-400/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
            <Bot size={40} />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-display font-bold tracking-tight text-white">{APP.name}</h1>
            <p className="text-sm text-cyan-300">Panel właścicielki · zakupy online UK</p>
          </div>
          <p className="text-base text-slate-400 leading-relaxed">
            {APP.tagline}. Zaloguj się, aby kontynuować.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-user" className="field-label">Login</label>
            <div className="relative">
              <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="login-user"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="field pl-11"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="field-label">Hasło</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field pl-11 pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                className="absolute right-1 top-1 h-12 w-12 rounded-lg flex items-center justify-center text-slate-400 active:bg-white/10"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !login.trim() || !password}
            className="w-full h-14 rounded-xl bg-cyan-400 text-black font-semibold text-base active:bg-cyan-300 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogIn size={20} />
            <span>{loading ? 'Weryfikacja…' : 'Zaloguj się'}</span>
          </button>
        </form>

        <p className="text-sm italic text-center text-slate-500">„Dobry zakup ma zmniejszyć stres, nie stworzyć nowy problem.”</p>
      </motion.div>
    </div>
  );
}
