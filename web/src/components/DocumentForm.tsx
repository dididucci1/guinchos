import { useEffect } from "react";
import { useFetch } from "../lib/useFetch";
import { useForm } from "../lib/useForm";
import { addDays, DOC_TYPE, plateFmt } from "../lib/format";
import type { FleetDocument, Truck } from "../lib/types";
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, notifyFleetChanged, useToast } from "./ui";

/**
 * Cadastro/edição de documento. Com `renew`, cria um novo documento do mesmo tipo
 * (o anterior vira histórico automaticamente).
 */
export function DocumentFormModal({
  open,
  doc,
  renew,
  truckId,
  onClose,
  onSaved,
}: {
  open: boolean;
  doc?: FleetDocument | null;
  renew?: boolean;
  truckId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const trucks = useFetch<Truck[]>(open ? "/trucks" : null);
  const f = useForm<Record<string, any>>({});
  const editing = !!doc && !renew;

  useEffect(() => {
    if (!open) return;
    f.setError("");
    f.setValues({
      truck_id: doc?.truck_id ?? truckId ?? "",
      type: doc?.type ?? "crlv",
      number: editing ? doc?.number ?? "" : "",
      issue_date: editing ? doc?.issue_date ?? "" : "",
      expiry_date: editing ? doc?.expiry_date ?? "" : renew && doc?.expiry_date ? addDays(doc.expiry_date, 365) : "",
      amount: editing ? doc?.amount ?? "" : "",
      notes: editing ? doc?.notes ?? "" : "",
    });
  }, [open, doc?.id, renew]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar documento" : renew ? `Renovar ${DOC_TYPE[doc!.type]}` : "Novo documento"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="doc-form" loading={f.saving}>Salvar</Button>
        </>
      }
    >
      <form
        id="doc-form"
        onSubmit={f.submit(editing ? `/documents/${doc!.id}` : "/documents", editing ? "PUT" : "POST", () => {
          toast("success", renew ? "Documento renovado" : editing ? "Documento atualizado" : "Documento cadastrado");
          notifyFleetChanged();
          onSaved();
          onClose();
        })}
        className="space-y-4"
      >
        {f.error && <ErrorBox message={f.error} />}
        {renew && <p className="text-sm text-slate-600">O documento atual fica guardado no histórico.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Guincho">
            <Select {...f.field("truck_id")} required disabled={renew}>
              <option value="">Selecione…</option>
              {trucks.data?.map((t) => (
                <option key={t.id} value={t.id}>{plateFmt(t.plate)} · {t.model}</option>
              ))}
            </Select>
          </Field>
          <Field label="Documento">
            <Select {...f.field("type")} disabled={renew}>
              {Object.entries(DOC_TYPE).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Número / apólice">
            <Input {...f.field("number")} />
          </Field>
          <Field label="Valor pago (R$)">
            <Input {...f.field("amount")} type="number" min={0} step="0.01" />
          </Field>
          <Field label="Emissão">
            <Input {...f.field("issue_date")} type="date" />
          </Field>
          <Field label="Vencimento" hint="Avisamos 30 dias antes">
            <Input {...f.field("expiry_date")} type="date" required={f.values.type !== "outro"} />
          </Field>
        </div>
        <Field label="Observações">
          <Textarea {...f.field("notes")} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}
