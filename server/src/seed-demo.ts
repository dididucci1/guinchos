/**
 * Dados de demonstração: motoristas, guinchos, utilizações dos últimos 90 dias, manutenções e documentos.
 *   npm run seed:demo            cria
 *   npm run seed:demo -- --limpar remove (só os registros de demonstração)
 */
import bcrypt from "bcryptjs";
import { query, tx } from "./db.js";
import { migrate } from "./schema.js";

const DEMO_PLATES = ["GCH1A23", "GCH2B34", "GCH3C45", "GCH4D56", "GCH5E67", "GCH6F78", "GCH7G89"];
const clean = process.argv.includes("--limpar");

async function wipe() {
  await query("DELETE FROM expenses WHERE driver_id IN (SELECT id FROM users WHERE email LIKE '%@demo.com') OR truck_id IN (SELECT id FROM trucks WHERE plate = ANY($1))", [DEMO_PLATES]);
  await query("DELETE FROM trucks WHERE plate = ANY($1)", [DEMO_PLATES]);
  await query("DELETE FROM users WHERE email LIKE '%@demo.com'");
}

const rand = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
const pick = <T>(arr: T[]) => arr[rand(0, arr.length - 1)];
const daysFromToday = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toLocaleDateString("en-CA");
};

async function main() {
  await migrate();
  await wipe();
  if (clean) {
    console.log("Dados de demonstração removidos.");
    return;
  }

  const hash = await bcrypt.hash("123", 10);
  const drivers: number[] = [];
  const people: [string, string, number][] = [
    ["João Pereira", "joao", 200],
    ["Marcos Lima", "marcos", 12],
    ["Rafael Souza", "rafael", 400],
    ["Paulo Henrique", "paulo", -3],
    ["Anderson Silva", "anderson", 300],
  ];
  for (const [name, login, cnhDays] of people) {
    const [u] = await query(
      `INSERT INTO users (name, email, password_hash, role, phone, cnh_number, cnh_expiry)
       VALUES ($1,$2,$3,'motorista',$4,$5,$6) RETURNING id`,
      [name, `${login}@demo.com`, hash, `(11) 9${rand(1000, 9999)}-${rand(1000, 9999)}`, String(rand(1e10, 9e10)), daysFromToday(cnhDays)],
    );
    drivers.push(u.id);
  }
  await query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ('Carla Operações','operador@demo.com',$1,'operador')",
    [hash],
  );

  const fleet: [string, string, string, number, string, number, number][] = [
    ["GCH1A23", "Volkswagen", "Delivery 11.180 Plataforma", 2021, "plataforma", 4500, 148_200],
    ["GCH2B34", "Mercedes-Benz", "Accelo 1016 Plataforma", 2022, "plataforma", 5000, 96_400],
    ["GCH3C45", "Iveco", "Daily 70C17 Plataforma", 2020, "plataforma", 3500, 201_350],
    ["GCH4D56", "Ford", "Cargo 1119 Asa-delta", 2019, "asa_delta", 3000, 256_900],
    ["GCH5E67", "Volkswagen", "Constellation 24.280 Integrado", 2018, "integrado", 12000, 312_700],
    ["GCH6F78", "Mercedes-Benz", "Atego 2426 Pesado", 2023, "pesado", 18000, 61_800],
    ["GCH7G89", "Fiat", "Ducato Plataforma", 2017, "plataforma", 1800, 288_100],
  ];

  const services = ["Pane mecânica", "Colisão", "Remoção pátio", "Transferência", "Pane elétrica", "Pneu furado", "Leilão", "Concessionária"];
  const clients = ["Porto Seguro", "Allianz", "Particular", "Localiza", "Prefeitura", "Mapfre", "Movida", "Concessionária Norte"];
  const places = ["Centro", "Marginal Tietê", "Rod. Anhanguera km 32", "Pátio Municipal", "Zona Sul", "Osasco", "Guarulhos", "ABC", "Rod. Bandeirantes km 50"];
  const cars = ["Gol branco", "Onix prata", "HB20 preto", "Hilux", "Corolla", "Strada", "Caminhão 3/4", "Kwid vermelho", "Compass"];

  await tx(async (db) => {
    for (const [i, [plate, brand, model, year, kind, cap, km]] of fleet.entries()) {
      // Começa 90 dias atrás com km menor e vai somando as viagens.
      let odo = km - rand(4000, 9000);
      const [t] = await db.query(
        `INSERT INTO trucks (plate, brand, model, year, kind, capacity_kg, odometer_km, location, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() - interval '120 days') RETURNING id`,
        [plate, brand, model, year, kind, cap, odo, "Base"],
      );
      await db.query("INSERT INTO truck_events (truck_id, to_status, note, created_at) VALUES ($1,'disponivel','Guincho cadastrado', now() - interval '120 days')", [t.id]);

      // Utilizações concluídas
      for (let d = 90; d >= 1; d--) {
        if (Math.random() < 0.45) continue;
        const trips = rand(1, 2);
        for (let k = 0; k < trips; k++) {
          const dist = rand(8, kind === "pesado" || kind === "integrado" ? 180 : 90);
          const start = new Date();
          start.setDate(start.getDate() - d);
          start.setHours(7 + k * 6 + rand(0, 4), rand(0, 59), 0, 0);
          const end = new Date(start.getTime() + rand(50, 240) * 60000);
          // Valor cobrado: saída + km (alguns ficam sem valor, para conferir no financeiro).
          const heavy = kind === "pesado" || kind === "integrado";
          const amount = Math.random() < 0.08 ? null : Math.round(((heavy ? 450 : 180) + dist * (heavy ? 9 : 4.5)) / 10) * 10;
          const driver = pick(drivers);
          const [usage] = await db.query(
            `INSERT INTO usages (truck_id, driver_id, client, service, origin, destination, vehicle, status, started_at, ended_at, start_km, end_km, amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'concluida',$8,$9,$10,$11,$12) RETURNING id`,
            [t.id, driver, pick(clients), pick(services), pick(places), pick(places), pick(cars), start, end, odo, odo + dist, amount],
          );
          // Despesas da viagem: pedágio e combustível às vezes, pneu/alimentação raramente.
          const costs: [string, number, string | null, string][] = [];
          if (dist > 40 && Math.random() < 0.6) costs.push(["pedagio", rand(8, 32) + 0.4, null, "empresa"]);
          if (Math.random() < 0.25) costs.push(["combustivel", rand(180, 520), "Posto Ipiranga", "empresa"]);
          if (Math.random() < 0.04) costs.push(["pneu", rand(60, 180), "Borracharia na rodovia — pneu furado", "motorista"]);
          if (dist > 60 && Math.random() < 0.2) costs.push(["alimentacao", rand(25, 55), null, "motorista"]);
          for (const [category, value, description, paidBy] of costs) {
            const status = d > 6 ? (Math.random() < 0.95 ? "aprovada" : "recusada") : "pendente";
            await db.query(
              `INSERT INTO expenses (truck_id, usage_id, driver_id, category, amount, spent_at, description, paid_by, status, review_note, reviewed_at, reimbursed_at, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$3)`,
              [
                t.id, usage.id, driver, category, value, new Date(start.getTime() + rand(10, 50) * 60000), description, paidBy, status,
                status === "recusada" ? "Nota ilegível — tire outra foto" : null,
                status === "pendente" ? null : end,
                status === "aprovada" && paidBy === "motorista" && d > 15 ? end : null,
              ],
            );
          }
          odo += dist;
        }
      }
      await db.query("UPDATE trucks SET odometer_km = $1 WHERE id = $2", [odo, t.id]);

      // Preventivas concluídas: troca de óleo a cada 10.000 km / 90 dias
      const prevDaysAgo = [70, 40, 95, 20, 110, 30, 60][i];
      const prevKm = odo - rand(2000, 9800);
      await db.query(
        `INSERT INTO maintenances (truck_id, type, description, status, scheduled_date, started_at, completed_at, odometer_km, cost, provider, next_due_date, next_due_km)
         VALUES ($1,'preventiva','Troca de óleo e filtros','concluida',$2, $3::date + time '08:00', $3::date + time '17:00',$4,$5,'Auto Center Diesel',$6,$7)`,
        [t.id, daysFromToday(-prevDaysAgo), daysFromToday(-prevDaysAgo), prevKm, rand(600, 1400), daysFromToday(-prevDaysAgo + 90), prevKm + 10000],
      );
      if (Math.random() < 0.7) {
        const d = rand(10, 85);
        await db.query(
          `INSERT INTO maintenances (truck_id, type, description, status, started_at, completed_at, odometer_km, cost, provider)
           VALUES ($1,'corretiva',$2,'concluida', now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '6 hours', $4, $5, $6)`,
          [t.id, pick(["Troca de pastilhas de freio", "Reparo no guincho hidráulico", "Substituição de cabo de aço", "Troca de bateria", "Reparo elétrico"]), d, odo - rand(500, 3000), rand(300, 4800), pick(["Oficina Central", "Hidráulica Paulista", "Auto Elétrica Rocha"])],
        );
      }

      // Documentos
      const docs: [string, number | null][] = [
        ["crlv", rand(-5, 300)],
        ["licenciamento", [20, 180, -8, 240, 15, 300, 200][i]],
        ["seguro", rand(25, 330)],
        ["antt", rand(60, 600)],
        ["tacografo", kind === "pesado" || kind === "integrado" ? rand(10, 400) : null],
      ];
      for (const [type, days] of docs) {
        if (days === null) continue;
        await db.query(
          `INSERT INTO documents (truck_id, type, number, issue_date, expiry_date, amount) VALUES ($1,$2,$3,$4,$5,$6)`,
          [t.id, type, String(rand(1e8, 9e8)), daysFromToday(days - 365), daysFromToday(days), type === "seguro" ? rand(4000, 12000) : type === "licenciamento" ? rand(150, 400) : null],
        );
      }
    }
  });

  // Situação atual: 2 em serviço, 1 em manutenção, 1 manutenção agendada.
  const ids = await query<{ id: number; odometer_km: number; plate: string }>("SELECT id, odometer_km, plate FROM trucks WHERE plate = ANY($1) ORDER BY plate", [DEMO_PLATES]);
  for (const [n, t] of [ids[0], ids[3]].entries()) {
    await query(
      `INSERT INTO usages (truck_id, driver_id, client, service, origin, destination, vehicle, started_at, start_km)
       VALUES ($1,$2,'Porto Seguro',$3,'Base',$4,$5, now() - interval '${40 + n * 35} minutes', $6)`,
      [t.id, drivers[n], n ? "Colisão" : "Pane mecânica", n ? "Marginal Pinheiros" : "Rod. Anhanguera km 21", n ? "Civic cinza" : "Saveiro branca", t.odometer_km],
    );
    await query("UPDATE trucks SET status='em_servico', status_since = now() - interval '40 minutes' WHERE id=$1", [t.id]);
    await query("INSERT INTO truck_events (truck_id, from_status, to_status, note) VALUES ($1,'disponivel','em_servico','Saída registrada')", [t.id]);
  }
  await query(
    `INSERT INTO maintenances (truck_id, type, description, status, started_at, odometer_km, provider)
     VALUES ($1,'corretiva','Vazamento no cilindro hidráulico da plataforma','em_andamento', now() - interval '1 day', $2, 'Hidráulica Paulista')`,
    [ids[2].id, ids[2].odometer_km],
  );
  await query("UPDATE trucks SET status='manutencao', status_since = now() - interval '1 day' WHERE id=$1", [ids[2].id]);
  await query("INSERT INTO truck_events (truck_id, from_status, to_status, note) VALUES ($1,'disponivel','manutencao','Vazamento hidráulico')", [ids[2].id]);
  await query(
    `INSERT INTO maintenances (truck_id, type, description, status, scheduled_date, provider)
     VALUES ($1,'preventiva','Revisão 300.000 km','agendada', CURRENT_DATE + 4, 'Concessionária VW')`,
    [ids[4].id],
  );

  console.log("Dados de demonstração criados. Logins: operador@demo.com, joao@demo.com (motorista)... senha 123");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
