import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Receipt, CheckCircle2, FileWarning, IdCard, MapPin, Route, User, Wrench } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { date, daysLabel, DOC_TYPE, elapsed, km, money, num, plateFmt } from "../lib/format";
import type { DashboardData } from "../lib/types";
import { Card, ErrorBox, Spinner, Stat } from "../components/ui";
import { ChartCard, DailyKmChart, FleetBar, Legend, MaintenanceCostChart, RankList, TruckKmChart } from "../components/charts";

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, reload } = useFetch<DashboardData>("/dashboard");

  useEffect(() => {
    const t = setInterval(() => !document.hidden && reload(), 30000);
    window.addEventListener("fleet:changed", reload);
    return () => {
      clearInterval(t);
      window.removeEventListener("fleet:changed", reload);
    };
  }, [reload]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  const c = data.counts;
  const operating = c.disponivel + c.em_servico + c.manutencao;
  const availability = operating ? Math.round((c.disponivel / operating) * 100) : 0;
  const alerts = data.docs.length + data.preventive.length + data.cnh.length + (data.expenses.pending_count > 0 ? 1 : 0);
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const prevMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const vs = `vs ${prevMonth} até hoje`;
  const days30 = data.daily.reduce((s, d) => s + d.km, 0);
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const hour = new Date().getHours();

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-slate-500 first-letter:uppercase">{today}</p>
        <h1 className="mt-0.5 text-xl font-semibold text-slate-900 sm:text-2xl">
          {hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"}, {user?.name.split(" ")[0]}
        </h1>
      </div>

      {/* Frota agora + números do mês */}
      <div className="mb-5 grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Frota agora</p>
              <p className="mt-1 text-3xl font-semibold text-slate-900">
                {availability}% <span className="text-base font-normal text-slate-500">disponível</span>
              </p>
            </div>
            <Link to="/disponibilidade" className="text-sm font-medium text-brand-700 hover:underline">Ver quadro</Link>
          </div>
          <FleetBar counts={c} />
        </Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
          <Stat
            label={`Serviços em ${monthName}`}
            value={num(data.month.services)}
            delta={{ current: data.month.services, previous: data.prev.services, upIsGood: true, vs }}
            trend={{ values: data.daily.map((d) => d.services), label: "Serviços por dia, últimos 30 dias" }}
          />
          <Stat
            label="Km rodados no mês"
            value={num(data.month.km)}
            delta={{ current: data.month.km, previous: data.prev.km, upIsGood: true, vs }}
            trend={{ values: data.daily.map((d) => d.km), label: "Km por dia, últimos 30 dias" }}
          />
          <Stat
            label="Custo de manutenção"
            value={money(data.month.maintenance_cost)}
            delta={{ current: data.month.maintenance_cost, previous: data.prev.maintenance_cost, upIsGood: false, vs }}
            hint={`${num(data.month.maintenances)} concluídas no mês`}
            trend={{ values: data.maintMonthly.map((m) => m.preventiva + m.corretiva), label: "Custo por mês, últimos 6 meses" }}
          />
        </div>
      </div>

      {/* Uso diário + alertas */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Km rodados por dia" subtitle={`Últimos 30 dias completos · ${num(days30)} km no total`}>
          <DailyKmChart data={data.daily} />
        </ChartCard>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="flex items-center gap-2 font-medium text-slate-900"><AlertTriangle className="size-4 text-amber-500" /> Alertas</p>
            {alerts > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular">{alerts}</span>}
          </div>
          {alerts === 0 ? (
            <p className="flex items-center gap-2 p-6 text-sm text-slate-600"><CheckCircle2 className="size-4 text-green-600" /> Nenhum vencimento próximo nem despesa a conferir.</p>
          ) : (
            <ul className="max-h-[284px] divide-y divide-slate-100 overflow-y-auto">
              {data.expenses.pending_count > 0 && (
                <AlertRow
                  to="/despesas"
                  critical={false}
                  icon={<Receipt className="size-4" />}
                  title={`${data.expenses.pending_count} despesa${data.expenses.pending_count > 1 ? "s" : ""} a conferir`}
                  text={`${money(data.expenses.pending_amount)} enviados pelos motoristas`}
                  badge="Conferir"
                />
              )}
              {data.preventive.map((p) => (
                <AlertRow
                  key={`p${p.truck_id}`}
                  to="/manutencoes"
                  critical={p.situation === "vencida"}
                  icon={<Wrench className="size-4" />}
                  title={`Preventiva · ${plateFmt(p.plate)}`}
                  text={[p.next_due_date && daysLabel(p.days_left), p.km_left != null && (p.km_left >= 0 ? `faltam ${km(p.km_left)}` : `passou ${km(-p.km_left)}`)].filter(Boolean).join(" · ")}
                />
              ))}
              {data.docs.map((d) => (
                <AlertRow key={`d${d.id}`} to="/documentos" critical={d.situation === "vencido"} icon={<FileWarning className="size-4" />} title={`${DOC_TYPE[d.type]} · ${plateFmt(d.plate)}`} text={`${date(d.expiry_date)} · ${daysLabel(d.days_left)}`} />
              ))}
              {data.cnh.map((u) => (
                <AlertRow key={`c${u.id}`} to="/usuarios" critical={u.days_left < 0} icon={<IdCard className="size-4" />} title={`CNH · ${u.name}`} text={`${date(u.cnh_expiry)} · ${daysLabel(u.days_left)}`} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Manutenção e uso por guincho */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Custo de manutenção"
          subtitle="Últimos 6 meses"
          legend={<Legend items={[{ label: "Preventivas", color: "var(--color-series-1)" }, { label: "Corretivas", color: "var(--color-series-2)" }]} />}
        >
          <MaintenanceCostChart data={data.maintMonthly} />
        </ChartCard>
        <ChartCard title="Km por guincho" subtitle={`Em ${monthName}, guinchos em operação`}>
          <TruckKmChart data={data.topTrucks} />
        </ChartCard>
      </div>

      {/* Operação */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel icon={<Route className="size-4 text-sky-500" />} title="Em serviço agora" link={{ to: "/disponibilidade", label: "Ver quadro" }}>
          {data.active.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Nenhum guincho na rua no momento.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.active.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900">
                      <Link to={`/guinchos/${a.truck_id}`} className="font-mono font-semibold hover:text-brand-700">{plateFmt(a.plate)}</Link> · {a.service}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {a.driver_name && <span className="inline-flex items-center gap-1"><User className="size-3" /> {a.driver_name}</span>}
                      {a.destination && <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {a.destination}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500 tabular">há {elapsed(a.started_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={<Route className="size-4 text-brand-600" />} title="Serviços mais comuns" subtitle="últimos 30 dias">
          <div className="p-4">
            {data.serviceTypes.length ? <RankList rows={data.serviceTypes.map((s) => ({ label: s.service, value: s.count }))} /> : <p className="text-sm text-slate-500">Sem serviços no período.</p>}
          </div>
        </Panel>

        <Panel icon={<CalendarClock className="size-4 text-brand-600" />} title="Manutenções agendadas" link={{ to: "/manutencoes", label: "Ver todas" }}>
          {data.scheduled.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Nenhuma manutenção agendada.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.scheduled.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <p className="min-w-0 truncate text-slate-900">
                    <span className="font-mono font-semibold">{plateFmt(m.plate)}</span> · {m.description}
                  </p>
                  <span className="shrink-0 text-xs text-slate-500 tabular">{date(m.scheduled_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function Panel({ icon, title, subtitle, link, children }: { icon: ReactNode; title: string; subtitle?: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="flex items-center gap-2 font-medium text-slate-900">
          {icon} {title} {subtitle && <span className="text-sm font-normal text-slate-500">· {subtitle}</span>}
        </p>
        {link && <Link to={link.to} className="text-sm font-medium text-brand-700 hover:underline">{link.label}</Link>}
      </div>
      {children}
    </Card>
  );
}

function AlertRow({ to, critical, icon, title, text, badge }: { to: string; critical: boolean; icon: ReactNode; title: string; text: string; badge?: string }) {
  return (
    <li>
      <Link to={to} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
        <span className={`mt-0.5 rounded-lg p-1.5 ${critical ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{text}</p>
        </div>
        <span className={`shrink-0 text-xs font-medium ${critical ? "text-red-600" : "text-amber-700"}`}>{badge ?? (critical ? "Vencido" : "A vencer")}</span>
      </Link>
    </li>
  );
}
