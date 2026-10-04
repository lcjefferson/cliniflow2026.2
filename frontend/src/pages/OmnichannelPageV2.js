import React, { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api, { API_BASE } from "../services/api";
import io from "socket.io-client";
import { useAuth } from "../contexts/AuthContext";
import { 
  MessageSquare, Send, UserCheck, X, Check, 
  CheckCheck, Phone, Mail, AlertCircle, FileText, Download,
  Paperclip, Mic, StopCircle, Search, ArrowLeft, RotateCcw, Lock
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ContactAvatar from "../components/ContactAvatar";
import { formatPhone } from "../lib/contact";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "mine", label: "Meus" },
  { id: "unassigned", label: "Não atribuídos" },
];

const DAY_MS = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
const toDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const formatListTime = (value) => {
  const d = toDate(value);
  if (!d) return "";
  const diff = daysAgo(d);
  if (diff === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 1) return "Ontem";
  if (diff < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", ...(sameYear ? {} : { year: "2-digit" }) });
};

const formatDayLabel = (value) => {
  const d = toDate(value);
  if (!d) return "";
  const diff = daysAgo(d);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
};

const dayKey = (value) => toDate(value)?.toDateString() || "";

// The message list ships media as a media_path (fetched once, cached by the browser); real-time
// socket messages may still carry the base64 inline.
const mediaSrc = (content, fallbackMime) => {
  if (content.file_data) return `data:${content.mimetype || fallbackMime};base64,${content.file_data}`;
  if (content.media_path) return `${API_BASE}${content.media_path}?token=${encodeURIComponent(localStorage.getItem("token") || "")}`;
  return null;
};

const AudioMessage = ({ content, messageId }) => {
  const [error, setError] = useState(false);
  const [audioSrc, setAudioSrc] = useState(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Initial load logic
    let src = mediaSrc(content, 'audio/ogg') ||
        (content.body || content.data ? `data:${content.mimetype || 'audio/ogg'};base64,${content.body || content.data}` : null) || 
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
    // Prioritize stored media if available to prevent reverting to encrypted URL during polling
    let src = mediaSrc(content, mimetype) ||
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
    // Prioritize stored media
    let src = mediaSrc(content, mimetype) ||
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
  const [listLoaded, setListLoaded] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
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
    const REFRESH_MS = 15000;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadData();
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval;
    if (selectedConversation) {
      setMessages([]);
      setLoadingMessages(true);
      const convId = selectedConversation.id;
      api
        .get(`/conversations/${convId}/messages`)
        .then((res) => {
          setMessages(Array.isArray(res.data) ? res.data : []);
          setShouldScrollToBottom(true);
        })
        .catch(() => toast.error("Erro ao carregar mensagens"))
        .finally(() => setLoadingMessages(false));
      interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          api.get(`/conversations/${convId}/messages`).then((res) => {
            setMessages(Array.isArray(res.data) ? res.data : []);
          }).catch(() => {});
        }
      }, 6000);
    } else {
      setMessages([]);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedConversation]);

  useEffect(() => {
    if (shouldScrollToBottom && messages.length > 0) {
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [messages, shouldScrollToBottom]);

  useEffect(() => {
    if (selectedConversation && messages.length > 0) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [selectedConversation?.id, messages.length]);

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
      const convRes = await api.get("/conversations");
      const list = Array.isArray(convRes.data) ? convRes.data : [];
      setConversations(list);
      // Leads em segundo plano (para conversão/edição); lista usa lead_name da conversa
      api.get("/leads", { params: { page_size: 300 } }).then((leadsRes) => {
        const data = leadsRes.data?.items ?? (Array.isArray(leadsRes.data) ? leadsRes.data : []);
        setLeads(data);
      }).catch(() => {});
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
      toast.error("Erro ao carregar conversas");
    } finally {
      setListLoaded(true);
    }
  };

  const loadMessages = async (conversationId) => {
    if (!conversationId) return;
    try {
      const response = await api.get(`/conversations/${conversationId}/messages`);
      setMessages(Array.isArray(response.data) ? response.data : []);
      setShouldScrollToBottom(true);
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

  const getLeadInfo = (leadId, conversation = null) => {
    const id = leadId != null ? String(leadId) : "";
    const fromConv = conversation && (conversation.lead_name != null || conversation.lead_phone != null)
      ? { name: conversation.lead_name || conversation.lead_phone || "Contato", phone: conversation.lead_phone || "", email: conversation.lead_email || "" }
      : null;
    const fromList = leads.find(l => String(l.id) === id);
    if (fromList) return { name: fromList.name || "Contato", phone: fromList.phone || "", email: fromList.email || "" };
    if (fromConv) return fromConv;
    return { name: "Contato", phone: id ? String(leadId) : "", email: "" };
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
      if (content === "[mensagem enviada pelo celular]") {
        return <span className="italic text-gray-500 text-sm">(Mensagem enviada pelo celular)</span>;
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
          content.url ||
          content.media_path) {
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
    const lead = getLeadInfo(conv.lead_id, conv);
    const matchesSearch = !searchTerm ||
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone?.includes(searchTerm) ||
        lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
        
    if (!matchesSearch) return false;

    if (filter === "mine") return conv.assigned_to === user?.id;
    if (filter === "unassigned") return !conv.assigned_to;
    return true;
  });

  const filterCounts = {
    all: conversations.length,
    mine: conversations.filter(c => c.assigned_to === user?.id).length,
    unassigned: conversations.filter(c => !c.assigned_to).length,
  };

  const selectedLead = selectedConversation
    ? getLeadInfo(selectedConversation.lead_id, selectedConversation)
    : null;
  const isConversationOpen = selectedConversation
    && (selectedConversation.status === "active" || !selectedConversation.status);

  return (
    <Layout fullHeight>
      <div className="relative flex h-full overflow-hidden bg-white">
        {/* Lista de conversas */}
        <aside className={`absolute inset-0 z-10 flex w-full flex-col bg-white transition-transform duration-300 md:static md:w-[22rem] md:flex-shrink-0 md:translate-x-0 md:border-r md:border-slate-200 xl:w-96 ${selectedConversation ? "-translate-x-full" : "translate-x-0"}`}>
          <div className="space-y-3 border-b border-slate-200 px-4 pb-3 pt-4">
            <div>
              <h1 className="text-lg text-slate-900">Omnichannel</h1>
              <p className="text-xs text-slate-500">Atendimento integrado multicanal</p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone ou e-mail"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {FILTERS.map(({ id, label }) => {
                const active = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={`flex flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition ${
                      active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {label}
                    <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-blue-50 text-blue-700" : "bg-slate-200/70 text-slate-500"}`}>
                      {filterCounts[id]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!listLoaded ? (
              <ul aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                    <div className="h-11 w-11 animate-pulse rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">Nenhuma conversa encontrada</p>
                <p className="mt-1 text-xs text-slate-500">
                  {searchTerm ? "Tente buscar por outro termo." : "As novas conversas aparecem aqui automaticamente."}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const lead = getLeadInfo(conv.lead_id, conv);
                const isSelected = selectedConversation?.id === conv.id;
                const isAssignedToMe = conv.assigned_to === user?.id;

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      if (conv.id === selectedConversation?.id) return;
                      setSelectedConversation(conv);
                    }}
                    className={`relative flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${
                      isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"
                    }`}
                  >
                    {isSelected && <span className="absolute inset-y-0 left-0 w-0.5 bg-blue-600" />}
                    <ContactAvatar name={lead.name} seed={conv.lead_id || conv.id} channel={conv.channel} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm font-semibold ${isSelected ? "text-blue-700" : "text-slate-900"}`}>
                          {formatPhone(lead.name)}
                        </span>
                        <span className="flex-shrink-0 text-[11px] tabular-nums text-slate-400">
                          {formatListTime(conv.last_message_at || conv.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
                        {conv.status === "closed" && (
                          <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                            Encerrado
                          </span>
                        )}
                        {conv.assigned_to ? (
                          <span className="flex min-w-0 items-center gap-1 text-slate-500">
                            <UserCheck className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{isAssignedToMe ? "Você" : conv.assigned_to_name || "Atribuído"}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-medium text-amber-600">
                            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                            Não atribuído
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Área do chat */}
        <section className={`absolute inset-0 z-20 flex min-w-0 flex-1 flex-col bg-slate-50 transition-transform duration-300 md:static md:translate-x-0 ${selectedConversation ? "translate-x-0" : "translate-x-full"}`}>
          {selectedConversation ? (
            <>
              <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 md:px-5 md:py-3">
                <button
                  type="button"
                  className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                  onClick={() => setSelectedConversation(null)}
                  aria-label="Voltar para conversas"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <ContactAvatar
                  size="sm"
                  name={selectedLead.name}
                  seed={selectedConversation.lead_id || selectedConversation.id}
                  channel={selectedConversation.channel}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-slate-900 md:text-base">{formatPhone(selectedLead.name)}</h2>
                  <div className="flex min-w-0 items-center gap-3 text-xs text-slate-500">
                    {selectedLead.phone && (
                      <span className="flex min-w-0 items-center gap-1">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{formatPhone(selectedLead.phone)}</span>
                      </span>
                    )}
                    {selectedLead.email && (
                      <span className="hidden min-w-0 items-center gap-1 xl:flex">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{selectedLead.email}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {!selectedConversation.assigned_to && (
                    <Button
                      size="sm"
                      onClick={() => handleAssignToMe(selectedConversation.id)}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      title="Assumir atendimento"
                    >
                      <UserCheck className="mr-1.5 h-4 w-4" />
                      Assumir
                    </Button>
                  )}

                  {selectedConversation.assigned_to === user?.id && selectedConversation.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCloseConversation(selectedConversation.id)}
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      title="Encerrar atendimento"
                    >
                      <X className="mr-1.5 h-4 w-4" />
                      Encerrar
                    </Button>
                  )}

                  {selectedConversation.status === "closed" && (
                    <Button
                      size="sm"
                      onClick={() => handleReopenConversation(selectedConversation.id)}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                      title="Reabrir atendimento"
                    >
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      Reabrir
                    </Button>
                  )}
                </div>
              </header>

              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4 md:px-6"
              >
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">Nenhuma mensagem nesta conversa ainda.</div>
                ) : (
                  messages.map((msg, index) => {
                    const isFromConsultant = msg.sender_type === "consultant";
                    const isFromMe = msg.sender_id === user?.id;
                    const showDay = index === 0 || dayKey(messages[index - 1].created_at) !== dayKey(msg.created_at);
                    const bubbleClass = isFromConsultant
                      ? isFromMe
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-violet-600 text-white rounded-br-md"
                      : "bg-white text-slate-900 ring-1 ring-slate-200 rounded-bl-md";

                    return (
                      <React.Fragment key={msg.id}>
                        {showDay && (
                          <div className="flex justify-center py-2">
                            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-200">
                              {formatDayLabel(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${isFromConsultant ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm md:max-w-[70%] ${bubbleClass}`}>
                            {isFromConsultant && !isFromMe && (
                              <p className="mb-0.5 text-[11px] font-semibold text-white/80">{msg.sender_name}</p>
                            )}
                            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                              {renderMessageContent(msg.content, msg.id)}
                            </div>
                            <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${isFromConsultant ? "text-white/70" : "text-slate-400"}`}>
                              {toDate(msg.created_at)?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              {isFromMe && (msg.read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                            </p>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {isConversationOpen && selectedConversation.assigned_to && selectedConversation.assigned_to !== user?.id && (
                <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <p>
                    <span className="font-medium">
                      Em atendimento por {selectedConversation.assigned_to_name || "outro consultor"}.
                    </span>{" "}
                    Você pode visualizar as mensagens, mas não pode responder.
                  </p>
                </div>
              )}

              {isConversationOpen && (
                <div className="border-t border-slate-200 bg-white px-3 py-2.5 md:px-4 md:py-3">
                  <form onSubmit={handleSendMessage} className="flex items-center gap-1 md:gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <button
                      type="button"
                      className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 disabled:opacity-50"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={loading}
                      title="Anexar arquivo"
                      aria-label="Anexar arquivo"
                    >
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className={`rounded-full p-2 transition-colors disabled:opacity-50 ${
                        isRecording ? "animate-pulse bg-red-50 text-red-600" : "text-slate-500 hover:bg-slate-100 hover:text-red-600"
                      }`}
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={loading}
                      title={isRecording ? "Parar gravação" : "Gravar áudio"}
                      aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
                    >
                      {isRecording ? <StopCircle className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </button>
                    <Input
                      type="text"
                      placeholder={isRecording ? "Gravando áudio..." : "Digite sua mensagem..."}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      disabled={loading || isRecording}
                      className="h-10 flex-1 rounded-full border-slate-200 bg-slate-50 px-4 focus-visible:bg-white"
                    />
                    <button
                      type="submit"
                      disabled={loading || !messageText.trim() || isRecording}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
                      aria-label="Enviar mensagem"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                  {!selectedConversation.assigned_to && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                      Esta conversa não está atribuída. Assuma o atendimento para ser o responsável.
                    </p>
                  )}
                </div>
              )}

              {selectedConversation.status === "closed" && (
                <div className="border-t border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-500">
                  Atendimento encerrado. Reabra para continuar conversando.
                </div>
              )}
            </>
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center p-8 text-center md:flex">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-base text-slate-900">Nenhuma conversa selecionada</h3>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Escolha uma conversa na lista para ver as mensagens e responder.
              </p>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

