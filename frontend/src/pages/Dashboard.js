import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import StatCard from "../components/StatCard";
import api from "../services/api";
import {
  Calendar, Users, UserPlus, DollarSign, Activity, MessageSquare, ClipboardList,
  ChevronRight, CalendarX2, ArrowUpRight,
} from "lucide-react";
import { STATUS_META, getStatusMeta } from "../lib/appointmentStatus";

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const formatCurrency = (value) =>
  (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const QUICK_LINKS = [
  { to: "/omnichannel", icon: MessageSquare, label: "Omnichannel", text: "Conversas e atendimentos", roles: ["admin", "consultor", "superuser"] },
  { to: "/followup", icon: ClipboardList, label: "Follow-up", text: "Retornos e lembretes pendentes", roles: ["admin", "consultor", "superuser"] },
  { to: "/leads", icon: Users, label: "Leads", text: "Funil de novos contatos", roles: ["admin", "consultor", "superuser"] },
  { to: "/patients", icon: UserPlus, label: "Pacientes", text: "Cadastros e prontuários", roles: ["admin", "consultor", "profissional", "superuser", "profissional_admin"] },
];

export default function Dashboard() {
  const [stats, setStats] = useState({
    appointmentsToday: 0,
    appointmentsTotal: 0,
    leadsTotal: 0,
    leadsHot: 0,
    patientsTotal: 0,
    revenueTotal: 0,
    revenuePaid: 0,
    revenuePending: 0
  });
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [patientNames, setPatientNames] = useState({});
  const [loadingAgenda, setLoadingAgenda] = useState(true);

  // Pegar usuário atual do localStorage
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user?.role?.is_admin || false;
  const isSuperUser = user?.user_type === 'superuser';
  const userType = user?.user_type || "consultor";
  const canSeeRevenue = isAdmin || userType === 'profissional_admin';

  useEffect(() => {
    loadStats();
    loadAgenda();
  }, []);

  const loadStats = async () => {
    try {
      const { data } = await api.get("/dashboard/stats");
      setStats({
        appointmentsToday: data.appointmentsToday ?? 0,
        appointmentsTotal: data.appointmentsTotal ?? 0,
        leadsTotal: data.leadsTotal ?? 0,
        leadsHot: data.leadsHot ?? 0,
        patientsTotal: data.patientsTotal ?? 0,
        revenueTotal: (data.revenuePaid ?? 0) + (data.revenuePending ?? 0),
        revenuePaid: data.revenuePaid ?? 0,
        revenuePending: data.revenuePending ?? 0,
        expensesTotal: data.expensesTotal ?? 0,
        netRevenue: data.netRevenue ?? 0,
      });
    } catch (error) {
      console.error("Erro ao carregar estatísticas", error);
    }
  };

  const loadAgenda = async () => {
    const today = toYMD(new Date());
    try {
      const [aptRes, profRes] = await Promise.all([
        api.get("/appointments", { params: { date_from: today, date_to: today, sort_by: "appointment_time", order: "asc", limit: 500 } }),
        api.get("/professionals").catch(() => ({ data: [] })),
      ]);
      const list = (Array.isArray(aptRes.data) ? aptRes.data : [])
        .slice()
        .sort((a, b) => String(a.appointment_time || "").localeCompare(String(b.appointment_time || "")));
      setTodayAppointments(list);
      setProfessionals(Array.isArray(profRes.data) ? profRes.data : []);
      setPatientNames(Object.fromEntries(list.filter((a) => a.patient_id && a.patient_name).map((a) => [String(a.patient_id), a.patient_name])));
    } catch (error) {
      console.error("Erro ao carregar agenda do dia", error);
    } finally {
      setLoadingAgenda(false);
    }
  };

  const getProfessional = (id) => professionals.find((p) => p.id === id);
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nextAppointment = todayAppointments.find(
    (a) => (a.status === "scheduled" || a.status === "waiting" || !a.status) && String(a.appointment_time || "") >= nowHM
  );
  const statusCounts = todayAppointments.reduce((acc, a) => {
    const key = STATUS_META[a.status] ? a.status : "scheduled";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = (user?.name || "").trim().split(/\s+/)[0];
  const todayLabel = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const cards = [
    {
      testId: "appointments-today-card",
      label: "Agendamentos hoje",
      value: loadingAgenda ? stats.appointmentsToday : todayAppointments.length,
      hint: `Total geral: ${stats.appointmentsTotal.toLocaleString("pt-BR")}`,
      icon: Calendar,
      tone: "from-blue-500 to-blue-600",
      to: "/calendar",
    },
    {
      testId: "leads-card",
      label: "Leads",
      value: stats.leadsTotal.toLocaleString("pt-BR"),
      hint: `${stats.leadsHot} quente${stats.leadsHot === 1 ? "" : "s"}`,
      icon: Users,
      tone: "from-green-500 to-green-600",
      to: ["admin", "consultor", "superuser"].includes(userType) ? "/leads" : null,
    },
    {
      testId: "patients-card",
      label: "Pacientes",
      value: stats.patientsTotal.toLocaleString("pt-BR"),
      hint: "Cadastrados",
      icon: UserPlus,
      tone: "from-purple-500 to-purple-600",
      to: "/patients",
    },
    canSeeRevenue && {
      testId: "revenue-card",
      label: "Receita recebida",
      value: formatCurrency(stats.revenuePaid),
      hint: `Pendente: ${formatCurrency(stats.revenuePending)}`,
      icon: DollarSign,
      tone: "from-orange-500 to-orange-600",
      to: "/revenue",
    },
    isSuperUser && {
      testId: "net-revenue-card",
      label: "Lucro líquido",
      value: formatCurrency(stats.netRevenue),
      hint: "Receita − despesas",
      icon: Activity,
      tone: "from-teal-500 to-teal-600",
      to: "/revenue",
    },
  ].filter(Boolean);

  const gridCols = {
    3: "lg:grid-cols-3",
    4: "xl:grid-cols-4",
    5: "lg:grid-cols-3 2xl:grid-cols-5",
  }[cards.length] || "xl:grid-cols-4";

  const quickLinks = QUICK_LINKS.filter((l) => l.roles.includes(userType));

  return (
    <Layout>
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl text-slate-900" data-testid="dashboard-title">
              {greeting}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-slate-500 first-letter:uppercase">{todayLabel}</p>
          </div>
          <Link to="/calendar" className="btn-primary w-full sm:w-auto">
            <Calendar className="h-4 w-4" />
            Abrir calendário
          </Link>
        </div>

        <div className={`grid grid-cols-2 ${gridCols} gap-3 md:gap-4`}>
          {cards.map((card, index) => (
            <StatCard
              key={card.testId}
              {...card}
              wide={cards.length % 2 === 1 && index === cards.length - 1}
            />
          ))}
        </div>

        <div className={`mt-4 md:mt-6 grid grid-cols-1 gap-4 md:gap-6 ${quickLinks.length ? "xl:grid-cols-3" : ""}`}>
          {/* Agenda de hoje */}
          <section className={`bg-white rounded-xl border border-slate-200 shadow-sm ${quickLinks.length ? "xl:col-span-2" : ""}`}>
            <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Agenda de hoje</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {loadingAgenda
                    ? "Carregando..."
                    : `${todayAppointments.length} ${todayAppointments.length === 1 ? "agendamento" : "agendamentos"}`}
                </p>
              </div>
              <Link to="/calendar" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
                Ver calendário
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            {!loadingAgenda && todayAppointments.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 md:px-5 py-3 border-b border-slate-100">
                {Object.entries(STATUS_META).map(([key, meta]) =>
                  statusCounts[key] ? (
                    <span key={key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                      <span className="font-semibold text-slate-900 tabular-nums">{statusCounts[key]}</span>
                    </span>
                  ) : null
                )}
              </div>
            )}

            {loadingAgenda ? (
              <div className="divide-y divide-slate-100">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-4 md:px-5 py-3.5 animate-pulse">
                    <div className="h-4 w-12 rounded bg-slate-100" />
                    <div className="h-8 w-1.5 rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-40 rounded bg-slate-100" />
                      <div className="h-3 w-56 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : todayAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-14 px-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                  <CalendarX2 className="h-6 w-6 text-slate-400" />
                </span>
                <p className="mt-3 text-sm font-medium text-slate-900">Nenhum agendamento para hoje</p>
                <p className="mt-1 text-sm text-slate-500">Os atendimentos do dia aparecem aqui.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {todayAppointments.map((apt, index) => {
                  const status = getStatusMeta(apt);
                  const professional = getProfessional(apt.professional_id);
                  const isNext = nextAppointment && apt === nextAppointment;
                  const services = Array.isArray(apt.service_names) ? apt.service_names.join(", ") : "";
                  return (
                    <li key={apt.id || index}>
                      <Link
                        to="/calendar"
                        className={`flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 hover:bg-slate-50 transition-colors ${isNext ? "bg-blue-50/50" : ""}`}
                      >
                        <span className="w-12 flex-shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
                          {apt.appointment_time}
                        </span>
                        <span className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${professional?.color || "bg-slate-300"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={`text-sm font-medium truncate ${apt.status === "cancelled" ? "text-slate-400 line-through" : "text-slate-900"}`}>
                              {patientNames[String(apt.patient_id)] || "Paciente"}
                            </span>
                            {isNext && (
                              <span className="flex-shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Próximo
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-slate-500 truncate">
                            {[professional?.name, services].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="hidden sm:block flex-shrink-0">
                          <span className={`status-badge ${status.className}`}>{status.label}</span>
                        </span>
                        <span className={`sm:hidden h-2.5 w-2.5 flex-shrink-0 rounded-full ${status.dot}`} title={status.label} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Acesso rápido */}
          {quickLinks.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm self-start">
              <div className="px-4 md:px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">Acesso rápido</h2>
              </div>
              <ul className="p-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1">
                {quickLinks.map(({ to, icon: Icon, label, text }) => (
                  <li key={to}>
                    <Link to={to} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">{label}</span>
                        <span className="block text-xs text-slate-500 truncate">{text}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Layout>
  );
}
