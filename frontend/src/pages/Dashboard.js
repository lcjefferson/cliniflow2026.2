import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Calendar, Users, DollarSign, Activity } from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState({ appointments: {}, leads: {}, revenue: {} });
  useEffect(() => {
    loadStats();
  }, []);
  const loadStats = async () => {
    try {
      const [appts, leads, revenue] = await Promise.all([
        api.get("/dashboard/appointments"),
        api.get("/dashboard/leads"),
        api.get("/dashboard/revenue").catch(() => ({ data: { total_revenue: 0 } }))
      ]);
      setStats({ appointments: appts.data, leads: leads.data, revenue: revenue.data });
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error("Erro ao carregar estatísticas", error);
      }
    }
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
              <Users className="w-10 h-10 text-green-500" />
              <span className="text-3xl font-bold text-gray-900">{stats.leads.total || 0}</span>
            <h3 className="text-gray-600 font-medium">Total de Leads</h3>
          <div className="bg-white rounded-2xl p-6 shadow-lg card-hover" data-testid="hot-leads-card">
              <Activity className="w-10 h-10 text-orange-500" />
              <span className="text-3xl font-bold text-gray-900">{stats.leads.hot || 0}</span>
            <h3 className="text-gray-600 font-medium">Leads Quentes</h3>
          <div className="bg-white rounded-2xl p-6 shadow-lg card-hover" data-testid="revenue-card">
              <DollarSign className="w-10 h-10 text-purple-500" />
              <span className="text-3xl font-bold text-gray-900">
                R$ {(stats.revenue.total_revenue || 0).toLocaleString('pt-BR')}
              </span>
            <h3 className="text-gray-600 font-medium">Faturamento Total</h3>
        </div>
      </div>
    </Layout>
  );
}
