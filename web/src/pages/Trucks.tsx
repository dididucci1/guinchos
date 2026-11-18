import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, FileWarning, Plus, Search, Truck as TruckIcon } from "lucide-react";
import { useFetch } from "../lib/useFetch";
import { qs } from "../lib/api";
import { kg, km, plateFmt, TRUCK_KIND, TRUCK_STATUS } from "../lib/format";
import type { Truck, TruckStatus } from "../lib/types";
import { Button, Card, Chips, Empty, ErrorBox, Input, PageHeader, Spinner, Table, TruckBadge } from "../components/ui";
import { TruckFormModal } from "../components/TruckForm";

type Filter = "" | TruckStatus;

export default function Trucks() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Filter>("");
  const [formOpen, setFormOpen] = useState(false);
  const { data, error, loading, reload } = useFetch<Truck[]>(`/trucks${qs({ q, status })}`);

  return (
    <>
      <PageHeader
        title="Guinchos"
        subtitle="Cadastro da frota"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Novo guincho
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa, marca ou modelo" className="pl-9" />
        </div>
        <Chips<Filter>
          value={status}
          onChange={setStatus}
          options={[{ value: "", label: "Todos" }, ...(Object.keys(TRUCK_STATUS) as TruckStatus[]).map((s) => ({ value: s, label: TRUCK_STATUS[s].label }))]}
        />
      </div>

      {error && <ErrorBox message={error} />}
      <Card>
        {!data && loading ? (
          <Spinner />
        ) : !data?.length ? (
          <Empty
            icon={<TruckIcon className="size-6" />}
            title={q || status ? "Nenhum guincho encontrado" : "Nenhum guincho cadastrado"}
            text={q || status ? "Tente outro filtro." : "Cadastre o primeiro guincho da frota."}
          />
        ) : (
          <>
            {/* Celular: lista */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.map((t) => (
                <li key={t.id}>
                  <button onClick={() => navigate(`/guinchos/${t.id}`)} className="flex w-full items-center gap-3 p-4 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{plateFmt(t.plate)}</span>
                        <TruckBadge status={t.status} />
                      </div>
                      <p className="truncate text-sm text-slate-500">{t.model}</p>
                      <p className="text-xs text-slate-500 tabular">{TRUCK_KIND[t.kind]} · {kg(t.capacity_kg)} · {km(t.odometer_km)}</p>
                    </div>
                    <ChevronRight className="size-4 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
            {/* Computador: tabela */}
            <div className="hidden md:block">
              <Table head={["Placa", "Modelo", "Tipo", "Capacidade", "Quilometragem", "Situação", ""]}>
                {data.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/guinchos/${t.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{plateFmt(t.plate)}</td>
                    <td className="px-4 py-3">
                      <p className="text-slate-900">{t.model}</p>
                      <p className="text-xs text-slate-500">{[t.brand, t.year].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{TRUCK_KIND[t.kind]}</td>
                    <td className="px-4 py-3 text-slate-600 tabular">{kg(t.capacity_kg)}</td>
                    <td className="px-4 py-3 text-slate-600 tabular">{km(t.odometer_km)}</td>
                    <td className="px-4 py-3"><TruckBadge status={t.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {t.doc_alerts > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800" title="Documentos vencidos ou a vencer">
                          <FileWarning className="size-3.5" /> {t.doc_alerts}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </>
        )}
      </Card>

      <TruckFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={(t) => { reload(); navigate(`/guinchos/${t.id}`); }} />
    </>
  );
}
