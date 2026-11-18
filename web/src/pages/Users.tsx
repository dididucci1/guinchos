import { useEffect, useState } from "react";
import { Plus, Users as UsersIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useFetch } from "../lib/useFetch";
import { useForm } from "../lib/useForm";
import { date, daysLabel, ROLE_LABEL, todayISO } from "../lib/format";
import type { Role, User } from "../lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Table, useToast } from "../components/ui";

const ROLE_HELP: Record<Role, string> = {
  admin: "Acesso total, inclusive usuários e exclusões",
  operador: "Gerencia frota, saídas, manutenções e documentos",
  motorista: "Vê a disponibilidade e registra as próprias saídas e retornos",
};

const ROLE_TONE: Record<Role, { label: string; cls: string; dot: string }> = {
  admin: { label: ROLE_LABEL.admin, cls: "bg-brand-50 text-brand-800 ring-brand-200", dot: "bg-brand-600" },
  operador: { label: ROLE_LABEL.operador, cls: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500" },
  motorista: { label: ROLE_LABEL.motorista, cls: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
};

export default function UsersPage() {
  const { data, error, reload } = useFetch<User[]>("/users");
  const [editing, setEditing] = useState<User | "new" | null>(null);

  const cnhInfo = (u: User) => {
    if (!u.cnh_expiry) return "—";
    const days = Math.round((new Date(u.cnh_expiry + "T12:00:00").getTime() - new Date(todayISO() + "T12:00:00").getTime()) / 86400000);
    return (
      <span className={days < 0 ? "text-red-600" : days <= 30 ? "text-amber-700" : "text-slate-600"}>
        {date(u.cnh_expiry)}
        {days <= 30 && <span className="block text-xs">{daysLabel(days)}</span>}
      </span>
    );
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle="Acessos ao sistema e cadastro dos motoristas"
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Novo usuário</Button>}
      />
      {error && <ErrorBox message={error} />}
      <Card>
        {!data ? (
          <Spinner />
        ) : !data.length ? (
          <Empty icon={<UsersIcon className="size-6" />} title="Nenhum usuário" />
        ) : (
          <Table head={["Nome", "Nível", "Telefone", "CNH vence", "Situação"]}>
            {data.map((u) => (
              <tr key={u.id} onClick={() => setEditing(u)} className={`cursor-pointer hover:bg-slate-50 ${u.active ? "" : "opacity-60"}`}>
                <td className="px-4 py-3">
                  <p className="text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="px-4 py-3"><Badge tone={ROLE_TONE[u.role]} /></td>
                <td className="px-4 py-3 text-slate-600">{u.phone || "—"}</td>
                <td className="px-4 py-3 tabular">{u.role === "motorista" ? cnhInfo(u) : "—"}</td>
                <td className="px-4 py-3 text-slate-600">{u.active ? "Ativo" : "Inativo"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <UserModal user={editing} onClose={() => setEditing(null)} onSaved={reload} />
    </>
  );
}

function UserModal({ user, onClose, onSaved }: { user: User | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { user: me } = useAuth();
  const isNew = user === "new";
  const f = useForm<Record<string, any>>({});

  useEffect(() => {
    if (!user) return;
    f.setError("");
    const u = isNew ? null : user;
    f.setValues({
      name: u?.name ?? "",
      email: u?.email ?? "",
      role: u?.role ?? "motorista",
      phone: u?.phone ?? "",
      cnh_number: u?.cnh_number ?? "",
      cnh_expiry: u?.cnh_expiry ?? "",
      active: u?.active ?? true,
      password: "",
    });
  }, [user]);

  if (!user) return null;
  const self = !isNew && user.id === me?.id;

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Novo usuário" : "Editar usuário"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button form="user-form" loading={f.saving}>Salvar</Button>
        </>
      }
    >
      <form
        id="user-form"
        onSubmit={f.submit(isNew ? "/users" : `/users/${user.id}`, isNew ? "POST" : "PUT", () => {
          toast("success", isNew ? "Usuário criado" : "Usuário atualizado");
          onSaved();
          onClose();
        })}
        className="space-y-4"
      >
        {f.error && <ErrorBox message={f.error} />}
        <Field label="Nome"><Input {...f.field("name")} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail (login)"><Input {...f.field("email")} type="email" required /></Field>
          <Field label="Telefone"><Input {...f.field("phone")} type="tel" /></Field>
        </div>
        <Field label="Nível de acesso" hint={ROLE_HELP[f.values.role as Role]}>
          <Select {...f.field("role")} disabled={self}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        {f.values.role === "motorista" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número da CNH"><Input {...f.field("cnh_number")} /></Field>
            <Field label="Validade da CNH"><Input {...f.field("cnh_expiry")} type="date" /></Field>
          </div>
        )}
        <Field label={isNew ? "Senha" : "Nova senha"} hint={isNew ? undefined : "Deixe em branco para manter a atual"}>
          <Input {...f.field("password")} type="password" required={isNew} minLength={3} autoComplete="new-password" />
        </Field>
        {!isNew && !self && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 accent-brand-600" checked={!!f.values.active} onChange={(e) => f.set("active", e.target.checked)} />
            Usuário ativo
          </label>
        )}
      </form>
    </Modal>
  );
}
