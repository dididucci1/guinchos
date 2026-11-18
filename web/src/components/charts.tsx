import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, num, plateFmt, TRUCK_STATUS } from "../lib/format";
import type { TruckStatus } from "../lib/types";
import { Card } from "./ui";

/*
 * Gráficos do dashboard. Regras seguidas:
 * - cores por papel (série 1 = azul, série 2 = laranja), validadas para daltonismo nos dois temas;
 * - um único eixo por gráfico; marcas finas (linha 2px, barras <= 24px com ponta arredondada);
 * - legenda sempre que há 2+ séries; textos nunca na cor da série; tooltip em tudo.
 */

const C = {
  s1: "var(--color-series-1)",
  s2: "var(--color-series-2)",
  grid: "var(--color-chart-grid)",
  axis: "var(--color-chart-axis)",
  tick: "var(--color-chart-tick)",
  cursor: "var(--color-chart-cursor)",
  surface: "var(--color-white)",
};
const tick = { fill: C.tick, fontSize: 12 };

export function ChartCard({ title, subtitle, legend, action, children, className = "" }: { title: string; subtitle?: string; legend?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={`flex flex-col p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="font-medium text-slate-900">{title}</p>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {legend}
        {action}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </Card>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Tooltip no padrão do app. */
type TipRow = { label: string; value: string; color?: string };
interface TipProps {
  active?: boolean;
  payload?: { payload: any }[];
  title: (p: any) => ReactNode;
  rows: (p: any) => TipRow[];
}

function Tip({ active, payload, title, rows }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="min-w-40 rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-medium text-slate-900">{title(p)}</p>
      {rows(p).map((r) => (
          <p key={r.label} className="flex items-center justify-between gap-4 text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="font-medium text-slate-900 tabular">{r.value}</span>
          </p>
        ))}
    </div>
  );
}

const dayLabel = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const weekday = (iso: string) => {
  const s = new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const monthShort = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const compact = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : num(v));

/** Km rodados por dia (área, série única). */
export function DailyKmChart({ data }: { data: { day: string; km: number; services: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="kmFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.s1} stopOpacity={0.14} />
            <stop offset="100%" stopColor={C.s1} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="day" tickFormatter={dayLabel} tick={tick} tickLine={false} axisLine={{ stroke: C.axis }} interval={6} minTickGap={12} />
        <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
        <Tooltip
          cursor={{ stroke: C.axis }}
          content={<Tip title={(p: any) => weekday(p.day)} rows={(p: any) => [{ label: "Km rodados", value: `${num(p.km)} km`, color: C.s1 }, { label: "Serviços", value: num(p.services) }]} />}
        />
        <Area type="monotone" dataKey="km" stroke={C.s1} strokeWidth={2} fill="url(#kmFill)" activeDot={{ r: 5, stroke: C.surface, strokeWidth: 2, fill: C.s1 }} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Custo de manutenção por mês, empilhado por tipo. */
export function MaintenanceCostChart({ data }: { data: { month: string; preventiva: number; corretiva: number; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="month" tickFormatter={monthShort} tick={tick} tickLine={false} axisLine={{ stroke: C.axis }} />
        <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000} mil` : String(v))} width={48} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={
            <Tip
              title={(p: any) => {
                const [y, m] = p.month.split("-").map(Number);
                const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                return s.charAt(0).toUpperCase() + s.slice(1);
              }}
              rows={(p: any) => [
                { label: "Preventivas", value: money(p.preventiva), color: C.s1 },
                { label: "Corretivas", value: money(p.corretiva), color: C.s2 },
                { label: "Total", value: money(p.preventiva + p.corretiva) },
              ]}
            />
          }
        />
        {/* stroke na cor da superfície = vão de 2px entre os segmentos */}
        <Bar dataKey="preventiva" stackId="c" fill={C.s1} stroke={C.surface} strokeWidth={2} maxBarSize={24} />
        <Bar dataKey="corretiva" stackId="c" fill={C.s2} stroke={C.surface} strokeWidth={2} maxBarSize={24} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Km de cada guincho no mês (barras horizontais, valor na ponta). */
export function TruckKmChart({ data }: { data: { id: number; plate: string; km: number; services: number; model: string }[] }) {
  const rows = data.map((d) => ({ ...d, label: plateFmt(d.plate) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34 + 16)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" tick={{ ...tick, fontFamily: "ui-monospace, monospace" }} tickLine={false} axisLine={false} width={84} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={<Tip title={(p: any) => `${p.label} · ${p.model}`} rows={(p: any) => [{ label: "Km no mês", value: `${num(p.km)} km`, color: C.s1 }, { label: "Serviços", value: num(p.services) }]} />}
        />
        <Bar dataKey="km" fill={C.s1} maxBarSize={18} radius={[0, 4, 4, 0]} minPointSize={2}>
          <LabelList dataKey="km" position="right" formatter={(v: any) => `${num(Number(v))} km`} style={{ fill: C.tick, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const SHORT: Record<TruckStatus, string> = { disponivel: "Disponível", em_servico: "Em serviço", manutencao: "Manutenção", inativo: "Inativo" };

/** Barra segmentada da frota por situação (um todo dividido em partes). */
export function FleetBar({ counts }: { counts: Record<TruckStatus, number> }) {
  const order: TruckStatus[] = ["disponivel", "em_servico", "manutencao", "inativo"];
  const total = order.reduce((s, k) => s + counts[k], 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100">
        {order.map((s) =>
          counts[s] > 0 ? (
            <div key={s} className={`${TRUCK_STATUS[s].dot} first:rounded-l-full last:rounded-r-full`} style={{ width: `${(counts[s] / total) * 100}%` }} title={`${TRUCK_STATUS[s].label}: ${counts[s]}`} />
          ) : null,
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {order.map((s) => (
          <div key={s}>
            <p className="flex items-center gap-1.5 text-sm whitespace-nowrap text-slate-500">
              <span className={`size-2 shrink-0 rounded-full ${TRUCK_STATUS[s].dot}`} /> {SHORT[s]}
            </p>
            <p className="mt-0.5 text-2xl font-semibold text-slate-900 tabular">{counts[s]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lista com barras proporcionais (ranking simples, sem eixo). */
export function RankList({ rows, format = num }: { rows: { label: string; value: number; hint?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="text-slate-700">{r.label}{r.hint && <span className="text-slate-500"> · {r.hint}</span>}</span>
            <span className="font-medium text-slate-900 tabular">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: C.s1 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Faturamento x custos por mês (barras lado a lado, mesma escala em R$). */
export function RevenueCostChart({ data }: { data: { month: string; revenue: number; expenses: number; maintenance: number; documents: number }[] }) {
  const rows = data.map((d) => ({ ...d, costs: d.expenses + d.maintenance + d.documents }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="month" tickFormatter={monthShort} tick={tick} tickLine={false} axisLine={{ stroke: C.axis }} />
        <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={compact} width={68} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={
            <Tip
              title={(p: any) => {
                const [y, m] = p.month.split("-").map(Number);
                const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                return s.charAt(0).toUpperCase() + s.slice(1);
              }}
              rows={(p: any) => [
                { label: "Faturamento", value: money(p.revenue), color: C.s1 },
                { label: "Custos", value: money(p.costs), color: C.s2 },
                { label: "· despesas de viagem", value: money(p.expenses) },
                { label: "· manutenção", value: money(p.maintenance) },
                { label: "· documentos e seguros", value: money(p.documents) },
                { label: "Resultado", value: money(p.revenue - p.costs) },
              ]}
            />
          }
        />
        <Bar dataKey="revenue" fill={C.s1} maxBarSize={24} radius={[4, 4, 0, 0]} />
        <Bar dataKey="costs" fill={C.s2} maxBarSize={24} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
