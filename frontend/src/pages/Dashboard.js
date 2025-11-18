import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Calendar, Users, DollarSign, Activity } from "lucide-react";

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

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [appointments, leads, patients, transactions] = await Promise.all([
        api.get("/appointments"),
        api.get("/leads"),
        api.get("/patients"),
        api.get("/transactions")
      ]);

      // Calcular agendamentos de hoje
      const today = new Date().toISOString().split('T')[0];
      const appointmentsToday = appointments.data.filter(a => a.appointment_date === today).length;

      // Calcular leads quentes
      const leadsHot = leads.data.filter(l => l.status === "quente").length;

      // Calcular receita paga e pendente
      const revenuePaid = transactions.data
        .filter(t => t.status === "paid")
        .reduce((sum, t) => sum + t.amount, 0);
      
      const revenuePending = transactions.data
        .filter(t => t.status === "pending")
        .reduce((sum, t) => sum + t.amount, 0);

      setStats({
        appointmentsToday,
        appointmentsTotal: appointments.data.length,
        leadsTotal: leads.data.length,
        leadsHot,
        patientsTotal: patients.data.length,
        revenueTotal: revenuePaid + revenuePending,
        revenuePaid,
        revenuePending
      });
    } catch (error) {
      console.error("Erro ao carregar estatísticas", error);
    }
  };

  return (
    <Layout>
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-8" data-testid="dashboard-title">Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-lg card-hover" data-testid="appointments-today-card">
            <div className="flex items-center justify-between mb-4">
              <Calendar className="w-10 h-10 text-blue-500" />
              <span className="text-3xl font-bold text-gray-900">{stats.appointments.today || 0}</span>
            </div>
            <h3 className="text-gray-600 font-medium">Agendamentos Hoje</h3>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg card-hover" data-testid="leads-card">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-10 h-10 text-green-500" />
              <span className="text-3xl font-bold text-gray-900">{stats.leads.total || 0}</span>
            </div>
            <h3 className="text-gray-600 font-medium">Total de Leads</h3>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg card-hover" data-testid="hot-leads-card">
            <div className="flex items-center justify-between mb-4">
              <Activity className="w-10 h-10 text-orange-500" />
              <span className="text-3xl font-bold text-gray-900">{stats.leads.hot || 0}</span>
            </div>
            <h3 className="text-gray-600 font-medium">Leads Quentes</h3>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg card-hover" data-testid="revenue-card">
            <div className="flex items-center justify-between mb-4">
              <DollarSign className="w-10 h-10 text-purple-500" />
              <span className="text-3xl font-bold text-gray-900">
                R$ {(stats.revenue.total_revenue || 0).toLocaleString('pt-BR')}
              </span>
            </div>
            <h3 className="text-gray-600 font-medium">Faturamento Total</h3>
          </div>
        </div>
      </div>
    </Layout>
  );
}
