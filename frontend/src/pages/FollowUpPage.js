import React, { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api, { MEDIA_BASE } from "../services/api";
import { Plus, Edit, Trash2, Settings, ChevronLeft, ChevronRight, CheckCircle, Users, History, MessageSquare, BarChart, ImagePlus, Video, Smile, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { useAuth } from "../contexts/AuthContext";

import LeadCombobox from "../components/LeadCombobox";
import PatientCombobox from "../components/PatientCombobox";
import SearchableSelect from "../components/SearchableSelect";

export default function FollowUpPage() {
  const { user } = useAuth();
  const isAdmin = user?.role?.is_admin || user?.user_type === "admin" || user?.user_type === "superuser";
  
  const [followUps, setFollowUps] = useState([]);
  const [leads, setLeads] = useState([]);
  const [patients, setPatients] = useState([]);
  const [rules, setRules] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [followUpToDelete, setFollowUpToDelete] = useState(null);
  const [deleteRuleDialog, setDeleteRuleDialog] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  const [formData, setFormData] = useState({
    target_kind: "lead", // 'lead' | 'patient'
    lead_id: "",
    patient_id: "",
    contact_type: "whatsapp",
    status: "pending",
    scheduled_date: new Date().toISOString().split('T')[0],
    notes: "",
    contact_reason: "comercial"
  });

  const [ruleFormData, setRuleFormData] = useState({
    name: "",
    type: "comercial",
    trigger: "lead_created",
    service_id: "",
    days_after: 1,
    message_template: "",
    message_media_url: "",
    message_media_type: "",
    active: true
  });
  const messageTemplateRef = useRef(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const MAX_IMAGE_MB = 5;
  const MAX_VIDEO_MB = 15;

  // Campaign State
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [services, setServices] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [activeTab, setActiveTab] = useState("list"); // 'list' or 'history'
  const [campaignFormData, setCampaignFormData] = useState({
    title: "",
    target_type: "patients",
    target_filter: "all",
    service_id: "",
    service_ids: [],
    cities: [],
    lead_status: "",
    message: "",
    message_media_url: "",
    message_media_type: ""
  });
  const [campaignCities, setCampaignCities] = useState([]);
  const [campaignAudienceEstimate, setCampaignAudienceEstimate] = useState(null);
  const campaignMessageRef = useRef(null);
  const [campaignUploadingMedia, setCampaignUploadingMedia] = useState(false);
  const CAMPAIGN_MAX_IMAGE_MB = 5;
  const CAMPAIGN_MAX_VIDEO_MB = 15;

  useEffect(() => {
    loadFollowUps();
    loadLeads();
    loadPatients();
    loadServices();
    loadCampaigns();
    if (isAdmin) {
      loadRules();
    }
  }, [isAdmin]);

  const loadCampaigns = async () => {
    try {
      const response = await api.get("/campaigns");
      setCampaigns(response.data);
    } catch (error) {
      console.error("Erro ao carregar histórico de campanhas");
    }
  };

  const loadFollowUps = async () => {
    try {
      const response = await api.get("/follow-ups");
      setFollowUps(response.data);
    } catch (error) {
      toast.error("Erro ao carregar follow-ups");
    }
  };

  const loadLeads = async () => {
    try {
      const response = await api.get("/leads", { params: { page_size: 500 } });
      const data = response.data?.items ?? (Array.isArray(response.data) ? response.data : []);
      setLeads(data);
    } catch (error) {
      console.error("Erro ao carregar leads");
    }
  };

  const loadPatients = async () => {
    try {
      // Carregar todos os pacientes (paginação) para permitir busca por nome/telefone
      const pageSize = 500;
      let all = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await api.get("/patients", { params: { page, page_size: pageSize, sort_by: "name", order: "asc" } });
        const list = res.data?.items ?? (Array.isArray(res.data) ? res.data : []);
        all = all.concat(list);
        hasMore = Array.isArray(list) && list.length === pageSize;
        page += 1;
      }
      setPatients(all);
    } catch (error) {
      console.error("Erro ao carregar pacientes");
    }
  };

  const loadServices = async () => {
    try {
      const response = await api.get("/services");
      setServices(response.data);
    } catch (error) {
      console.error("Erro ao carregar serviços");
    }
  };

  useEffect(() => {
    if (!showCampaignDialog) return;
    const fetchCities = async () => {
      try {
        const res = await api.get("/patients/cities");
        setCampaignCities(Array.isArray(res.data) ? res.data : []);
      } catch {
        setCampaignCities([]);
      }
    };
    fetchCities();
  }, [showCampaignDialog]);

  useEffect(() => {
    if (!showCampaignDialog) return;
    const fetchEstimate = async () => {
      try {
        const params = new URLSearchParams({ target_type: campaignFormData.target_type });
        if (campaignFormData.target_type === "patients") {
          if (campaignFormData.target_filter === "by_services" && campaignFormData.service_ids?.length) {
            params.set("target_filter", "by_services");
            params.set("service_ids", campaignFormData.service_ids.join(","));
          } else if (campaignFormData.target_filter === "by_cities" && campaignFormData.cities?.length) {
            params.set("target_filter", "by_cities");
            params.set("cities", campaignFormData.cities.join(","));
          }
        }
        const res = await api.get(`/campaigns/audience-estimate?${params.toString()}`);
        setCampaignAudienceEstimate(res.data?.estimate ?? 0);
      } catch {
        setCampaignAudienceEstimate(null);
      }
    };
    fetchEstimate();
  }, [showCampaignDialog, campaignFormData.target_type, campaignFormData.target_filter, campaignFormData.service_ids, campaignFormData.cities]);

  const toggleCampaignCity = (cityName) => {
    setCampaignFormData((prev) => {
      const list = prev.cities || [];
      if (list.includes(cityName)) return { ...prev, cities: list.filter((c) => c !== cityName) };
      return { ...prev, cities: [...list, cityName] };
    });
  };

  const toggleCampaignService = (serviceId) => {
    setCampaignFormData((prev) => {
      const ids = prev.service_ids || [];
      const next = ids.includes(serviceId) ? ids.filter((id) => id !== serviceId) : [...ids, serviceId];
      return { ...prev, service_ids: next };
    });
  };

  const insertCampaignEmoji = (emoji) => {
    const ta = campaignMessageRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = campaignFormData.message || "";
    const next = text.slice(0, start) + emoji + text.slice(end);
    setCampaignFormData({ ...campaignFormData, message: next });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
  };

  const handleCampaignMediaUpload = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const isImage = (file.type || "").startsWith("image/");
    const isVideo = (file.type || "").startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("Selecione uma imagem ou vídeo.");
      return;
    }
    const maxMb = isImage ? CAMPAIGN_MAX_IMAGE_MB : CAMPAIGN_MAX_VIDEO_MB;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Tamanho máximo: ${maxMb} MB`);
      return;
    }
    setCampaignUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/follow-up-rules/upload-media", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setCampaignFormData({
        ...campaignFormData,
        message_media_url: res.data?.url ?? "",
        message_media_type: res.data?.media_type ?? (isImage ? "image" : "video")
      });
      toast.success("Mídia anexada.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao enviar mídia.");
    } finally {
      setCampaignUploadingMedia(false);
      e.target.value = "";
    }
  };

  const handleCampaignSubmit = async (e) => {
    e.preventDefault();
    if (!campaignFormData.title) {
      toast.error("Por favor, dê um título para a campanha");
      return;
    }
    if (campaignFormData.target_type === "patients" && campaignFormData.target_filter === "by_services" && (!campaignFormData.service_ids || campaignFormData.service_ids.length === 0)) {
      toast.error("Selecione ao menos um serviço para o público por serviços agendados.");
      return;
    }
    if (campaignFormData.target_type === "patients" && campaignFormData.target_filter === "by_cities" && (!campaignFormData.cities || campaignFormData.cities.length === 0)) {
      toast.error("Selecione ao menos uma cidade para o público por cidades.");
      return;
    }
    try {
      const payload = {
        ...campaignFormData,
        service_ids: campaignFormData.service_ids?.length ? campaignFormData.service_ids : undefined,
        cities: campaignFormData.cities?.length ? campaignFormData.cities : undefined
      };
      const response = await api.post("/campaigns/send", payload);
      toast.success(response.data.message);
      setShowCampaignDialog(false);
      setCampaignFormData({
        title: "",
        target_type: "patients",
        target_filter: "all",
        service_id: "",
        service_ids: [],
        cities: [],
        lead_status: "",
        message: "",
        message_media_url: "",
        message_media_type: ""
      });
      setCampaignAudienceEstimate(null);
      loadFollowUps(); // Refresh to see new followups
      loadCampaigns(); // Refresh history
    } catch (error) {
      toast.error("Erro ao enviar campanha");
    }
  };

  const loadRules = async () => {
    try {
      const response = await api.get("/follow-up-rules");
      setRules(response.data);
    } catch (error) {
      console.error("Erro ao carregar regras:", error);
      toast.error("Erro ao carregar regras de follow-up");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.target_kind === "lead" && !formData.lead_id) {
      toast.error("Selecione um lead para criar o follow-up.");
      return;
    }
    if (formData.target_kind === "patient" && !formData.patient_id) {
      toast.error("Selecione um paciente para criar o follow-up.");
      return;
    }
    try {
      if (editingId) {
        await api.put(`/follow-ups/${editingId}`, formData);
        toast.success("Follow-up atualizado!");
      } else {
        await api.post("/follow-ups", formData);
        toast.success("Follow-up criado!");
      }
      setShowDialog(false);
      setEditingId(null);
      setFormData({
        target_kind: "lead",
        lead_id: "",
        patient_id: "",
        contact_type: "whatsapp",
        status: "pending",
        scheduled_date: new Date().toISOString().split('T')[0],
        notes: "",
        contact_reason: "comercial"
      });
      loadFollowUps();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar follow-up" : "Erro ao criar follow-up");
    }
  };

  const handleEdit = (followUp) => {
    setEditingId(followUp.id);
    setFormData({
      target_kind: followUp.patient_id ? "patient" : "lead",
      lead_id: followUp.lead_id || "",
      patient_id: followUp.patient_id || "",
      contact_type: followUp.contact_type,
      status: followUp.status,
      scheduled_date: followUp.scheduled_date,
      notes: followUp.notes || "",
      contact_reason: followUp.contact_reason || "comercial"
    });
    setShowDialog(true);
  };

  const handleDelete = async (followUp) => {
    setFollowUpToDelete(followUp);
    setDeleteDialog(true);
  };

  const confirmDeleteFollowUp = async () => {
    if (!followUpToDelete) return;
    
    try {
      await api.delete(`/follow-ups/${followUpToDelete.id}`);
      toast.success("Follow-up deletado!");
      setDeleteDialog(false);
      setFollowUpToDelete(null);
      loadFollowUps();
    } catch (error) {
      toast.error("Erro ao deletar follow-up");
    }
  };

  const handleComplete = async (id) => {
    try {
      await api.put(`/follow-ups/${id}`, { status: "completed" });
      toast.success("Follow-up marcado como concluído!");
      loadFollowUps();
    } catch (error) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRuleId) {
        await api.put(`/follow-up-rules/${editingRuleId}`, ruleFormData);
        toast.success("Regra atualizada!");
      } else {
        await api.post("/follow-up-rules", ruleFormData);
        toast.success("Regra criada!");
      }
      setShowRuleDialog(false);
      setEditingRuleId(null);
      setRuleFormData({
        name: "",
        type: "comercial",
        trigger: "lead_created",
        service_id: "",
        days_after: 1,
        message_template: "",
        message_media_url: "",
        message_media_type: "",
        active: true
      });
      loadRules();
    } catch (error) {
      toast.error(editingRuleId ? "Erro ao atualizar regra" : "Erro ao criar regra");
    }
  };

  const handleEditRule = (rule) => {
    setEditingRuleId(rule.id);
    setRuleFormData({
      name: rule.name ?? "",
      type: rule.type ?? "comercial",
      trigger: rule.trigger ?? "lead_created",
      service_id: rule.service_id ?? "",
      days_after: rule.days_after ?? 1,
      message_template: rule.message_template ?? "",
      message_media_url: rule.message_media_url ?? "",
      message_media_type: rule.message_media_type ?? "",
      active: rule.active !== false
    });
    setShowRuleDialog(true);
  };

  const insertEmoji = (emoji) => {
    const ta = messageTemplateRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ruleFormData.message_template || "";
    const next = text.slice(0, start) + emoji + text.slice(end);
    setRuleFormData({ ...ruleFormData, message_template: next });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
  };

  const handleRuleMediaUpload = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const isImage = (file.type || "").startsWith("image/");
    const isVideo = (file.type || "").startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("Selecione uma imagem ou vídeo.");
      return;
    }
    const maxMb = isImage ? MAX_IMAGE_MB : MAX_VIDEO_MB;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`Tamanho máximo: ${maxMb} MB`);
      return;
    }
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/follow-up-rules/upload-media", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setRuleFormData({
        ...ruleFormData,
        message_media_url: res.data?.url ?? "",
        message_media_type: res.data?.media_type ?? (isImage ? "image" : "video")
      });
      toast.success("Mídia anexada.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Erro ao enviar mídia.");
    } finally {
      setUploadingMedia(false);
      e.target.value = "";
    }
  };

  const handleDeleteRule = (rule) => {
    setRuleToDelete(rule);
    setDeleteRuleDialog(true);
  };

  const confirmDeleteRule = async () => {
    if (!ruleToDelete) return;
    
    try {
      await api.delete(`/follow-up-rules/${ruleToDelete.id}`);
      toast.success("Regra deletada!");
      setDeleteRuleDialog(false);
      setRuleToDelete(null);
      loadRules();
    } catch (error) {
      toast.error("Erro ao deletar regra");
    }
  };

  const toggleRuleActive = async (id) => {
    try {
      const rule = rules.find(r => r.id === id);
      if (!rule) return;
      await api.put(`/follow-up-rules/${id}`, { ...rule, active: !rule.active });
      toast.success("Status da regra atualizado!");
      loadRules();
    } catch (error) {
      toast.error("Erro ao atualizar status da regra");
    }
  };

  const getLeadName = (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    return lead ? lead.name : "";
  };

  const getPatientName = (patientId) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.name : "";
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-700",
      completed: "bg-green-100 text-green-700",
      cancelled: "bg-red-100 text-red-700"
    };
    const labels = {
      pending: "Pendente",
      completed: "Concluído",
      cancelled: "Cancelado"
    };
    return <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>;
  };

  // Paginação e Filtros
  const getFilteredFollowUps = () => {
    if (activeTab === 'list') {
      return followUps.filter(f => f.status !== 'completed');
    }
    if (activeTab === 'completed') {
      return followUps.filter(f => f.status === 'completed');
    }
    return [];
  };

  const filteredList = getFilteredFollowUps();
  const currentFollowUps = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredList.length / itemsPerPage);

  // Pagination for Campaigns
  const currentCampaigns = campaigns.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalCampaignPages = Math.ceil(campaigns.length / itemsPerPage);

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Follow-up</h1>
          <div className="flex gap-3">
            {isAdmin && (
              <Button
                onClick={() => {
                  setEditingRuleId(null);
                  setRuleFormData({
                    name: "",
                    type: "comercial",
                    trigger: "lead_created",
                    service_id: "",
                    days_after: 1,
                    message_template: "",
                    message_media_url: "",
                    message_media_type: "",
                    active: true
                  });
                  setShowRuleDialog(true);
                }}
                variant="outline"
                className="btn-secondary"
              >
                <Settings className="w-5 h-5 mr-2" />
                Gerenciar Regras
              </Button>
            )}
            <Button onClick={() => setShowCampaignDialog(true)} variant="outline" className="btn-secondary border-green-200 text-green-700 bg-green-50 hover:bg-green-100">
              <Users className="w-5 h-5 mr-2" />
              Campanha em Massa
            </Button>
            <Button onClick={() => setShowDialog(true)} className="btn-primary">
              <Plus className="w-5 h-5 mr-2" />
              Novo Follow-up
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            className={`pb-2 px-4 font-medium ${activeTab === 'list' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => { setActiveTab('list'); setCurrentPage(1); }}
          >
            Pendentes
          </button>
          <button
            className={`pb-2 px-4 font-medium ${activeTab === 'completed' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => { setActiveTab('completed'); setCurrentPage(1); }}
          >
            Concluídos
          </button>
          <button
            className={`pb-2 px-4 font-medium ${activeTab === 'history' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => { setActiveTab('history'); setCurrentPage(1); }}
          >
            Histórico de Campanhas
          </button>
        </div>

        {/* Regras Ativas (apenas para admin e aba lista) */}
        {isAdmin && rules.length > 0 && activeTab === 'list' && (
          <div className="bg-blue-50 rounded-2xl p-6 mb-8 border border-blue-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Regras Automáticas Ativas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.filter(r => r.active).map((rule) => (
                <div key={rule.id} className="bg-white p-4 rounded-lg border border-blue-200">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-gray-900">{rule.name}</h4>
                    <span className={`px-2 py-1 rounded text-xs ${
                      rule.type === "comercial" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {rule.type === "comercial" ? "Comercial" : "Informativo"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">Dispara {rule.days_after} dia(s) após {rule.trigger === "lead_created" ? "lead criado" : "agendamento"}</p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="text-blue-500 hover:text-blue-700 text-sm"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleRuleActive(rule.id)}
                      className="text-gray-500 hover:text-gray-700 text-sm"
                    >
                      {rule.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de Follow-ups (Pendentes e Concluídos) */}
        {(activeTab === 'list' || activeTab === 'completed') && (
        <div className="grid gap-6">
          {currentFollowUps.map((followUp) => (
            <div key={followUp.id} className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">
                      {followUp.lead_id
                        ? (followUp.lead_name || getLeadName(followUp.lead_id) || "—")
                        : (followUp.patient_name || getPatientName(followUp.patient_id) || "—")}
                    </h3>
                    {getStatusBadge(followUp.status)}
                    <span className={`px-2 py-1 rounded text-xs ${
                      followUp.contact_reason === "comercial" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {followUp.contact_reason === "comercial" ? "Comercial" : "Informativo"}
                    </span>
                  </div>
                  <p className="text-gray-600">
                    Contato: {followUp.contact_type === "whatsapp" ? "WhatsApp" : 
                             followUp.contact_type === "phone" ? "Telefone" : "Email"}
                  </p>
                  <p className="text-gray-600">
                    Data agendada: {new Date(followUp.scheduled_date).toLocaleDateString('pt-BR')}
                  </p>
                  {followUp.notes && <p className="text-gray-600 mt-2">{followUp.notes}</p>}
                </div>
                <div className="flex gap-2">
                  {followUp.status === "pending" && (
                    <button
                      onClick={() => handleComplete(followUp.id)}
                      className="text-green-500 hover:text-green-700"
                      title="Marcar como concluído"
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(followUp)}
                    className="text-blue-500 hover:text-blue-700"
                    title="Editar"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      setFollowUpToDelete(followUp);
                      setDeleteDialog(true);
                    }}
                    className="text-red-500 hover:text-red-700"
                    title="Excluir"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {filteredList.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              {activeTab === 'list' ? 'Nenhum follow-up pendente.' : 'Nenhum follow-up concluído.'}
            </div>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
        )}

        {/* Histórico de Campanhas */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {currentCampaigns.map(campaign => (
              <div key={campaign.id} className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{campaign.title || "Campanha sem título"}</h3>
                    <p className="text-sm text-gray-500">
                      Enviada em {new Date(campaign.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    campaign.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {campaign.status === 'completed' ? 'Concluída' : 'Processando'}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="text-gray-500 text-sm block">Público Alvo</span>
                    <span className="font-medium">
                      {campaign.target_type === 'patients' ? 'Pacientes' : 'Leads'}
                      {(campaign.service_id || (campaign.service_ids && campaign.service_ids.length > 0)) && ' (Por serviços agendados)'}
                      {(campaign.cities && campaign.cities.length > 0) && ` (Por cidades: ${campaign.cities.join(", ")})`}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="text-gray-500 text-sm block">Total de Destinatários</span>
                    <span className="font-medium">{campaign.total_targets}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <span className="text-gray-500 text-sm block">Entrega</span>
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 font-medium">{campaign.stats?.delivered || 0} enviadas</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-red-500 font-medium">{campaign.stats?.failed || 0} falhas</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">Mensagem Enviada:</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{campaign.message}</p>
                </div>
              </div>
            ))}
            {campaigns.length === 0 && (
              <div className="text-center py-10 text-gray-500">
                Nenhuma campanha enviada ainda.
              </div>
            )}

            {/* Paginação de Campanhas */}
            {totalCampaignPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  Página {currentPage} de {totalCampaignPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalCampaignPages, p + 1))}
                  disabled={currentPage === totalCampaignPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Modal de Criar/Editar Follow-up */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Follow-up" : "Novo Follow-up"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Criar para</Label>
                <select
                  className="input-field"
                  value={formData.target_kind}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFormData({
                      ...formData,
                      target_kind: next,
                      lead_id: next === "lead" ? formData.lead_id : "",
                      patient_id: next === "patient" ? formData.patient_id : "",
                    });
                  }}
                >
                  <option value="lead">Lead</option>
                  <option value="patient">Paciente</option>
                </select>
              </div>
              <div>
                {formData.target_kind === "lead" ? (
                  <>
                    <Label>Lead *</Label>
                    <LeadCombobox
                      leads={leads}
                      value={formData.lead_id}
                      onChange={(leadId) => setFormData({ ...formData, lead_id: leadId, patient_id: "" })}
                      placeholder="Busque por nome, telefone ou email..."
                    />
                  </>
                ) : (
                  <>
                    <Label>Paciente *</Label>
                    <PatientCombobox
                      patients={patients}
                      value={formData.patient_id}
                      onChange={(patientId) => setFormData({ ...formData, patient_id: patientId, lead_id: "" })}
                      placeholder="Busque por nome, telefone ou email..."
                    />
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Contato</Label>
                  <select
                    className="input-field"
                    value={formData.contact_type}
                    onChange={(e) => setFormData({...formData, contact_type: e.target.value})}
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="phone">Telefone</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div>
                  <Label>Motivo do Contato</Label>
                  <select
                    className="input-field"
                    value={formData.contact_reason}
                    onChange={(e) => setFormData({...formData, contact_reason: e.target.value})}
                  >
                    <option value="comercial">Comercial</option>
                    <option value="informativo">Informativo</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Data Agendada</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Observações</Label>
                <textarea
                  className="input-field min-h-[100px]"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Anotações sobre este follow-up"
                />
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingId ? "Salvar Alterações" : "Criar Follow-up"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal de Gerenciar Regras */}
        <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingRuleId ? "Editar Regra" : "Nova Regra de Follow-up"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRuleSubmit} className="space-y-4">
              <div>
                <Label>Nome da Regra *</Label>
                <Input
                  value={ruleFormData.name}
                  onChange={(e) => setRuleFormData({...ruleFormData, name: e.target.value})}
                  placeholder="Ex: Follow-up Lead Novo"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo *</Label>
                  <select
                    className="input-field"
                    value={ruleFormData.type}
                    onChange={(e) => setRuleFormData({...ruleFormData, type: e.target.value})}
                  >
                    <option value="comercial">Comercial</option>
                    <option value="informativo">Informativo</option>
                  </select>
                </div>
                <div>
                  <Label>Disparar *</Label>
                  <select
                    className="input-field"
                    value={ruleFormData.trigger}
                    onChange={(e) => setRuleFormData({...ruleFormData, trigger: e.target.value, service_id: e.target.value === "service_maintenance" ? ruleFormData.service_id : ""})}
                  >
                    <option value="lead_created">Lead Criado</option>
                    <option value="appointment_created">Agendamento Criado</option>
                    <option value="appointment_completed">Consulta Concluída</option>
                    <option value="patient_birthday">Pacientes Aniversariantes</option>
                    <option value="service_maintenance">Serviços</option>
                  </select>
                </div>
              </div>
              {ruleFormData.trigger === "service_maintenance" && (
                <div>
                  <Label>Serviço (manutenção) *</Label>
                  <select
                    className="input-field"
                    value={ruleFormData.service_id}
                    onChange={(e) => setRuleFormData({...ruleFormData, service_id: e.target.value})}
                    required={ruleFormData.trigger === "service_maintenance"}
                  >
                    <option value="">Selecione o serviço</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Mensagem será enviada aos pacientes que realizaram este serviço há o tempo escolhido em &quot;Aguardar&quot;.
                  </p>
                </div>
              )}
              <div>
                <Label>Aguardar *</Label>
                <select
                  className="input-field"
                  value={ruleFormData.days_after}
                  onChange={(e) => setRuleFormData({...ruleFormData, days_after: parseInt(e.target.value, 10)})}
                >
                  <option value={0}>No dia</option>
                  <option value={1}>1 dia depois</option>
                  <option value={2}>2 dias depois</option>
                  <option value={-1}>1 dia antes</option>
                  <option value={-2}>2 dias antes</option>
                  <option value={15}>15 dias</option>
                  <option value={30}>1 mês</option>
                  <option value={60}>2 meses</option>
                  <option value={90}>3 meses</option>
                  <option value={120}>4 meses</option>
                  <option value={150}>5 meses</option>
                  <option value={180}>6 meses</option>
                </select>
              </div>
              <div>
                <Label>Template da Mensagem *</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Smile className="w-4 h-4" /> Inserir emoji:
                  </span>
                  {["😀", "👍", "❤️", "📅", "⏰", "✨", "🦷", "💬", "📱", "✅"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="text-lg hover:bg-gray-100 rounded p-1"
                      title="Inserir emoji"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={messageTemplateRef}
                  className="input-field min-h-[120px]"
                  value={ruleFormData.message_template}
                  onChange={(e) => setRuleFormData({...ruleFormData, message_template: e.target.value})}
                  placeholder="Use {nome}, {horario}, {data} como variáveis"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Variáveis: {"{nome}"} ou {"{name}"}, {"{horario}"}, {"{data}"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Label className="sr-only">Anexar mídia</Label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-blue-600 hover:text-blue-800">
                    <ImagePlus className="w-4 h-4" />
                    <span>Imagem (máx. {MAX_IMAGE_MB} MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleRuleMediaUpload}
                      disabled={uploadingMedia}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-blue-600 hover:text-blue-800">
                    <Video className="w-4 h-4" />
                    <span>Vídeo (máx. {MAX_VIDEO_MB} MB)</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleRuleMediaUpload}
                      disabled={uploadingMedia}
                    />
                  </label>
                  {uploadingMedia && <span className="text-xs text-gray-500">Enviando...</span>}
                </div>
                {ruleFormData.message_media_url && (
                  <div className="mt-2 p-2 border rounded-lg bg-gray-50">
                    {ruleFormData.message_media_type === "image" ? (
                      <img src={`${MEDIA_BASE}${ruleFormData.message_media_url}`} alt="Anexo" className="max-h-32 rounded object-contain" />
                    ) : (
                      <video src={`${MEDIA_BASE}${ruleFormData.message_media_url}`} controls className="max-h-32 rounded" />
                    )}
                    <button
                      type="button"
                      onClick={() => setRuleFormData({ ...ruleFormData, message_media_url: "", message_media_type: "" })}
                      className="text-xs text-red-600 hover:underline mt-1"
                    >
                      Remover mídia
                    </button>
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingRuleId ? "Salvar Alterações" : "Criar Regra"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Campaign Dialog */}
        <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Nova Campanha em Massa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCampaignSubmit} className="space-y-4 mt-4">
              <div>
                <Label>Título da Campanha</Label>
                <Input
                  value={campaignFormData.title}
                  onChange={(e) => setCampaignFormData({...campaignFormData, title: e.target.value})}
                  placeholder="Ex: Promoção Clareamento Janeiro"
                  required
                />
              </div>

              <div>
                <Label>Público Alvo</Label>
                <select
                  className="input-field"
                  value={campaignFormData.target_type}
                  onChange={(e) => setCampaignFormData({...campaignFormData, target_type: e.target.value})}
                >
                  <option value="patients">Pacientes</option>
                  <option value="leads">Leads</option>
                </select>
              </div>

              {campaignFormData.target_type === "patients" && (
                <>
                  <div>
                    <Label>Enviar para</Label>
                    <select
                      className="input-field"
                      value={campaignFormData.target_filter}
                      onChange={(e) => setCampaignFormData({...campaignFormData, target_filter: e.target.value})}
                    >
                      <option value="all">Todos os pacientes (com telefone)</option>
                      <option value="by_services">Por serviços já agendados</option>
                      <option value="by_cities">Por cidades</option>
                    </select>
                  </div>
                  {campaignFormData.target_filter === "by_cities" && (
                    <div>
                      <Label>Cidades (pacientes cadastrados nessas cidades)</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between input-field min-h-[40px] font-normal mt-1"
                          >
                            Buscar e adicionar cidade...
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border shadow-lg z-[100]" align="start">
                          <Command className="rounded-md border-0 bg-white max-h-[280px]">
                            <CommandInput placeholder="Buscar cidade..." className="bg-white" />
                            <div className="overflow-y-auto max-h-[220px] [&_[cmdk-list]]:max-h-none [&_[cmdk-list]]:overflow-visible" onWheel={(e) => e.stopPropagation()}>
                              <CommandList className="bg-white">
                                <CommandEmpty>Nenhuma cidade encontrada.</CommandEmpty>
                                {campaignCities.map((city) => (
                                  <CommandItem
                                    key={city}
                                    value={city}
                                    onSelect={() => toggleCampaignCity(city)}
                                    className="bg-white hover:bg-gray-100 cursor-pointer"
                                  >
                                    {(campaignFormData.cities || []).includes(city) ? "✓ " : ""}{city}
                                  </CommandItem>
                                ))}
                              </CommandList>
                            </div>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {(campaignFormData.cities || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(campaignFormData.cities || []).map((city) => (
                            <span
                              key={city}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-sm"
                            >
                              {city}
                              <button
                                type="button"
                                onClick={() => toggleCampaignCity(city)}
                                className="hover:bg-blue-200 rounded p-0.5"
                                aria-label="Remover"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {campaignAudienceEstimate !== null && campaignFormData.target_filter === "by_cities" && (
                        <p className="text-sm text-gray-600 mt-2">
                          <strong>Estimativa do público:</strong> ~{campaignAudienceEstimate} pessoa{campaignAudienceEstimate !== 1 ? "s" : ""} (com telefone)
                        </p>
                      )}
                    </div>
                  )}
                  {campaignFormData.target_filter === "by_services" && (
                    <div>
                      <Label>Serviços (pacientes que já agendaram)</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between input-field min-h-[40px] font-normal mt-1"
                          >
                            Buscar e adicionar serviço...
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border shadow-lg z-[100]" align="start">
                          <Command className="rounded-md border-0 bg-white max-h-[280px]">
                            <CommandInput placeholder="Buscar serviço..." className="bg-white" />
                            <div className="overflow-y-auto max-h-[220px] [&_[cmdk-list]]:max-h-none [&_[cmdk-list]]:overflow-visible" onWheel={(e) => e.stopPropagation()}>
                              <CommandList className="bg-white">
                                <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
                                {services.map((s) => (
                                  <CommandItem
                                    key={s.id}
                                    value={s.name}
                                    onSelect={() => toggleCampaignService(s.id)}
                                    className="bg-white hover:bg-gray-100 cursor-pointer"
                                  >
                                    {(campaignFormData.service_ids || []).includes(s.id) ? "✓ " : ""}{s.name}
                                  </CommandItem>
                                ))}
                              </CommandList>
                            </div>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {(campaignFormData.service_ids || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(campaignFormData.service_ids || []).map((id) => {
                            const s = services.find((x) => x.id === id);
                            return s ? (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-sm"
                              >
                                {s.name}
                                <button
                                  type="button"
                                  onClick={() => toggleCampaignService(id)}
                                  className="hover:bg-gray-300 rounded p-0.5"
                                  aria-label="Remover"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                      {campaignAudienceEstimate !== null && (
                        <p className="text-sm text-gray-600 mt-2">
                          <strong>Estimativa do público:</strong> ~{campaignAudienceEstimate} pessoa{campaignAudienceEstimate !== 1 ? "s" : ""} (com telefone)
                        </p>
                      )}
                    </div>
                  )}
                  {campaignFormData.target_filter === "all" && campaignAudienceEstimate !== null && (
                    <p className="text-sm text-gray-600">
                      <strong>Estimativa do público:</strong> ~{campaignAudienceEstimate} pessoa{campaignAudienceEstimate !== 1 ? "s" : ""}
                    </p>
                  )}
                </>
              )}

              {campaignFormData.target_type === "leads" && (
                <div>
                  <Label>Status do Lead (Opcional)</Label>
                  <select
                    className="input-field"
                    value={campaignFormData.lead_status}
                    onChange={(e) => setCampaignFormData({...campaignFormData, lead_status: e.target.value})}
                  >
                    <option value="">Todos os leads com telefone</option>
                    <option value="new">Novo</option>
                    <option value="contacted">Contatado</option>
                    <option value="scheduled">Agendado</option>
                    <option value="qualified">Qualificado</option>
                    <option value="converted">Convertido</option>
                    <option value="lost">Perdido</option>
                  </select>
                  {campaignAudienceEstimate !== null && (
                    <p className="text-sm text-gray-600 mt-2">
                      <strong>Estimativa:</strong> ~{campaignAudienceEstimate} pessoa{campaignAudienceEstimate !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}

              <div>
                <Label>Mensagem</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Smile className="w-4 h-4" /> Emojis:
                  </span>
                  {["😀", "👍", "❤️", "📅", "✨", "💬", "📱", "✅"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertCampaignEmoji(emoji)}
                      className="text-lg hover:bg-gray-100 rounded p-1"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={campaignMessageRef}
                  className="input-field min-h-[120px]"
                  value={campaignFormData.message}
                  onChange={(e) => setCampaignFormData({...campaignFormData, message: e.target.value})}
                  placeholder="Olá {name}, temos uma novidade especial para você..."
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Variável: {"{name}"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-blue-600 hover:text-blue-800">
                    <ImagePlus className="w-4 h-4" />
                    Imagem (máx. {CAMPAIGN_MAX_IMAGE_MB} MB)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCampaignMediaUpload}
                      disabled={campaignUploadingMedia}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-blue-600 hover:text-blue-800">
                    <Video className="w-4 h-4" />
                    Vídeo (máx. {CAMPAIGN_MAX_VIDEO_MB} MB)
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleCampaignMediaUpload}
                      disabled={campaignUploadingMedia}
                    />
                  </label>
                  {campaignUploadingMedia && <span className="text-xs text-gray-500">Enviando...</span>}
                </div>
                {campaignFormData.message_media_url && (
                  <div className="mt-2 p-2 border rounded-lg bg-gray-50">
                    {campaignFormData.message_media_type === "image" ? (
                      <img src={`${MEDIA_BASE}${campaignFormData.message_media_url}`} alt="Anexo" className="max-h-32 rounded object-contain" />
                    ) : (
                      <video src={`${MEDIA_BASE}${campaignFormData.message_media_url}`} controls className="max-h-32 rounded" />
                    )}
                    <button
                      type="button"
                      onClick={() => setCampaignFormData({ ...campaignFormData, message_media_url: "", message_media_type: "" })}
                      className="text-xs text-red-600 hover:underline mt-1"
                    >
                      Remover mídia
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md text-sm text-yellow-800">
                <p className="font-semibold flex items-center gap-2">
                  <span className="text-lg">⚠️</span> Atenção
                </p>
                <p>
                  Esta ação enviará mensagens via WhatsApp para todos os contatos do filtro selecionado.
                  Certifique-se de que a mensagem está correta antes de enviar.
                </p>
                <p className="mt-2 font-medium">
                  Vários disparos em massa podem resultar no bloqueio ou banimento do número de WhatsApp configurado. Use com moderação.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCampaignDialog(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white">
                  Enviar Campanha
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Follow-up Confirmation Dialog */}
        <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão de Follow-up</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-700">
                Tem certeza que deseja excluir este follow-up?
              </p>
              {followUpToDelete && (
                <div className="mt-3 p-3 bg-gray-50 rounded">
                  <p className="text-sm"><strong>Data:</strong> {followUpToDelete.scheduled_date}</p>
                  <p className="text-sm"><strong>Observações:</strong> {followUpToDelete.notes}</p>
                </div>
              )}
              <p className="text-sm text-gray-500 mt-2">
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialog(false);
                  setFollowUpToDelete(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmDeleteFollowUp}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Excluir Follow-up
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Rule Confirmation Dialog */}
        <Dialog open={deleteRuleDialog} onOpenChange={setDeleteRuleDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão de Regra</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-700">
                Tem certeza que deseja excluir esta regra automática?
              </p>
              {ruleToDelete && (
                <div className="mt-3 p-3 bg-gray-50 rounded">
                  <p className="text-sm"><strong>Nome:</strong> {ruleToDelete.name}</p>
                  <p className="text-sm"><strong>Tipo:</strong> {ruleToDelete.trigger_type}</p>
                </div>
              )}
              <p className="text-sm text-gray-500 mt-2">
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteRuleDialog(false);
                  setRuleToDelete(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmDeleteRule}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Excluir Regra
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
