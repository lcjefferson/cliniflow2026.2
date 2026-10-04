import React, { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api, { MEDIA_BASE } from "../services/api";
import { Plus, Trash2, ChevronLeft, ChevronRight, CheckCircle, History, MessageSquare, ImagePlus, Video, Smile, ChevronDown, X, Eye, Pencil, Phone, Mail, Megaphone, Zap, Power, CalendarClock, AlertTriangle, Check, CalendarDays } from "lucide-react";
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

function getEmptyFollowUpForm() {
  return {
    target_kind: "lead",
    lead_id: "",
    patient_id: "",
    contact_type: "whatsapp",
    status: "pending",
    scheduled_date: new Date().toISOString().split("T")[0],
    notes: "",
    contact_reason: "comercial"
  };
}

function getEmptyRuleForm() {
  return {
    name: "",
    type: "comercial",
    trigger: "lead_created",
    service_id: "",
    days_after: 1,
    message_template: "",
    message_media_url: "",
    message_media_type: "",
    active: true
  };
}

function getTriggerLabel(trigger) {
  const labels = {
    lead_created: "Lead criado",
    appointment_created: "Agendamento criado",
    appointment_completed: "Consulta concluída",
    appointment_cancelled: "Agendamento cancelado",
    patient_birthday: "Pacientes aniversariantes",
    service_maintenance: "Manutenção de serviço"
  };
  return labels[trigger] || trigger || "—";
}

const TRIGGERS_ALLOWING_DAYS_BEFORE = ["appointment_created", "patient_birthday"];

const TRIGGER_HELP = {
  lead_created: "Enviada ao lead cadastrado na tela de leads ou que chegou pelo WhatsApp. \"No dia\" envia no momento do cadastro.",
  appointment_created: "Enviada ao paciente do agendamento. \"No dia\" envia ao criar o agendamento; \"dias antes\" funciona como lembrete antes da data da consulta; \"dias depois\" conta a partir da criação.",
  appointment_completed: "Enviada ao paciente quando o agendamento é marcado como \"Concluído\" na agenda. \"No dia\" envia no momento da conclusão.",
  appointment_cancelled: "Enviada ao paciente quando o agendamento é marcado como \"Cancelado\" na agenda. \"No dia\" envia no momento do cancelamento.",
  patient_birthday: "Enviada aos pacientes no aniversário (ou X dias antes/depois), todo dia às 9h."
};

function formatRuleDaysAfter(days) {
  const n = Number(days);
  const map = {
    0: "No dia",
    1: "1 dia depois",
    2: "2 dias depois",
    [-1]: "1 dia antes",
    [-2]: "2 dias antes",
    15: "15 dias",
    30: "1 mês",
    60: "2 meses",
    90: "3 meses",
    120: "4 meses",
    150: "5 meses",
    180: "6 meses"
  };
  if (map[n] !== undefined) return map[n];
  return `${n} dia(s)`;
}

function compareFollowUpByContactDate(a, b) {
  const da = (a.scheduled_date || "").slice(0, 10);
  const db = (b.scheduled_date || "").slice(0, 10);
  return da.localeCompare(db);
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const CONTACT_TYPES = {
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
  phone: { label: "Telefone", icon: Phone },
  email: { label: "E-mail", icon: Mail },
};

const REASON_BADGES = {
  comercial: { label: "Comercial", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  informativo: { label: "Informativo", className: "bg-blue-50 text-blue-700 ring-blue-600/20" },
};

const FOLLOWUP_STATUS = {
  pending: { label: "Pendente", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  completed: { label: "Concluído", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  cancelled: { label: "Cancelado", className: "bg-red-50 text-red-700 ring-red-600/20" },
};

const DUE_TONES = {
  overdue: { block: "bg-red-50 text-red-700 ring-red-200", label: "text-red-600" },
  today: { block: "bg-amber-50 text-amber-700 ring-amber-200", label: "text-amber-600" },
  soon: { block: "bg-blue-50 text-blue-700 ring-blue-200", label: "text-blue-600" },
  later: { block: "bg-slate-50 text-slate-600 ring-slate-200", label: "text-slate-500" },
  done: { block: "bg-slate-50 text-slate-400 ring-slate-200", label: "text-slate-400" },
};

// scheduled_date vem como "AAAA-MM-DD"; new Date() leria como UTC e mostraria o dia anterior no Brasil.
function parseLocalDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function getDueInfo(followUp) {
  const date = parseLocalDate(followUp.scheduled_date);
  if (!date) return { day: "—", month: "", label: "Sem data", tone: "later", diff: null };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date - today) / 86400000);
  const base = {
    day: String(date.getDate()).padStart(2, "0"),
    month: MONTHS_SHORT[date.getMonth()],
    full: date.toLocaleDateString("pt-BR"),
    diff,
  };
  if (followUp.status === "completed") return { ...base, label: base.full, tone: "done" };
  if (diff < 0) return { ...base, label: diff === -1 ? "Atrasado há 1 dia" : `Atrasado há ${-diff} dias`, tone: "overdue" };
  if (diff === 0) return { ...base, label: "Hoje", tone: "today" };
  if (diff === 1) return { ...base, label: "Amanhã", tone: "soon" };
  return { ...base, label: `Em ${diff} dias`, tone: diff <= 7 ? "soon" : "later" };
}

function RingBadge({ className, children }) {
  return <span className={`status-badge whitespace-nowrap ${className}`}>{children}</span>;
}

function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-1 border-t border-slate-200 px-3 py-2.5 text-xs text-slate-500 md:px-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-1 tabular-nums">Página {page} de {totalPages}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Próxima página"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function IconAction({ onClick, title, tone = "default", children }) {
  const tones = {
    default: "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
    danger: "text-slate-400 hover:bg-red-50 hover:text-red-600",
  };
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={`rounded-lg p-2 transition-colors ${tones[tone]}`}>
      {children}
    </button>
  );
}

function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-sm text-xs text-slate-500">{text}</p>}
      {action}
    </div>
  );
}

