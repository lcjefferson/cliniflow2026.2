import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { 
  LayoutDashboard, MessageSquare, Calendar, Users, 
  ClipboardList, UserPlus, Briefcase, DoorOpen, 
  FileText, DollarSign, LogOut, Activity, Settings
} from "lucide-react";

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = user?.role?.is_admin;
  const userType = user?.user_type || "consultor"; // admin, consultor, profissional

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Define menus baseado no tipo de usuário
  const allMenuItems = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "consultor"] },
    { path: "/omnichannel", icon: MessageSquare, label: "Omnichannel", roles: ["admin", "consultor"] },
    { path: "/calendar", icon: Calendar, label: "Calendário", roles: ["admin", "consultor", "profissional"] },
    { path: "/leads", icon: Users, label: "Leads", roles: ["admin", "consultor"] },
    { path: "/followup", icon: ClipboardList, label: "Follow-up", roles: ["admin", "consultor"] },
    { path: "/patients", icon: UserPlus, label: "Pacientes", roles: ["admin", "consultor"] },
    { path: "/medical-records", icon: FileText, label: "Prontuários", roles: ["admin", "consultor"] },
    { path: "/professionals", icon: Briefcase, label: "Profissionais", roles: ["admin"] },
    { path: "/services", icon: Activity, label: "Serviços", roles: ["admin"] },
    { path: "/rooms", icon: DoorOpen, label: "Salas", roles: ["admin"] },
    { path: "/revenue", icon: DollarSign, label: "Faturamento", roles: ["admin"] },
    { path: "/settings", icon: Settings, label: "Configurações", roles: ["admin"] },
  ];

  // Filtra menus baseado no tipo de usuário
  const menuItems = allMenuItems.filter(item => item.roles.includes(userType));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-72 bg-white shadow-xl flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
            CliniFlow
          </h1>
          <p className="text-sm text-gray-500 mt-1">{user?.name}</p>
          <p className="text-xs text-gray-400">
            {userType === "admin" ? "Super Usuário" : userType === "consultor" ? "Consultor" : "Profissional"}
          </p>
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
