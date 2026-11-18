import { useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Wrench } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, daysLabel, km, MAINT_STATUS, MAINT_TYPE, money, plateFmt, PREV_SITUATION } from "../lib/format";
import type { Maintenance, PreventiveDue } from "../lib/types";
import { Badge, Button, Card, Empty, Table, notifyFleetChanged, useToast } from "./ui";
import { CompleteMaintenanceModal, MaintenanceFormModal } from "./MaintenanceModals";

/** Próxima preventiva de um guincho (por data e/ou km). */
export function PreventiveCard({ d, onSchedule }: { d: PreventiveDue; onSchedule?: () => void }) {
  const parts = [
    d.next_due_date && `${date(d.next_due_date)} (${daysLabel(d.days_left)})`,
    d.next_due_km != null && `${km(d.next_due_km)} (${d.km_left! >= 0 ? `faltam ${km(d.km_left)}` : `passou ${km(-d.km_left!)}`})`,
  ].filter(Boolean);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">Próxima preventiva</p>
          <p className="mt-0.5 font-medium text-slate-900">{d.description}</p>
        </div>
        {d.scheduled_id ? <Badge tone={MAINT_STATUS.agendada} /> : <Badge tone={PREV_SITUATION[d.situation]} />}
      </div>
      <p className="mt-2 text-sm text-slate-600 tabular">{parts.join(" ou ")}</p>
      {onSchedule && !d.scheduled_id && d.situation !== "ok" && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onSchedule}>Agendar preventiva</Button>
      )}
    </Card>
  );
}

/** Ações de etapa (iniciar, cancelar, excluir) com confirmação e aviso. */
export function useMaintenanceActions(onChange: () => void) {
  const toast = useToast();
  const run = async (m: Maintenance, path: string, msg: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    try {
      await api(`/maintenances/${m.id}${path}`, { method: path ? "POST" : "DELETE" });
      toast("success", msg);
      notifyFleetChanged();
      onChange();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };
  return {
    start: (m: Maintenance) => run(m, "/start", "Guincho em manutenção", `Iniciar agora? O guincho ${plateFmt(m.plate)} sai de operação.`),
    cancel: (m: Maintenance) => run(m, "/cancel", "Manutenção cancelada", "Cancelar esta manutenção?"),
    remove: (m: Maintenance) => run(m, "", "Manutenção excluída", "Excluir definitivamente?"),
  };
}

/** Tabela de manutenções com as ações de cada etapa. */
export function MaintenanceTable({ rows, onChange, hideTruck }: { rows: Maintenance[]; onChange: () => void; hideTruck?: boolean }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState<Maintenance | null>(null);
  const [completing, setCompleting] = useState<Maintenance | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const acts = useMaintenanceActions(onChange);
  const action = (fn: (m: Maintenance) => void, m: Maintenance) => {
    setMenu(null);
    fn(m);
  };

  if (!rows.length) return <Empty icon={<Wrench className="size-6" />} title="Nenhuma manutenção encontrada" />;

  const when = (m: Maintenance) =>
    m.status === "concluida" ? `Concluída ${date(m.completed_at)}` : m.status === "em_andamento" ? `Desde ${date(m.started_at)}` : m.scheduled_date ? `Prevista ${date(m.scheduled_date)}` : "Sem data";

  const actions = (m: Maintenance) => {
    const open = m.status === "agendada" || m.status === "em_andamento";
    return (
      <div className="relative flex justify-end gap-1">
        {m.status === "agendada" && (
          <Button size="sm" variant="secondary" onClick={() => action(acts.start, m)}>
            Iniciar
          </Button>
        )}
        {open && <Button size="sm" onClick={() => setCompleting(m)}>Concluir</Button>}
        <Button size="sm" variant="ghost" onClick={() => setMenu(menu === m.id ? null : m.id)} aria-label="Mais ações">
          <MoreHorizontal className="size-4" />
        </Button>
        {menu === m.id && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
            <div className="absolute top-9 right-0 z-20 w-44 rounded-lg bg-white py-1 text-left text-sm shadow-lg ring-1 ring-slate-200">
              <button className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setMenu(null); setEditing(m); }}>Editar</button>
              {open && (
                <button className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => action(acts.cancel, m)}>
                  Cancelar manutenção
                </button>
              )}
              {can("admin") && (
                <button className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => action(acts.remove, m)}>
                  Excluir
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((m) => (
          <li key={m.id} className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {!hideTruck && <span className="font-mono font-semibold">{plateFmt(m.plate)}</span>}
              <Badge tone={MAINT_TYPE[m.type]} />
              <Badge tone={MAINT_STATUS[m.status]} />
            </div>
            <p className="text-slate-900">{m.description}</p>
            <p className="text-xs text-slate-500">{when(m)}{m.provider ? ` · ${m.provider}` : ""}{m.cost != null ? ` · ${money(m.cost)}` : ""}</p>
            {actions(m)}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table head={[...(hideTruck ? [] : ["Guincho"]), "Serviço", "Tipo", "Data", "Km", "Custo", "Situação", ""]}>
          {rows.map((m) => (
            <tr key={m.id} className="align-top hover:bg-slate-50">
              {!hideTruck && (
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link to={`/guinchos/${m.truck_id}`} className="font-mono font-semibold hover:text-brand-700">{plateFmt(m.plate)}</Link>
                </td>
              )}
              <td className="min-w-64 px-4 py-3">
                <p className="text-slate-900">{m.description}</p>
                <p className="text-xs text-slate-500">
                  {m.provider}
                  {m.type === "preventiva" && m.status === "concluida" && (m.next_due_date || m.next_due_km) && (
                    <> · próxima {[m.next_due_date && date(m.next_due_date), m.next_due_km && km(m.next_due_km)].filter(Boolean).join(" ou ")}</>
                  )}
                </p>
              </td>
              <td className="px-4 py-3"><Badge tone={MAINT_TYPE[m.type]} /></td>
              <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">{when(m)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular">{m.odometer_km != null ? km(m.odometer_km) : "—"}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular">{m.cost != null ? money(m.cost) : "—"}</td>
              <td className="px-4 py-3"><Badge tone={MAINT_STATUS[m.status]} /></td>
              <td className="px-4 py-3">{actions(m)}</td>
            </tr>
          ))}
        </Table>
      </div>

      <MaintenanceFormModal open={!!editing} maintenance={editing} onClose={() => setEditing(null)} onSaved={onChange} />
      <CompleteMaintenanceModal open={!!completing} maintenance={completing} onClose={() => setCompleting(null)} onSaved={onChange} />
    </>
  );
}
