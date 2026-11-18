import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Camera,
  CloudOff,
  FileText,
  Landmark,
  Receipt,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Route,
  Sun,
  Truck,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ROLE_LABEL } from "../lib/format";
import { usePersistedFlag, useTheme } from "../lib/theme";
import type { DashboardData, Role } from "../lib/types";
import { Button, Field, Input, Modal, useToast } from "./ui";
import { ExpenseSheetProvider, useExpenseSheet } from "./ExpenseSheet";
import { useOutbox } from "../lib/outbox";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  badge?: "docs" | "maint" | "expenses";
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "operador"] },
  { to: "/disponibilidade", label: "Disponibilidade", icon: RadioTower, roles: ["admin", "operador", "motorista"] },
  { to: "/guinchos", label: "Guinchos", icon: Truck, roles: ["admin", "operador"] },
  { to: "/utilizacao", label: "Histórico de utilização", icon: Route, roles: ["admin", "operador", "motorista"] },
  { to: "/despesas", label: "Despesas", icon: Receipt, roles: ["admin", "operador", "motorista"], badge: "expenses" },
  { to: "/financeiro", label: "Financeiro", icon: Landmark, roles: ["admin", "operador"] },
  { to: "/manutencoes", label: "Manutenções", icon: Wrench, roles: ["admin", "operador"], badge: "maint" },
  { to: "/documentos", label: "Documentos", icon: FileText, roles: ["admin", "operador"], badge: "docs" },
  { to: "/usuarios", label: "Usuários", icon: Users, roles: ["admin"] },
];

/** Ícone da marca (guincho estilizado). */
export function Monogram({ className = "size-8" }: { className?: string }) {
  return <img src="/icon.svg" alt="" className={`shrink-0 ${className}`} />;
}

export function Logo({ light, className = "" }: { light?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Monogram className="size-9" />
      <div className="leading-tight">
        <p className={`text-[15px] font-bold ${light ? "text-onbrand" : "text-slate-900"}`}>Frota Guinchos</p>
        <p className={`text-xs ${light ? "text-onbrand/70" : "text-slate-500"}`}>Gestão de frota</p>
      </div>
    </div>
  );
}

