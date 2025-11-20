import React, { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { 
  MessageSquare, Send, UserCheck, UserX, X, Check, 
  CheckCheck, Phone, Mail, User, Clock, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function OmnichannelPageV2() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // all, mine, unassigned
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadData();
    // Auto-refresh a cada 10 segundos
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadData = async () => {
    try {
      const [convRes, leadsRes] = await Promise.all([
        api.get("/conversations"),
        api.get("/leads")
      ]);
      setConversations(convRes.data);
      setLeads(leadsRes.data);
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
    }
  };

  const loadMessages = async (conversationId) => {
    try {
      const response = await api.get(`/conversations/${conversationId}/messages`);
      setMessages(response.data);
    } catch (error) {
      toast.error("Erro ao carregar mensagens");
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedConversation) return;

    setLoading(true);
    try {
      await api.post(`/conversations/${selectedConversation.id}/messages`, {
        conversation_id: selectedConversation.id,
        content: messageText
      });
      
      setMessageText("");
      await loadMessages(selectedConversation.id);
      await loadData();
      toast.success("Mensagem enviada!");
    } catch (error) {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToMe = async (conversationId) => {
    try {
      await api.put(`/conversations/${conversationId}/assign`);
      toast.success("Atendimento assumido!");
      await loadData();
      
      // Se esta conversa estava selecionada, atualizar
      if (selectedConversation?.id === conversationId) {
        const updatedConv = conversations.find(c => c.id === conversationId);
        if (updatedConv) {
          setSelectedConversation({
            ...updatedConv,
            assigned_to: user.id,
            assigned_to_name: user.name
          });
        }
      }
    } catch (error) {
      toast.error("Erro ao assumir atendimento");
    }
  };

  const handleCloseConversation = async (conversationId) => {
    if (!window.confirm("Tem certeza que deseja encerrar este atendimento?")) return;
    
    try {
      await api.put(`/conversations/${conversationId}/close`);
      toast.success("Atendimento encerrado!");
      await loadData();
      if (selectedConversation?.id === conversationId) {
        setSelectedConversation(null);
      }
    } catch (error) {
      toast.error("Erro ao encerrar atendimento");
    }
  };

  const handleReopenConversation = async (conversationId) => {
    try {
      await api.put(`/conversations/${conversationId}/reopen`);
      toast.success("Atendimento reaberto!");
      await loadData();
    } catch (error) {
      toast.error("Erro ao reabrir atendimento");
    }
  };

  const getLeadInfo = (leadId) => {
    return leads.find(l => l.id === leadId) || { name: "Lead Desconhecido", phone: "", email: "" };
  };

  const getChannelIcon = (channel) => {
    switch(channel) {
      case "whatsapp": return "💬";
      case "instagram": return "📷";
      case "messenger": return "💌";
      default: return "💬";
    }
  };

  const getChannelColor = (channel) => {
    switch(channel) {
      case "whatsapp": return "bg-green-500";
      case "instagram": return "bg-pink-500";
      case "messenger": return "bg-blue-500";
      default: return "bg-gray-500";
    }
  };

  const filteredConversations = conversations.filter(conv => {
    if (filter === "mine") return conv.assigned_to === user?.id;
    if (filter === "unassigned") return !conv.assigned_to;
    return true;
  });

  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Omnichannel</h1>
              <p className="text-sm text-gray-600">Atendimento integrado multi-canal</p>
            </div>
            
            {/* Filtros */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === "all" 
                    ? "bg-blue-500 text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Todos ({conversations.length})
              </button>
              <button
                onClick={() => setFilter("mine")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === "mine" 
                    ? "bg-blue-500 text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Meus ({conversations.filter(c => c.assigned_to === user?.id).length})
              </button>
              <button
                onClick={() => setFilter("unassigned")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === "unassigned" 
                    ? "bg-blue-500 text-white" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Não Atribuídos ({conversations.filter(c => !c.assigned_to).length})
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Conversas List */}
          <div className="w-96 bg-white border-r border-gray-200 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Nenhuma conversa encontrada</p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const lead = getLeadInfo(conv.lead_id);
                const isSelected = selectedConversation?.id === conv.id;
                const isAssignedToMe = conv.assigned_to === user?.id;
                
                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`p-4 border-b border-gray-100 cursor-pointer transition-all hover:bg-gray-50 ${
                      isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-full ${getChannelColor(conv.channel)} flex items-center justify-center text-white text-xl flex-shrink-0`}>
                        {getChannelIcon(conv.channel)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 truncate">{lead.name}</h3>
                          {conv.status === "closed" && (
                            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded-full">
                              Encerrado
                            </span>
                          )}
                        </div>
                        
                        {conv.assigned_to ? (
                          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                            <UserCheck className="w-3 h-3" />
                            <span>{isAssignedToMe ? "Você" : conv.assigned_to_name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-orange-600 mb-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Não atribuído</span>
                          </div>
                        )}
                        
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(conv.last_message_at || conv.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Chat Area */}
          {selectedConversation ? (
            <div className="flex-1 flex flex-col bg-gray-50">
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${getChannelColor(selectedConversation.channel)} flex items-center justify-center text-white`}>
                      {getChannelIcon(selectedConversation.channel)}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">
                        {getLeadInfo(selectedConversation.lead_id).name}
                      </h2>
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        {getLeadInfo(selectedConversation.lead_id).phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {getLeadInfo(selectedConversation.lead_id).phone}
                          </span>
                        )}
                        {getLeadInfo(selectedConversation.lead_id).email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {getLeadInfo(selectedConversation.lead_id).email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!selectedConversation.assigned_to && (
                      <Button
                        onClick={() => handleAssignToMe(selectedConversation.id)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <UserCheck className="w-4 h-4 mr-2" />
                        Assumir Atendimento
                      </Button>
                    )}
                    
                    {selectedConversation.assigned_to === user?.id && selectedConversation.status === "active" && (
                      <Button
                        onClick={() => handleCloseConversation(selectedConversation.id)}
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Encerrar
                      </Button>
                    )}
                    
                    {selectedConversation.status === "closed" && (
                      <Button
                        onClick={() => handleReopenConversation(selectedConversation.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Reabrir
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => {
                  const isFromConsultant = msg.sender_type === "consultant";
                  const isFromMe = msg.sender_id === user?.id;
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isFromConsultant ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[70%] ${isFromConsultant ? "order-2" : "order-1"}`}>
                        <div className={`rounded-2xl px-4 py-2 ${
                          isFromConsultant
                            ? isFromMe
                              ? "bg-blue-500 text-white"
                              : "bg-purple-500 text-white"
                            : "bg-white text-gray-900 border border-gray-200"
                        }`}>
                          {!isFromMe && (
                            <p className="text-xs opacity-75 mb-1">
                              {isFromConsultant ? msg.sender_name : getLeadInfo(selectedConversation.lead_id).name}
                            </p>
                          )}
                          <p className="break-words">{msg.content}</p>
                          <p className={`text-xs mt-1 flex items-center gap-1 ${
                            isFromConsultant ? "opacity-75" : "text-gray-500"
                          }`}>
                            {new Date(msg.created_at).toLocaleTimeString('pt-BR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                            {isFromMe && (
                              msg.read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              {selectedConversation.status === "active" && (!selectedConversation.assigned_to || selectedConversation.assigned_to === user?.id) && (
                <div className="bg-white border-t border-gray-200 p-4">
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Digite sua mensagem..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      disabled={loading}
                      className="flex-1"
                    />
                    <Button 
                      type="submit" 
                      disabled={loading || !messageText.trim()}
                      className="btn-primary"
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  </form>
                  {!selectedConversation.assigned_to && (
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Esta conversa não está atribuída. Assuma o atendimento para garantir que você é o responsável.
                    </p>
                  )}
                </div>
              )}
              
              {selectedConversation.status === "closed" && (
                <div className="bg-gray-100 border-t border-gray-200 p-4 text-center text-gray-600">
                  Atendimento encerrado. Reabra para continuar conversando.
                </div>
              )}
              
              {selectedConversation.status === "active" && selectedConversation.assigned_to && selectedConversation.assigned_to !== user?.id && (
                <div className="bg-yellow-50 border-t border-yellow-200 p-4 text-center">
                  <AlertCircle className="w-5 h-5 inline-block mr-2 text-yellow-600" />
                  <span className="text-yellow-800 font-medium">
                    Este atendimento está sendo realizado por {selectedConversation.assigned_to_name || "outro consultor"}
                  </span>
                  <p className="text-sm text-yellow-700 mt-1">
                    Você pode visualizar as mensagens mas não pode responder.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center text-gray-500">
                <MessageSquare className="w-24 h-24 mx-auto mb-4 opacity-20" />
                <h3 className="text-xl font-semibold mb-2">Selecione uma conversa</h3>
                <p>Escolha uma conversa à esquerda para começar a atender</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
