import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, FilePlus, MapPin, Pencil, Plus, Power, Trash2, Wrench } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { dateTime, elapsed, kg, km, money, num, plateFmt, TRUCK_KIND, TRUCK_STATUS } from "../lib/format";
import type { Expense, FleetDocument, Maintenance, PreventiveDue, TruckDetail as TD, Usage } from "../lib/types";
import { Button, Card, ErrorBox, PageHeader, Spinner, Stat, Tabs, TruckBadge, notifyFleetChanged, useToast } from "../components/ui";
import { TruckFormModal } from "../components/TruckForm";
import { FinishUsageModal, StartUsageModal } from "../components/UsageModals";
import { MaintenanceFormModal } from "../components/MaintenanceModals";
import { DocumentFormModal } from "../components/DocumentForm";
import { UsageTable } from "../components/UsageTable";
import { MaintenanceTable, PreventiveCard } from "../components/MaintenanceTable";
import { DocumentTable } from "../components/DocumentTable";
import { ExpenseList } from "../components/ExpenseList";
import { useExpenseSheet } from "../components/ExpenseSheet";

type Tab = "resumo" | "utilizacao" | "despesas" | "manutencoes" | "documentos";

export default function TruckDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("resumo");
  const [modal, setModal] = useState<"" | "edit" | "start" | "finish" | "maint" | "doc">("");
  const truck = useFetch<TD>(`/trucks/${id}`);
  const usages = useFetch<Usage[]>(`/usages?truck_id=${id}`);
  const maints = useFetch<Maintenance[]>(`/maintenances?truck_id=${id}`);
  const docs = useFetch<FleetDocument[]>(`/documents?truck_id=${id}&historico=1`);
  const due = useFetch<PreventiveDue[]>("/maintenances/due");
  const expenses = useFetch<Expense[]>(`/expenses?truck_id=${id}`);
  const sheet = useExpenseSheet();

  const reloadAll = () => {
    truck.reload();
    usages.reload();
    maints.reload();
    docs.reload();
    due.reload();
    expenses.reload();
  };

  if (truck.error) return <ErrorBox message={truck.error} />;
  const t = truck.data;
  if (!t) return <Spinner />;

  const prev = due.data?.find((d) => d.truck_id === t.id);

  const setStatus = async (status: "disponivel" | "inativo") => {
    if (status === "inativo" && !confirm(`Inativar ${plateFmt(t.plate)}? Ele sai da operação até ser reativado.`)) return;
    try {
      await api(`/trucks/${t.id}/status`, { method: "PATCH", body: { status } });
      toast("success", status === "inativo" ? "Guincho inativado" : "Guincho reativado");
      notifyFleetChanged();
      truck.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const remove = async () => {
    if (!confirm(`Excluir ${plateFmt(t.plate)} e todos os registros dele?`)) return;
    try {
      await api(`/trucks/${t.id}`, { method: "DELETE" });
      toast("success", "Guincho excluído");
      notifyFleetChanged();
      navigate("/guinchos");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <>
      <Link to="/guinchos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Guinchos
      </Link>
      <PageHeader
        title={`${plateFmt(t.plate)} · ${t.model}`}
        subtitle={[t.brand, t.year, TRUCK_KIND[t.kind], kg(t.capacity_kg)].filter(Boolean).join(" · ")}
        actions={
          <>
            {t.status === "disponivel" && <Button onClick={() => setModal("start")}><Plus className="size-4" /> Registrar saída</Button>}
            {t.status === "em_servico" && t.usage_id && <Button onClick={() => setModal("finish")}>Registrar retorno</Button>}
            <Button variant="secondary" onClick={() => setModal("edit")}><Pencil className="size-4" /> Editar</Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Situação</p>
          <div className="mt-2"><TruckBadge status={t.status} /></div>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500"><Clock className="size-3" /> há {elapsed(t.status_since)}</p>
        </Card>
        <Stat label="Quilometragem" value={num(t.odometer_km)} hint="km no hodômetro" />
        <Stat label="Rodados no mês" value={num(t.stats.month_km)} hint={`${num(t.stats.total_services)} serviços no total`} />
        <Stat label="Gasto com manutenção" value={money(t.stats.maintenance_cost)} hint="total concluído" />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "resumo", label: "Resumo" },
          { value: "utilizacao", label: "Utilização", count: usages.data?.length },
          { value: "despesas", label: "Despesas", count: expenses.data?.length },
          { value: "manutencoes", label: "Manutenções", count: maints.data?.length },
          { value: "documentos", label: "Documentos", count: docs.data?.length },
        ]}
      />

      {tab === "resumo" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {t.status === "em_servico" && (
              <Card className="p-4">
                <p className="text-sm font-medium text-slate-500">Em serviço agora</p>
                <p className="mt-1 font-medium text-slate-900">{t.usage_service}{t.usage_client ? ` · ${t.usage_client}` : ""}</p>
                <p className="text-sm text-slate-600">{[t.usage_driver, t.usage_destination].filter(Boolean).join(" · ")}</p>
                {t.usage_started_at && <p className="mt-1 text-xs text-slate-500">Saiu {dateTime(t.usage_started_at)} (há {elapsed(t.usage_started_at)})</p>}
              </Card>
            )}
            {t.status === "manutencao" && (
              <Card className="p-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800"><Wrench className="size-4" /> Em manutenção</p>
                <p className="mt-1 text-slate-900">{t.maintenance_description}</p>
                <button onClick={() => setTab("manutencoes")} className="mt-2 text-sm font-medium text-brand-700 hover:underline">Ver manutenção</button>
              </Card>
            )}
            {prev && <PreventiveCard d={prev} />}

            <Card>
              <div className="border-b border-slate-100 px-4 py-3 font-medium text-slate-900">Linha do tempo</div>
              <ol className="divide-y divide-slate-100">
                {t.events.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TRUCK_STATUS[e.to_status].dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900">
                        {e.from_status ? <>Passou para <strong>{TRUCK_STATUS[e.to_status].label.toLowerCase()}</strong></> : <strong>{TRUCK_STATUS[e.to_status].label}</strong>}
                        {e.note && <span className="text-slate-600"> — {e.note}</span>}
                      </p>
                      <p className="text-xs text-slate-500">{dateTime(e.created_at)}{e.user_name ? ` · ${e.user_name}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="p-4">
              <p className="mb-3 font-medium text-slate-900">Dados do guincho</p>
              <dl className="space-y-2 text-sm">
                {[
                  ["Placa", plateFmt(t.plate)],
                  ["Marca / modelo", [t.brand, t.model].filter(Boolean).join(" ")],
                  ["Ano", t.year || "—"],
                  ["Tipo", TRUCK_KIND[t.kind]],
                  ["Capacidade de carga", `${num(t.capacity_kg)} kg`],
                  ["Quilometragem", km(t.odometer_km)],
                  ["Km total em serviços", km(t.stats.total_km)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right text-slate-900 tabular">{v}</dd>
                  </div>
                ))}
              </dl>
              {t.location && <p className="mt-3 flex items-center gap-1 text-sm text-slate-600"><MapPin className="size-4" /> {t.location}</p>}
              {t.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-600">{t.notes}</p>}
            </Card>

            <Card className="space-y-2 p-4">
              <p className="mb-1 font-medium text-slate-900">Ações</p>
              <Button variant="secondary" className="w-full justify-start" onClick={() => setModal("maint")}><Wrench className="size-4" /> Nova manutenção</Button>
              <Button variant="secondary" className="w-full justify-start" onClick={() => setModal("doc")}><FilePlus className="size-4" /> Novo documento</Button>
              {t.status === "inativo" ? (
                <Button variant="secondary" className="w-full justify-start" onClick={() => setStatus("disponivel")}><Power className="size-4" /> Reativar guincho</Button>
              ) : (
                t.status === "disponivel" && (
                  <Button variant="secondary" className="w-full justify-start" onClick={() => setStatus("inativo")}><Power className="size-4" /> Inativar guincho</Button>
                )
              )}
              {can("admin") && (
                <Button variant="danger" className="w-full justify-start" onClick={remove}><Trash2 className="size-4" /> Excluir</Button>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "utilizacao" && <Card>{usages.data ? <UsageTable rows={usages.data} onChange={reloadAll} hideTruck /> : <Spinner />}</Card>}
      {tab === "despesas" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {expenses.data && `Total sem recusadas: ${money(expenses.data.filter((e) => e.status !== "recusada").reduce((s, e) => s + e.amount, 0))}`}
            </p>
            <Button onClick={() => sheet.open({ truckId: t.id })}><Plus className="size-4" /> Lançar despesa</Button>
          </div>
          <Card>{expenses.data ? <ExpenseList rows={expenses.data} onChange={reloadAll} hideTruck /> : <Spinner />}</Card>
        </div>
      )}
      {tab === "manutencoes" && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button onClick={() => setModal("maint")}><Plus className="size-4" /> Nova manutenção</Button></div>
          <Card>{maints.data ? <MaintenanceTable rows={maints.data} onChange={reloadAll} hideTruck /> : <Spinner />}</Card>
        </div>
      )}
      {tab === "documentos" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Inclui documentos anteriores já renovados.</p>
            <Button onClick={() => setModal("doc")}><Plus className="size-4" /> Novo documento</Button>
          </div>
          <Card>{docs.data ? <DocumentTable rows={docs.data} onChange={reloadAll} hideTruck /> : <Spinner />}</Card>
        </div>
      )}

      <TruckFormModal open={modal === "edit"} truck={t} onClose={() => setModal("")} onSaved={reloadAll} />
      <StartUsageModal open={modal === "start"} truck={t} onClose={() => setModal("")} onSaved={reloadAll} />
      <FinishUsageModal
        open={modal === "finish"}
        usage={t.usage_id ? { id: t.usage_id, plate: t.plate, service: t.usage_service || "", start_km: t.usage_start_km ?? t.odometer_km } : null}
        onClose={() => setModal("")}
        onSaved={reloadAll}
      />
      <MaintenanceFormModal open={modal === "maint"} truckId={t.id} onClose={() => setModal("")} onSaved={reloadAll} />
      <DocumentFormModal open={modal === "doc"} truckId={t.id} onClose={() => setModal("")} onSaved={reloadAll} />
    </>
  );
}
