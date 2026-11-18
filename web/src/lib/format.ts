import type { DocSituation, ExpenseCategory, ExpenseStatus, DocType, MaintenanceStatus, MaintenanceType, Role, TruckKind, TruckStatus, UsageStatus } from "./types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (v: number | null | undefined) => brl.format(Number(v || 0));
export const num = (v: number | null | undefined) => Number(v || 0).toLocaleString("pt-BR");
export const km = (v: number | null | undefined) => `${num(v)} km`;
export const kg = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t` : `${v} kg`);

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
export const date = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return iso.length === 10
    ? iso.split("-").reverse().join("/")
    : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};
export const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "há 2 h 15 min" */
export function elapsed(iso: string, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} h ${mins % 60 ? `${mins % 60} min` : ""}`.trim();
  return `${Math.floor(h / 24)} dias`;
}

/** "vence em 5 dias" / "venceu há 3 dias" / "vence hoje" */
export function daysLabel(days: number | null | undefined, verb = "vence") {
  if (days == null) return "";
  if (days === 0) return `${verb} hoje`;
  if (days > 0) return `${verb} em ${days} dia${days > 1 ? "s" : ""}`;
  const past = verb === "vence" ? "venceu" : verb;
  return `${past} há ${-days} dia${days < -1 ? "s" : ""}`;
}

export function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}
export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}
/** Valor para <input type="datetime-local"> no fuso local. */
export function localDateTimeInput(d = new Date()) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export const plateFmt = (p: string) => (p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p);

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  operador: "Operador",
  motorista: "Motorista",
};

export type Tone = { label: string; cls: string; dot: string };

export const TRUCK_STATUS: Record<TruckStatus, Tone> = {
  disponivel: { label: "Disponível", cls: "bg-green-50 text-green-800 ring-green-200", dot: "bg-green-600" },
  em_servico: { label: "Em serviço", cls: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  manutencao: { label: "Em manutenção", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  inativo: { label: "Inativo", cls: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const TRUCK_KIND: Record<TruckKind, string> = {
  plataforma: "Plataforma",
  asa_delta: "Asa-delta",
  lanca: "Lança / Reboque",
  integrado: "Integrado",
  pesado: "Pesado",
};

export const MAINT_TYPE: Record<MaintenanceType, Tone> = {
  preventiva: { label: "Preventiva", cls: "bg-brand-50 text-brand-800 ring-brand-200", dot: "bg-brand-600" },
  corretiva: { label: "Corretiva", cls: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
};

export const MAINT_STATUS: Record<MaintenanceStatus, Tone> = {
  agendada: { label: "Agendada", cls: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  em_andamento: { label: "Em andamento", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  concluida: { label: "Concluída", cls: "bg-green-50 text-green-800 ring-green-200", dot: "bg-green-600" },
  cancelada: { label: "Cancelada", cls: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const DOC_TYPE: Record<DocType, string> = {
  crlv: "CRLV",
  licenciamento: "Licenciamento",
  ipva: "IPVA",
  seguro: "Seguro",
  antt: "ANTT / RNTRC",
  tacografo: "Aferição do tacógrafo",
  inspecao: "Inspeção veicular",
  outro: "Outro",
};

export const DOC_SITUATION: Record<DocSituation, Tone> = {
  vencido: { label: "Vencido", cls: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  a_vencer: { label: "A vencer", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  em_dia: { label: "Em dia", cls: "bg-green-50 text-green-800 ring-green-200", dot: "bg-green-600" },
  sem_validade: { label: "Sem validade", cls: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const PREV_SITUATION: Record<"vencida" | "proxima" | "ok", Tone> = {
  vencida: { label: "Vencida", cls: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  proxima: { label: "Próxima", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  ok: { label: "Em dia", cls: "bg-green-50 text-green-800 ring-green-200", dot: "bg-green-600" },
};

export const USAGE_STATUS: Record<UsageStatus, Tone> = {
  em_andamento: { label: "Em andamento", cls: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  concluida: { label: "Concluída", cls: "bg-green-50 text-green-800 ring-green-200", dot: "bg-green-600" },
  cancelada: { label: "Cancelada", cls: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export const EXPENSE_CATEGORY: Record<ExpenseCategory, string> = {
  pneu: "Pneu / borracheiro",
  combustivel: "Combustível",
  pedagio: "Pedágio",
  alimentacao: "Alimentação",
  mecanica: "Mecânica / peça",
  estacionamento: "Estacionamento",
  hospedagem: "Hospedagem",
  lavagem: "Lavagem",
  multa: "Multa",
  outro: "Outro",
};

export const EXPENSE_STATUS: Record<ExpenseStatus, Tone> = {
  pendente: { label: "A conferir", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  aprovada: { label: "Aprovada", cls: "bg-green-50 text-green-800 ring-green-200", dot: "bg-green-600" },
  recusada: { label: "Recusada", cls: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
};

/** "45,50" / "1.234,56" / "45.5" → número (NaN se inválido). */
export function parseMoney(v: string | number | null | undefined) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}
