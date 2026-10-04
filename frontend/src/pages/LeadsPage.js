import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import * as XLSX from "xlsx";
import {
  Plus, Pencil, Trash2, UserPlus, ChevronLeft, ChevronRight, X, Download, Search, Eraser, Users, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ContactAvatar from "../components/ContactAvatar";
import { CHANNEL_META, formatPhone } from "../lib/contact";

const LEAD_STATUS = {
  new: { label: "Novo", plural: "Novos", className: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  contacted: { label: "Contatado", plural: "Contatados", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  hot: { label: "Quente", plural: "Quentes", className: "bg-red-50 text-red-700 ring-red-600/20" },
  cold: { label: "Frio", plural: "Frios", className: "bg-slate-50 text-slate-600 ring-slate-500/20" },
  converted: { label: "Convertido", plural: "Convertidos", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
};

const STATUS_FILTERS = ["new", "contacted", "hot", "cold"];

const EMPTY_FORM = { name: "", phone: "", email: "", source: "whatsapp", status: "new", notes: "" };

const SEARCH_DEBOUNCE_MS = 400;

const formatDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "";
};

function StatusBadge({ status }) {
  const meta = LEAD_STATUS[status];
  return (
    <span className={`status-badge whitespace-nowrap ${meta ? meta.className : "bg-slate-50 text-slate-600 ring-slate-500/20"}`}>
      {meta ? meta.label : status || "—"}
    </span>
  );
}

function SourceLabel({ source }) {
  const meta = CHANNEL_META[source];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-600">
      <span className={`h-2 w-2 rounded-full ${meta ? meta.dot : "bg-slate-300"}`} />
      {meta ? meta.label : source || "—"}
    </span>
  );
}

function IconAction({ onClick, title, tone = "default", children }) {
  const tones = {
    default: "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
    success: "text-slate-400 hover:bg-emerald-50 hover:text-emerald-600",
    danger: "text-slate-400 hover:bg-red-50 hover:text-red-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-lg p-2 transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [convertingLead, setConvertingLead] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const pageSize = 50;
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [convertData, setConvertData] = useState({
    birthdate: "",
    address: ""
  });
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term === appliedSearch) return;
    const timer = setTimeout(() => setAppliedSearch(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm, appliedSearch]);

  useEffect(() => {
    loadLeads(1);
  }, [filterStatus, filterSource, appliedSearch]);

  const buildParams = (extra) => {
    const params = { ...extra };
    if (filterStatus) params.status = filterStatus;
    if (filterSource) params.source = filterSource;
    if (appliedSearch) params.search = appliedSearch;
    return params;
  };

  const loadLeads = async (page = currentPage) => {
    setLoadingLeads(true);
    try {
      const response = await api.get("/leads", { params: buildParams({ page, page_size: pageSize }) });
      const data = response.data?.items ?? (Array.isArray(response.data) ? response.data : []);
      const total = response.data?.total ?? data.length;
      setLeads(data);
      setTotalLeads(total);
      setCurrentPage(page);
    } catch (error) {
      toast.error("Erro ao carregar leads");
    } finally {
      setLoadingLeads(false);
      setLoaded(true);
    }
  };

  const exportToExcel = async () => {
    try {
      const response = await api.get("/leads", { params: buildParams({ page: 1, page_size: 5000 }) });
      const data = response.data?.items ?? (Array.isArray(response.data) ? response.data : []);
      if (!data.length) {
        toast.error("Nenhum lead para exportar");
        return;
      }
      const rows = data.map((l) => ({
        Nome: l.name || "",
        Telefone: l.phone || "",
        Email: l.email || "",
        Origem: l.source || "",
        Status: l.status || "",
        Observações: l.notes || "",
        Data: l.created_at ? new Date(l.created_at).toLocaleString("pt-BR") : "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      XLSX.writeFile(wb, `leads_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Planilha exportada!");
    } catch (e) {
      toast.error("Erro ao exportar");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/leads/${editingId}`, formData);
        toast.success("Lead atualizado!");
      } else {
        await api.post("/leads", formData);
        toast.success("Lead cadastrado!");
      }
      
      setShowDialog(false);
      setEditingId(null);
      setFormData(EMPTY_FORM);
      loadLeads();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar lead" : "Erro ao cadastrar lead");
    }
  };

  const handleEdit = (lead) => {
    setEditingId(lead.id);
    setFormData({
      name: lead.name,
      phone: lead.phone,
      email: lead.email || "",
      source: lead.source,
      status: lead.status,
      notes: lead.notes || ""
    });
    setShowDialog(true);
  };

  const handleDelete = (lead) => {
    setLeadToDelete(lead);
    setDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!leadToDelete) return;
    
    try {
      await api.delete(`/leads/${leadToDelete.id}`);
      toast.success("Lead removido!");
      setDeleteDialog(false);
      setLeadToDelete(null);
      loadLeads();
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast.error("Erro ao remover lead: " + (error.response?.data?.detail || error.message));
    }
  };

  const handleConvertToPatient = (lead) => {
    setConvertingLead(lead);
    setConvertData({
      birthdate: "",
      address: ""
    });
    setShowConvertDialog(true);
  };

  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/leads/${convertingLead.id}/convert-to-patient`, null, {
        params: { birthdate: convertData.birthdate, address: convertData.address || "" },
      });
      toast.success("Lead convertido em paciente com sucesso!");
      setShowConvertDialog(false);
      setConvertingLead(null);
      loadLeads();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erro ao converter lead");
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const openNewLead = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  };

  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));
  const hasFilters = Boolean(appliedSearch || filterStatus || filterSource);
  const rangeStart = totalLeads === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalLeads);

  const clearFilters = () => {
    setSearchTerm("");
    setAppliedSearch("");
    setFilterStatus("");
    setFilterSource("");
  };

  const paginate = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > totalPages) return;
    loadLeads(pageNumber);
  };

  const handleCleanupDuplicates = async () => {
    if (!window.confirm("Deseja remover leads que já são pacientes cadastrados?")) return;
    
    try {
      const response = await api.post("/leads/cleanup-duplicates");
      toast.success(response.data.message);
      loadLeads();
    } catch (error) {
      toast.error("Erro ao limpar leads duplicados");
    }
  };

  const renderActions = (lead) => (
    <div className="flex items-center justify-end gap-0.5">
      {lead.status !== "converted" && (
        <IconAction onClick={() => handleConvertToPatient(lead)} title="Converter em paciente" tone="success">
          <UserPlus className="h-4 w-4" />
        </IconAction>
      )}
      <IconAction onClick={() => handleEdit(lead)} title="Editar lead">
        <Pencil className="h-4 w-4" />
      </IconAction>
      <IconAction onClick={() => handleDelete(lead)} title="Excluir lead" tone="danger">
        <Trash2 className="h-4 w-4" />
      </IconAction>
    </div>
  );

  const showSkeleton = loadingLeads && (!loaded || leads.length === 0);

  return (
    <Layout>
      <div>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl text-slate-900 md:text-3xl" data-testid="leads-page-title">Leads</h1>
            <p className="mt-1 text-sm text-slate-500">
              {loaded
                ? `${totalLeads.toLocaleString("pt-BR")} ${totalLeads === 1 ? "lead" : "leads"}${hasFilters ? (totalLeads === 1 ? " encontrado" : " encontrados") : ""}`
                : "Carregando..."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportToExcel} className="gap-2 border-slate-200" title="Exportar Excel">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
            <Button variant="outline" onClick={handleCleanupDuplicates} className="gap-2 border-slate-200" title="Remover leads que já são pacientes">
              <Eraser className="h-4 w-4" />
              <span className="hidden sm:inline">Limpar duplicados</span>
            </Button>
            <Button onClick={openNewLead} className="ml-auto gap-2 sm:ml-0">
              <Plus className="h-4 w-4" />
              Novo lead
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Busca e filtros */}
          <div className="space-y-3 border-b border-slate-200 p-3 md:p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, telefone ou e-mail"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setAppliedSearch(searchTerm.trim());
                    }
                  }}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => { setSearchTerm(""); setAppliedSearch(""); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                    aria-label="Limpar busca"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 sm:w-48"
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                aria-label="Origem"
              >
                <option value="">Todas as origens</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="messenger">Messenger</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {["", ...STATUS_FILTERS].map((status) => {
                  const active = filterStatus === status;
                  return (
                    <button
                      key={status || "all"}
                      type="button"
                      onClick={() => setFilterStatus(status)}
                      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {status ? LEAD_STATUS[status].plural : "Todos"}
                    </button>
                  );
                })}
              </div>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className={`relative transition-opacity ${loadingLeads && !showSkeleton ? "opacity-60" : ""}`}>
            {showSkeleton ? (
              <ul aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <li key={i} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-2.5 w-1/5 animate-pulse rounded bg-slate-100" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Users className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  {hasFilters ? "Nenhum lead encontrado" : "Nenhum lead cadastrado"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {hasFilters ? "Ajuste a busca ou limpe os filtros." : "Os novos contatos aparecem aqui."}
                </p>
                {hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 border-slate-200">
                    Limpar filtros
                  </Button>
                ) : (
                  <Button size="sm" onClick={openNewLead} className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Novo lead
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Tabela (desktop) */}
                <table className="hidden w-full text-sm md:table">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-medium text-slate-500">
                      <th className="w-full px-4 py-2.5 font-medium">Lead</th>
                      <th className="px-4 py-2.5 font-medium">Telefone</th>
                      <th className="px-4 py-2.5 font-medium">Origem</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="hidden px-4 py-2.5 font-medium xl:table-cell">Cadastro</th>
                      <th className="px-4 py-2.5"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="w-full max-w-0 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ContactAvatar size="sm" name={lead.name} seed={lead.id} />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{lead.name}</p>
                              {(lead.email || lead.notes) && (
                                <p className="truncate text-xs text-slate-500" title={lead.notes || undefined}>
                                  {lead.email || lead.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{formatPhone(lead.phone)}</td>
                        <td className="px-4 py-3"><SourceLabel source={lead.source} /></td>
                        <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 xl:table-cell">{formatDate(lead.created_at)}</td>
                        <td className="w-px whitespace-nowrap px-2 py-3">{renderActions(lead)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Cards (mobile) */}
                <ul className="md:hidden">
                  {leads.map((lead) => (
                    <li key={lead.id} className="border-b border-slate-100 px-3 py-3 last:border-0">
                      <div className="flex items-start gap-3">
                        <ContactAvatar size="sm" name={lead.name} seed={lead.id} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-slate-900">{lead.name}</p>
                            <StatusBadge status={lead.status} />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Phone className="h-3 w-3" />
                              {formatPhone(lead.phone)}
                            </span>
                            <SourceLabel source={lead.source} />
                          </div>
                          {lead.email && <p className="mt-1 truncate text-xs text-slate-500">{lead.email}</p>}
                          {lead.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{lead.notes}</p>}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between pl-12">
                        <span className="text-[11px] tabular-nums text-slate-400">{formatDate(lead.created_at)}</span>
                        {renderActions(lead)}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Paginação */}
          {loaded && totalLeads > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2.5 text-xs text-slate-500 md:px-4">
              <span className="tabular-nums">
                {rangeStart}–{rangeEnd} de {totalLeads.toLocaleString("pt-BR")}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => paginate(currentPage - 1)}
                    disabled={currentPage === 1 || loadingLeads}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-1 tabular-nums">Página {currentPage} de {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => paginate(currentPage + 1)}
                    disabled={currentPage === totalPages || loadingLeads}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal de Editar/Adicionar Lead */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar lead" : "Novo lead"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Atualize os dados do contato." : "Cadastre um novo contato interessado."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lead-name">Nome *</Label>
                <Input id="lead-name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">Telefone *</Label>
                <Input id="lead-phone" type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">E-mail</Label>
                <Input id="lead-email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-source">Origem</Label>
                <select
                  id="lead-source"
                  className="input-field"
                  value={formData.source}
                  onChange={(e) => setFormData({...formData, source: e.target.value})}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="messenger">Messenger</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-status">Status</Label>
                <select
                  id="lead-status"
                  className="input-field"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                >
                  {Object.entries(LEAD_STATUS).map(([value, { label }]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lead-notes">Observações</Label>
                <Textarea id="lead-notes" rows={3} value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
              <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
                <Button type="submit">{editingId ? "Salvar alterações" : "Cadastrar lead"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal de Converter Lead em Paciente */}
        <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Converter em paciente</DialogTitle>
              <DialogDescription>Complete os dados para criar o cadastro do paciente.</DialogDescription>
            </DialogHeader>
            {convertingLead && (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <ContactAvatar size="sm" name={convertingLead.name} seed={convertingLead.id} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{convertingLead.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[formatPhone(convertingLead.phone), convertingLead.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            )}
            <form onSubmit={handleConvertSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="convert-birthdate">Data de nascimento *</Label>
                <Input 
                  id="convert-birthdate"
                  type="date" 
                  value={convertData.birthdate} 
                  onChange={(e) => setConvertData({...convertData, birthdate: e.target.value})} 
                  required 
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="convert-address">Endereço (opcional)</Label>
                <Input 
                  id="convert-address"
                  value={convertData.address} 
                  onChange={(e) => setConvertData({...convertData, address: e.target.value})} 
                  placeholder="Rua, número, cidade, estado"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowConvertDialog(false)}>Cancelar</Button>
                <Button type="submit" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <UserPlus className="h-4 w-4" />
                  Converter
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Confirmação de exclusão */}
        <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Excluir lead</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir <strong className="text-slate-900">{leadToDelete?.name}</strong>? Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialog(false);
                  setLeadToDelete(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmDelete}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Excluir lead
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
