import { useEffect } from "react";
import { Camera, Receipt } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { useForm } from "../lib/useForm";
import { EXPENSE_CATEGORY, km, localDateTimeInput, money, parseMoney, plateFmt } from "../lib/format";
import type { Driver, Expense, Truck } from "../lib/types";
import { useExpenseSheet } from "./ExpenseSheet";
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, notifyFleetChanged, useToast } from "./ui";

/** Registrar saída de um guincho (inicia uma utilização). */
export function StartUsageModal({ open, truck, onClose, onSaved }: { open: boolean; truck?: Truck | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { user, can } = useAuth();
  const isDriver = user?.role === "motorista";
  const trucks = useFetch<Truck[]>(open && !truck ? "/trucks?status=disponivel" : null);
  const drivers = useFetch<Driver[]>(open && can("admin", "operador") ? "/users/drivers" : null);
  const f = useForm<Record<string, any>>({});

  useEffect(() => {
    if (!open) return;
    f.setError("");
    f.setValues({
      truck_id: truck?.id ?? "",
      driver_id: "",
      service: "",
      client: "",
      origin: truck?.location ?? "",
      destination: "",
      vehicle: "",
      start_km: truck?.odometer_km ?? "",
      started_at: localDateTimeInput(),
      notes: "",
      amount: "",
    });
  }, [open, truck?.id]);

  // Ao escolher o guincho na lista, sugere o km atual dele.
  const selected = truck ?? trucks.data?.find((t) => t.id === Number(f.values.truck_id));
  useEffect(() => {
    if (!truck && selected) f.setValues((v) => ({ ...v, start_km: selected.odometer_km, origin: v.origin || selected.location || "" }));
  }, [selected?.id]);

  const body = () => ({
    ...f.values,
    started_at: f.values.started_at ? new Date(f.values.started_at).toISOString() : null,
    amount: f.values.amount ? parseMoney(f.values.amount) : null,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={truck ? `Registrar saída · ${plateFmt(truck.plate)}` : "Registrar saída"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="usage-start" loading={f.saving}>Registrar saída</Button>
        </>
      }
    >
      <form
        id="usage-start"
        onSubmit={(e) =>
          f.submit("/usages", "POST", () => {
            toast("success", "Saída registrada — guincho em serviço");
            notifyFleetChanged();
            onSaved();
            onClose();
          }, body())(e)
        }
        className="space-y-4"
      >
        {f.error && <ErrorBox message={f.error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          {!truck && (
            <Field label="Guincho" hint={trucks.data?.length === 0 ? "Nenhum guincho disponível no momento" : undefined}>
              <Select {...f.field("truck_id")} required>
                <option value="">Selecione…</option>
                {trucks.data?.map((t) => (
                  <option key={t.id} value={t.id}>{plateFmt(t.plate)} · {t.model}</option>
                ))}
              </Select>
            </Field>
          )}
          {!isDriver && (
            <Field label="Motorista">
              <Select {...f.field("driver_id")}>
                <option value="">Não informado</option>
                {drivers.data?.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Serviço">
            <Input {...f.field("service")} required placeholder="Pane mecânica, colisão, remoção…" />
          </Field>
          <Field label="Cliente / seguradora">
            <Input {...f.field("client")} placeholder="Particular" />
          </Field>
          <Field label="Origem">
            <Input {...f.field("origin")} placeholder="Base" />
          </Field>
          <Field label="Destino">
            <Input {...f.field("destination")} placeholder="Rod. Anhanguera km 32" />
          </Field>
          <Field label="Veículo rebocado">
            <Input {...f.field("vehicle")} placeholder="Modelo, cor, placa" />
          </Field>
          <Field label="Km de saída" hint={selected ? `Hodômetro atual: ${km(selected.odometer_km)}` : undefined}>
            <Input {...f.field("start_km")} type="number" min={0} />
          </Field>
          <Field label="Data e hora da saída">
            <Input {...f.field("started_at")} type="datetime-local" />
          </Field>
          {!isDriver && (
            <Field label="Valor cobrado (R$)" hint="Pode deixar em branco e definir no retorno ou no Financeiro">
              <Input {...f.field("amount")} inputMode="decimal" placeholder="0,00" />
            </Field>
          )}
        </div>
        <Field label="Observações">
          <Textarea {...f.field("notes")} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}

/** Registrar retorno (encerra a utilização e libera o guincho). */
export function FinishUsageModal({
  open,
  usage,
  onClose,
  onSaved,
}: {
  open: boolean;
  usage: { id: number; plate: string; service: string; start_km: number; amount?: number | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const gestao = can("admin", "operador");
  const sheet = useExpenseSheet();
  const f = useForm<Record<string, any>>({});
  const expenses = useFetch<Expense[]>(open && usage ? `/expenses?usage_id=${usage.id}` : null);

  useEffect(() => {
    if (!open || !usage) return;
    f.setError("");
    f.setValues({ end_km: "", ended_at: localDateTimeInput(), notes: "", amount: usage.amount != null ? String(usage.amount).replace(".", ",") : "" });
  }, [open, usage?.id]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("expenses:changed", expenses.reload);
    return () => window.removeEventListener("expenses:changed", expenses.reload);
  }, [open, expenses.reload]);

  if (!usage) return null;
  const dist = Number(f.values.end_km) - usage.start_km;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Registrar retorno · ${plateFmt(usage.plate)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="usage-finish" loading={f.saving}>Confirmar retorno</Button>
        </>
      }
    >
      <form
        id="usage-finish"
        onSubmit={(e) =>
          f.submit(`/usages/${usage.id}/finish`, "POST", () => {
            toast("success", "Retorno registrado — guincho liberado");
            notifyFleetChanged();
            onSaved();
            onClose();
          }, {
            ...f.values,
            ended_at: f.values.ended_at ? new Date(f.values.ended_at).toISOString() : null,
            amount: gestao && f.values.amount ? parseMoney(f.values.amount) : null,
          })(e)
        }
        className="space-y-4"
      >
        {f.error && <ErrorBox message={f.error} />}
        <p className="text-sm text-slate-600">
          {usage.service} · saída com <strong className="tabular">{km(usage.start_km)}</strong>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Km de chegada" hint={f.values.end_km && dist >= 0 ? `Percorridos: ${km(dist)}` : undefined}>
            <Input {...f.field("end_km")} type="number" min={usage.start_km} required autoFocus />
          </Field>
          <Field label="Data e hora do retorno">
            <Input {...f.field("ended_at")} type="datetime-local" />
          </Field>
          {gestao && (
            <Field label="Valor cobrado (R$)">
              <Input {...f.field("amount")} inputMode="decimal" placeholder="0,00" />
            </Field>
          )}
        </div>

        {/* Lembrete das notas antes de fechar a viagem */}
        <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <Receipt className="size-4" /> Despesas da viagem
              {!!expenses.data?.length && <span className="text-slate-900 tabular">· {money(expenses.data.reduce((s, e) => s + (e.status === "recusada" ? 0 : e.amount), 0))}</span>}
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={() => sheet.openCamera({ usageId: usage.id })}>
              <Camera className="size-4" /> Lançar
            </Button>
          </div>
          {expenses.data?.length ? (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {expenses.data.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>{EXPENSE_CATEGORY[e.category]}{e.photo_ids.length ? "" : " (sem foto)"}</span>
                  <span className="tabular">{money(e.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Nenhuma lançada. Pagou pneu, pedágio, diesel ou comida? Lance antes de fechar.</p>
          )}
        </div>

        <Field label="Observações">
          <Textarea {...f.field("notes")} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
