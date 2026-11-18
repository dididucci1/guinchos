import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Availability from "./pages/Availability";
import Trucks from "./pages/Trucks";
import TruckDetail from "./pages/TruckDetail";
import Usages from "./pages/Usages";
import Maintenances from "./pages/Maintenances";
import Documents from "./pages/Documents";
import UsersPage from "./pages/Users";
import Expenses from "./pages/Expenses";
import Finance from "./pages/Finance";

/** Bloqueia a rota para quem não tem o nível de acesso. */
function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? <>{children}</> : <Navigate to="/" replace />;
}

const GESTAO: Role[] = ["admin", "operador"];

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner className="h-full items-center" />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  const home = user.role === "motorista" ? "/disponibilidade" : "/dashboard";
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Guard roles={GESTAO}><Dashboard /></Guard>} />
        <Route path="/disponibilidade" element={<Availability />} />
        <Route path="/guinchos" element={<Guard roles={GESTAO}><Trucks /></Guard>} />
        <Route path="/guinchos/:id" element={<Guard roles={GESTAO}><TruckDetail /></Guard>} />
        <Route path="/utilizacao" element={<Usages />} />
        <Route path="/despesas" element={<Expenses />} />
        <Route path="/financeiro" element={<Guard roles={GESTAO}><Finance /></Guard>} />
        <Route path="/manutencoes" element={<Guard roles={GESTAO}><Maintenances /></Guard>} />
        <Route path="/documentos" element={<Guard roles={GESTAO}><Documents /></Guard>} />
        <Route path="/usuarios" element={<Guard roles={["admin"]}><UsersPage /></Guard>} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}
