#!/bin/bash

# Dashboard
cat > /app/frontend/src/pages/Dashboard.js << 'EOF'
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
EOF

# Professionals Page
cat > /app/frontend/src/pages/ProfessionalsPage.js << 'EOF'
import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfessionalsPage() {
  const [professionals, setProfessionals] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ name: "", specialty: "", email: "", phone: "" });

  useEffect(() => {
    loadProfessionals();
  }, []);

  const loadProfessionals = async () => {
    const response = await api.get("/professionals");
    setProfessionals(response.data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/professionals", formData);
      toast.success("Profissional cadastrado!");
      setShowDialog(false);
      setFormData({ name: "", specialty: "", email: "", phone: "" });
      loadProfessionals();
    } catch (error) {
      toast.error("Erro ao cadastrar profissional");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/professionals/${id}`);
      toast.success("Profissional removido!");
      loadProfessionals();
    } catch (error) {
      toast.error("Erro ao remover profissional");
    }
  };

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Profissionais</h1>
          <Button onClick={() => setShowDialog(true)} data-testid="add-professional-button" className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Adicionar Profissional
          </Button>
        </div>

        <div className="grid gap-6">
          {professionals.map((prof) => (
            <div key={prof.id} className="bg-white rounded-2xl p-6 shadow-lg" data-testid={`professional-${prof.id}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{prof.name}</h3>
                  <p className="text-blue-600">{prof.specialty}</p>
                  <p className="text-gray-600 mt-2">{prof.email}</p>
                  <p className="text-gray-600">{prof.phone}</p>
                </div>
                <button
                  onClick={() => handleDelete(prof.id)}
                  data-testid={`delete-professional-${prof.id}`}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent data-testid="professional-dialog">
            <DialogHeader>
              <DialogTitle>Adicionar Profissional</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  data-testid="professional-name-input"
                  required
                />
              </div>
              <div>
                <Label>Especialidade</Label>
                <Input
                  value={formData.specialty}
                  onChange={(e) => setFormData({...formData, specialty: e.target.value})}
                  data-testid="professional-specialty-input"
                  required
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  data-testid="professional-email-input"
                  required
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  data-testid="professional-phone-input"
                  required
                />
              </div>
              <Button type="submit" data-testid="submit-professional-button" className="w-full btn-primary">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
EOF

