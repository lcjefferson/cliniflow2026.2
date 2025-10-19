import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { 
  LayoutDashboard, MessageSquare, Calendar, Users, 
  ClipboardList, UserPlus, Briefcase, DoorOpen, 
  FileText, DollarSign, LogOut, Activity
} from "lucide-react";

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = user?.role?.is_admin;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const menuItems = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/omnichannel", icon: MessageSquare, label: "Omnichannel" },
    { path: "/calendar", icon: Calendar, label: "Calendário" },
    { path: "/leads", icon: Users, label: "Leads" },
    { path: "/followup", icon: ClipboardList, label: "Follow-up" },
    { path: "/patients", icon: UserPlus, label: "Pacientes" },
    { path: "/medical-records", icon: FileText, label: "Prontuários" },
    { path: "/professionals", icon: Briefcase, label: "Profissionais" },
    { path: "/services", icon: Activity, label: "Serviços" },
    { path: "/rooms", icon: DoorOpen, label: "Salas" },
  ];

  if (isAdmin) {
    menuItems.push({ path: "/revenue", icon: DollarSign, label: "Faturamento" });
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-72 bg-white shadow-xl flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
            CliniFlow
          </h1>
          <p className="text-sm text-gray-500 mt-1">{user?.name}</p>
          <p className="text-xs text-gray-400">{isAdmin ? "Administrador" : "Atendente"}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-link-${item.label.toLowerCase()}`}
                className={`sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            data-testid="logout-button"
            className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
