import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { RefreshCw, CheckCircle, XCircle, Activity, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WebhookMonitor() {
  const [conversations, setConversations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadData();
    
    if (autoRefresh) {
      const interval = setInterval(loadData, 3000); // Atualiza a cada 3 segundos
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadData = async () => {
    try {
      const [convRes, leadsRes] = await Promise.all([
        api.get("/conversations"),
        api.get("/leads")
      ]);
      
      setConversations(convRes.data);
      setLeads(leadsRes.data);
      setLastUpdate(new Date());

      // Carregar mensagens de todas as conversas
      const allMessages = [];
      for (const conv of convRes.data) {
        try {
          const msgRes = await api.get(`/conversations/${conv.id}/messages`);
          allMessages.push(...msgRes.data.map(m => ({ ...m, conversation_id: conv.id })));
        } catch (err) {
          console.error(`Erro ao carregar mensagens da conversa ${conv.id}`);
        }
      }
      setMessages(allMessages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }
  };

  const getLeadInfo = (leadId) => {
    return leads.find(l => l.id === leadId) || { name: "Desconhecido", phone: "" };
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR');
  };

  return (
    <Layout>
      <div className="p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Activity className="w-8 h-8 text-blue-600" />
                Monitor de Webhooks WhatsApp
              </h1>
              <p className="text-gray-600">Acompanhe mensagens chegando em tempo real</p>
            </div>
            
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4"
                />
                Auto-refresh (3s)
              </label>
              
              <Button onClick={loadData} disabled={loading} variant="outline">
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>
          </div>
          
          {lastUpdate && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
              <Clock className="w-4 h-4" />
              Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="text-blue-600 text-sm font-medium mb-1">Conversas Ativas</div>
            <div className="text-3xl font-bold text-blue-900">{conversations.length}</div>
          </div>
          
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
            <div className="text-green-600 text-sm font-medium mb-1">Leads Total</div>
            <div className="text-3xl font-bold text-green-900">{leads.length}</div>
          </div>
          
          <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
            <div className="text-purple-600 text-sm font-medium mb-1">Mensagens Total</div>
            <div className="text-3xl font-bold text-purple-900">{messages.length}</div>
          </div>
        </div>

        {/* Conversas Recentes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Conversas Ativas</h2>
          
          {conversations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma conversa ativa</p>
              <p className="text-sm mt-1">Envie uma mensagem no WhatsApp para testar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map(conv => {
                const lead = getLeadInfo(conv.lead_id);
                return (
                  <div key={conv.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white text-lg">
                            💬
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{lead.name}</div>
                            <div className="text-sm text-gray-600">{lead.phone}</div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">
                          {conv.assigned_to ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Atribuído
                            </span>
                          ) : (
                            <span className="text-orange-600 flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              Não atribuído
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {formatTime(conv.last_message_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mensagens Recentes */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Últimas Mensagens (Tempo Real)</h2>
          
          {messages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma mensagem ainda</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {messages.slice(0, 20).map(msg => (
                <div 
                  key={msg.id} 
                  className={`p-3 rounded-lg ${
                    msg.sender_type === 'lead' 
                      ? 'bg-blue-50 border-l-4 border-blue-500' 
                      : 'bg-green-50 border-l-4 border-green-500'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${
                          msg.sender_type === 'lead' ? 'text-blue-700' : 'text-green-700'
                        }`}>
                          {msg.sender_type === 'lead' ? '📱 Lead' : '👤 Consultor'}
                        </span>
                        <span className="text-xs text-gray-600">{msg.sender_name}</span>
                      </div>
                      <div className="text-sm text-gray-900">{msg.content}</div>
                    </div>
                    <div className="text-xs text-gray-400 ml-3">
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instruções */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <h3 className="font-bold text-yellow-900 mb-2">📱 Como testar:</h3>
          <ol className="list-decimal list-inside text-sm text-yellow-800 space-y-1">
            <li>Envie uma mensagem do seu WhatsApp para o número configurado</li>
            <li>Aguarde alguns segundos</li>
            <li>A conversa e mensagem aparecerão aqui automaticamente</li>
            <li>Acesse /omnichannel para responder</li>
          </ol>
        </div>
      </div>
    </Layout>
  );
}
