import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { date, daysLabel, DOC_SITUATION, DOC_TYPE, money, plateFmt } from "../lib/format";
import type { FleetDocument } from "../lib/types";
import { Badge, Button, Empty, Table, notifyFleetChanged, useToast } from "./ui";
import { DocumentFormModal } from "./DocumentForm";

/** Tabela de documentos com renovação/edição. */
export function DocumentTable({ rows, onChange, hideTruck }: { rows: FleetDocument[]; onChange: () => void; hideTruck?: boolean }) {
  const toast = useToast();
  const { can } = useAuth();
  const [editing, setEditing] = useState<{ doc: FleetDocument; renew: boolean } | null>(null);

  const remove = async (d: FleetDocument) => {
    if (!confirm(`Excluir ${DOC_TYPE[d.type]} de ${plateFmt(d.plate)}?`)) return;
    try {
      await api(`/documents/${d.id}`, { method: "DELETE" });
      toast("success", "Documento excluído");
      notifyFleetChanged();
      onChange();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  if (!rows.length) return <Empty icon={<FileText className="size-6" />} title="Nenhum documento encontrado" />;

  const actions = (d: FleetDocument) => (
    <div className="flex justify-end gap-1">
      {(d.situation === "vencido" || d.situation === "a_vencer") && (
        <Button size="sm" onClick={() => setEditing({ doc: d, renew: true })}>Renovar</Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setEditing({ doc: d, renew: false })}>Editar</Button>
      {can("admin") && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(d)}>Excluir</Button>}
    </div>
  );

  return (
    <>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((d) => (
          <li key={d.id} className="space-y-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{DOC_TYPE[d.type]}</span>
              <Badge tone={DOC_SITUATION[d.situation]} />
            </div>
            <p className="text-sm text-slate-600">
              {!hideTruck && <span className="font-mono font-semibold">{plateFmt(d.plate)} · </span>}
              Vence {date(d.expiry_date)} {d.days_left != null && d.situation !== "em_dia" && `(${daysLabel(d.days_left)})`}
            </p>
            {actions(d)}
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table head={[...(hideTruck ? [] : ["Guincho"]), "Documento", "Número", "Vencimento", "Valor", "Situação", ""]}>
          {rows.map((d) => (
            <tr key={d.id} className="hover:bg-slate-50">
              {!hideTruck && (
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link to={`/guinchos/${d.truck_id}`} className="font-mono font-semibold hover:text-brand-700">{plateFmt(d.plate)}</Link>
                </td>
              )}
              <td className="px-4 py-3 text-slate-900">{DOC_TYPE[d.type]}</td>
              <td className="px-4 py-3 text-slate-600">{d.number || "—"}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <p className="text-slate-900 tabular">{date(d.expiry_date)}</p>
                {d.days_left != null && <p className="text-xs text-slate-500">{daysLabel(d.days_left)}</p>}
              </td>
              <td className="px-4 py-3 text-slate-600 tabular">{d.amount != null ? money(d.amount) : "—"}</td>
              <td className="px-4 py-3"><Badge tone={DOC_SITUATION[d.situation]} /></td>
              <td className="px-4 py-3">{actions(d)}</td>
            </tr>
          ))}
        </Table>
      </div>

      <DocumentFormModal open={!!editing} doc={editing?.doc} renew={editing?.renew} onClose={() => setEditing(null)} onSaved={onChange} />
    </>
  );
}
