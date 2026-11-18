import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, HandCoins, Pencil, Receipt } from "lucide-react";
import { api, qs } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { addDays, dateTime, EXPENSE_CATEGORY, km, money, num, parseMoney, plateFmt, todayISO } from "../lib/format";
import type { FinanceData } from "../lib/types";
import { Card, Chips, ErrorBox, Input, PageHeader, Spinner, Stat, Table, useToast } from "../components/ui";
import { ChartCard, Legend, RankList, RevenueCostChart } from "../components/charts";

type Preset = "mes" | "anterior" | "3m" | "12m" | "custom";

function range(p: Preset): [string, string] {
  const now = new Date();
  const iso = (d: Date) => d.toLocaleDateString("en-CA");
  if (p === "mes") return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), todayISO()];
  if (p === "anterior") return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (p === "3m") return [addDays(todayISO(), -90), todayISO()];
  return [addDays(todayISO(), -365), todayISO()];
}

const pct = (v: number, base: number) => (base ? `${Math.round((v / base) * 100)}%` : "—");

export default function Finance() {
  const [preset, setPreset] = useState<Preset>("mes");
  const [[from, to], setRange] = useState(range("mes"));
  const { data, error, loading, reload } = useFetch<FinanceData>(`/finance${qs({ from, to })}`);

  useEffect(() => {
    window.addEventListener("expenses:changed", reload);
    return () => window.removeEventListener("expenses:changed", reload);
  }, [reload]);

  const choose = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") setRange(range(p));
  };

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Quanto cada viagem e cada guincho rendeu e custou" />

      <Card className="mb-5 flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <Chips<Preset>
          value={preset}
          onChange={choose}
          options={[
            { value: "mes", label: "Este mês" },
            { value: "anterior", label: "Mês passado" },
            { value: "3m", label: "90 dias" },
            { value: "12m", label: "12 meses" },
            { value: "custom", label: "Período" },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 lg:w-80">
          <Input type="date" value={from} onChange={(e) => { setPreset("custom"); setRange([e.target.value, to]); }} aria-label="De" />
          <Input type="date" value={to} onChange={(e) => { setPreset("custom"); setRange([from, e.target.value]); }} aria-label="Até" />
        </div>
      </Card>

      {error && <ErrorBox message={error} />}
      {!data ? (
        loading && <Spinner />
      ) : (
        <Content data={data} reload={reload} />
      )}
    </>
  );
}

