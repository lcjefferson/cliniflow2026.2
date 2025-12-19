import React, { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api, { API_BASE } from "../services/api";
import io from "socket.io-client";
import { useAuth } from "../contexts/AuthContext";
import { 
  MessageSquare, Send, UserCheck, UserX, X, Check, 
  CheckCheck, Phone, Mail, User, Clock, AlertCircle, FileText, Download,
  Paperclip, Mic, StopCircle, Search, ArrowLeft
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AudioMessage = ({ content, messageId }) => {
  const [error, setError] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Initial load logic
    let src = (content.file_data || content.body || content.data ? 
        `data:${content.mimetype || 'audio/ogg'};base64,${content.file_data || content.body || content.data}` : null) || 
        content.url || content.URL || content.mediaUrl || content.link;
    
    if (src && src.startsWith('/media')) {
        src = `${API_BASE}${src}`;
    }

    setAudioSrc(src);
    const encrypted = src && (src.includes('.enc') || src.includes('mmg.whatsapp.net'));
    setIsEncrypted(encrypted);
    
    // Auto-fetch if encrypted
    if (encrypted && messageId && retryCount < 1) {
        fetchPlayableAudio();
    }
  }, [content, messageId]);

  const fetchPlayableAudio = async () => {
      if (!messageId) return;
      setLoading(true);
      setError(false);
      setErrorMessage("");
      try {
          const response = await api.get(`/messages/${messageId}/play-audio`);
          if (response.data && response.data.src) {
              setAudioSrc(response.data.src);
              setIsEncrypted(false);
              setRetryCount(prev => prev + 1);
          } else {
              setError(true);
          }
      } catch (err) {
          console.error("Failed to fetch playable audio", err);
          setError(true);
          setRetryCount(prev => prev + 1);

          if (err.response) {
              if (err.response.status === 400) {
                  setErrorMessage("Áudio antigo não recuperável");
              } else if (err.response.status === 410) {
                  setErrorMessage("Áudio expirado (sem recuperação)");
              } else {
                  setErrorMessage(`Erro: ${err.response.data?.detail || err.message}`);
              }
          } else {
              setErrorMessage(`Erro: ${err.message}`);
          }
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
         <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-2 rounded-lg mb-1">
            <span role="img" aria-label="audio">🎵</span>
            <span>Áudio {content.seconds ? `(${content.seconds}s)` : ''}</span>
         </div>
         {loading ? (
             <div className="text-xs text-blue-600 animate-pulse p-2">
                 Carregando áudio...
             </div>
         ) : audioSrc && !error && !isEncrypted ? (
             <div className="w-full">
                <audio 
                    controls 
                    src={audioSrc} 
                    className="w-full max-w-[250px]" 
                    onError={(e) => {
                        console.error("Audio playback error", e);
                        setError(true);
                        // Try to fetch one last time if error occurs on "valid" src
                        if (retryCount < 2) fetchPlayableAudio();
                    }} 
                />
             </div>
         ) : (
             <div className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100">
                <p className="font-semibold mb-1">
                    {errorMessage || (error ? "Erro na reprodução" : "Áudio indisponível")}
                </p>
                {!errorMessage && (isEncrypted || error) && (
                    <div className="mb-2">
                        <p className="text-orange-700 leading-tight mb-2">
                           Áudio original criptografado.
                        </p>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 text-[10px]"
                            onClick={fetchPlayableAudio}
                            disabled={loading}
                        >
                            {loading ? "Baixando..." : "Tentar Baixar Novamente"}
                        </Button>
                    </div>
                )}
             </div>
         )}
    </div>
  );
};

const ImageMessage = ({ content, messageId }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const mimetype = content.mimetype || content.mediaType || 'image/jpeg';
    // Prioritize base64 data if available to prevent reverting to encrypted URL during polling
    let src = (content.file_data ? `data:${mimetype};base64,${content.file_data}` : null) ||
        content.url || content.URL || content.mediaUrl;

    if (src && src.startsWith('/media')) {
        src = `${API_BASE}${src}`;
    }

    setImageSrc(src);
    const encrypted = src && (src.includes('.enc') || src.includes('mmg.whatsapp.net'));
    setIsEncrypted(encrypted);

    if (encrypted && messageId && retryCount < 1) {
        fetchViewableImage();
    }
  }, [content, messageId]);

  const fetchViewableImage = async () => {
      if (!messageId) return;
      setLoading(true);
      setError(false);
      setErrorMessage("");
      try {
          const response = await api.get(`/messages/${messageId}/view-image`);
          if (response.data && response.data.src) {
              setImageSrc(response.data.src);
              setIsEncrypted(false);
              setRetryCount(prev => prev + 1);
          } else {
              setError(true);
          }
      } catch (err) {
          console.error("Failed to fetch viewable image", err);
          setError(true);
          setRetryCount(prev => prev + 1);
          
          if (err.response) {
             if (err.response.status === 410) {
                 setErrorMessage("Imagem expirada (sem recuperação)");
             } else {
                 setErrorMessage(`Erro: ${err.response.data?.detail || err.message}`);
             }
          }
      } finally {
          setLoading(false);
      }
  };

  return (
     <div className="flex flex-col gap-2">
         <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
            <span role="img" aria-label="image">📷</span>
            <span>Imagem ({content.mimetype ? content.mimetype.split('/')[1] : 'arquivo'})</span>
         </div>
         
         {loading ? (
             <div className="flex items-center justify-center w-full h-32 bg-gray-100 rounded-lg animate-pulse">
                 <span className="text-xs text-blue-600">Carregando imagem...</span>
             </div>
         ) : imageSrc && !error && !isEncrypted ? (
             <img 
                src={imageSrc} 
                alt="Anexo" 
                className="max-w-xs rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity" 
                loading="lazy"
                onClick={() => window.open(imageSrc, '_blank')}
                onError={(e) => {
                    console.error("Image load error", e);
                    setError(true);
                    if (retryCount < 2) fetchViewableImage();
                }}
             />
         ) : (
            <div className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100">
                <p className="font-semibold mb-1">
                    {errorMessage || (error ? "Erro ao carregar imagem" : "Imagem indisponível")}
                </p>
                {!errorMessage && (isEncrypted || error) && (
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-6 text-[10px] mt-1"
                        onClick={fetchViewableImage}
                        disabled={loading}
                    >
                        {loading ? "Baixando..." : "Tentar Baixar Novamente"}
                    </Button>
                )}
            </div>
         )}
     </div>
  );
};

