import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { qs } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { addDays, num, plateFmt, todayISO, USAGE_STATUS } from "../lib/format";
import type { Driver, Truck, Usage, UsageStatus } from "../lib/types";
import { Button, Card, Chips, ErrorBox, Input, PageHeader, Select, Spinner } from "../components/ui";
import { UsageTable } from "../components/UsageTable";
import { StartUsageModal } from "../components/UsageModals";

type StatusFilter = "" | UsageStatus;

export default function Usages() {
  const { can } = useAuth();
  const gestao = can("admin", "operador");
  const [status, setStatus] = useState<StatusFilter>("");
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [from, setFrom] = useState(addDays(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [q, setQ] = useState("");
  const [startOpen, setStartOpen] = useState(false);

  const trucks = useFetch<Truck[]>(gestao ? "/trucks" : null);
  const drivers = useFetch<Driver[]>(gestao ? "/users/drivers" : null);
  const { data, error, loading, reload } = useFetch<Usage[]>(`/usages${qs({ status, truck_id: truckId, driver_id: driverId, from, to, q })}`);

  const done = data?.filter((u) => u.status === "concluida") || [];
  const totalKm = done.reduce((s, u) => s + (u.distance_km || 0), 0);

  return (
    <>
      <PageHeader
        title={gestao ? "Histórico de utilização" : "Minhas saídas"}
        subtitle={data ? `${num(done.length)} serviços concluídos · ${num(totalKm)} km no período` : "Saídas e retornos dos guinchos"}
        actions={<Button onClick={() => setStartOpen(true)}><Plus className="size-4" /> Registrar saída</Button>}
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, serviço, destino" className="pl-9" />
          </div>
          {gestao && (
            <>
              <Select value={truckId} onChange={(e) => setTruckId(e.target.value)} aria-label="Guincho">
                <option value="">Todos os guinchos</option>
                {trucks.data?.map((t) => <option key={t.id} value={t.id}>{plateFmt(t.plate)} · {t.model}</option>)}
              </Select>
              <Select value={driverId} onChange={(e) => setDriverId(e.target.value)} aria-label="Motorista">
                <option value="">Todos os motoristas</option>
                {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </>
          )}
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        </div>
        <div className="mt-3">
          <Chips<StatusFilter>
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: "Todas" }, ...(Object.keys(USAGE_STATUS) as UsageStatus[]).map((s) => ({ value: s, label: USAGE_STATUS[s].label }))]}
          />
        </div>
      </Card>

      {error && <ErrorBox message={error} />}
      <Card>{!data && loading ? <Spinner /> : <UsageTable rows={data || []} onChange={reload} />}</Card>

      <StartUsageModal open={startOpen} onClose={() => setStartOpen(false)} onSaved={reload} />
    </>
  );
}