function Content({ data, reload }: { data: FinanceData; reload: () => void }) {
  const t = data.totals;
  const costs = t.expenses + t.maintenance + t.documents;
  const result = t.revenue - costs;
  const owed = data.reimburse.reduce((s, r) => s + r.amount, 0);
  const [allTrips, setAllTrips] = useState(false);
  const trips = allTrips ? data.trips : data.trips.slice(0, 50);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Faturamento" value={money(t.revenue)} hint={`${num(t.trips)} viagens · ${km(t.km)}`} />
        <Stat
          label="Custos"
          value={money(costs)}
          hint={`viagem ${money(t.expenses)} · manutenção ${money(t.maintenance)}${t.documents ? ` · documentos ${money(t.documents)}` : ""}`}
        />
        <Stat
          label="Resultado"
          value={<span className={result < 0 ? "text-red-600" : ""}>{money(result)}</span>}
          hint={t.revenue ? `margem de ${pct(result, t.revenue)}` : "sem faturamento no período"}
        />
        <Stat label="Custo por km" value={t.km ? money(costs / t.km) : "—"} hint={t.km ? `faturamento ${money(t.revenue / t.km)}/km` : "sem km no período"} />
      </div>

      {(t.trips_without_amount > 0 || t.expenses_pending_count > 0 || owed > 0) && (
        <div className="mb-5 grid gap-3 lg:grid-cols-3">
          {t.trips_without_amount > 0 && (
            <Notice icon={<AlertTriangle className="size-4" />} tone="amber">
              <strong>{t.trips_without_amount}</strong> viage{t.trips_without_amount > 1 ? "ns" : "m"} sem valor cobrado — o faturamento está menor que o real. Defina na tabela abaixo.
            </Notice>
          )}
          {t.expenses_pending_count > 0 && (
            <Notice icon={<Receipt className="size-4" />} tone="amber" to="/despesas">
              <strong>{money(t.expenses_pending)}</strong> em {t.expenses_pending_count} despesa{t.expenses_pending_count > 1 ? "s" : ""} aguardando conferência (já somadas nos custos).
            </Notice>
          )}
          {owed > 0 && (
            <Notice icon={<HandCoins className="size-4" />} tone="slate" to="/despesas">
              <strong>{money(owed)}</strong> a reembolsar: {data.reimburse.map((r) => `${r.driver_name || "sem motorista"} ${money(r.amount)}`).join(" · ")}
            </Notice>
          )}
        </div>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Faturamento x custos"
          subtitle="Últimos 6 meses até o fim do período"
          legend={<Legend items={[{ label: "Faturamento", color: "var(--color-series-1)" }, { label: "Custos", color: "var(--color-series-2)" }]} />}
        >
          <RevenueCostChart data={data.monthly} />
        </ChartCard>
        <ChartCard title="Despesas de viagem por tipo" subtitle="No período, sem recusadas">
          {data.byCategory.length ? (
            <RankList format={money} rows={data.byCategory.map((c) => ({ label: EXPENSE_CATEGORY[c.category], value: c.amount, hint: `${c.count}×` }))} />
          ) : (
            <p className="text-sm text-slate-500">Nenhuma despesa lançada no período.</p>
          )}
        </ChartCard>
      </div>

      <Card className="mb-5">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="font-medium text-slate-900">Resultado por guincho</p>
          <p className="text-sm text-slate-500">Faturamento das viagens menos despesas, manutenção e documentos do período</p>
        </div>
        <Table head={["Guincho", "Viagens", "Km", "Faturamento", "Despesas viagem", "Manutenção", "Documentos", "Resultado", "Custo/km"]}>
          {data.byTruck.map((r) => {
            const c = r.expenses + r.maintenance + r.documents;
            const res = r.revenue - c;
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link to={`/guinchos/${r.id}`} className="font-mono font-semibold hover:text-brand-700">{plateFmt(r.plate)}</Link>
                  <p className="text-xs text-slate-500">{r.model}</p>
                </td>
                <td className="px-4 py-3 tabular">{num(r.trips)}</td>
                <td className="px-4 py-3 whitespace-nowrap tabular">{num(r.km)}</td>
                <td className="px-4 py-3 whitespace-nowrap tabular">{money(r.revenue)}</td>
                <td className="px-4 py-3 whitespace-nowrap tabular text-slate-600">{money(r.expenses)}</td>
                <td className="px-4 py-3 whitespace-nowrap tabular text-slate-600">{money(r.maintenance)}</td>
                <td className="px-4 py-3 whitespace-nowrap tabular text-slate-600">{money(r.documents)}</td>
                <td className={`px-4 py-3 font-medium whitespace-nowrap tabular ${res < 0 ? "text-red-600" : "text-slate-900"}`}>{money(res)}</td>
                <td className="px-4 py-3 whitespace-nowrap tabular text-slate-600">{r.km ? money(c / r.km) : "—"}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="font-medium text-slate-900">Viagens</p>
          <p className="text-sm text-slate-500">Valor cobrado menos as despesas lançadas na viagem. Clique no valor para corrigir.</p>
        </div>
        {data.trips.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nenhuma viagem concluída no período.</p>
        ) : (
          <Table head={["Data", "Guincho", "Serviço", "Motorista", "Km", "Valor cobrado", "Despesas", "Resultado"]}>
            {trips.map((r) => {
              const res = r.amount != null ? r.amount - r.expenses : null;
              return (
                <tr key={r.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600 tabular">{dateTime(r.started_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/guinchos/${r.truck_id}`} className="font-mono font-semibold hover:text-brand-700">{plateFmt(r.plate)}</Link>
                  </td>
                  <td className="min-w-44 px-4 py-3">
                    <p className="text-slate-900">{r.service}</p>
                    <p className="text-xs text-slate-500">{[r.client, r.destination].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.driver_name || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular">{num(r.distance_km)}</td>
                  <td className="px-4 py-3"><AmountCell id={r.id} amount={r.amount} onSaved={reload} /></td>
                  <td className="px-4 py-3 whitespace-nowrap tabular">
                    {r.expense_count ? (
                      <Link to={`/despesas`} className="text-slate-700 hover:text-brand-700" title={r.pending_count ? `${r.pending_count} a conferir` : undefined}>
                        {money(r.expenses)} <span className="text-xs text-slate-500">({r.expense_count}{r.pending_count ? `, ${r.pending_count} a conferir` : ""})</span>
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-medium whitespace-nowrap tabular ${res != null && res < 0 ? "text-red-600" : "text-slate-900"}`}>
                    {res != null ? money(res) : <span className="font-normal text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        {data.trips.length > trips.length && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button onClick={() => setAllTrips(true)} className="text-sm font-medium text-brand-700 hover:underline">
              Mostrar todas as {data.trips.length} viagens
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

function Notice({ icon, tone, to, children }: { icon: ReactNode; tone: "amber" | "slate"; to?: string; children: ReactNode }) {
  const cls = tone === "amber" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-slate-700 ring-slate-200";
  const body = (
    <div className={`flex h-full items-start gap-2 rounded-xl px-4 py-3 text-sm ring-1 ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
  return to ? <Link to={to} className="block hover:opacity-90">{body}</Link> : body;
}

/** Valor cobrado editável direto na tabela. */
function AmountCell({ id, amount, onSaved }: { id: number; amount: number | null; onSaved: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    const v = value.trim() ? parseMoney(value) : null;
    if (v != null && (!Number.isFinite(v) || v < 0)) return toast("error", "Valor inválido");
    setSaving(true);
    try {
      await api(`/finance/trips/${id}`, { method: "PATCH", body: { amount: v } });
      setEditing(false);
      onSaved();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (editing)
    return (
      <form onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); }} className="flex w-36 gap-1">
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-8 px-2" disabled={saving} onBlur={save} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} />
      </form>
    );
  return (
    <button
      onClick={() => { setValue(amount != null ? String(amount).replace(".", ",") : ""); setEditing(true); }}
      className={`group inline-flex items-center gap-1 whitespace-nowrap tabular ${amount == null ? "rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200" : "text-slate-900"}`}
    >
      {amount != null ? money(amount) : "Definir valor"}
      <Pencil className="size-3 text-slate-400 opacity-0 group-hover:opacity-100" />
    </button>
  );
}
