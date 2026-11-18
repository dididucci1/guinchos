import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BedDouble, Camera, ChevronDown, CircleDot, Droplets, Fuel, ImagePlus, Loader2, MapPin, Milestone, Receipt,
  Siren, SquareParking, UtensilsCrossed, Wrench, X, type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { addDays, dateTime, EXPENSE_CATEGORY, localDateTimeInput, money, parseMoney, plateFmt, todayISO } from "../lib/format";
import { compressPhoto, type PhotoPayload } from "../lib/photos";
import { notifyExpensesChanged, useOutbox } from "../lib/outbox";
import type { Driver, Expense, ExpenseCategory, Truck, Usage } from "../lib/types";
import { Button, ErrorBox, Field, Input, Modal, Select, Textarea, useToast } from "./ui";
import { PhotoImg } from "./ExpensePhotos";

/** Ordem pensada para o motorista: o que mais acontece na estrada vem primeiro. */
export const CATEGORY_TILES: { value: ExpenseCategory; short: string; icon: LucideIcon }[] = [
  { value: "pneu", short: "Pneu", icon: CircleDot },
  { value: "combustivel", short: "Diesel", icon: Fuel },
  { value: "pedagio", short: "Pedágio", icon: Milestone },
  { value: "alimentacao", short: "Comida", icon: UtensilsCrossed },
  { value: "mecanica", short: "Mecânica", icon: Wrench },
  { value: "estacionamento", short: "Estacion.", icon: SquareParking },
  { value: "hospedagem", short: "Hotel", icon: BedDouble },
  { value: "lavagem", short: "Lavagem", icon: Droplets },
  { value: "multa", short: "Multa", icon: Siren },
  { value: "outro", short: "Outro", icon: Receipt },
];
export const CATEGORY_ICON = Object.fromEntries(CATEGORY_TILES.map((c) => [c.value, c.icon])) as Record<ExpenseCategory, LucideIcon>;

const MAX_PHOTOS = 4;

type NewPhoto = { key: string; payload: PhotoPayload };

export interface ExpenseSheetOptions {
  /** Editar uma despesa existente. */
  expense?: Expense;
  usageId?: number;
  truckId?: number;
  /** Foto que acabou de ser tirada pelo botão de câmera. */
  file?: File;
}

interface Ctx {
  open: (opts?: ExpenseSheetOptions) => void;
  /** Abre a câmera direto e, depois da foto, o formulário. Chamar dentro do clique. */
  openCamera: (opts?: ExpenseSheetOptions) => void;
}
const SheetCtx = createContext<Ctx>({ open: () => {}, openCamera: () => {} });
export const useExpenseSheet = () => useContext(SheetCtx);

export function ExpenseSheetProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ExpenseSheetOptions | null>(null);
  const pending = useRef<ExpenseSheetOptions>({});
  const camera = useRef<HTMLInputElement>(null);

  const openCamera = (o: ExpenseSheetOptions = {}) => {
    pending.current = o;
    camera.current?.click();
  };

  return (
    <SheetCtx.Provider value={{ open: (o = {}) => setOpts(o), openCamera }}>
      {children}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) setOpts({ ...pending.current, file });
        }}
      />
      {opts && <ExpenseSheet opts={opts} onClose={() => setOpts(null)} />}
    </SheetCtx.Provider>
  );
}

