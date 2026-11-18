import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, Clock, Gauge, Pencil, Plus, Search, Store, Wrench } from "lucide-react";
import { qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { addDays, date, daysLabel, elapsed, km, MAINT_STATUS, MAINT_TYPE, money, num, plateFmt, PREV_SITUATION, todayISO } from "../lib/format";
import type { Maintenance, MaintenanceType, PreventiveDue, Truck } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Input, PageHeader, Select, Spinner, Stat, Table, Tabs } from "../components/ui";
import { CompleteMaintenanceModal, MaintenanceFormModal } from "../components/MaintenanceModals";
import { useMaintenanceActions } from "../components/MaintenanceTable";

type Bottom = "historico" | "plano";

/**
 * Manutenções em três blocos de trabalho (na oficina, agendadas, preventivas a fazer)
 * e, abaixo, o histórico e o plano de preventivas da frota.
 */
export default function Maintenances() {
  const [formOpen, setFormOpen] = useState<{ truckId?: number; maintenance?: Maintenance } | null>(null);
  const [completing, setCompleting] = useState<Maintenance | null>(null);
  const [bottom, setBottom] = useState<Bottom>("historico");

  const open = useFetch<Maintenance[]>("/maintenances?open=1");
  const due = useFetch<PreventiveDue[]>("/maintenances/due");
  const [hist, setHist] = useState({ truck_id: "", type: "" as "" | MaintenanceType, from: addDays(todayISO(), -180), to: todayISO(), q: "" });
  const history = useFetch<Maintenance[]>(`/maintenances${qs({ closed: "1", ...hist })}`);
  const trucks = useFetch<Truck[]>("/trucks");

  const reload = () => {
    open.reload();
    due.reload();
    history.reload();
  };
  const acts = useMaintenanceActions(reload);

  const inShop = open.data?.filter((m) => m.status === "em_andamento") || [];
  const scheduled = (open.data?.filter((m) => m.status === "agendada") || []).sort((a, b) => (a.scheduled_date || "9999").localeCompare(b.scheduled_date || "9999"));
  const todo = due.data?.filter((d) => d.situation !== "ok" && !d.scheduled_id) || [];
  const overdue = todo.filter((d) => d.situation === "vencida").length;

  const ym = todayISO().slice(0, 7);
  const monthCost = (history.data || []).filter((m) => m.status === "concluida" && m.completed_at?.startsWith(ym)).reduce((s, m) => s + (m.cost || 0), 0);
  const done = (history.data || []).filter((m) => m.status === "concluida");
  const histCost = done.reduce((s, m) => s + (m.cost || 0), 0);

  return (
    <>
      <PageHeader
        title="Manutenções"
        subtitle="O que está na oficina, o que vem pela frente e o histórico"
        actions={<Button onClick={() => setFormOpen({})}><Plus className="size-4" /> Nova manutenção</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Na oficina agora" value={num(inShop.length)} hint={inShop.length ? "guinchos fora de operação" : "nenhum guincho parado"} tone={MAINT_STATUS.em_andamento} />
        <Stat label="Agendadas" value={num(scheduled.length)} hint={scheduled[0]?.scheduled_date ? `próxima ${date(scheduled[0].scheduled_date)}` : "nada agendado"} tone={MAINT_STATUS.agendada} />
        <Stat label="Preventivas a fazer" value={num(todo.length)} hint={overdue ? `${overdue} vencida${overdue > 1 ? "s" : ""}` : "nenhuma vencida"} tone={overdue ? PREV_SITUATION.vencida : PREV_SITUATION.proxima} />
        <Stat label="Gasto no mês" value={money(monthCost)} hint="manutenções concluídas" />
      </div>

      {open.error && <ErrorBox message={open.error} />}

      {/* Quadro de trabalho */}
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Column title="Na oficina agora" tone={MAINT_STATUS.em_andamento} count={inShop.length} loading={!open.data} empty="Nenhum guincho na oficina.">
          {inShop.map((m) => (
            <WorkCard key={m.id} m={m}>
              <p className="flex items-center gap-1 text-xs text-slate-500"><Clock className="size-3.5" /> Parado há {elapsed(m.started_at || m.created_at)}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => setCompleting(m)}><CheckCircle2 className="size-4" /> Concluir</Button>
                <Button size="sm" variant="ghost" onClick={() => acts.cancel(m)}>Cancelar</Button>
              </div>
            </WorkCard>
          ))}
        </Column>

        <Column title="Agendadas" tone={MAINT_STATUS.agendada} count={scheduled.length} loading={!open.data} empty="Nenhuma manutenção agendada.">
          {scheduled.map((m) => {
            const late = m.scheduled_date && m.scheduled_date < todayISO();
            return (
              <WorkCard key={m.id} m={m}>
                <p className={`flex items-center gap-1 text-xs ${late ? "font-medium text-red-600" : "text-slate-500"}`}>
                  <CalendarClock className="size-3.5" />
                  {m.scheduled_date ? `${date(m.scheduled_date)} · ${daysLabel(Math.round((new Date(m.scheduled_date + "T12:00:00").getTime() - new Date(todayISO() + "T12:00:00").getTime()) / 86400000), "previsto")}` : "Sem data definida"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => acts.start(m)}>Levar à oficina</Button>
                  <Button size="sm" variant="ghost" onClick={() => setFormOpen({ maintenance: m })} aria-label="Editar"><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => acts.cancel(m)}>Cancelar</Button>
                </div>
              </WorkCard>
            );
          })}
        </Column>

        <Column title="Preventivas a fazer" tone={overdue ? PREV_SITUATION.vencida : PREV_SITUATION.proxima} count={todo.length} loading={!due.data} empty="Todas as preventivas em dia.">
          {todo.map((d) => (
            <div key={d.truck_id} className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/guinchos/${d.truck_id}`} className="font-mono font-semibold text-slate-900 hover:text-brand-700">{plateFmt(d.plate)}</Link>
                <Badge tone={PREV_SITUATION[d.situation]} />
              </div>
              <p className="mt-1 text-sm text-slate-700">{d.description}</p>
              <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                {d.next_due_date && <p className="flex items-center gap-1"><CalendarClock className="size-3.5" /> {date(d.next_due_date)} · {daysLabel(d.days_left)}</p>}
                {d.next_due_km != null && (
                  <p className="flex items-center gap-1 tabular">
                    <Gauge className="size-3.5" /> {km(d.next_due_km)} · {d.km_left! >= 0 ? `faltam ${km(d.km_left)}` : `passou ${km(-d.km_left!)}`}
                  </p>
                )}
              </div>
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setFormOpen({ truckId: d.truck_id })}>Agendar preventiva</Button>
            </div>
          ))}
        </Column>
      </div>

      {/* Histórico e plano */}
      <Tabs<Bottom>
        value={bottom}
        onChange={setBottom}
        tabs={[
          { value: "historico", label: "Histórico" },
          { value: "plano", label: "Plano de preventivas da frota" },
        ]}
      />

      {bottom === "historico" && (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={hist.q} onChange={(e) => setHist({ ...hist, q: e.target.value })} placeholder="Serviço ou oficina" className="pl-9" />
            </div>
            <Select value={hist.truck_id} onChange={(e) => setHist({ ...hist, truck_id: e.target.value })} aria-label="Guincho">
              <option value="">Todos os guinchos</option>
              {trucks.data?.map((t) => <option key={t.id} value={t.id}>{plateFmt(t.plate)} · {t.model}</option>)}
            </Select>
            <Select value={hist.type} onChange={(e) => setHist({ ...hist, type: e.target.value as "" | MaintenanceType })} aria-label="Tipo">
              <option value="">Preventivas e corretivas</option>
              <option value="preventiva">Só preventivas</option>
              <option value="corretiva">Só corretivas</option>
            </Select>
            <Input type="date" value={hist.from} onChange={(e) => setHist({ ...hist, from: e.target.value })} aria-label="De" />
            <Input type="date" value={hist.to} onChange={(e) => setHist({ ...hist, to: e.target.value })} aria-label="Até" />
          </div>
          {history.data && (
            <p className="mb-2 text-sm text-slate-500">
              {num(done.length)} concluídas · <strong className="font-medium text-slate-800 tabular">{money(histCost)}</strong> no período
            </p>
          )}
          <Card>
            {!history.data ? (
              <Spinner />
            ) : !history.data.length ? (
              <p className="p-6 text-center text-sm text-slate-500">Nenhuma manutenção encerrada no período.</p>
            ) : (
              <HistoryTable rows={history.data} onEdit={(m) => setFormOpen({ maintenance: m })} onRemove={acts.remove} />
            )}
          </Card>
        </>
      )}

      {bottom === "plano" && <PreventivePlan rows={due.data} onSchedule={(truckId) => setFormOpen({ truckId })} />}

      <MaintenanceFormModal open={!!formOpen} maintenance={formOpen?.maintenance} truckId={formOpen?.truckId} onClose={() => setFormOpen(null)} onSaved={reload} />
      <CompleteMaintenanceModal open={!!completing} maintenance={completing} onClose={() => setCompleting(null)} onSaved={reload} />
    </>
  );
}

/** Coluna do quadro de trabalho. */
function Column({ title, tone, count, loading, empty, children }: { title: string; tone: { dot: string }; count: number; loading: boolean; empty: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl bg-slate-100/70 p-3 ring-1 ring-slate-200/70">
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className={`size-2 rounded-full ${tone.dot}`} />
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 tabular ring-1 ring-slate-200">{count}</span>
      </header>
      {loading ? (
        <Spinner className="py-6" />
      ) : count === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-sm text-slate-500">
          <CheckCircle2 className="size-4 text-green-600" /> {empty}
        </p>
      ) : (
        <div className="max-h-[520px] space-y-2.5 overflow-y-auto">{children}</div>
      )}
    </section>
  );
}

/** Cartão de uma manutenção aberta. */
function WorkCard({ m, children }: { m: Maintenance; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/guinchos/${m.truck_id}`} className="font-mono font-semibold text-slate-900 hover:text-brand-700">{plateFmt(m.plate)}</Link>
        <Badge tone={MAINT_TYPE[m.type]} />
      </div>
      <p className="mt-1 text-sm text-slate-700">{m.description}</p>
      {m.provider && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Store className="size-3.5" /> {m.provider}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Histórico de manutenções encerradas. */
function HistoryTable({ rows, onEdit, onRemove }: { rows: Maintenance[]; onEdit: (m: Maintenance) => void; onRemove: (m: Maintenance) => void }) {
  const { can } = useAuth();
  return (
    <>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((m) => (
          <li key={m.id} className="space-y-1 p-4" onClick={() => onEdit(m)}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold">{plateFmt(m.plate)}</span>
              <span className="text-sm font-medium text-slate-900 tabular">{m.cost != null ? money(m.cost) : "—"}</span>
            </div>
            <p className="text-slate-800">{m.description}</p>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Badge tone={MAINT_TYPE[m.type]} /> {date(m.completed_at || m.created_at)}{m.status === "cancelada" && " · cancelada"}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table head={["Data", "Guincho", "Serviço", "Tipo", "Km", "Custo", ""]}>
          {rows.map((m) => (
            <tr key={m.id} className={`group hover:bg-slate-50 ${m.status === "cancelada" ? "opacity-60" : ""}`}>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular">{date(m.completed_at || m.created_at)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <Link to={`/guinchos/${m.truck_id}`} className="font-mono font-semibold hover:text-brand-700">{plateFmt(m.plate)}</Link>
              </td>
              <td className="min-w-64 px-4 py-3">
                <p className="text-slate-900">{m.description}{m.status === "cancelada" && <span className="ml-2 text-xs text-slate-500">(cancelada)</span>}</p>
                {m.provider && <p className="text-xs text-slate-500">{m.provider}</p>}
              </td>
              <td className="px-4 py-3"><Badge tone={MAINT_TYPE[m.type]} /></td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular">{m.odometer_km != null ? km(m.odometer_km) : "—"}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-slate-900 tabular">{m.cost != null ? money(m.cost) : "—"}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <span className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(m)}>Editar</Button>
                  {can("admin") && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => onRemove(m)}>Excluir</Button>}
                </span>
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}

/** Plano de preventivas: a próxima de cada guincho. */
function PreventivePlan({ rows, onSchedule }: { rows: PreventiveDue[] | null; onSchedule: (truckId: number) => void }) {
  if (!rows) return <Spinner />;
  return (
    <>
      <p className="mb-3 text-sm text-slate-500">
        A próxima preventiva vem da última concluída de cada guincho. Avisamos 15 dias ou 1.000 km antes.
      </p>
      <Card>
        {!rows.length ? (
          <p className="p-6 text-center text-sm text-slate-500">Nenhuma preventiva com próxima data/km. Ao concluir uma preventiva, informe quando será a próxima.</p>
        ) : (
          <Table head={["Guincho", "Última preventiva", "Próxima por data", "Próxima por km", "Situação", ""]}>
            {rows.map((d) => (
              <tr key={d.truck_id} className="hover:bg-slate-50">
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link to={`/guinchos/${d.truck_id}`} className="font-mono font-semibold hover:text-brand-700">{plateFmt(d.plate)}</Link>
                  <p className="text-xs text-slate-500">{d.model}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{d.description}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {d.next_due_date ? <><p className="tabular">{date(d.next_due_date)}</p><p className="text-xs text-slate-500">{daysLabel(d.days_left)}</p></> : "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {d.next_due_km != null ? (
                    <><p className="tabular">{km(d.next_due_km)}</p><p className="text-xs text-slate-500">{d.km_left! >= 0 ? `faltam ${km(d.km_left)}` : `passou ${km(-d.km_left!)}`}</p></>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">{d.scheduled_id ? <Badge tone={MAINT_STATUS.agendada} /> : <Badge tone={PREV_SITUATION[d.situation]} />}</td>
                <td className="px-4 py-3 text-right">
                  {!d.scheduled_id && d.situation !== "ok" && <Button size="sm" variant="secondary" onClick={() => onSchedule(d.truck_id)}>Agendar</Button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
