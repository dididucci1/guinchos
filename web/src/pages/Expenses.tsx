import { useEffect, useMemo, useState } from "react";
import { Camera, HandCoins, Plus, Search } from "lucide-react";
import { api, qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { addDays, EXPENSE_CATEGORY, EXPENSE_STATUS, money, num, plateFmt, todayISO } from "../lib/format";
import { notifyExpensesChanged } from "../lib/outbox";
import type { Driver, Expense, ExpenseCategory, Truck } from "../lib/types";
import { Button, Card, Chips, ErrorBox, Input, PageHeader, Select, Spinner, Stat, useToast } from "../components/ui";
import { ExpenseList } from "../components/ExpenseList";
import { useExpenseSheet } from "../components/ExpenseSheet";

type View = "pendente" | "aprovada" | "recusada" | "reembolsar" | "";

const useExpensesChanged = (fn: () => void) =>
  useEffect(() => {
    window.addEventListener("expenses:changed", fn);
    return () => window.removeEventListener("expenses:changed", fn);
  }, [fn]);

export default function Expenses() {
  const { can } = useAuth();
  return can("admin", "operador") ? <Conference /> : <MyExpenses />;
}

/* ---------- Motorista ---------- */
function MyExpenses() {
  const sheet = useExpenseSheet();
  const [view, setView] = useState<"" | "pendente" | "recusada">("");
  const list = useFetch<Expense[]>(`/expenses${qs({ status: view, from: view ? undefined : addDays(todayISO(), -60) })}`);
  const all = useFetch<Expense[]>(`/expenses?from=${addDays(todayISO(), -365)}`);
  const reload = () => { list.reload(); all.reload(); };
  useExpensesChanged(list.reload);
  useExpensesChanged(all.reload);

  const rows = all.data || [];
  const pending = rows.filter((e) => e.status === "pendente");
  const toReceive = rows.filter((e) => e.status === "aprovada" && e.paid_by === "motorista" && !e.reimbursed_at);
  const refused = rows.filter((e) => e.status === "recusada");
  const sum = (l: Expense[]) => l.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader title="Minhas despesas" subtitle="Pneu, diesel, pedágio, comida… tire a foto da nota e pronto." />

      {/* Ação principal, grande para usar com uma mão */}
      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto]">
        <button
          onClick={() => sheet.openCamera()}
          className="flex h-16 items-center justify-center gap-3 rounded-xl bg-brand-600 text-lg font-semibold text-onbrand shadow-sm active:scale-[0.99]"
        >
          <Camera className="size-6" /> Tirar foto da nota
        </button>
        <Button variant="secondary" className="h-12 sm:h-16" onClick={() => sheet.open()}>
          <Plus className="size-4" /> Lançar sem foto
        </Button>
      </div>

      <Card className="mb-5 grid grid-cols-3 divide-x divide-slate-100">
        {[
          { label: "A conferir", value: money(sum(pending)), hint: `${num(pending.length)} despesa${pending.length === 1 ? "" : "s"}`, tone: EXPENSE_STATUS.pendente },
          { label: "A receber", value: money(sum(toReceive)), hint: "pagas por você", tone: EXPENSE_STATUS.aprovada },
          { label: "Recusadas", value: num(refused.length), hint: refused.length ? "veja o motivo" : "nenhuma", tone: EXPENSE_STATUS.recusada },
        ].map((x) => (
          <div key={x.label} className="min-w-0 p-3 sm:p-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-500 sm:text-sm"><span className={`size-2 shrink-0 rounded-full ${x.tone.dot}`} /> {x.label}</p>
            <p className="mt-1 truncate text-base font-semibold text-slate-900 tabular sm:text-2xl">{x.value}</p>
            <p className="truncate text-xs text-slate-500">{x.hint}</p>
          </div>
        ))}
      </Card>

      <div className="mb-3">
        <Chips
          value={view}
          onChange={setView}
          options={[
            { value: "", label: "Últimos 60 dias" },
            { value: "pendente", label: "A conferir", count: pending.length },
            { value: "recusada", label: "Recusadas", count: refused.length },
          ]}
        />
      </div>
      {list.error && <ErrorBox message={list.error} />}
      <Card>{!list.data ? <Spinner /> : <ExpenseList rows={list.data} onChange={reload} emptyText="Quando você lançar uma despesa ela aparece aqui." />}</Card>
    </>
  );
}