const DocumentMessage = ({ content, messageId }) => {
  const [docSrc, setDocSrc] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const mimetype = content.mimetype || content.mediaType || 'application/pdf';
    // Prioritize base64 data
    let src = (content.file_data ? `data:${mimetype};base64,${content.file_data}` : null) ||
        content.url || content.URL || content.mediaUrl;

    if (src && src.startsWith('/media')) {
        src = `${API_BASE}${src}`;
    }

    setDocSrc(src);
    const encrypted = src && (src.includes('.enc') || src.includes('mmg.whatsapp.net'));
    setIsEncrypted(encrypted);

    // Only auto-download if we really think we can
    if (encrypted && messageId && retryCount < 1) {
       // fetchDownloadableDocument(); // Optional: maybe don't auto-download docs to save bandwidth?
       // Let's keep it manual for docs unless user clicks
    }
  }, [content, messageId]);

  const fetchDownloadableDocument = async () => {
      if (!messageId) return;
      setLoading(true);
      setError(false);
      setErrorMessage("");
      try {
          const response = await api.get(`/messages/${messageId}/download-document`);
          if (response.data && response.data.src) {
              setDocSrc(response.data.src);
              setIsEncrypted(false);
              setRetryCount(prev => prev + 1);
              
              // Auto download
              const link = document.createElement('a');
              link.href = response.data.src;
              link.download = response.data.filename || content.fileName || 'document';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              
          } else {
              setError(true);
          }
      } catch (err) {
          console.error("Failed to fetch document", err);
          setError(true);
          setRetryCount(prev => prev + 1);
          
          if (err.response) {
              if (err.response.status === 410) {
                  setErrorMessage("Documento expirado (sem recuperação)");
              } else {
                  setErrorMessage(`Erro: ${err.response.data?.detail || err.message}`);
              }
          }
      } finally {
          setLoading(false);
      }
  };

  const handleDownload = () => {
      if (isEncrypted) {
          fetchDownloadableDocument();
      } else if (docSrc) {
          const link = document.createElement('a');
          link.href = docSrc;
          link.download = content.fileName || 'document';
          link.target = "_blank";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  };

  return (
     <div className="flex flex-col gap-2 min-w-[200px]">
         <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg border border-gray-200">
            <div className="bg-red-100 p-2 rounded-full text-red-600">
                <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                    {content.fileName || "Documento"}
                </p>
                <p className="text-xs text-gray-500">
                    {content.pageCount ? `${content.pageCount} páginas • ` : ''} 
                    {content.mimetype && typeof content.mimetype === 'string' ? content.mimetype.split('/')[1]?.toUpperCase() : 'DOC'}
                </p>
            </div>
            <Button 
                variant="ghost" 
                size="sm"
                className="text-gray-600 hover:text-blue-600"
                onClick={handleDownload}
                disabled={loading}
            >
                {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div> : <Download className="w-5 h-5" />}
            </Button>
         </div>
         
         {(isEncrypted || error) && (
            <div className="text-xs text-orange-700 bg-orange-50 p-2 rounded border border-orange-100 flex flex-col gap-1">
                <span>{errorMessage || (error ? "Erro no download" : "Arquivo criptografado")}</span>
                {!errorMessage && (
                    <Button 
                        variant="link" 
                        size="sm" 
                        className="h-auto p-0 text-[10px] text-blue-600 underline self-start"
                        onClick={fetchDownloadableDocument}
                        disabled={loading}
                    >
                        {loading ? "Baixando..." : "Tentar Baixar"}
                    </Button>
                )}
            </div>
         )}
     </div>
  );
};