export default function FollowUpPage() {
  const { user } = useAuth();
  const isAdmin = user?.role?.is_admin || user?.user_type === "admin" || user?.user_type === "superuser";
  
  const [followUps, setFollowUps] = useState([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(true);
  const [leads, setLeads] = useState([]);
  const [patients, setPatients] = useState([]);
  const pickerDataLoadingRef = useRef(false);
  const pickerDataLoadedRef = useRef(false);
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
  const [pendingFilters, setPendingFilters] = useState({
    dateFrom: "",
    dateTo: "",
    contact_type: "",
    contact_reason: ""
  });
  
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [formData, setFormData] = useState(() => getEmptyFollowUpForm());

  const [ruleFormData, setRuleFormData] = useState(() => getEmptyRuleForm());
  const [viewingRule, setViewingRule] = useState(null);
  const [rulesHistoryPage, setRulesHistoryPage] = useState(1);
  const RULES_HISTORY_PER_PAGE = 10;

  useEffect(() => {
    const maxPage = Math.ceil(rules.length / RULES_HISTORY_PER_PAGE) || 1;
    if (rulesHistoryPage > maxPage) setRulesHistoryPage(maxPage);
  }, [rules.length, rulesHistoryPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pendingFilters]);

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
    if (isAdmin) {
      loadRules();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === "list" || activeTab === "completed") {
      loadFollowUps(activeTab);
    } else if (activeTab === "history") {
      loadCampaigns();
    } else if (activeTab === "rules_history" && isAdmin) {
      loadRules();
    }
  }, [activeTab, isAdmin]);

  useEffect(() => {
    if (showDialog) {
      ensurePickerData();
    }
  }, [showDialog]);

  useEffect(() => {
    if (showRuleDialog || showCampaignDialog) {
      loadServices();
    }
  }, [showRuleDialog, showCampaignDialog]);

  const loadCampaigns = async () => {
    try {
      const response = await api.get("/campaigns");
      setCampaigns(response.data);
    } catch (error) {
      console.error("Erro ao carregar histórico de campanhas");
    }
  };

  const loadFollowUps = async (tab = activeTab) => {
    if (tab !== "list" && tab !== "completed") return;
    setLoadingFollowUps(true);
    try {
      const params = { status: tab === "completed" ? "completed" : "pending" };
      const response = await api.get("/follow-ups", { params });
      setFollowUps(response.data);
    } catch (error) {
      toast.error("Erro ao carregar follow-ups");
    } finally {
      setLoadingFollowUps(false);
    }
  };

  const ensurePickerData = async () => {
    if (pickerDataLoadedRef.current || pickerDataLoadingRef.current) return;
    pickerDataLoadingRef.current = true;
    try {
      await Promise.all([loadLeads(), loadPatients()]);
      pickerDataLoadedRef.current = true;
    } finally {
      pickerDataLoadingRef.current = false;
    }
  };

  const seedPickerSelection = (followUp) => {
    if (followUp.lead_id) {
      setLeads((prev) => {
        if (prev.some((l) => l.id === followUp.lead_id)) return prev;
        return [{ id: followUp.lead_id, name: followUp.lead_name || "Lead" }, ...prev];
      });
    }
    if (followUp.patient_id) {
      setPatients((prev) => {
        if (prev.some((p) => p.id === followUp.patient_id)) return prev;
        return [{ id: followUp.patient_id, name: followUp.patient_name || "Paciente" }, ...prev];
      });
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
      loadFollowUps("list");
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
      setFormData(getEmptyFollowUpForm());
      loadFollowUps(activeTab);
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar follow-up" : "Erro ao criar follow-up");
    }
  };

  const handleEdit = (followUp) => {
    seedPickerSelection(followUp);
    ensurePickerData();
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

  const handleOpenNewFollowUp = () => {
    setEditingId(null);
    setFormData(getEmptyFollowUpForm());
    ensurePickerData();
    setShowDialog(true);
  };

  const handleFollowUpDialogOpenChange = (open) => {
    setShowDialog(open);
    if (!open) {
      setEditingId(null);
      setFormData(getEmptyFollowUpForm());
    }
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
      loadFollowUps(activeTab);
    } catch (error) {
      toast.error("Erro ao deletar follow-up");
    }
  };

  const handleComplete = async (id) => {
    try {
      await api.put(`/follow-ups/${id}`, { status: "completed" });
      toast.success("Follow-up marcado como concluído!");
      loadFollowUps(activeTab);
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
      setRuleFormData(getEmptyRuleForm());
      loadRules();
    } catch (error) {
      toast.error(editingRuleId ? "Erro ao atualizar regra" : "Erro ao criar regra");
    }
  };

  const handleEditRule = (rule) => {
    setViewingRule(null);
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

  const handleOpenNewRule = () => {
    setEditingRuleId(null);
    setRuleFormData(getEmptyRuleForm());
    setShowRuleDialog(true);
  };

  const handleRuleDialogOpenChange = (open) => {
    setShowRuleDialog(open);
    if (!open) {
      setEditingRuleId(null);
      setRuleFormData(getEmptyRuleForm());
    }
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

  const getServiceName = (serviceId) => {
    if (!serviceId) return "";
    const s = services.find((x) => x.id === serviceId);
    return s ? s.name : serviceId;
  };

  // Paginação e Filtros
  const hasActivePendingFilters =
    pendingFilters.dateFrom ||
    pendingFilters.dateTo ||
    pendingFilters.contact_type ||
    pendingFilters.contact_reason;

  const clearPendingFilters = () => {
    setPendingFilters({
      dateFrom: "",
      dateTo: "",
      contact_type: "",
      contact_reason: ""
    });
  };

  const getFilteredFollowUps = () => {
    if (activeTab === "list") {
      return followUps
        .filter((f) => {
          if (f.status === "completed") return false;

          if (pendingFilters.contact_type && f.contact_type !== pendingFilters.contact_type) {
            return false;
          }
          if (pendingFilters.contact_reason && f.contact_reason !== pendingFilters.contact_reason) {
            return false;
          }

          const sched = (f.scheduled_date || "").slice(0, 10);
          if (pendingFilters.dateFrom && sched < pendingFilters.dateFrom) return false;
          if (pendingFilters.dateTo && sched > pendingFilters.dateTo) return false;

          return true;
        })
        .sort(compareFollowUpByContactDate);
    }
    if (activeTab === "completed") {
      return followUps
        .filter((f) => f.status === "completed")
        .sort(compareFollowUpByContactDate);
    }
    return [];
  };

  const filteredList = getFilteredFollowUps();
  const currentFollowUps = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filteredList.length / itemsPerPage);

  // Pagination for Campaigns
  const currentCampaigns = campaigns.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalCampaignPages = Math.ceil(campaigns.length / itemsPerPage);

  const sortedRulesHistory = [...rules].sort((a, b) => {
    const ta = a.created_at != null ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at != null ? new Date(b.created_at).getTime() : 0;
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
  const totalRuleHistoryPages = Math.ceil(sortedRulesHistory.length / RULES_HISTORY_PER_PAGE) || 1;
  const pagedRulesHistory = sortedRulesHistory.slice(
    (rulesHistoryPage - 1) * RULES_HISTORY_PER_PAGE,
    rulesHistoryPage * RULES_HISTORY_PER_PAGE
  );

  const pendingSummary = activeTab === "list"
    ? followUps.reduce(
        (acc, f) => {
          if (f.status === "completed") return acc;
          const { diff } = getDueInfo(f);
          if (diff == null) return acc;
          if (diff < 0) acc.overdue += 1;
          else if (diff === 0) acc.today += 1;
          else if (diff <= 7) acc.week += 1;
          return acc;
        },
        { overdue: 0, today: 0, week: 0 }
      )
    : null;

  const activeRules = rules.filter((r) => r.active);

  const TABS = [
    { id: "list", label: "Pendentes" },
    { id: "completed", label: "Concluídos" },
    { id: "history", label: "Campanhas" },
    ...(isAdmin ? [{ id: "rules_history", label: "Regras" }] : []),
  ];

  const selectTab = (id) => {
    setActiveTab(id);
    setCurrentPage(1);
    if (id === "rules_history") {
      setRulesHistoryPage(1);
      loadRules();
    }
  };

  const filterControlClass =
    "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10";

  const renderFollowUpRow = (followUp) => {
    const due = getDueInfo(followUp);
    const tone = DUE_TONES[due.tone];
    const contact = CONTACT_TYPES[followUp.contact_type];
    const ContactIcon = contact?.icon;
    const reason = REASON_BADGES[followUp.contact_reason];
    const status = FOLLOWUP_STATUS[followUp.status];
    const name = followUp.lead_id
      ? (followUp.lead_name || getLeadName(followUp.lead_id) || "—")
      : (followUp.patient_name || getPatientName(followUp.patient_id) || "—");

    return (
      <li key={followUp.id} className="flex items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-0 md:gap-4 md:px-4">
        <div className={`flex w-12 flex-shrink-0 flex-col items-center rounded-lg py-1.5 ring-1 ring-inset ${tone.block}`}>
          <span className="text-lg font-semibold leading-none tabular-nums">{due.day}</span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide">{due.month}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {followUp.lead_id ? "Lead" : "Paciente"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={`font-medium ${tone.label}`}>{due.label}</span>
            {contact && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <ContactIcon className="h-3.5 w-3.5" />
                {contact.label}
              </span>
            )}
            {reason && <RingBadge className={reason.className}>{reason.label}</RingBadge>}
            {activeTab === "completed" && status && <RingBadge className={status.className}>{status.label}</RingBadge>}
          </div>
          {followUp.notes && (
            <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500" title={followUp.notes}>
              {followUp.notes}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-0.5">
          {followUp.status === "pending" && (
            <button
              type="button"
              onClick={() => handleComplete(followUp.id)}
              title="Marcar como concluído"
              aria-label="Marcar como concluído"
              className="mr-1 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <Check className="h-4 w-4" />
              <span className="hidden sm:inline">Concluir</span>
            </button>
          )}
          <IconAction onClick={() => handleEdit(followUp)} title="Editar">
            <Pencil className="h-4 w-4" />
          </IconAction>
          <IconAction
            onClick={() => {
              setFollowUpToDelete(followUp);
              setDeleteDialog(true);
            }}
            title="Excluir"
            tone="danger"
          >
            <Trash2 className="h-4 w-4" />
          </IconAction>
        </div>
      </li>
    );
  };

  return (
    <Layout>
      <div>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl text-slate-900 md:text-3xl">Follow-up</h1>
            <p className="mt-1 text-sm text-slate-500">Retornos, lembretes e campanhas</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button onClick={handleOpenNewRule} variant="outline" className="gap-2 border-slate-200" title="Nova regra automática">
                <Zap className="h-4 w-4" />
                <span className="hidden sm:inline">Nova regra</span>
              </Button>
            )}
            <Button onClick={() => setShowCampaignDialog(true)} variant="outline" className="gap-2 border-slate-200" title="Campanha em massa">
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Campanha</span>
            </Button>
            <Button onClick={handleOpenNewFollowUp} className="ml-auto gap-2 sm:ml-0">
              <Plus className="h-4 w-4" />
              Novo follow-up
            </Button>
          </div>
        </div>

        {/* Abas */}
        <div className="-mx-4 mb-5 overflow-x-auto border-b border-slate-200 px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-1">
            {TABS.map(({ id, label }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                    active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Resumo de pendentes */}
        {activeTab === "list" && !loadingFollowUps && pendingSummary && (
          <div className="mb-4 grid grid-cols-3 gap-2 md:gap-3">
            {[
              { key: "overdue", label: "Atrasados", icon: AlertTriangle, tone: "text-red-600 bg-red-50" },
              { key: "today", label: "Para hoje", icon: CalendarClock, tone: "text-amber-600 bg-amber-50" },
              { key: "week", label: "Próximos 7 dias", icon: CalendarDays, tone: "text-blue-600 bg-blue-50" },
            ].map(({ key, label, icon: Icon, tone }) => (
              <div key={key} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <span className={`hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg sm:flex ${tone}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-xl font-semibold tabular-nums text-slate-900">{pendingSummary[key]}</p>
                  <p className="text-xs leading-tight text-slate-500">{label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Regras automáticas ativas (admin, aba Pendentes) */}
        {isAdmin && activeRules.length > 0 && activeTab === "list" && (
          <div className="mb-4 hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-900">Regras automáticas ativas</h2>
                <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium tabular-nums text-slate-500">{activeRules.length}</span>
              </div>
              <button type="button" onClick={() => selectTab("rules_history")} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                Ver todas
              </button>
            </div>
            <ul className="-mt-px grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {activeRules.map((rule) => {
                const reason = REASON_BADGES[rule.type] || REASON_BADGES.informativo;
                return (
                  <li key={rule.id} className="flex items-start gap-2 border-t border-slate-100 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900" title={rule.name}>{rule.name}</p>
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <RingBadge className={reason.className}>{reason.label}</RingBadge>
                        <span className="truncate text-xs text-slate-500">
                          {getTriggerLabel(rule.trigger)} · {formatRuleDaysAfter(rule.days_after)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center">
                      <IconAction onClick={() => handleEditRule(rule)} title="Editar regra">
                        <Pencil className="h-4 w-4" />
                      </IconAction>
                      <IconAction onClick={() => toggleRuleActive(rule.id)} title="Desativar regra">
                        <Power className="h-4 w-4" />
                      </IconAction>
                      <IconAction onClick={() => handleDeleteRule(rule)} title="Excluir regra" tone="danger">
                        <Trash2 className="h-4 w-4" />
                      </IconAction>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Lista de Follow-ups (Pendentes e Concluídos) */}
        {(activeTab === "list" || activeTab === "completed") && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {activeTab === "list" && !loadingFollowUps && (
              <div className="border-b border-slate-200 p-3 md:p-4">
                <button
                  type="button"
                  onClick={() => setShowMobileFilters((v) => !v)}
                  className="flex w-full items-center justify-between text-sm font-medium text-slate-700 md:hidden"
                  aria-expanded={showMobileFilters}
                >
                  <span>
                    Filtros
                    {hasActivePendingFilters && (
                      <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 text-[11px] text-blue-700">ativos</span>
                    )}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showMobileFilters ? "rotate-180" : ""}`} />
                </button>
                <div className={`${showMobileFilters ? "mt-3 grid" : "hidden"} grid-cols-2 gap-2 md:mt-0 md:grid md:grid-cols-[repeat(4,minmax(0,1fr))_auto] md:items-end`}>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">De</span>
                    <input
                      type="date"
                      value={pendingFilters.dateFrom}
                      onChange={(e) => setPendingFilters({ ...pendingFilters, dateFrom: e.target.value })}
                      className={filterControlClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Até</span>
                    <input
                      type="date"
                      value={pendingFilters.dateTo}
                      min={pendingFilters.dateFrom || undefined}
                      onChange={(e) => setPendingFilters({ ...pendingFilters, dateTo: e.target.value })}
                      className={filterControlClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Contato</span>
                    <select
                      className={filterControlClass}
                      value={pendingFilters.contact_type}
                      onChange={(e) => setPendingFilters({ ...pendingFilters, contact_type: e.target.value })}
                    >
                      <option value="">Todos</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="phone">Telefone</option>
                      <option value="email">E-mail</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-500">Motivo</span>
                    <select
                      className={filterControlClass}
                      value={pendingFilters.contact_reason}
                      onChange={(e) => setPendingFilters({ ...pendingFilters, contact_reason: e.target.value })}
                    >
                      <option value="">Todos</option>
                      <option value="comercial">Comercial</option>
                      <option value="informativo">Informativo</option>
                    </select>
                  </label>
                  {hasActivePendingFilters && (
                    <button
                      type="button"
                      onClick={clearPendingFilters}
                      className="col-span-2 flex h-9 items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:col-span-1"
                    >
                      <X className="h-3.5 w-3.5" />
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            )}

            {loadingFollowUps ? (
              <ul aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
                    <div className="h-12 w-12 animate-pulse rounded-lg bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : filteredList.length === 0 ? (
              <EmptyState
                icon={activeTab === "list" ? CheckCircle : History}
                title={
                  activeTab === "list"
                    ? hasActivePendingFilters
                      ? "Nenhum follow-up pendente com esses filtros"
                      : "Tudo em dia!"
                    : "Nenhum follow-up concluído"
                }
                text={activeTab === "list" && !hasActivePendingFilters ? "Não há follow-ups pendentes no momento." : undefined}
              />
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs text-slate-500 md:px-4">
                  <span>
                    {filteredList.length} {filteredList.length === 1 ? "follow-up" : "follow-ups"}
                    {activeTab === "list" ? (filteredList.length === 1 ? " pendente" : " pendentes") : (filteredList.length === 1 ? " concluído" : " concluídos")}
                  </span>
                  <span className="hidden sm:inline">Ordenados pela data de contato</span>
                </div>
                <ul>{currentFollowUps.map(renderFollowUpRow)}</ul>
              </>
            )}
            <Pager page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
          </div>
        )}

        {/* Histórico de Campanhas */}
        {activeTab === "history" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {campaigns.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="Nenhuma campanha enviada ainda"
                text="Use o botão Campanha para enviar uma mensagem em massa para pacientes ou leads."
              />
            ) : (
              <ul>
                {currentCampaigns.map((campaign) => {
                  const done = campaign.status === "completed";
                  const hasServices = campaign.service_id || (campaign.service_ids && campaign.service_ids.length > 0);
                  const hasCities = campaign.cities && campaign.cities.length > 0;
                  return (
                    <li key={campaign.id} className="border-b border-slate-100 px-3 py-4 last:border-0 md:px-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{campaign.title || "Campanha sem título"}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Enviada em {new Date(campaign.created_at).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <RingBadge
                          className={done ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-amber-50 text-amber-700 ring-amber-600/20"}
                        >
                          {done ? "Concluída" : "Processando"}
                        </RingBadge>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <dt className="text-slate-500">Público</dt>
                          <dd className="mt-0.5 font-medium text-slate-800">
                            {campaign.target_type === "patients" ? "Pacientes" : "Leads"}
                          </dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <dt className="text-slate-500">Destinatários</dt>
                          <dd className="mt-0.5 font-medium tabular-nums text-slate-800">{campaign.total_targets}</dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <dt className="text-slate-500">Enviadas</dt>
                          <dd className="mt-0.5 font-medium tabular-nums text-emerald-600">{campaign.stats?.delivered || 0}</dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2">
                          <dt className="text-slate-500">Falhas</dt>
                          <dd className={`mt-0.5 font-medium tabular-nums ${campaign.stats?.failed ? "text-red-600" : "text-slate-800"}`}>
                            {campaign.stats?.failed || 0}
                          </dd>
                        </div>
                      </dl>

                      {(hasServices || hasCities) && (
                        <p className="mt-2 text-xs text-slate-500">
                          {hasServices && "Filtrado por serviços agendados"}
                          {hasServices && hasCities && " · "}
                          {hasCities && `Cidades: ${campaign.cities.join(", ")}`}
                        </p>
                      )}

                      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                        <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700" title={campaign.message}>
                          {campaign.message}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Pager page={currentPage} totalPages={totalCampaignPages} onChange={setCurrentPage} />
          </div>
        )}

        {/* Histórico de regras automáticas (admin) */}
        {isAdmin && activeTab === "rules_history" && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {sortedRulesHistory.length === 0 ? (
              <EmptyState
                icon={Zap}
                title="Nenhuma regra cadastrada"
                text="Regras enviam mensagens automáticas após eventos como novo lead, agendamento ou aniversário."
                action={
                  <Button size="sm" onClick={handleOpenNewRule} className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Nova regra
                  </Button>
                }
              />
            ) : (
              <>
                <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 md:px-4">
                  {sortedRulesHistory.length} {sortedRulesHistory.length === 1 ? "regra" : "regras"} · ativas e inativas
                </div>
                <ul>
                  {pagedRulesHistory.map((rule) => {
                    const reason = REASON_BADGES[rule.type] || REASON_BADGES.informativo;
                    return (
                      <li key={rule.id} className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 last:border-0 sm:flex-row sm:items-center md:px-4">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <span
                            className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${rule.active ? "bg-emerald-500" : "bg-slate-300"}`}
                            title={rule.active ? "Ativa" : "Inativa"}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`truncate text-sm font-medium ${rule.active ? "text-slate-900" : "text-slate-500"}`}>
                                {rule.name || "Sem nome"}
                              </p>
                              <RingBadge className={reason.className}>{reason.label}</RingBadge>
                              {!rule.active && (
                                <RingBadge className="bg-slate-50 text-slate-500 ring-slate-500/20">Inativa</RingBadge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              <span className="font-medium text-slate-700">{getTriggerLabel(rule.trigger)}</span>
                              {" · "}
                              {formatRuleDaysAfter(rule.days_after)}
                              {rule.trigger === "service_maintenance" && rule.service_id && (
                                <> · Serviço: {getServiceName(rule.service_id)}</>
                              )}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              Criada em {rule.created_at ? new Date(rule.created_at).toLocaleString("pt-BR") : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1 pl-5 sm:pl-0">
                          <IconAction onClick={() => setViewingRule(rule)} title="Visualizar">
                            <Eye className="h-4 w-4" />
                          </IconAction>
                          <IconAction onClick={() => handleEditRule(rule)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </IconAction>
                          <button
                            type="button"
                            onClick={() => toggleRuleActive(rule.id)}
                            className={`ml-1 inline-flex w-[6.5rem] items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                              rule.active
                                ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            <Power className="h-3.5 w-3.5" />
                            {rule.active ? "Desativar" : "Ativar"}
                          </button>
                          <IconAction onClick={() => handleDeleteRule(rule)} title="Excluir" tone="danger">
                            <Trash2 className="h-4 w-4" />
                          </IconAction>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <Pager page={rulesHistoryPage} totalPages={totalRuleHistoryPages} onChange={setRulesHistoryPage} />
          </div>
        )}

        {/* Modal de Criar/Editar Follow-up */}
        <Dialog open={showDialog} onOpenChange={handleFollowUpDialogOpenChange}>
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

        {/* Visualizar regra (somente leitura) */}
        <Dialog open={!!viewingRule} onOpenChange={(open) => !open && setViewingRule(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da regra</DialogTitle>
            </DialogHeader>
            {viewingRule && (
              <div className="space-y-4 text-sm">
                <div>
                  <span className="text-gray-500 block text-xs uppercase tracking-wide">Nome</span>
                  <p className="font-semibold text-gray-900">{viewingRule.name || "—"}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-500 block text-xs uppercase tracking-wide">Tipo</span>
                    <p className="text-gray-900">{viewingRule.type === "comercial" ? "Comercial" : "Informativo"}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs uppercase tracking-wide">Status</span>
                    <p className="text-gray-900">{viewingRule.active !== false ? "Ativa" : "Inativa"}</p>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs uppercase tracking-wide">Disparar quando</span>
                  <p className="text-gray-900">{getTriggerLabel(viewingRule.trigger)}</p>
                </div>
                {viewingRule.trigger === "service_maintenance" && viewingRule.service_id && (
                  <div>
                    <span className="text-gray-500 block text-xs uppercase tracking-wide">Serviço</span>
                    <p className="text-gray-900">{getServiceName(viewingRule.service_id)}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 block text-xs uppercase tracking-wide">Aguardar</span>
                  <p className="text-gray-900">{formatRuleDaysAfter(viewingRule.days_after)}</p>
                </div>
                <div>
                  <span className="text-gray-500 block text-xs uppercase tracking-wide">Template da mensagem</span>
                  <p className="text-gray-900 whitespace-pre-wrap mt-1 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    {viewingRule.message_template || "—"}
                  </p>
                </div>
                {viewingRule.message_media_url && (
                  <div>
                    <span className="text-gray-500 block text-xs uppercase tracking-wide mb-2">Mídia</span>
                    {viewingRule.message_media_type === "image" ? (
                      <img
                        src={`${MEDIA_BASE}${viewingRule.message_media_url}`}
                        alt="Anexo da regra"
                        className="max-h-48 rounded-lg object-contain border"
                      />
                    ) : (
                      <video
                        src={`${MEDIA_BASE}${viewingRule.message_media_url}`}
                        controls
                        className="max-h-48 rounded-lg border"
                      />
                    )}
                  </div>
                )}
                <div>
                  <span className="text-gray-500 block text-xs uppercase tracking-wide">Criada em</span>
                  <p className="text-gray-900">
                    {viewingRule.created_at ? new Date(viewingRule.created_at).toLocaleString("pt-BR") : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setViewingRule(null)}>
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      const r = viewingRule;
                      setViewingRule(null);
                      handleEditRule(r);
                    }}
                  >
                    Editar regra
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Gerenciar Regras */}
        <Dialog open={showRuleDialog} onOpenChange={handleRuleDialogOpenChange}>
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
                    onChange={(e) => {
                      const trigger = e.target.value;
                      setRuleFormData({
                        ...ruleFormData,
                        trigger,
                        service_id: trigger === "service_maintenance" ? ruleFormData.service_id : "",
                        days_after:
                          !TRIGGERS_ALLOWING_DAYS_BEFORE.includes(trigger) && ruleFormData.days_after < 0
                            ? 0
                            : ruleFormData.days_after
                      });
                    }}
                  >
                    <option value="lead_created">Lead Criado</option>
                    <option value="appointment_created">Agendamento Criado</option>
                    <option value="appointment_completed">Consulta Concluída</option>
                    <option value="appointment_cancelled">Agendamento Cancelado</option>
                    <option value="patient_birthday">Pacientes Aniversariantes</option>
                    <option value="service_maintenance">Serviços</option>
                  </select>
                </div>
              </div>
              {TRIGGER_HELP[ruleFormData.trigger] && (
                <p className="text-xs text-gray-500 -mt-2">{TRIGGER_HELP[ruleFormData.trigger]}</p>
              )}
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
                  {TRIGGERS_ALLOWING_DAYS_BEFORE.includes(ruleFormData.trigger) && (
                    <>
                      <option value={-1}>1 dia antes</option>
                      <option value={-2}>2 dias antes</option>
                    </>
                  )}
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
