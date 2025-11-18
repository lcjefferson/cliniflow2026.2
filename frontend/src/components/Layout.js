import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { 
  LayoutDashboard, MessageSquare, Calendar, Users, 
  ClipboardList, UserPlus, Briefcase, DoorOpen, 
  FileText, DollarSign, LogOut, Activity, Settings, Menu, FileBarChart
} from "lucide-react";

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = user?.role?.is_admin;
  const userType = user?.user_type || "consultor"; // admin, consultor, profissional
  const [isCollapsed, setIsCollapsed] = React.useState(false);

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
    { path: "/professionals", icon: Briefcase, label: "Profissionais", roles: ["admin"] },
    { path: "/services", icon: Activity, label: "Serviços", roles: ["admin"] },
    { path: "/rooms", icon: DoorOpen, label: "Salas", roles: ["admin"] },
    { path: "/reports", icon: FileBarChart, label: "Relatórios", roles: ["admin"] },
    { path: "/revenue", icon: DollarSign, label: "Faturamento", roles: ["admin"] },
    { path: "/users", icon: Users, label: "Usuários", roles: ["admin"] },
    { path: "/settings", icon: Settings, label: "Configurações", roles: ["admin"] },
  ];

  // Filtra menus baseado no tipo de usuário
  const menuItems = allMenuItems.filter(item => item.roles.includes(userType));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={`bg-white shadow-xl flex flex-col transition-all duration-500 ease-in-out ${isCollapsed ? 'w-20' : 'w-72'} md:relative fixed md:translate-x-0 z-40`}>
        <div className={`p-6 border-b border-gray-100 transition-all duration-500 ${isCollapsed ? 'px-3 py-4' : 'py-6'}`}>
          <div className="flex items-center justify-between">
            <div className={`flex-1 overflow-hidden transition-all duration-500 ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent whitespace-nowrap">
                CliniFlow
              </h1>
              <p className="text-sm text-gray-500 mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{user?.name}</p>
              <p className="text-xs text-gray-400 whitespace-nowrap">
                {userType === "admin" ? "Super Usuário" : userType === "consultor" ? "Consultor" : "Profissional"}
              </p>
            </div>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`p-2 hover:bg-blue-50 rounded-lg transition-all duration-300 hover:scale-110 ${isCollapsed ? 'mx-auto' : 'flex-shrink-0'}`}
              title={isCollapsed ? "Expandir menu" : "Recolher menu"}
            >
              <Menu className={`w-5 h-5 text-blue-600 transition-transform duration-500 ${isCollapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-link-${item.label.toLowerCase()}`}
                className={`sidebar-link group relative ${isActive ? "active" : ""} ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? item.label : ""}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className={`transition-all duration-500 overflow-hidden whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0 ml-0' : 'opacity-100 ml-3'}`}>
                  {item.label}
                </span>
                
                {/* Tooltip para menu recolhido */}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 whitespace-nowrap z-50 pointer-events-none">
                    {item.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            data-testid="logout-button"
            className={`flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300 hover:scale-105 group ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? "Sair" : ""}
          >
            <LogOut className="w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110" />
            <span className={`transition-all duration-500 overflow-hidden whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
              Sair
            </span>
          </button>
        </div>
      </aside>

      {/* Overlay para mobile quando menu está aberto */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setIsCollapsed(true)}
        ></div>
      )}

      {/* Main Content */}
      <main className={`flex-1 overflow-y-auto bg-gray-50 transition-all duration-500 ${isCollapsed ? 'md:ml-0' : 'md:ml-0'}`}>
        <div className="w-full px-4 py-6 md:px-6 md:py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