export default function OmnichannelPageV2() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // all, mine, unassigned
  const [searchTerm, setSearchTerm] = useState("");
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);

  // Media Sending Logic
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadMedia(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadMedia = async (file) => {
    if (!selectedConversation) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    
    try {
        await api.post(`/conversations/${selectedConversation.id}/media`, formData, {
            headers: { "Content-Type": "multipart/form-data" }
        });
        
        await loadMessages(selectedConversation.id);
        await loadData();
        toast.success("Arquivo enviado!");
    } catch (error) {
        console.error(error);
        toast.error("Erro ao enviar arquivo");
    } finally {
        setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
            ? 'audio/webm;codecs=opus' 
            : (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : 'audio/mp4');
            
        const ext = mimeType.includes('ogg') ? 'ogg' : (mimeType.includes('mp4') ? 'm4a' : 'webm');
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioFile = new File([audioBlob], `voice_message.${ext}`, { type: mimeType });
        await uploadMedia(audioFile);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Erro ao acessar microfone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh a cada 10 segundos
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval;
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
      // Poll messages every 3 seconds to keep chat live
      interval = setInterval(() => {
        loadMessages(selectedConversation.id);
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedConversation]);

  useEffect(() => {
    if (shouldScrollToBottom) {
      scrollToBottom();
    }
  }, [messages]);

  useEffect(() => {
    const socket = io(API_BASE);

    socket.on("connect", () => {
      console.log("Socket.IO connected");
    });

    socket.on("new_message", (message) => {
      console.log("Socket received message:", message);
      
      // Update conversation list to show new last_message/time
      loadData();

      if (selectedConversation && message.conversation_id === selectedConversation.id) {
        setMessages((prev) => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
        setShouldScrollToBottom(true);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedConversation]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldScrollToBottom(isNearBottom);
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
      
      // Fetch the updated conversation directly to ensure state consistency
      const response = await api.get(`/conversations/${conversationId}`);
      console.log("Updated conversation:", response.data);
      console.log("Current User:", user);
      setSelectedConversation(response.data);
      
      // If we are in "unassigned" filter, switching to "mine" helps the user keep track
      // of the conversation they just picked up, preventing it from disappearing.
      if (filter === "unassigned") {
          setFilter("mine");
      }
      
      // Refresh the list in background
      await loadData();
    } catch (error) {
      console.error("Error assigning conversation:", error);
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

  const renderMessageContent = (content, messageId) => {
    if (!content) return null;
    if (typeof content === 'string') {
      // Tenta fazer o parse de JSON stringificado (comum no WhatsApp API)
      try {
        if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
          const parsed = JSON.parse(content);
          // Se tiver URL ou mimetype, trata como objeto de mídia
          if (parsed.URL || parsed.url || parsed.mimetype || parsed.Mimetype) {
             // Normaliza as chaves para minúsculo para o handler de objeto
             const normalized = {
                url: parsed.URL || parsed.url,
                mimetype: parsed.mimetype || parsed.Mimetype || 'image/jpeg', // Fallback
                file_data: parsed.file_data,
                ...parsed
             };
             return renderMessageContent(normalized, messageId); // Recursão com objeto normalizado
          }
        }
      } catch (e) {
        // Ignora erro de parse e segue como string normal
      }

      if (content.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) {
        return (
          <img 
            src={content} 
            alt="Imagem" 
            className="max-w-xs rounded-lg border border-gray-200 shadow-sm" 
            loading="lazy"
          />
        );
      }
      if (content.startsWith('http')) {
        return (
          <a 
            href={content} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-blue-600 hover:underline break-all"
          >
            {content}
          </a>
        );
      }
      return content;
    }
    
    // Tratamento para mensagens de áudio/mídia
    if (typeof content === 'object') {
      const mimetype = content.mimetype || content.mediaType || '';
      const isAudio = mimetype.toLowerCase().includes('audio') || mimetype.toLowerCase() === 'ptt' || content.PTT;

      if (isAudio) {
        return <AudioMessage content={content} messageId={messageId} />;
      }
      
      if (mimetype.toLowerCase().includes('image')) {
        return <ImageMessage content={content} messageId={messageId} />;
      }
      
      // Check for document types or generic files
      if (mimetype.toLowerCase().includes('pdf') || 
          mimetype.toLowerCase().includes('document') || 
          mimetype.toLowerCase().includes('sheet') || 
          mimetype.toLowerCase().includes('msword') ||
          mimetype.toLowerCase().includes('application/octet-stream') ||
          content.fileName || 
          content.url) {
         return <DocumentMessage content={content} messageId={messageId} />;
      }

      // Tratamento genérico para outros objetos para evitar crash
      return (
        <div className="text-xs font-mono bg-gray-50 p-1 rounded overflow-x-auto max-w-full">
          {JSON.stringify(content)}
        </div>
      );
    }
    return String(content);
  };

  const filteredConversations = conversations.filter(conv => {
    const lead = getLeadInfo(conv.lead_id);
    const matchesSearch = !searchTerm || 
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        lead.phone?.includes(searchTerm) ||
        lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
        
    if (!matchesSearch) return false;

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
        <div className="flex-1 flex overflow-hidden relative">
          {/* Conversas List */}
          <div className={`w-full md:w-96 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 absolute md:static inset-0 z-10 transition-transform duration-300 ${selectedConversation ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
            {/* Search Input */}
            <div className="p-4 border-b border-gray-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Buscar conversa..." 
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
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
          </div>

          {/* Chat Area */}
          <div className={`flex-1 flex flex-col bg-gray-50 min-w-0 absolute md:static inset-0 z-20 transition-transform duration-300 ${selectedConversation ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
            {selectedConversation ? (
              <>
              {/* Chat Header */}
              <div className="bg-white border-b border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="md:hidden mr-1"
                      onClick={() => setSelectedConversation(null)}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
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
              <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-4"
              >
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
                          <div className="break-all">{renderMessageContent(msg.content, msg.id)}</div>
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
              {(selectedConversation.status === "active" || !selectedConversation.status) && (
                <div className="bg-white border-t border-gray-200 p-4">
                  <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                    {/* File Upload */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-gray-500 hover:text-blue-600"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                    >
                        <Paperclip className="w-5 h-5" />
                    </Button>

                    {/* Voice Recording */}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`${isRecording ? "text-red-600 animate-pulse" : "text-gray-500 hover:text-red-600"}`}
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={loading}
                    >
                        {isRecording ? <StopCircle className="w-6 h-6" /> : <Mic className="w-5 h-5" />}
                    </Button>

                    <Input
                      type="text"
                      placeholder={isRecording ? "Gravando áudio..." : "Digite sua mensagem..."}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      disabled={loading || isRecording}
                      className="flex-1"
                    />
                    <Button 
                      type="submit" 
                      disabled={loading || !messageText.trim() || isRecording}
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
              
              {/* Debug Info for Assignment Mismatch */}
              {(selectedConversation.status === "active" || !selectedConversation.status) && selectedConversation.assigned_to && String(selectedConversation.assigned_to) !== String(user?.id) && (
                 <div className="bg-red-50 border-t border-red-200 p-4 text-center">
                    <p className="text-red-800 font-medium">Debug: ID Mismatch</p>
                    <p className="text-xs text-red-600">
                        Conversation Assigned To: {selectedConversation.assigned_to} <br/>
                        Current User ID: {user?.id}
                    </p>
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
              </>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-gray-400 flex-col">
              <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
              <p>Selecione uma conversa para iniciar o atendimento</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </Layout>
  );
}
