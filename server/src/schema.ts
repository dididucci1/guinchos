import bcrypt from "bcryptjs";
import { exec, query } from "./db.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','operador','motorista')),
  phone         TEXT,
  cnh_number    TEXT,
  cnh_expiry    DATE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trucks (
  id            SERIAL PRIMARY KEY,
  plate         TEXT NOT NULL UNIQUE,
  brand         TEXT,
  model         TEXT NOT NULL,
  year          INT,
  kind          TEXT NOT NULL DEFAULT 'plataforma' CHECK (kind IN ('plataforma','asa_delta','lanca','integrado','pesado')),
  capacity_kg   INT NOT NULL CHECK (capacity_kg > 0),
  odometer_km   INT NOT NULL DEFAULT 0 CHECK (odometer_km >= 0),
  status        TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','em_servico','manutencao','inativo')),
  location      TEXT,
  notes         TEXT,
  status_since  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenances (
  id             SERIAL PRIMARY KEY,
  truck_id       INT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('preventiva','corretiva')),
  description    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','em_andamento','concluida','cancelada')),
  scheduled_date DATE,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  odometer_km    INT,
  cost           NUMERIC(12,2) CHECK (cost >= 0),
  provider       TEXT,
  next_due_date  DATE,
  next_due_km    INT,
  notes          TEXT,
  created_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenances_truck_idx ON maintenances(truck_id);
CREATE INDEX IF NOT EXISTS maintenances_status_idx ON maintenances(status);

CREATE TABLE IF NOT EXISTS documents (
  id          SERIAL PRIMARY KEY,
  truck_id    INT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('crlv','licenciamento','ipva','seguro','antt','tacografo','inspecao','outro')),
  number      TEXT,
  issue_date  DATE,
  expiry_date DATE,
  amount      NUMERIC(12,2) CHECK (amount >= 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_truck_idx ON documents(truck_id);
CREATE INDEX IF NOT EXISTS documents_expiry_idx ON documents(expiry_date);

CREATE TABLE IF NOT EXISTS usages (
  id           SERIAL PRIMARY KEY,
  truck_id     INT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  driver_id    INT REFERENCES users(id),
  client       TEXT,
  service      TEXT NOT NULL,
  origin       TEXT,
  destination  TEXT,
  vehicle      TEXT,
  status       TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluida','cancelada')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  start_km     INT NOT NULL CHECK (start_km >= 0),
  end_km       INT CHECK (end_km >= start_km),
  notes        TEXT,
  created_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usages_truck_idx ON usages(truck_id);
CREATE INDEX IF NOT EXISTS usages_started_idx ON usages(started_at);
CREATE UNIQUE INDEX IF NOT EXISTS usages_one_active_per_truck ON usages(truck_id) WHERE status = 'em_andamento';

CREATE TABLE IF NOT EXISTS truck_events (
  id          SERIAL PRIMARY KEY,
  truck_id    INT NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  user_id     INT REFERENCES users(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS truck_events_truck_idx ON truck_events(truck_id);

-- Valor cobrado do cliente pela viagem (financeiro).
ALTER TABLE usages ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) CHECK (amount >= 0);

-- Despesas lançadas pelos motoristas (pneu, combustível, pedágio...) com foto da nota.
CREATE TABLE IF NOT EXISTS expenses (
  id            SERIAL PRIMARY KEY,
  client_uuid   TEXT UNIQUE,
  truck_id      INT REFERENCES trucks(id) ON DELETE CASCADE,
  usage_id      INT REFERENCES usages(id) ON DELETE SET NULL,
  driver_id     INT REFERENCES users(id),
  category      TEXT NOT NULL CHECK (category IN ('combustivel','pedagio','pneu','mecanica','alimentacao','hospedagem','estacionamento','lavagem','multa','outro')),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  spent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  description   TEXT,
  odometer_km   INT,
  liters        NUMERIC(8,2),
  paid_by       TEXT NOT NULL DEFAULT 'motorista' CHECK (paid_by IN ('motorista','empresa')),
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','recusada')),
  review_note   TEXT,
  reviewed_by   INT REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  reimbursed_at TIMESTAMPTZ,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_truck_idx ON expenses(truck_id);
CREATE INDEX IF NOT EXISTS expenses_usage_idx ON expenses(usage_id);
CREATE INDEX IF NOT EXISTS expenses_spent_idx ON expenses(spent_at);
CREATE INDEX IF NOT EXISTS expenses_status_idx ON expenses(status);

CREATE TABLE IF NOT EXISTS expense_photos (
  id          SERIAL PRIMARY KEY,
  expense_id  INT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  thumb       BYTEA,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expense_photos_expense_idx ON expense_photos(expense_id);
`;

export async function migrate() {
  await exec(SCHEMA);
  const [{ count }] = await query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users");
  if (count === 0) {
    await query("INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')", [
      "Administrador",
      "admin@guinchos.com",
      await bcrypt.hash("123", 10),
    ]);
    console.log("Usuário inicial criado: admin@guinchos.com / 123");
  }
}
