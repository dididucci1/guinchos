import { useState, type FormEvent } from "react";
import { CalendarClock, Loader2, Lock, Mail, RadioTower, Wrench } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Logo, ThemeButton } from "../components/Layout";
import { ErrorBox } from "../components/ui";

const FEATURES = [
  { icon: RadioTower, text: "Disponibilidade de cada guincho em tempo real" },
  { icon: Wrench, text: "Manutenções preventivas e corretivas com alertas" },
  { icon: CalendarClock, text: "Documentos e vencimentos sempre em dia" },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "h-11 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

  return (
    <div className="flex min-h-full">
      <div className="relative hidden w-1/2 overflow-hidden bg-[#1b1850] lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Faixas de sinalização ao fundo */}
        <div
          aria-hidden
          className="absolute -right-24 -bottom-24 size-[28rem] rotate-12 rounded-3xl opacity-[0.07]"
          style={{ background: "repeating-linear-gradient(45deg, #f97316 0 28px, transparent 28px 56px)" }}
        />
        <div className="relative"><Logo light /></div>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold text-onbrand">Sua frota de guinchos sob controle.</h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-onbrand/85">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-signal">
                  <f.icon className="size-[18px]" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
          <p className="mt-12 text-sm text-onbrand/55">© {new Date().getFullYear()} Frota Guinchos</p>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-white px-6 py-12">
        <ThemeButton className="absolute top-4 right-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100" />
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold text-slate-900">Entrar</h1>
          <p className="mt-1 text-sm text-slate-500">Use seu e-mail e senha de acesso.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {error && <ErrorBox message={error} />}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">E-mail</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <input type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="voce@empresa.com" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Senha</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="••••••" />
              </div>
            </label>
            <button
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 font-medium text-onbrand shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading && <Loader2 className="size-4 animate-spin" />} Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
