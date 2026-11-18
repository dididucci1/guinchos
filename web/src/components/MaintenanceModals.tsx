import { useEffect } from "react";
import { useFetch } from "../lib/useFetch";
import { useForm } from "../lib/useForm";
import { addDays, km, plateFmt, todayISO } from "../lib/format";
import type { Maintenance, Truck } from "../lib/types";
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, notifyFleetChanged, useToast } from "./ui";

/** Nova manutenção / edição. */
export function MaintenanceFormModal({
  open,
  maintenance,
  truckId,
  onClose,
  onSaved,
}: {
  open: boolean;
  maintenance?: Maintenance | null;
  truckId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const trucks = useFetch<Truck[]>(open ? "/trucks" : null);
  const f = useForm<Record<string, any>>({});
  const editing = !!maintenance;

  useEffect(() => {
    if (!open) return;
    f.setError("");
    const m = maintenance;
    f.setValues({
      truck_id: m?.truck_id ?? truckId ?? "",
      type: m?.type ?? "preventiva",
      description: m?.description ?? "",
      scheduled_date: m?.scheduled_date ?? todayISO(),
      odometer_km: m?.odometer_km ?? "",
      cost: m?.cost ?? "",
      provider: m?.provider ?? "",
      next_due_date: m?.next_due_date ?? "",
      next_due_km: m?.next_due_km ?? "",
      notes: m?.notes ?? "",
      start_now: false,
    });
  }, [open, maintenance?.id]);

  const truck = trucks.data?.find((t) => t.id === Number(f.values.truck_id));
  const preventive = f.values.type === "preventiva";
  const showNext = preventive && (!editing || maintenance?.status === "concluida");

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? "Editar manutenção" : "Nova manutenção"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="maint-form" loading={f.saving}>{editing ? "Salvar" : f.values.start_now ? "Iniciar manutenção" : "Agendar"}</Button>
        </>
      }
    >
      <form
        id="maint-form"
        onSubmit={f.submit(editing ? `/maintenances/${maintenance!.id}` : "/maintenances", editing ? "PUT" : "POST", () => {
          toast("success", editing ? "Manutenção atualizada" : f.values.start_now ? "Guincho em manutenção" : "Manutenção agendada");
          notifyFleetChanged();
          onSaved();
          onClose();
        })}
        className="space-y-4"
      >
        {f.error && <ErrorBox message={f.error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guincho">
            <Select {...f.field("truck_id")} required disabled={editing && maintenance?.status !== "agendada"}>
              <option value="">Selecione…</option>
              {trucks.data?.map((t) => (
                <option key={t.id} value={t.id}>{plateFmt(t.plate)} · {t.model}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <div className="grid h-10 grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              {(["preventiva", "corretiva"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => f.set("type", t)}
                  className={`rounded-md text-sm font-medium capitalize ${f.values.type === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Serviço">
          <Input {...f.field("description")} required placeholder={preventive ? "Troca de óleo e filtros, revisão…" : "Reparo no sistema hidráulico…"} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Data prevista">
            <Input {...f.field("scheduled_date")} type="date" />
          </Field>
          <Field label="Km do guincho" hint={truck ? `Atual: ${km(truck.odometer_km)}` : undefined}>
            <Input {...f.field("odometer_km")} type="number" min={0} />
          </Field>
          <Field label="Custo (R$)">
            <Input {...f.field("cost")} type="number" min={0} step="0.01" />
          </Field>
        </div>
        <Field label="Oficina / fornecedor">
          <Input {...f.field("provider")} />
        </Field>
        {showNext && editing && <NextDueFields f={f} baseKm={Number(f.values.odometer_km) || truck?.odometer_km} />}
        <Field label="Observações">
          <Textarea {...f.field("notes")} rows={2} />
        </Field>
        {!editing && (
          <label className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
            <input type="checkbox" className="mt-0.5 size-4 accent-amber-600" checked={!!f.values.start_now} onChange={(e) => f.set("start_now", e.target.checked)} />
            <span className="text-sm text-amber-800">
              <strong>O guincho já está na oficina.</strong> Inicia a manutenção agora e tira o guincho de operação até ser concluída.
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
}

/** Campos de "próxima preventiva" com atalhos. */
function NextDueFields({ f, baseKm }: { f: ReturnType<typeof useForm<Record<string, any>>>; baseKm?: number }) {
  return (
    <div className="rounded-lg bg-brand-50 p-3 ring-1 ring-brand-200">
      <p className="mb-2 text-sm font-medium text-brand-800">Próxima preventiva</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Até a data">
          <Input {...f.field("next_due_date")} type="date" />
          <div className="mt-1 flex gap-1">
            {[90, 180, 365].map((d) => (
              <button type="button" key={d} onClick={() => f.set("next_due_date", addDays(todayISO(), d))} className="rounded bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                +{d === 365 ? "1 ano" : `${d / 30} meses`}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Ou ao atingir (km)">
          <Input {...f.field("next_due_km")} type="number" min={0} />
          {baseKm ? (
            <div className="mt-1 flex gap-1">
              {[5000, 10000, 20000].map((k) => (
                <button type="button" key={k} onClick={() => f.set("next_due_km", baseKm + k)} className="rounded bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                  +{k / 1000} mil
                </button>
              ))}
            </div>
          ) : null}
        </Field>
      </div>
    </div>
  );
}

/** Concluir manutenção: custo, km e (preventiva) quando é a próxima. */
export function CompleteMaintenanceModal({ open, maintenance, onClose, onSaved }: { open: boolean; maintenance: Maintenance | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const trucks = useFetch<Truck[]>(open ? "/trucks" : null);
  const f = useForm<Record<string, any>>({});

  useEffect(() => {
    if (!open || !maintenance) return;
    f.setError("");
    f.setValues({
      odometer_km: maintenance.odometer_km ?? "",
      cost: maintenance.cost ?? "",
      provider: maintenance.provider ?? "",
      next_due_date: "",
      next_due_km: "",
      notes: maintenance.notes ?? "",
    });
  }, [open, maintenance?.id]);

  if (!maintenance) return null;
  const truck = trucks.data?.find((t) => t.id === maintenance.truck_id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Concluir manutenção · ${plateFmt(maintenance.plate)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="maint-complete" loading={f.saving}>Concluir</Button>
        </>
      }
    >
      <form
        id="maint-complete"
        onSubmit={f.submit(`/maintenances/${maintenance.id}/complete`, "POST", () => {
          toast("success", "Manutenção concluída — guincho liberado");
          notifyFleetChanged();
          onSaved();
          onClose();
        })}
        className="space-y-4"
      >
        {f.error && <ErrorBox message={f.error} />}
        <p className="text-sm text-slate-600">{maintenance.description}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Km do guincho" hint={truck ? `Atual: ${km(truck.odometer_km)}` : undefined}>
            <Input {...f.field("odometer_km")} type="number" min={0} />
          </Field>
          <Field label="Custo total (R$)">
            <Input {...f.field("cost")} type="number" min={0} step="0.01" />
          </Field>
          <Field label="Oficina / fornecedor">
            <Input {...f.field("provider")} />
          </Field>
        </div>
        {maintenance.type === "preventiva" && <NextDueFields f={f} baseKm={Number(f.values.odometer_km) || truck?.odometer_km} />}
        <Field label="Observações">
          <Textarea {...f.field("notes")} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
