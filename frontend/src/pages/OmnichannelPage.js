import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function OmnichannelPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await api.get("/conversations");
      setConversations(response.data);
    } catch (error) {
      // Não mostrar erro se for 401 (usuário será redirecionado)
      if (error.response?.status !== 401) {
      toast.error("Erro ao carregar conversas");
      }
    }
    }
  };

  const loadMessages = async (convId) => {
    try {
      const response = await api.get(`/conversations/${convId}/messages`);
      setMessages(response.data);
      setSelectedConv(convId);
    } catch (error) {
      // Não mostrar erro se for 401 (usuário será redirecionado)
      if (error.response?.status !== 401) {
      toast.error("Erro ao carregar mensagens");
      }
    }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConv) return;

    try {
      await api.post(`/conversations/${selectedConv}/messages`, {
        conversation_id: selectedConv,
        content: newMessage
      });
      setNewMessage("");
      loadMessages(selectedConv);
      toast.success("Mensagem enviada (mockado)");
    } catch (error) {
      // Não mostrar erro se for 401 (usuário será redirecionado)
      if (error.response?.status !== 401) {
      toast.error("Erro ao enviar mensagem");
      }
    }
    }
  };

  const getChannelIcon = (channel) => {
    const icons = {
      whatsapp: "📱",
      instagram: "📷",
      messenger: "💬"
    };
    return icons[channel] || "💬";
  };

  return (
    <Layout>
      <div>
        <h1 className="text-4xl font-bold text-gray-900 mb-8" data-testid="omnichannel-page-title">Omnichannel</h1>
        
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden" style={{height: '600px'}}>
          <div className="flex h-full">
            {/* Lista de conversas */}
            <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
              <div className="p-4 bg-blue-50 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Conversas</h2>
              </div>
              {conversations.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <p>Nenhuma conversa disponível</p>
                  <p className="text-sm mt-2">(Integrações mockadas)</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => loadMessages(conv.id)}
                    className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${
                      selectedConv === conv.id ? 'bg-blue-100' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getChannelIcon(conv.channel)}</span>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">Lead {conv.lead_id.substring(0, 8)}</p>
                        <p className="text-sm text-gray-500">{conv.channel}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Área de mensagens */}
            <div className="flex-1 flex flex-col">
              {selectedConv ? (
                <>
                  <div className="p-4 bg-blue-50 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">Conversa selecionada</h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.sender_type === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl ${
                            msg.sender_type === 'user'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 text-gray-900'
                          }`}
                        >
                          <p>{msg.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
                    <div className="flex gap-2">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Digite sua mensagem..."
                        className="flex-1"
                      />
                      <Button type="submit" className="btn-primary">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>Selecione uma conversa para começar</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <p className="text-sm text-yellow-800">
            <strong>Nota:</strong> As integrações com WhatsApp, Instagram e Messenger estão <strong>mockadas</strong> nesta versão. 
            Para ativar, configure as credenciais da Meta Business API.
          </p>
        </div>
      </div>
    </Layout>
  );
}