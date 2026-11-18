import { useState } from "react";
import { Ban, Check, HandCoins, MapPin, Pencil, Receipt, Trash2, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateTime, EXPENSE_CATEGORY, EXPENSE_STATUS, money, num, plateFmt } from "../lib/format";
import { notifyExpensesChanged } from "../lib/outbox";
import type { Expense } from "../lib/types";
import { Badge, Button, Empty, useToast } from "./ui";
import { PhotoImg, PhotoViewer } from "./ExpensePhotos";
import { CATEGORY_ICON, useExpenseSheet } from "./ExpenseSheet";

/** Lista de despesas com foto, situação e ações de conferência. */
export function ExpenseList({ rows, onChange, hideTruck, emptyText }: { rows: Expense[]; onChange: () => void; hideTruck?: boolean; emptyText?: string }) {
  const toast = useToast();
  const { can } = useAuth();
  const sheet = useExpenseSheet();
  const gestao = can("admin", "operador");
  const [viewer, setViewer] = useState<{ ids: number[]; index: number } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const act = async (e: Expense, fn: () => Promise<unknown>, ok: string) => {
    setBusy(e.id);
    try {
      await fn();
      toast("success", ok);
      notifyExpensesChanged();
      onChange();
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const review = (e: Expense, status: "aprovada" | "recusada" | "pendente") => {
    let note: string | null = null;
    if (status === "recusada") {
      note = prompt("Motivo da recusa (o motorista vai ver):", "Nota ilegível — tire outra foto");
      if (!note?.trim()) return;
    }
    const label = { aprovada: "Despesa aprovada", recusada: "Despesa recusada", pendente: "Voltou para conferência" }[status];
    act(e, () => api(`/expenses/${e.id}/review`, { body: { status, note } }), label);
  };

  const remove = (e: Expense) => {
    if (!confirm(`Excluir a despesa de ${money(e.amount)} (${EXPENSE_CATEGORY[e.category]})?`)) return;
    act(e, () => api(`/expenses/${e.id}`, { method: "DELETE" }), "Despesa excluída");
  };

  const reimburse = (e: Expense, undo = false) =>
    act(e, () => api("/expenses/reimburse", { body: { ids: [e.id], undo } }), undo ? "Reembolso desfeito" : "Marcada como reembolsada");

  if (!rows.length) return <Empty icon={<Receipt className="size-6" />} title="Nenhuma despesa encontrada" text={emptyText} />;

  return (
    <>
      <ul className="divide-y divide-slate-100">
        {rows.map((e) => {
          const Icon = CATEGORY_ICON[e.category];
          const canEdit = gestao || e.status === "pendente";
          return (
            <li key={e.id} className="flex gap-3 p-3 sm:p-4">
              {e.photo_ids.length ? (
                <button onClick={() => setViewer({ ids: e.photo_ids, index: 0 })} className="relative shrink-0" aria-label="Ver foto da nota">
                  <PhotoImg id={e.photo_ids[0]} thumb className="size-16 rounded-lg ring-1 ring-slate-200 sm:size-20" />
                  {e.photo_ids.length > 1 && (
                    <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">+{e.photo_ids.length - 1}</span>
                  )}
                </button>
              ) : (
                <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-slate-50 text-[10px] text-slate-400 ring-1 ring-slate-200 sm:size-20">
                  <Icon className="mb-0.5 size-5" /> sem foto
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 font-medium text-slate-900">
                    <Icon className="size-4 shrink-0 text-slate-500" />
                    <span className="truncate">{EXPENSE_CATEGORY[e.category]}</span>
                  </p>
                  <p className="shrink-0 text-base font-semibold text-slate-900 tabular">{money(e.amount)}</p>
                </div>
                <p className="truncate text-sm text-slate-600">
                  {[
                    !hideTruck && e.plate && plateFmt(e.plate),
                    gestao && (e.driver_name || "Sem motorista"),
                    e.usage_service ? `Viagem: ${e.usage_service}${e.usage_client ? ` · ${e.usage_client}` : ""}` : "Sem viagem",
                  ].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 tabular">
                  <span>{dateTime(e.spent_at)}</span>
                  <span>· {e.paid_by === "motorista" ? "pago pelo motorista" : "pago pela empresa"}</span>
                  {e.liters != null && <span>· {num(e.liters)} L{e.liters ? ` (${money(e.amount / e.liters)}/L)` : ""}</span>}
                  {e.odometer_km != null && <span>· {num(e.odometer_km)} km</span>}
                  {e.lat != null && e.lng != null && (
                    <a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">
                      <MapPin className="size-3" /> mapa
                    </a>
                  )}
                </p>
                {e.description && <p className="mt-1 text-sm text-slate-700">{e.description}</p>}
                {e.status === "recusada" && e.review_note && (
                  <p className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 ring-1 ring-red-200">Recusada: {e.review_note}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={EXPENSE_STATUS[e.status]} />
                  {e.status === "aprovada" && e.paid_by === "motorista" && (
                    <span className={`text-xs font-medium ${e.reimbursed_at ? "text-green-700" : "text-amber-800"}`}>
                      {e.reimbursed_at ? `Reembolsado em ${dateTime(e.reimbursed_at).slice(0, 8)}` : "Aguardando reembolso"}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap gap-1">
                    {gestao && e.status === "pendente" && (
                      <>
                        <Button size="sm" onClick={() => review(e, "aprovada")} loading={busy === e.id}><Check className="size-4" /> Aprovar</Button>
                        <Button size="sm" variant="danger" onClick={() => review(e, "recusada")} disabled={busy === e.id}><Ban className="size-4" /> Recusar</Button>
                      </>
                    )}
                    {gestao && e.status === "aprovada" && e.paid_by === "motorista" && !e.reimbursed_at && (
                      <Button size="sm" variant="secondary" onClick={() => reimburse(e)} disabled={busy === e.id}><HandCoins className="size-4" /> Reembolsado</Button>
                    )}
                    {gestao && e.status !== "pendente" && (
                      <Button size="sm" variant="ghost" onClick={() => (e.reimbursed_at ? reimburse(e, true) : review(e, "pendente"))} disabled={busy === e.id} title={e.reimbursed_at ? "Desfazer reembolso" : "Voltar para conferência"}>
                        <Undo2 className="size-4" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => sheet.open({ expense: e })} title="Editar" aria-label="Editar">
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => remove(e)} disabled={busy === e.id} title="Excluir" aria-label="Excluir" className="hover:text-red-600">
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {viewer && <PhotoViewer ids={viewer.ids} index={viewer.index} onClose={() => setViewer(null)} />}
    </>
  );
}
