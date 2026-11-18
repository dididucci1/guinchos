import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Loader2, Minus, X, XCircle } from "lucide-react";
import { TRUCK_STATUS, type Tone } from "../lib/format";
import type { TruckStatus } from "../lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- Botão ---------- */
type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-onbrand hover:bg-brand-700 shadow-sm",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
  danger: "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50",
  ghost: "text-slate-600 hover:bg-slate-100",
};

export function Button({
  variant = "primary",
  loading,
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Campos ---------- */
const fieldCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(fieldCls, "h-10", p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(fieldCls, "h-10", p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(fieldCls, p.className)} />;

/* ---------- Superfícies ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-slate-200/80 bg-white shadow-sm", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, text }: { icon?: ReactNode; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-600">{icon}</div>}
      <p className="font-medium text-slate-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cx("flex justify-center py-12 text-brand-600", className)}>
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{message}</div>;
}

/* ---------- Badges ---------- */
/** Selo com bolinha de cor + texto (a cor nunca aparece sozinha). */
export function Badge({ tone, children }: { tone: Tone; children?: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", tone.cls)}>
      <span className={cx("size-1.5 rounded-full", tone.dot)} />
      {children ?? tone.label}
    </span>
  );
}

export const TruckBadge = ({ status }: { status: TruckStatus }) => <Badge tone={TRUCK_STATUS[status]} />;

/* ---------- Abas ---------- */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition",
            value === t.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs tabular text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Tabela simples ---------- */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-2.5 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

/* ---------- Indicador (tile) ---------- */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
  delta,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  /** Minilinha de tendência (sem eixo); o último ponto é destacado. */
  trend?: { values: number[]; label: string };
  /** Variação vs período anterior; `upIsGood` define a cor (custo subindo é ruim). */
  delta?: { current: number; previous: number; upIsGood: boolean; vs: string };
}) {
  let deltaEl: ReactNode = null;
  if (delta && delta.previous > 0) {
    const pct = Math.round(((delta.current - delta.previous) / delta.previous) * 100);
    const up = pct > 0;
    const good = pct === 0 ? null : up === delta.upIsGood;
    const Arrow = pct === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
    deltaEl = (
      <span className="inline-flex items-center gap-1">
        <span className={cx("inline-flex items-center gap-0.5 font-medium", good === null ? "text-slate-600" : good ? "text-green-700" : "text-red-600")}>
          <Arrow className="size-3.5" /> {pct > 0 ? "+" : ""}{pct}%
        </span>
        <span>{delta.vs}</span>
      </span>
    );
  }
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {tone && <span className={cx("size-2 rounded-full", tone.dot)} />}
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-slate-900">{value}</p>
      {(deltaEl || hint) && <p className="mt-1 text-xs text-slate-500">{deltaEl || hint}</p>}
      {trend && trend.values.length > 1 && <Sparkline {...trend} />}
    </Card>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 200;
  const h = 40;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 3 - (v / max) * (h - 8)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <div className="mt-auto pt-3" title={label}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full overflow-visible" role="img" aria-label={label}>
        <path d={`${d} L${lx},${h} L3,${h} Z`} fill="var(--color-series-1)" opacity={0.08} />
        <path d={d} fill="none" stroke="var(--color-series-1)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

/** Lança um evento para outras telas recarregarem (ex.: contador do menu). */
export const notifyFleetChanged = () => window.dispatchEvent(new Event("fleet:changed"));

/* ---------- Modal (vira "bottom sheet" no celular) ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; type: "success" | "error"; text: string };
const ToastCtx = createContext<(type: Toast["type"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: Toast["type"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm shadow-lg ring-1 ring-slate-200"
          >
            {t.type === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
            )}
            <span className="text-slate-800">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- Abas de filtro (chips) ---------- */
export function Chips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
            value === o.value ? "bg-brand-600 text-onbrand" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cx("rounded-full px-1.5 text-xs tabular", value === o.value ? "bg-onbrand/20" : "bg-slate-100")}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
