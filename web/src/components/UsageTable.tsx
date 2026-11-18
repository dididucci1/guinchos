import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Route } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, elapsed, km, money, plateFmt, time, USAGE_STATUS } from "../lib/format";
import type { Usage } from "../lib/types";
import { Badge, Button, Empty, Table, notifyFleetChanged, useToast } from "./ui";
import { FinishUsageModal } from "./UsageModals";

/** Tabela do histórico de utilização (página geral e aba do guincho). */
export function UsageTable({ rows, onChange, hideTruck }: { rows: Usage[]; onChange: () => void; hideTruck?: boolean }) {
  const toast = useToast();
  const { user, can } = useAuth();
  const [finishing, setFinishing] = useState<Usage | null>(null);
  const gestao = can("admin", "operador");

  const cancel = async (u: Usage) => {
    if (!confirm(`Cancelar a saída "${u.service}"? O guincho volta a ficar disponível.`)) return;
    try {
      await api(`/usages/${u.id}/cancel`, { method: "POST" });
      toast("success", "Saída cancelada");
      notifyFleetChanged();
      onChange();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  /** Valor cobrado e despesas (o motorista vê só as despesas). */
  const finance = (u: Usage) =>
    [gestao && u.amount != null && `cobrado ${money(u.amount)}`, u.expenses_count > 0 && `despesas ${money(u.expenses_total)}`].filter(Boolean).join(" · ");

  if (!rows.length) return <Empty icon={<Route className="size-6" />} title="Nenhuma utilização encontrada" />;

  const period = (u: Usage) =>
    u.ended_at
      ? `${dateTime(u.started_at)} → ${new Date(u.ended_at).toDateString() === new Date(u.started_at).toDateString() ? time(u.ended_at) : dateTime(u.ended_at)}`
      : `${dateTime(u.started_at)} · há ${elapsed(u.started_at)}`;

  const actions = (u: Usage) =>
    u.status === "em_andamento" && (gestao || u.driver_id === user?.id) ? (
      <div className="flex justify-end gap-1">
        <Button size="sm" onClick={() => setFinishing(u)}>Retorno</Button>
        <Button size="sm" variant="ghost" onClick={() => cancel(u)}>Cancelar</Button>
      </div>
    ) : null;

  return (
    <>
      {/* Celular */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((u) => (
          <li key={u.id} className="space-y-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{u.service}</span>
              <Badge tone={USAGE_STATUS[u.status]} />
            </div>
            <p className="text-sm text-slate-600">
              {!hideTruck && <span className="font-mono font-semibold">{plateFmt(u.plate)} · </span>}
              {u.driver_name || "Sem motorista"}
              {u.client ? ` · ${u.client}` : ""}
            </p>
            {(u.origin || u.destination) && (
              <p className="flex items-center gap-1 text-xs text-slate-500">
                {u.origin || "—"} <ArrowRight className="size-3" /> {u.destination || "—"}
              </p>
            )}
            <p className="text-xs text-slate-500 tabular">{period(u)}{u.distance_km != null ? ` · ${km(u.distance_km)}` : ""}</p>
            {finance(u) && <p className="text-xs text-slate-500 tabular">{finance(u)}</p>}
            {actions(u) && <div className="pt-1">{actions(u)}</div>}
          </li>
        ))}
      </ul>

      {/* Computador */}
      <div className="hidden md:block">
        <Table head={[...(hideTruck ? [] : ["Guincho"]), "Serviço", "Trajeto", "Motorista", "Período", "Km", "Situação", ""]}>
          {rows.map((u) => (
            <tr key={u.id} className="align-top hover:bg-slate-50">
              {!hideTruck && (
                <td className="px-4 py-3 whitespace-nowrap">
                  {gestao ? (
                    <Link to={`/guinchos/${u.truck_id}`} className="font-mono font-semibold hover:text-brand-700">{plateFmt(u.plate)}</Link>
                  ) : (
                    <span className="font-mono font-semibold">{plateFmt(u.plate)}</span>
                  )}
                </td>
              )}
              <td className="min-w-48 px-4 py-3">
                <p className="text-slate-900">{u.service}</p>
                <p className="text-xs text-slate-500">{[u.client, u.vehicle].filter(Boolean).join(" · ")}</p>
                {finance(u) && <p className="text-xs text-slate-500 tabular">{finance(u)}</p>}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {u.origin || u.destination ? (
                  <span className="inline-flex flex-wrap items-center gap-1">{u.origin || "—"} <ArrowRight className="size-3 text-slate-400" /> {u.destination || "—"}</span>
                ) : "—"}
              </td>
              <td className="px-4 py-3 text-slate-600">{u.driver_name || "—"}</td>
              <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600 tabular">{period(u)}</td>
              <td className="px-4 py-3 whitespace-nowrap tabular">
                {u.distance_km != null ? <span className="font-medium text-slate-900">{km(u.distance_km)}</span> : <span className="text-xs text-slate-500">saída {km(u.start_km)}</span>}
              </td>
              <td className="px-4 py-3"><Badge tone={USAGE_STATUS[u.status]} /></td>
              <td className="px-4 py-3">{actions(u)}</td>
            </tr>
          ))}
        </Table>
      </div>

      <FinishUsageModal open={!!finishing} usage={finishing} onClose={() => setFinishing(null)} onSaved={onChange} />
    </>
  );
}
