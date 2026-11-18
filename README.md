# Frota Guinchos — Gestão de frota

App web (computador e celular) para gestão de uma frota de guinchos: cadastro, quilometragem, disponibilidade em tempo real, manutenções preventivas e corretivas, documentação com vencimentos e histórico de utilização.

**Stack:** React + TypeScript (TSX) + Vite + Tailwind + React Router no front · Node + Express + TypeScript (tsx) no back · PostgreSQL.

## Rodando

```bash
npm run install:all   # instala raiz, server e web
npm run seed:demo     # (opcional) dados de demonstração
npm run dev           # API em :3002 e front em http://localhost:5173
```

**Banco de dados:** com `DATABASE_URL` no `.env` usa PostgreSQL (Neon, RDS etc.). Sem ela, usa um Postgres embutido (PGlite) gravado em `.data/`, sem precisar instalar nada. As tabelas são criadas sozinhas na primeira execução.

> O PGlite aceita um processo por vez: pare o `npm run dev` antes de rodar o `seed:demo`.

Produção (um único processo Node serve API + front):

```bash
npm run build
npm start             # http://localhost:3002
```

**Acesso inicial:** `admin@guinchos.com` / `123`. Troque a senha em *Senha* no menu lateral.
**Demonstração:** `operador@demo.com` e motoristas `joao@demo.com`, `marcos@demo.com`... (senha `123`). Para apagar: `npm run seed:demo -- --limpar`.

## Telas (rotas)

| Rota | Tela | Acesso |
|---|---|---|
| `/dashboard` | Situação da frota, números do mês, alertas de vencimento, guinchos na rua | admin, operador |
| `/disponibilidade` | Quadro em tempo real (atualiza a cada 15 s), registrar saída e retorno | todos |
| `/guinchos` | Cadastro: placa, marca/modelo, ano, tipo, capacidade de carga, km | admin, operador |
| `/guinchos/:id` | Detalhe com abas: resumo/linha do tempo, utilização, manutenções, documentos | admin, operador |
| `/utilizacao` | Histórico de saídas com filtros (guincho, motorista, período, situação) | todos (motorista vê só as dele) |
| `/despesas` | Motorista: tira foto da nota e lança (pneu, diesel, pedágio…). Escritório: confere, aprova/recusa e controla o reembolso | todos (motorista vê só as dele) |
| `/financeiro` | Faturamento x custos, resultado por guincho e por viagem, custo por km, a reembolsar | admin, operador |
| `/manutencoes` | Preventivas e corretivas + próximas preventivas por data/km | admin, operador |
| `/documentos` | CRLV, licenciamento, IPVA, seguro, ANTT, tacógrafo… com vencimentos e renovação | admin, operador |
| `/usuarios` | Usuários, níveis de acesso e CNH dos motoristas | admin |

## Regras de negócio

- **Disponibilidade** muda sozinha:
  - registrar saída → *em serviço* (só sai se estiver *disponível*);
  - registrar retorno → grava o km de chegada, atualiza o hodômetro e volta para *disponível*;
  - iniciar manutenção → *em manutenção* (não pode estar em serviço); concluir ou cancelar → libera.
  - *Inativo* é manual (guincho vendido, parado por tempo indeterminado). Toda mudança fica na linha do tempo do guincho.
- **Quilometragem** só aumenta (atualizada pelos retornos e manutenções). Apenas o admin pode corrigir para baixo, na edição do guincho.
- **Preventivas:** ao concluir, informe a próxima por data e/ou km. O sistema avisa 15 dias ou 1.000 km antes e mostra como vencida depois disso. O aviso some quando uma nova preventiva é agendada.
- **Documentos:** aviso 30 dias antes do vencimento. *Renovar* cria um novo documento; o anterior fica no histórico.
- **Despesas de viagem:** o motorista toca em *Despesa* (botão fixo no celular), a câmera abre, ele escolhe o tipo, digita o valor e envia. A despesa já vai ligada à viagem em andamento, com a localização. As fotos são reduzidas no celular (~250 KB) e ficam no banco.
  - **Sem internet:** a despesa fica guardada no celular e é enviada sozinha quando o sinal volta (sem duplicar).
  - **Conferência:** *a conferir* → *aprovada* ou *recusada* (com motivo, que o motorista vê). Depois de conferida, só o escritório altera.
  - **Reembolso:** despesas aprovadas que o motorista pagou do bolso entram em *A reembolsar*; *Paguei* marca todas de um motorista como reembolsadas.
- **Financeiro:** faturamento = valor cobrado das viagens concluídas (definido na saída, no retorno ou direto na tabela do Financeiro). Custos = despesas de viagem (sem as recusadas) + manutenções concluídas + documentos/seguros (pela data de emissão).
- **CNH dos motoristas** vencida ou a vencer também aparece nos alertas.

## Níveis de acesso

| Nível | O que faz |
|---|---|
| **Administrador** | Tudo, inclusive usuários e exclusões |
| **Operador** | Frota, saídas/retornos, manutenções e documentos |
| **Motorista** | Vê a disponibilidade, registra as próprias saídas e retornos, lança as próprias despesas e vê o próprio histórico |

## Estrutura

```
server/src/
  index.ts          servidor local (serve web/dist em produção)
  app.ts            Express, rotas e tratamento de erros
  db.ts             PostgreSQL (pg) ou PGlite, mesma interface
  schema.ts         tabelas + usuário inicial
  auth.ts           JWT, requireAuth, requireRole
  fleet.ts          regras de status, hodômetro e SQL de alertas
  validation.ts     validações com zod
  routes/           auth, users, trucks, usages, maintenances, documents, expenses, finance, dashboard
  seed-demo.ts      dados de demonstração
web/src/
  App.tsx           rotas (React Router) com controle de acesso
  pages/            Login, Dashboard, Availability, Trucks, TruckDetail, Usages, Maintenances, Documents, Users
  components/       Layout (menu lateral), formulários (modais), tabelas, ui
  lib/              api, auth, format, types, useFetch, useForm, theme
```
