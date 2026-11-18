import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { qs } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { DOC_SITUATION, DOC_TYPE, plateFmt } from "../lib/format";
import type { DocSituation, DocType, FleetDocument, Truck } from "../lib/types";
import { Button, Card, Chips, ErrorBox, PageHeader, Select, Spinner } from "../components/ui";
import { DocumentTable } from "../components/DocumentTable";
import { DocumentFormModal } from "../components/DocumentForm";

type SitFilter = "" | DocSituation;

export default function Documents() {
  const [situation, setSituation] = useState<SitFilter>("");
  const [type, setType] = useState<"" | DocType>("");
  const [truckId, setTruckId] = useState("");
  const [history, setHistory] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const trucks = useFetch<Truck[]>("/trucks");
  // Busca sem o filtro de situação para mostrar a contagem em cada chip.
  const { data, error, reload } = useFetch<FleetDocument[]>(`/documents${qs({ type, truck_id: truckId, historico: history ? "1" : "" })}`);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": data?.length || 0 };
    data?.forEach((d) => (c[d.situation] = (c[d.situation] || 0) + 1));
    return c;
  }, [data]);
  const rows = data?.filter((d) => !situation || d.situation === situation);

  return (
    <>
      <PageHeader
        title="Documentação e vencimentos"
        subtitle="CRLV, licenciamento, seguro, ANTT, tacógrafo e outros"
        actions={<Button onClick={() => setFormOpen(true)}><Plus className="size-4" /> Novo documento</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="grid grid-cols-2 gap-3 lg:w-96">
          <Select value={truckId} onChange={(e) => setTruckId(e.target.value)} aria-label="Guincho">
            <option value="">Todos os guinchos</option>
            {trucks.data?.map((t) => <option key={t.id} value={t.id}>{plateFmt(t.plate)}</option>)}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value as any)} aria-label="Tipo de documento">
            <option value="">Todos os documentos</option>
            {Object.entries(DOC_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        <Chips<SitFilter>
          value={situation}
          onChange={setSituation}
          options={[
            { value: "", label: "Todos", count: counts[""] },
            ...(["vencido", "a_vencer", "em_dia"] as DocSituation[]).map((s) => ({ value: s, label: DOC_SITUATION[s].label, count: counts[s] || 0 })),
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 lg:ml-auto">
          <input type="checkbox" className="size-4 accent-brand-600" checked={history} onChange={(e) => setHistory(e.target.checked)} />
          Mostrar renovados
        </label>
      </div>

      {error && <ErrorBox message={error} />}
      <Card>{!rows ? <Spinner /> : <DocumentTable rows={rows} onChange={reload} />}</Card>

      <DocumentFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={reload} />
    </>
  );
}
