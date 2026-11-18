import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Clock, FileWarning, Receipt, Gauge, MapPin, Plus, RefreshCw, Route, User, Weight, Wrench } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { elapsed, kg, km, money, plateFmt, time, TRUCK_KIND, TRUCK_STATUS } from "../lib/format";
import type { Maintenance, Truck, TruckStatus } from "../lib/types";
import { Button, Card, Chips, Empty, ErrorBox, PageHeader, Spinner, TruckBadge, useToast } from "../components/ui";
import { FinishUsageModal, StartUsageModal } from "../components/UsageModals";
import { CompleteMaintenanceModal } from "../components/MaintenanceModals";
import { useExpenseSheet } from "../components/ExpenseSheet";

const REFRESH_MS = 15000;
type Filter = "todos" | TruckStatus;

/** Quadro de disponibilidade: atualiza sozinho a cada 15 s e quando algo muda no app. */
export default function Availability() {
  const { user, can } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<Truck[]>("/trucks");
  const [filter, setFilter] = useState<Filter>("todos");
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState<Truck | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [finishing, setFinishing] = useState<Truck | null>(null);
  const [completing, setCompleting] = useState<Maintenance | null>(null);
  const gestao = can("admin", "operador");
  const sheet = useExpenseSheet();

  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) reload();
    }, REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 30000);
    const onChange = () => reload();
    window.addEventListener("fleet:changed", onChange);
    window.addEventListener("expenses:changed", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      clearInterval(t);
      clearInterval(clock);
      window.removeEventListener("fleet:changed", onChange);
      window.removeEventListener("expenses:changed", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [reload]);

  useEffect(() => {
    if (data) setUpdatedAt(Date.now());
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: 0, disponivel: 0, em_servico: 0, manutencao: 0, inativo: 0 };
    data?.forEach((t) => {
      c[t.status]++;
      c.todos++;
    });
    return c;
  }, [data]);

  const list = (data || []).filter((t) => filter === "todos" || t.status === filter);

  const openComplete = async (t: Truck) => {
    try {
      const [m] = await api<Maintenance[]>(`/maintenances?truck_id=${t.id}&status=em_andamento`);
      if (m) setCompleting(m);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="Disponibilidade"
        subtitle="Situação de cada guincho agora"
        actions={
          <>
            <Button variant="secondary" onClick={reload} title="Atualizar agora">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              <span className="tabular">Atualizado {time(new Date(updatedAt).toISOString())}</span>
            </Button>
            <Button onClick={() => setStartOpen(true)}>
              <Plus className="size-4" /> Registrar saída
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <Chips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todos", label: "Todos", count: counts.todos },
            ...(Object.keys(TRUCK_STATUS) as TruckStatus[]).map((s) => ({ value: s, label: TRUCK_STATUS[s].label, count: counts[s] })),
          ]}
        />
      </div>

      {error && <ErrorBox message={error} />}
      {!data && loading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <Card>
          <Empty icon={<Route className="size-6" />} title="Nenhum guincho nesta situação" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => {
            const mine = t.usage_driver_id === user?.id;
            return (
              <Card key={t.id} className={`flex flex-col overflow-hidden ${t.status === "inativo" ? "opacity-70" : ""}`}>
                <div className={`h-1 ${TRUCK_STATUS[t.status].dot}`} />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {gestao ? (
                        <Link to={`/guinchos/${t.id}`} className="font-mono text-lg font-semibold tracking-wide text-slate-900 hover:text-brand-700">
                          {plateFmt(t.plate)}
                        </Link>
                      ) : (
                        <p className="font-mono text-lg font-semibold tracking-wide text-slate-900">{plateFmt(t.plate)}</p>
                      )}
                      <p className="truncate text-sm text-slate-500">{t.model}</p>
                    </div>
                    <TruckBadge status={t.status} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Weight className="size-3.5" /> {TRUCK_KIND[t.kind]} · {kg(t.capacity_kg)}</span>
                    <span className="inline-flex items-center gap-1 tabular"><Gauge className="size-3.5" /> {km(t.odometer_km)}</span>
                    {t.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {t.location}</span>}
                  </div>

                  {t.status === "em_servico" && (
                    <div className="mt-3 rounded-lg bg-sky-50 p-3 text-sm ring-1 ring-sky-200">
                      <p className="font-medium text-sky-800">{t.usage_service}{t.usage_client ? ` · ${t.usage_client}` : ""}</p>
                      <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                        {t.usage_destination && <p className="flex items-center gap-1"><MapPin className="size-3.5" /> {t.usage_destination}</p>}
                        {t.usage_driver && <p className="flex items-center gap-1"><User className="size-3.5" /> {t.usage_driver}</p>}
                        {t.usage_started_at && <p className="flex items-center gap-1"><Clock className="size-3.5" /> Saiu há {elapsed(t.usage_started_at, now)}</p>}
                        {(gestao || mine) && t.usage_expenses > 0 && (
                          <p className="flex items-center gap-1"><Receipt className="size-3.5" /> Despesas na viagem: {money(t.usage_expenses)}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {t.status === "manutencao" && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
                      <p className="flex items-center gap-1.5 font-medium text-amber-800"><Wrench className="size-3.5" /> {t.maintenance_description || "Em manutenção"}</p>
                      <p className="mt-1 text-xs text-slate-600">Parado há {elapsed(t.status_since, now)}</p>
                    </div>
                  )}
                  {t.status === "disponivel" && <p className="mt-3 text-xs text-slate-500">Disponível há {elapsed(t.status_since, now)}</p>}
                  {gestao && t.doc_alerts > 0 && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-800">
                      <FileWarning className="size-3.5" /> {t.doc_alerts} documento{t.doc_alerts > 1 ? "s" : ""} vencido ou a vencer
                    </p>
                  )}
                </div>

                <div className="flex gap-2 border-t border-slate-100 p-3">
                  {t.status === "disponivel" && (
                    <Button size="sm" className="flex-1" onClick={() => setStarting(t)}>Registrar saída</Button>
                  )}
                  {t.status === "em_servico" && mine && t.usage_id && (
                    <Button size="sm" variant="secondary" onClick={() => sheet.openCamera({ usageId: t.usage_id!, truckId: t.id })} title="Lançar despesa desta viagem">
                      <Camera className="size-4" /> Despesa
                    </Button>
                  )}
                  {t.status === "em_servico" && (gestao || mine) && (
                    <Button size="sm" className="flex-1" onClick={() => setFinishing(t)}>Registrar retorno</Button>
                  )}
                  {t.status === "manutencao" && gestao && (
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => openComplete(t)}>Concluir manutenção</Button>
                  )}
                  {gestao && (
                    <Link to={`/guinchos/${t.id}`} className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                      Detalhes
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <StartUsageModal open={startOpen || !!starting} truck={starting} onClose={() => { setStarting(null); setStartOpen(false); }} onSaved={reload} />
      <FinishUsageModal
        open={!!finishing}
        usage={finishing && finishing.usage_id ? { id: finishing.usage_id, plate: finishing.plate, service: finishing.usage_service || "", start_km: finishing.usage_start_km ?? finishing.odometer_km } : null}
        onClose={() => setFinishing(null)}
        onSaved={reload}
      />
      <CompleteMaintenanceModal open={!!completing} maintenance={completing} onClose={() => setCompleting(null)} onSaved={reload} />
    </>
  );
}
