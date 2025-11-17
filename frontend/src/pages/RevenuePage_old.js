import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { DollarSign, TrendingUp, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function RevenuePage() {
  const { user } = useAuth();
  const [revenueData, setRevenueData] = useState({ total_revenue: 0, total_appointments: 0 });

  useEffect(() => {
    if (user?.role?.is_admin) {
      loadRevenue();
    }
  }, [user]);

  const loadRevenue = async () => {
    try {
      const response = await api.get("/dashboard/revenue");
      setRevenueData(response.data);
    } catch (error) {
      toast.error("Erro ao carregar dados de faturamento");
    }
  };

  if (!user?.role?.is_admin) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Acesso Negado</h1>
          <p className="text-gray-600">Apenas administradores podem acessar esta página.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-8" data-testid="revenue-page-title">Faturamento</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-8 shadow-xl text-white">
            <div className="flex items-center gap-4 mb-4">
              <DollarSign className="w-12 h-12" />
              <div>
                <p className="text-green-100">Faturamento Total</p>
                <h2 className="text-4xl font-bold">R$ {revenueData.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-8 shadow-xl text-white">
            <div className="flex items-center gap-4 mb-4">
              <Calendar className="w-12 h-12" />
              <div>
                <p className="text-blue-100">Atendimentos Concluídos</p>
                <h2 className="text-4xl font-bold">{revenueData.total_appointments}</h2>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">Detalhamento</h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
              <span className="text-gray-700 font-medium">Ticket Médio</span>
              <span className="text-xl font-bold text-blue-600">
                R$ {revenueData.total_appointments > 0 
                  ? (revenueData.total_revenue / revenueData.total_appointments).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                  : '0,00'
                }
              </span>
            </div>

            <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
              <span className="text-gray-700 font-medium">Total de Serviços Prestados</span>
              <span className="text-xl font-bold text-green-600">{revenueData.total_appointments}</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}