/* ---------- Escritório: conferência ---------- */
function Conference() {
  const toast = useToast();
  const sheet = useExpenseSheet();
  const [view, setView] = useState<View>("pendente");
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [category, setCategory] = useState<"" | ExpenseCategory>("");
  const [from, setFrom] = useState(addDays(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [q, setQ] = useState("");

  const trucks = useFetch<Truck[]>("/trucks");
  const drivers = useFetch<Driver[]>("/users/drivers");
  // "A conferir" e "A reembolsar" mostram tudo o que está em aberto, sem limite de data.
  const open = view === "pendente" || view === "reembolsar";
  const list = useFetch<Expense[]>(
    `/expenses${qs({
      status: view === "reembolsar" ? "" : view,
      reembolsar: view === "reembolsar" ? 1 : undefined,
      truck_id: truckId,
      driver_id: driverId,
      category,
      from: open ? undefined : from,
      to: open ? undefined : to,
      q,
    })}`,
  );
  const pending = useFetch<Expense[]>("/expenses?status=pendente");
  const owed = useFetch<Expense[]>("/expenses?reembolsar=1");
  const period = useFetch<Expense[]>(`/expenses${qs({ from, to })}`);
  const reload = () => { list.reload(); pending.reload(); owed.reload(); period.reload(); };
  useExpensesChanged(list.reload);
  useExpensesChanged(pending.reload);
  useExpensesChanged(owed.reload);
  useExpensesChanged(period.reload);

  const sum = (l: Expense[] | null) => (l || []).reduce((s, e) => s + e.amount, 0);
  const periodValid = (period.data || []).filter((e) => e.status !== "recusada");

  const byDriver = useMemo(() => {
    const m = new Map<string, { name: string; ids: number[]; amount: number }>();
    for (const e of view === "reembolsar" ? list.data || [] : []) {
      const k = String(e.driver_id ?? 0);
      const g = m.get(k) ?? { name: e.driver_name || "Sem motorista", ids: [], amount: 0 };
      g.ids.push(e.id);
      g.amount += e.amount;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [list.data, view]);

  const payDriver = async (g: { name: string; ids: number[]; amount: number }) => {
    if (!confirm(`Confirmar que ${g.name} recebeu ${money(g.amount)} (${g.ids.length} despesa${g.ids.length > 1 ? "s" : ""})?`)) return;
    try {
      await api("/expenses/reimburse", { body: { ids: g.ids } });
      toast("success", `Reembolso de ${g.name} registrado`);
      notifyExpensesChanged();
      reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Despesas de viagem"
        subtitle="Notas enviadas pelos motoristas: confira a foto, aprove ou recuse e controle o reembolso"
        actions={<Button onClick={() => sheet.open()}><Plus className="size-4" /> Lançar despesa</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="A conferir" value={num(pending.data?.length ?? 0)} hint={money(sum(pending.data))} tone={EXPENSE_STATUS.pendente} />
        <Stat label="A reembolsar" value={money(sum(owed.data))} hint="aprovadas, pagas pelos motoristas" />
        <Stat label="Despesas no período" value={money(sum(periodValid))} hint={`${num(periodValid.length)} lançamentos, sem recusadas`} />
        <Stat
          label="Com foto da nota"
          value={periodValid.length ? `${Math.round((periodValid.filter((e) => e.photo_ids.length).length / periodValid.length) * 100)}%` : "—"}
          hint="no período"
        />
      </div>

      <Card className="mb-4 p-4">
        <Chips<View>
          value={view}
          onChange={setView}
          options={[
            { value: "pendente", label: "A conferir", count: pending.data?.length },
            { value: "reembolsar", label: "A reembolsar", count: owed.data?.length },
            { value: "aprovada", label: "Aprovadas" },
            { value: "recusada", label: "Recusadas" },
            { value: "", label: "Todas" },
          ]}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Observação, motorista, placa" className="pl-9" />
          </div>
          <Select value={truckId} onChange={(e) => setTruckId(e.target.value)} aria-label="Guincho">
            <option value="">Todos os guinchos</option>
            {trucks.data?.map((t) => <option key={t.id} value={t.id}>{plateFmt(t.plate)}</option>)}
          </Select>
          <Select value={driverId} onChange={(e) => setDriverId(e.target.value)} aria-label="Motorista">
            <option value="">Todos os motoristas</option>
            {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | "")} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            {(Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[]).map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY[c]}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2" title={open ? "Em aberto: mostra tudo, sem limite de data" : undefined}>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" disabled={open} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" disabled={open} />
          </div>
        </div>
      </Card>

      {view === "reembolsar" && byDriver.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {byDriver.map((g) => (
            <Card key={g.name} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{g.name}</p>
                <p className="text-sm text-slate-500">{g.ids.length} despesa{g.ids.length > 1 ? "s" : ""} · <strong className="text-slate-900 tabular">{money(g.amount)}</strong></p>
              </div>
              <Button size="sm" onClick={() => payDriver(g)}><HandCoins className="size-4" /> Paguei</Button>
            </Card>
          ))}
        </div>
      )}

      {list.error && <ErrorBox message={list.error} />}
      <Card>
        {!list.data ? (
          <Spinner />
        ) : (
          <ExpenseList rows={list.data} onChange={reload} emptyText={view === "pendente" ? "Tudo conferido por aqui." : undefined} />
        )}
      </Card>
    </>
  );
}
