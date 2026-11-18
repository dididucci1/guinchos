export type Role = "admin" | "operador" | "motorista";
export type TruckStatus = "disponivel" | "em_servico" | "manutencao" | "inativo";
export type TruckKind = "plataforma" | "asa_delta" | "lanca" | "integrado" | "pesado";
export type MaintenanceType = "preventiva" | "corretiva";
export type MaintenanceStatus = "agendada" | "em_andamento" | "concluida" | "cancelada";
export type DocType = "crlv" | "licenciamento" | "ipva" | "seguro" | "antt" | "tacografo" | "inspecao" | "outro";
export type DocSituation = "vencido" | "a_vencer" | "em_dia" | "sem_validade";
export type UsageStatus = "em_andamento" | "concluida" | "cancelada";
export type ExpenseCategory =
  | "combustivel" | "pedagio" | "pneu" | "mecanica" | "alimentacao"
  | "hospedagem" | "estacionamento" | "lavagem" | "multa" | "outro";
export type ExpenseStatus = "pendente" | "aprovada" | "recusada";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  cnh_number?: string | null;
  cnh_expiry?: string | null;
  active?: boolean;
}

export interface Driver {
  id: number;
  name: string;
  phone: string | null;
  cnh_expiry: string | null;
}

export interface Truck {
  id: number;
  plate: string;
  brand: string | null;
  model: string;
  year: number | null;
  kind: TruckKind;
  capacity_kg: number;
  odometer_km: number;
  status: TruckStatus;
  location: string | null;
  notes: string | null;
  status_since: string;
  usage_id: number | null;
  usage_service: string | null;
  usage_client: string | null;
  usage_destination: string | null;
  usage_started_at: string | null;
  usage_start_km: number | null;
  usage_driver_id: number | null;
  usage_driver: string | null;
  usage_expenses: number;
  maintenance_id: number | null;
  maintenance_description: string | null;
  maintenance_type: MaintenanceType | null;
  doc_alerts: number;
}

export interface TruckEvent {
  id: number;
  from_status: TruckStatus | null;
  to_status: TruckStatus;
  note: string | null;
  user_name: string | null;
  created_at: string;
}

export interface TruckDetail extends Truck {
  events: TruckEvent[];
  stats: { total_services: number; total_km: number; month_km: number; maintenance_cost: number };
}

export interface Maintenance {
  id: number;
  truck_id: number;
  plate: string;
  model: string;
  type: MaintenanceType;
  description: string;
  status: MaintenanceStatus;
  scheduled_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  odometer_km: number | null;
  cost: number | null;
  provider: string | null;
  next_due_date: string | null;
  next_due_km: number | null;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface PreventiveDue {
  truck_id: number;
  plate: string;
  model: string;
  odometer_km: number;
  maintenance_id: number;
  description: string;
  next_due_date: string | null;
  next_due_km: number | null;
  days_left: number | null;
  km_left: number | null;
  situation: "vencida" | "proxima" | "ok";
  scheduled_id: number | null;
}

export interface FleetDocument {
  id: number;
  truck_id: number;
  plate: string;
  model: string;
  type: DocType;
  number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  amount: number | null;
  notes: string | null;
  situation: DocSituation;
  days_left: number | null;
}

export interface Usage {
  id: number;
  truck_id: number;
  plate: string;
  model: string;
  driver_id: number | null;
  driver_name: string | null;
  client: string | null;
  service: string;
  origin: string | null;
  destination: string | null;
  vehicle: string | null;
  status: UsageStatus;
  started_at: string;
  ended_at: string | null;
  start_km: number;
  end_km: number | null;
  distance_km: number | null;
  notes: string | null;
  amount: number | null;
  expenses_total: number;
  expenses_count: number;
}

export interface Expense {
  id: number;
  truck_id: number | null;
  plate: string | null;
  model: string | null;
  usage_id: number | null;
  usage_service: string | null;
  usage_client: string | null;
  usage_started_at: string | null;
  driver_id: number | null;
  driver_name: string | null;
  category: ExpenseCategory;
  amount: number;
  spent_at: string;
  description: string | null;
  odometer_km: number | null;
  liters: number | null;
  paid_by: "motorista" | "empresa";
  lat: number | null;
  lng: number | null;
  status: ExpenseStatus;
  review_note: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  reimbursed_at: string | null;
  photo_ids: number[];
  created_at: string;
}

export interface FinanceData {
  totals: {
    revenue: number; trips: number; trips_without_amount: number; km: number;
    expenses: number; expenses_pending: number; expenses_pending_count: number;
    maintenance: number; documents: number;
  };
  byCategory: { category: ExpenseCategory; amount: number; count: number }[];
  byTruck: { id: number; plate: string; model: string; trips: number; km: number; revenue: number; expenses: number; maintenance: number; documents: number }[];
  trips: {
    id: number; truck_id: number; plate: string; model: string; service: string; client: string | null;
    origin: string | null; destination: string | null; started_at: string; ended_at: string | null;
    distance_km: number; amount: number | null; driver_name: string | null;
    expenses: number; expense_count: number; pending_count: number;
  }[];
  monthly: { month: string; revenue: number; expenses: number; maintenance: number; documents: number }[];
  reimburse: { driver_id: number | null; driver_name: string | null; amount: number; count: number }[];
}

export interface DashboardData {
  counts: Record<TruckStatus, number>;
  expenses: { pending_count: number; pending_amount: number; month_revenue: number; month_expenses: number };
  month: { services: number; km: number; maintenance_cost: number; maintenances: number };
  docs: FleetDocument[];
  preventive: PreventiveDue[];
  cnh: { id: number; name: string; cnh_expiry: string; days_left: number }[];
  active: {
    id: number; service: string; client: string | null; destination: string | null; started_at: string;
    start_km: number; truck_id: number; plate: string; model: string; driver_name: string | null;
  }[];
  scheduled: { id: number; type: MaintenanceType; description: string; scheduled_date: string | null; truck_id: number; plate: string; model: string }[];
  topTrucks: { id: number; plate: string; model: string; services: number; km: number }[];
  prev: { services: number; km: number; maintenance_cost: number };
  daily: { day: string; km: number; services: number }[];
  maintMonthly: { month: string; preventiva: number; corretiva: number; count: number }[];
  serviceTypes: { service: string; count: number }[];
}
