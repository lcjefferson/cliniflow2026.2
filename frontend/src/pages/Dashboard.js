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

  // Pegar usuário atual do localStorage
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user?.role?.is_admin || false;

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
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 shadow-lg card-hover text-white" data-testid="appointments-today-card">
            <div className="flex items-center justify-between mb-4">
              <Calendar className="w-10 h-10 opacity-80" />
              <span className="text-3xl font-bold">{stats.appointmentsToday}</span>
            </div>
            <h3 className="font-medium opacity-90">Agendamentos Hoje</h3>
            <p className="text-xs opacity-75 mt-1">Total geral: {stats.appointmentsTotal} agendamentos</p>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 shadow-lg card-hover text-white" data-testid="leads-card">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-10 h-10 opacity-80" />
              <span className="text-3xl font-bold">{stats.leadsTotal}</span>
            </div>
            <h3 className="font-medium opacity-90">Total de Leads</h3>
            <p className="text-xs opacity-75 mt-1">{stats.leadsHot} lead(s) quente(s)</p>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 shadow-lg card-hover text-white" data-testid="patients-card">
            <div className="flex items-center justify-between mb-4">
              <Users className="w-10 h-10 opacity-80" />
              <span className="text-3xl font-bold">{stats.patientsTotal}</span>
            </div>
            <h3 className="font-medium opacity-90">Total de Pacientes</h3>
            <p className="text-xs opacity-75 mt-1">Cadastrados</p>
          </div>

          {/* Card de Faturamento - Apenas para Admins */}
          {isAdmin && (
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 shadow-lg card-hover text-white" data-testid="revenue-card">
              <div className="flex items-center justify-between mb-4">
                <DollarSign className="w-10 h-10 opacity-80" />
                <span className="text-2xl font-bold">R$ {stats.revenuePaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <h3 className="font-medium opacity-90">Receita Recebida</h3>
              <p className="text-xs opacity-75 mt-1">Pendente: R$ {stats.revenuePending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
