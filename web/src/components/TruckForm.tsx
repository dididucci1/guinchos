import { useEffect } from "react";
import { useForm } from "../lib/useForm";
import { TRUCK_KIND } from "../lib/format";
import type { Truck, TruckKind } from "../lib/types";
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, notifyFleetChanged, useToast } from "./ui";

const EMPTY = {
  plate: "",
  brand: "",
  model: "",
  year: "",
  kind: "plataforma" as TruckKind,
  capacity_kg: "",
  odometer_km: "",
  location: "",
  notes: "",
};

/** Cadastro e edição de guincho. */
export function TruckFormModal({ open, truck, onClose, onSaved }: { open: boolean; truck?: Truck | null; onClose: () => void; onSaved: (t: Truck) => void }) {
  const toast = useToast();
  const f = useForm<Record<string, any>>(EMPTY);

  useEffect(() => {
    if (!open) return;
    f.setError("");
    f.setValues(
      truck
        ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (truck as any)[k] ?? ""])) }
        : EMPTY,
    );
  }, [open, truck?.id]);

  const done = (t: Truck) => {
    toast("success", truck ? "Guincho atualizado" : "Guincho cadastrado");
    notifyFleetChanged();
    onSaved(t);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={truck ? `Editar guincho` : "Novo guincho"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="truck-form" loading={f.saving}>Salvar</Button>
        </>
      }
    >
      <form id="truck-form" onSubmit={f.submit(truck ? `/trucks/${truck.id}` : "/trucks", truck ? "PUT" : "POST", done)} className="space-y-4">
        {f.error && <ErrorBox message={f.error} />}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Placa">
            <Input {...f.field("plate")} required placeholder="ABC1D23" className="uppercase" maxLength={8} />
          </Field>
          <Field label="Marca">
            <Input {...f.field("brand")} placeholder="Volkswagen" />
          </Field>
          <Field label="Ano">
            <Input {...f.field("year")} type="number" min={1950} max={2100} placeholder="2022" />
          </Field>
        </div>
        <Field label="Modelo">
          <Input {...f.field("model")} required placeholder="Delivery 11.180 Plataforma" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo">
            <Select {...f.field("kind")}>
              {Object.entries(TRUCK_KIND).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Capacidade de carga (kg)">
            <Input {...f.field("capacity_kg")} type="number" min={1} required placeholder="4500" />
          </Field>
          <Field label="Quilometragem atual" hint={truck ? "Atualizada sozinha a cada retorno" : undefined}>
            <Input {...f.field("odometer_km")} type="number" min={0} required placeholder="0" />
          </Field>
        </div>
        <Field label="Base / localização">
          <Input {...f.field("location")} placeholder="Base Centro" />
        </Field>
        <Field label="Observações">
          <Textarea {...f.field("notes")} />
        </Field>
      </form>
    </Modal>
  );
}