export function ThemeButton({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button onClick={toggle} className={className} title={theme === "dark" ? "Modo claro" : "Modo escuro"} aria-label="Alternar tema">
      <Icon className="size-4" />
    </button>
  );
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = usePersistedFlag("guinchos.menuRecolhido");
  const [pwdOpen, setPwdOpen] = useState(false);
  const [alerts, setAlerts] = useState({ docs: 0, maint: 0, expenses: 0 });
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  // Contadores de alertas no menu (documentos vencendo, preventivas vencidas/próximas).
  useEffect(() => {
    if (!can("admin", "operador")) return;
    const load = () =>
      api<DashboardData>("/dashboard")
        .then((d) => setAlerts({ docs: d.docs.length, maint: d.preventive.length, expenses: d.expenses.pending_count }))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener("fleet:changed", load);
    window.addEventListener("expenses:changed", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("fleet:changed", load);
      window.removeEventListener("expenses:changed", load);
    };
  }, [user?.id]);

  const items = NAV.filter((n) => user && n.roles.includes(user.role));
  const current = items.find((i) => location.pathname.startsWith(i.to));
  const labelOf = (item: NavItem) =>
    user?.role === "motorista" && item.to === "/utilizacao" ? "Minhas saídas" : user?.role === "motorista" && item.to === "/despesas" ? "Minhas despesas" : item.label;
  const badgeOf = (item: NavItem) => (item.badge ? alerts[item.badge] : 0);

  /** `mini` = menu recolhido (só ícones), usado apenas no computador. */
  const renderSidebar = (mini: boolean, mobile: boolean) => (
    <div className="flex h-full flex-col bg-white">
      <div className={`flex h-16 shrink-0 items-center border-b border-slate-100 ${mini ? "justify-center px-2" : "justify-between pr-3 pl-4"}`}>
        {mini ? (
          <button onClick={() => setCollapsed(false)} className="group relative rounded-lg" title="Expandir menu" aria-label="Expandir menu">
            <span className="group-hover:opacity-0"><Monogram /></span>
            <PanelLeftOpen className="absolute inset-0 m-auto size-5 text-slate-600 opacity-0 group-hover:opacity-100" />
          </button>
        ) : (
          <>
            <Logo />
            {mobile ? (
              <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            ) : (
              <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setCollapsed(true)} title="Recolher menu" aria-label="Recolher menu">
                <PanelLeftClose className="size-5" />
              </button>
            )}
          </>
        )}
      </div>

      <nav className={`flex-1 space-y-1 overflow-y-auto ${mini ? "p-2" : "p-3"}`}>
        {items.map((item) => {
          const n = badgeOf(item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={mini ? labelOf(item) : undefined}
              className={({ isActive }) =>
                `relative flex items-center rounded-lg text-sm font-medium transition ${mini ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"} ${
                  isActive ? "bg-brand-600 text-onbrand shadow-sm" : "text-slate-600 hover:bg-brand-50 hover:text-brand-800"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="size-[18px] shrink-0" />
                  {!mini && <span className="flex-1">{labelOf(item)}</span>}
                  {n > 0 &&
                    (mini ? (
                      <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-onbrand">
                        {n > 9 ? "9+" : n}
                      </span>
                    ) : (
                      <span
                        title={item.badge === "expenses" ? "Despesas a conferir" : "Alertas de vencimento"}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular ${isActive ? "bg-white text-brand-700" : "bg-amber-100 text-amber-800"}`}
                      >
                        {n}
                      </span>
                    ))}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className={`border-t border-slate-100 ${mini ? "p-2" : "p-3"}`}>
        {mini ? (
          <div className="flex flex-col items-center gap-1">
            <div className="mb-1 flex size-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800" title={`${user?.name} · ${user && ROLE_LABEL[user.role]}`}>
              {user?.name.slice(0, 1).toUpperCase()}
            </div>
            <ThemeButton className="rounded-lg p-2.5 text-slate-600 hover:bg-slate-100" />
            <button onClick={() => setPwdOpen(true)} className="rounded-lg p-2.5 text-slate-600 hover:bg-slate-100" title="Alterar senha" aria-label="Alterar senha">
              <KeyRound className="size-4" />
            </button>
            <button onClick={logout} className="rounded-lg p-2.5 text-slate-600 hover:bg-red-50 hover:text-red-600" title="Sair" aria-label="Sair">
              <LogOut className="size-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
                {user?.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user && ROLE_LABEL[user.role]}</p>
              </div>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <button onClick={toggleTheme} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
                {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />} {theme === "dark" ? "Claro" : "Escuro"}
              </button>
              <button onClick={() => setPwdOpen(true)} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
                <KeyRound className="size-3.5" /> Senha
              </button>
              <button onClick={logout} className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600">
                <LogOut className="size-3.5" /> Sair
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <ExpenseSheetProvider>
    <div className={`min-h-full transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
      {/* Computador: fixo, recolhível */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 transition-[width] duration-200 lg:block ${collapsed ? "w-16" : "w-64"}`}>
        {renderSidebar(collapsed, false)}
      </aside>

      {/* Celular: gaveta */}
      <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`}>
        <div className={`absolute inset-0 bg-black/50 transition-opacity ${open ? "opacity-100" : "opacity-0"}`} onClick={() => setOpen(false)} />
        <aside className={`absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}>
          {renderSidebar(false, true)}
        </aside>
      </div>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="-ml-1.5 rounded-lg p-1.5 text-slate-700 hover:bg-slate-100" aria-label="Abrir menu">
          <Menu className="size-6" />
        </button>
        <span className="flex-1 font-semibold text-slate-900">{current ? labelOf(current) : "Frota Guinchos"}</span>
        <ThemeButton className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100" />
      </header>

      <main className={`mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8 ${user?.role === "motorista" ? "pb-28" : ""}`}>
        <OutboxBanner />
        <Outlet />
      </main>

      {user?.role === "motorista" && <CameraFab />}
      <PasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </div>
    </ExpenseSheetProvider>
  );
}

/** Botão fixo do motorista: abre a câmera direto para fotografar a nota. */
function CameraFab() {
  const sheet = useExpenseSheet();
  return (
    <button
      onClick={() => sheet.openCamera()}
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex h-14 items-center gap-2 rounded-full bg-brand-600 pr-5 pl-4 font-semibold text-onbrand shadow-lg shadow-black/20 active:scale-95"
      aria-label="Lançar despesa: tirar foto da nota"
    >
      <Camera className="size-6" /> Despesa
    </button>
  );
}

/** Despesas guardadas no celular esperando internet. */
function OutboxBanner() {
  const { items, syncing, flush, discard } = useOutbox();
  if (!items.length) return null;
  const failed = items.filter((i) => i.error);
  return (
    <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
      <div className="flex flex-wrap items-center gap-2">
        <CloudOff className="size-4 shrink-0" />
        <span className="flex-1">
          {items.length} despesa{items.length > 1 ? "s" : ""} guardada{items.length > 1 ? "s" : ""} no celular, esperando internet para enviar.
        </span>
        <Button size="sm" variant="secondary" onClick={flush} loading={syncing}>Enviar agora</Button>
      </div>
      {failed.map((i) => (
        <div key={i.uuid} className="mt-2 flex items-center gap-2 border-t border-amber-200 pt-2 text-xs">
          <span className="flex-1">Não foi aceita: {i.error}</span>
          <button className="font-medium underline" onClick={() => confirm("Descartar esta despesa guardada?") && discard(i.uuid)}>Descartar</button>
        </div>
      ))}
    </div>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/auth/password", { body: { current, next } });
      toast("success", "Senha alterada");
      setCurrent("");
      setNext("");
      onClose();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alterar senha"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="pwd-form" loading={saving}>Salvar</Button>
        </>
      }
    >
      <form id="pwd-form" onSubmit={submit} className="space-y-4">
        <Field label="Senha atual">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label="Nova senha">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={3} autoComplete="new-password" />
        </Field>
      </form>
    </Modal>
  );
}
