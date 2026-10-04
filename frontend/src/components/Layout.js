import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { 
  LayoutDashboard, MessageSquare, Calendar, Users, 
  ClipboardList, UserPlus, Briefcase, DoorOpen, 
  FileText, DollarSign, LogOut, Activity, Settings, Menu, FileBarChart, X
} from "lucide-react";

const MOBILE_QUERY = "(max-width: 1023px)";

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = user?.role?.is_admin;
  const userType = user?.user_type || "consultor"; // admin, consultor, profissional
  
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );

  React.useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const collapsed = !isMobile && isCollapsed;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Define menus baseado no tipo de usuário
  const allMenuItems = [
    { path: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "consultor", "profissional", "superuser", "profissional_admin"] },
    { path: "/omnichannel", icon: MessageSquare, label: "Omnichannel", roles: ["admin", "consultor", "superuser"] },
    { path: "/calendar", icon: Calendar, label: "Calendário", roles: ["admin", "consultor", "profissional", "superuser", "profissional_admin"] },
    { path: "/leads", icon: Users, label: "Leads", roles: ["admin", "consultor", "superuser"] },
    { path: "/followup", icon: ClipboardList, label: "Follow-up", roles: ["admin", "consultor", "superuser"] },
    { path: "/patients", icon: UserPlus, label: "Pacientes", roles: ["admin", "consultor", "profissional", "superuser", "profissional_admin"] },
    { path: "/professionals", icon: Briefcase, label: "Profissionais", roles: ["admin", "consultor", "superuser"] },
    { path: "/services", icon: Activity, label: "Serviços", roles: ["admin", "consultor", "superuser"] },
    { path: "/rooms", icon: DoorOpen, label: "Salas", roles: ["admin", "consultor", "superuser"] },
    { path: "/reports", icon: FileBarChart, label: "Relatórios", roles: ["admin", "superuser"] },
    { path: "/revenue", icon: DollarSign, label: "Faturamento", roles: ["admin", "superuser", "profissional_admin"] },
    { path: "/users", icon: Users, label: "Usuários", roles: ["admin", "superuser"] },
    { path: "/settings", icon: Settings, label: "Configurações", roles: ["admin", "superuser"] },
  ];

  // Filtra menus baseado no tipo de usuário
  const menuItems = allMenuItems.filter(item => item.roles.includes(userType));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out fixed inset-y-0 left-0 z-40 w-64 ${mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'} lg:relative lg:inset-auto lg:translate-x-0 lg:shadow-none ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}>
        <div className={`border-b border-slate-200 transition-all duration-300 ${collapsed ? 'px-3 py-4' : 'px-5 py-5'}`}>
          <div className="flex items-center justify-between">
            <div className={`flex-1 overflow-hidden transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 whitespace-nowrap">
                Clini<span className="text-blue-600">Flow</span>
              </h1>
              <p className="text-sm font-medium text-slate-700 mt-2 whitespace-nowrap overflow-hidden text-ellipsis">{user?.name}</p>
              <p className="text-xs text-slate-500 whitespace-nowrap">
                {userType === "superuser" ? "Super Usuário" : userType === "admin" ? "Administrador" : userType === "consultor" ? "Consultor" : userType === "profissional_admin" ? "Profissional Admin" : "Profissional"}
              </p>
            </div>
            {isMobile ? (
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
                title="Fechar menu"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            ) : (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={`p-2 hover:bg-slate-100 rounded-lg transition-colors ${collapsed ? 'mx-auto' : 'flex-shrink-0'}`}
                title={collapsed ? "Expandir menu" : "Recolher menu"}
              >
                <Menu className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-link-${item.label.toLowerCase()}`}
                className={`sidebar-link group relative ${isActive ? "active" : ""} ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.label : ""}
              >
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span className={`transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
                  {item.label}
                </span>
                
                {/* Tooltip para menu recolhido */}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 whitespace-nowrap z-50 pointer-events-none">
                    {item.label}
                    <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <button
            onClick={handleLogout}
            data-testid="logout-button"
            className={`flex items-center gap-3 px-3 py-2 w-full text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? "Sair" : ""}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            <span className={`transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
              Sair
            </span>
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        ></div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 h-14 px-4 bg-white/90 backdrop-blur border-b border-slate-200">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Abrir menu"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            Clini<span className="text-blue-600">Flow</span>
          </span>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="w-full px-4 py-6 md:px-6 md:py-8 lg:px-8 short:py-3">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