function ExpenseSheet({ opts, onClose }: { opts: ExpenseSheetOptions; onClose: () => void }) {
  const toast = useToast();
  const outbox = useOutbox();
  const { user, can } = useAuth();
  const gestao = can("admin", "operador");
  const editing = opts.expense;

  const [category, setCategory] = useState<ExpenseCategory | "">(editing?.category ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount).replace(".", ",") : "");
  const [paidBy, setPaidBy] = useState<"motorista" | "empresa">(editing?.paid_by ?? (gestao ? "empresa" : "motorista"));
  const [usageId, setUsageId] = useState<string>(String(editing?.usage_id ?? opts.usageId ?? ""));
  const [truckId, setTruckId] = useState<string>(String(editing?.truck_id ?? opts.truckId ?? ""));
  const [driverId, setDriverId] = useState<string>(String(editing?.driver_id ?? ""));
  const [spentAt, setSpentAt] = useState(localDateTimeInput(editing ? new Date(editing.spent_at) : new Date()));
  const [description, setDescription] = useState(editing?.description ?? "");
  const [odometer, setOdometer] = useState(editing?.odometer_km != null ? String(editing.odometer_km) : "");
  const [liters, setLiters] = useState(editing?.liters != null ? String(editing.liters).replace(".", ",") : "");
  const [more, setMore] = useState(!!editing && !!(editing.description || editing.odometer_km));
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [keptIds, setKeptIds] = useState<number[]>(editing?.photo_ids ?? []);
  const [processing, setProcessing] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const since = addDays(todayISO(), gestao ? -30 : -10);
  const trips = useFetch<Usage[]>(gestao ? (truckId ? `/usages?truck_id=${truckId}&from=${since}` : null) : `/usages?from=${since}`);
  const trucks = useFetch<Truck[]>("/trucks");
  const drivers = useFetch<Driver[]>(gestao ? "/users/drivers" : null);
  // Sem sinal na estrada: usa as últimas viagens/guinchos guardados no celular.
  const cacheKey = `guinchos.despesaCtx.${user?.id}`;
  const cached = useMemo<{ trips: Usage[]; trucks: Truck[] } | null>(() => {
    if (gestao) return null;
    try { return JSON.parse(localStorage.getItem(cacheKey) || "null"); } catch { return null; }
  }, [cacheKey, gestao]);
  useEffect(() => {
    if (gestao || !trips.data || !trucks.data) return;
    try { localStorage.setItem(cacheKey, JSON.stringify({ trips: trips.data.slice(0, 15), trucks: trucks.data })); } catch { /* */ }
  }, [trips.data, trucks.data, cacheKey, gestao]);
  const tripsData = trips.data ?? (trips.error ? cached?.trips ?? [] : null);
  const trucksData = trucks.data ?? cached?.trucks ?? null;
  const tripList = (tripsData || []).filter((u) => u.status !== "cancelada").slice(0, 15);

  // Motorista: já vincula à viagem em andamento (ou ao guincho da última viagem).
  const defaulted = useRef(!!editing || !!opts.usageId || !!opts.truckId);
  useEffect(() => {
    if (defaulted.current || gestao || !tripsData) return;
    defaulted.current = true;
    const active = tripsData.find((u) => u.status === "em_andamento");
    if (active) {
      setUsageId(String(active.id));
      setTruckId(String(active.truck_id));
    } else if (tripsData[0]) setTruckId(String(tripsData[0].truck_id));
  }, [tripsData, gestao]);

  // Localização (ajuda na conferência). Se o motorista negar, segue sem.
  useEffect(() => {
    if (editing || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }, [editing]);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, MAX_PHOTOS - photos.length - keptIds.length);
    if (!list.length) {
      toast("error", `No máximo ${MAX_PHOTOS} fotos`);
      return;
    }
    setProcessing((n) => n + list.length);
    for (const file of list) {
      try {
        const payload = await compressPhoto(file);
        setPhotos((p) => [...p, { key: `${Date.now()}-${Math.random()}`, payload }]);
      } catch (e) {
        toast("error", (e as Error).message);
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  };

  useEffect(() => {
    if (opts.file) addFiles([opts.file]);
  }, []);

  const pickTrip = (id: string) => {
    setUsageId(id);
    const t = tripList.find((u) => String(u.id) === id);
    if (t) {
      setTruckId(String(t.truck_id));
      if (gestao && t.driver_id && !driverId) setDriverId(String(t.driver_id));
    }
  };

  const submit = async () => {
    setError("");
    const value = parseMoney(amount);
    if (!category) return setError("Escolha o tipo da despesa");
    if (!Number.isFinite(value) || value <= 0) {
      amountRef.current?.focus();
      return setError("Informe o valor (ex.: 85,00)");
    }
    if (!usageId && !truckId) return setError("Escolha a viagem ou o guincho");
    if (!photos.length && !keptIds.length && !confirm("Enviar sem a foto da nota? Sem foto a conferência pode recusar.")) return;

    const body: Record<string, unknown> = {
      category,
      amount: value,
      paid_by: paidBy,
      usage_id: usageId || null,
      truck_id: truckId || null,
      driver_id: gestao ? driverId || null : undefined,
      spent_at: spentAt ? new Date(spentAt).toISOString() : null,
      description,
      odometer_km: odometer,
      liters: liters ? parseMoney(liters) : null,
      photos: photos.map((p) => p.payload),
    };
    setSaving(true);
    try {
      if (editing) {
        body.remove_photo_ids = editing.photo_ids.filter((id) => !keptIds.includes(id));
        await api(`/expenses/${editing.id}`, { method: "PUT", body });
        notifyExpensesChanged();
        toast("success", "Despesa atualizada");
      } else {
        const r = await outbox.send({ ...body, lat: geo?.lat ?? null, lng: geo?.lng ?? null });
        toast(
          "success",
          r === "sent" ? `Despesa de ${money(value)} enviada para conferência` : "Sem internet: a despesa ficou guardada no celular e será enviada sozinha",
        );
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const totalPhotos = photos.length + keptIds.length;
  const truck = trucksData?.find((t) => String(t.id) === truckId);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar despesa" : "Lançar despesa"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} loading={saving} disabled={processing > 0} className="h-12 text-base sm:h-10 sm:text-sm">
            {editing ? "Salvar" : "Enviar despesa"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <ErrorBox message={error} />}

        {/* 1. Foto da nota */}
        <section>
          <p className="mb-2 text-sm font-medium text-slate-700">Foto da nota / recibo</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {keptIds.map((id) => (
              <div key={id} className="relative shrink-0">
                <PhotoImg id={id} thumb className="size-24 rounded-lg ring-1 ring-slate-200" />
                <RemoveBtn onClick={() => setKeptIds((k) => k.filter((x) => x !== id))} />
              </div>
            ))}
            {photos.map((p) => (
              <div key={p.key} className="relative shrink-0">
                <img src={p.payload.thumb} alt="Foto da nota" className="size-24 rounded-lg object-cover ring-1 ring-slate-200" />
                <RemoveBtn onClick={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))} />
              </div>
            ))}
            {Array.from({ length: processing }).map((_, i) => (
              <div key={`p${i}`} className="flex size-24 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-brand-600">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ))}
            {totalPhotos + processing < MAX_PHOTOS && (
              <>
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-500 ${totalPhotos ? "size-24 text-xs" : "h-24 flex-1 text-sm font-medium"}`}
                >
                  <Camera className={totalPhotos ? "size-5" : "size-7"} />
                  {totalPhotos ? "Mais uma" : "Tirar foto da nota"}
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <ImagePlus className="size-5" /> Galeria
                </button>
              </>
            )}
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </section>

        {/* 2. O que foi */}
        <section>
          <p className="mb-2 text-sm font-medium text-slate-700">O que foi?</p>
          <div className="grid grid-cols-5 gap-1.5">
            {CATEGORY_TILES.map((c) => {
              const on = category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    setCategory(c.value);
                    // Foco síncrono: no iPhone o teclado só abre se for dentro do toque.
                    if (!amount) amountRef.current?.focus();
                  }}
                  aria-pressed={on}
                  title={EXPENSE_CATEGORY[c.value]}
                  className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-[11px] leading-tight font-medium transition ${
                    on ? "bg-brand-600 text-onbrand shadow-sm" : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <c.icon className="size-5" />
                  {c.short}
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Valor e quem pagou */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-slate-400">R$</span>
              <input
                ref={amountRef}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                placeholder="0,00"
                className="h-12 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-11 text-2xl font-semibold text-slate-900 tabular placeholder:text-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              />
            </div>
          </Field>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Quem pagou?</span>
            <div className="grid h-12 grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              {([["motorista", gestao ? "Motorista" : "Eu paguei"], ["empresa", "Empresa"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPaidBy(v)}
                  aria-pressed={paidBy === v}
                  className={`rounded-md text-sm font-medium transition ${paidBy === v ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{paidBy === "motorista" ? "Entra no reembolso depois de aprovada" : "Cartão, PIX ou faturado da empresa"}</p>
          </div>
        </section>

        {category === "combustivel" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Litros">
              <Input value={liters} onChange={(e) => setLiters(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="Opcional" />
            </Field>
            <Field label="Km no painel">
              <Input value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={truck ? String(truck.odometer_km) : "Opcional"} />
            </Field>
          </div>
        )}

        {/* 4. Vínculo com a viagem / guincho */}
        <section className="grid gap-3 sm:grid-cols-2">
          {gestao && (
            <Field label="Guincho">
              <Select value={truckId} onChange={(e) => { setTruckId(e.target.value); setUsageId(""); }}>
                <option value="">Selecione…</option>
                {trucksData?.map((t) => <option key={t.id} value={t.id}>{plateFmt(t.plate)} · {t.model}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Viagem" hint={!gestao && !usageId ? "Sem viagem: escolha o guincho abaixo" : undefined}>
            <Select value={usageId} onChange={(e) => pickTrip(e.target.value)} disabled={gestao && !truckId}>
              <option value="">{gestao ? "Sem viagem (gasto do guincho)" : "Sem viagem"}</option>
              {tripList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.status === "em_andamento" ? "AGORA · " : `${dateTime(u.started_at)} · `}
                  {!gestao ? `${plateFmt(u.plate)} · ` : ""}
                  {u.service}{u.client ? ` · ${u.client}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          {!gestao && !usageId && (
            <Field label="Guincho">
              <Select value={truckId} onChange={(e) => setTruckId(e.target.value)}>
                <option value="">Selecione…</option>
                {trucksData?.map((t) => <option key={t.id} value={t.id}>{plateFmt(t.plate)} · {t.model}</option>)}
              </Select>
            </Field>
          )}
          {gestao && (
            <Field label="Motorista">
              <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">Não informado</option>
                {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                {editing?.driver_id && !drivers.data?.some((d) => d.id === editing.driver_id) && (
                  <option value={editing.driver_id}>{editing.driver_name}</option>
                )}
              </Select>
            </Field>
          )}
        </section>

        {/* 5. Detalhes opcionais */}
        <section>
          <button type="button" onClick={() => setMore(!more)} className="flex items-center gap-1 text-sm font-medium text-brand-700">
            <ChevronDown className={`size-4 transition ${more ? "rotate-180" : ""}`} /> {more ? "Menos detalhes" : "Observação, data e hora"}
          </button>
          {more && (
            <div className="mt-3 space-y-3">
              <Field label="Observação">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Ex.: pneu traseiro furou na Anhanguera km 40" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data e hora">
                  <Input type="datetime-local" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
                </Field>
                {category !== "combustivel" && (
                  <Field label="Km no painel">
                    <Input value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Opcional" />
                  </Field>
                )}
              </div>
            </div>
          )}
        </section>

        {!editing && (
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="size-3.5" /> {geo ? "Localização registrada junto com a despesa" : "Localização: permita o acesso para registrar onde foi o gasto"}
          </p>
        )}
        {user && !gestao && editing && editing.status !== "pendente" && (
          <p className="text-xs text-slate-500">Despesa já conferida — alterações precisam ser feitas pelo escritório.</p>
        )}
      </div>
    </Modal>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 p-1 text-white shadow" aria-label="Remover foto">
      <X className="size-3.5" />
    </button>
  );
}
