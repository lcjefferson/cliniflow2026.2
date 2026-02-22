import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import * as XLSX from "xlsx";
import { Plus, Edit, Trash2, Filter, UserPlus, ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [convertingLead, setConvertingLead] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLeads, setTotalLeads] = useState(0);
  const pageSize = 50;
  const [formData, setFormData] = useState({ 
    name: "", 
    phone: "", 
    email: "", 
    source: "whatsapp", 
    status: "new", 
    notes: "" 
  });
  const [convertData, setConvertData] = useState({
    birthdate: "",
    address: ""
  });
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [loadingLeads, setLoadingLeads] = useState(false);

  useEffect(() => {
    loadLeads(1);
  }, [filterStatus, filterSource]);

  const loadLeads = async (page = currentPage) => {
    setLoadingLeads(true);
    try {
      const params = { page, page_size: pageSize };
      if (filterStatus) params.status = filterStatus;
      if (filterSource) params.source = filterSource;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const response = await api.get("/leads", { params });
      const data = response.data?.items ?? (Array.isArray(response.data) ? response.data : []);
      const total = response.data?.total ?? data.length;
      setLeads(data);
      setTotalLeads(total);
      setCurrentPage(page);
    } catch (error) {
      toast.error("Erro ao carregar leads");
    } finally {
      setLoadingLeads(false);
    }
  };

  const exportToExcel = async () => {
    try {
      const params = { page: 1, page_size: 5000 };
      if (filterStatus) params.status = filterStatus;
      if (filterSource) params.source = filterSource;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const response = await api.get("/leads", { params });
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
      setFormData({ name: "", phone: "", email: "", source: "whatsapp", status: "new", notes: "" });
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

  const handleDelete = async (lead) => {
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
      await api.post(`/leads/${convertingLead.id}/convert-to-patient?birthdate=${convertData.birthdate}&address=${convertData.address || ""}`);
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
    setFormData({ name: "", phone: "", email: "", source: "whatsapp", status: "new", notes: "" });
  };

  const getStatusBadge = (status) => {
    const styles = {
      new: "bg-blue-100 text-blue-700",
      contacted: "bg-yellow-100 text-yellow-700",
      hot: "bg-red-100 text-red-700",
      cold: "bg-gray-100 text-gray-700",
      converted: "bg-green-100 text-green-700"
    };
    const labels = {
      new: "Novo",
      contacted: "Contatado",
      hot: "Quente",
      cold: "Frio",
      converted: "Convertido"
    };
    return <span className={`status-badge ${styles[status]}`}>{labels[status]}</span>;
  };

  // Busca e filtros já aplicados no servidor; lista atual é a página atual
  const currentLeads = leads;
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));

  const onSearch = () => loadLeads(1);

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

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900" data-testid="leads-page-title">Leads</h1>
          <div className="flex gap-3">
            <Button onClick={exportToExcel} variant="outline" className="btn-secondary">
              <Download className="w-5 h-5 mr-2" />
              Exportar Excel
            </Button>
            <Button onClick={handleCleanupDuplicates} variant="outline" className="btn-secondary">
              <Trash2 className="w-5 h-5 mr-2" />
              Limpar Duplicados
            </Button>
            <Button onClick={() => setShowDialog(true)} className="btn-primary">
              <Plus className="w-5 h-5 mr-2" />
              Adicionar Lead
            </Button>
          </div>
        </div>

        {/* Barra de Pesquisa e Filtros */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <Label className="text-sm font-semibold mb-2 block">Pesquisar</Label>
              <Input
                placeholder="Nome, telefone ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onSearch())}
                className="w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold mb-2 block">Status</Label>
              <select 
                className="input-field" 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="new">Novos</option>
                <option value="contacted">Contatados</option>
                <option value="hot">Quentes</option>
                <option value="cold">Frios</option>
              </select>
            </div>
            <div>
              <Label className="text-sm font-semibold mb-2 block">Origem</Label>
              <select 
                className="input-field" 
                value={filterSource} 
                onChange={(e) => setFilterSource(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
                <option value="messenger">Messenger</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={onSearch} variant="secondary" className="btn-secondary text-sm">
              Buscar
            </Button>
            {(searchTerm || filterStatus || filterSource) && (
              <>
                <Button
                  onClick={() => {
                    setSearchTerm("");
                    setFilterStatus("");
                    setFilterSource("");
                  }}
                  variant="outline"
                  className="btn-secondary text-sm"
                >
                  <X className="w-4 h-4 mr-2" />
                  Limpar Filtros
                </Button>
                <span className="text-sm text-gray-600">
                  {totalLeads} resultado(s)
                </span>
              </>
            )}
          </div>
        </div>

        {loadingLeads ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : (
        <>
        <div className="grid gap-6">
          {currentLeads.map((lead) => (
            <div key={lead.id} className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{lead.name}</h3>
                    {getStatusBadge(lead.status)}
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-600">{lead.phone}</p>
                    {lead.email && <p className="text-gray-600">{lead.email}</p>}
                    <p className="text-sm text-gray-500">Origem: {lead.source}</p>
                    {lead.notes && <p className="text-gray-600 mt-2">{lead.notes}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {lead.status !== "converted" && (
                    <button
                      onClick={() => handleConvertToPatient(lead)}
                      className="text-green-500 hover:text-green-700 p-2"
                      title="Converter em Paciente"
                    >
                      <UserPlus className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(lead)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(lead)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-8">
            <Button
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
              variant="outline"
              className="btn-secondary"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-gray-700">
              Página {currentPage} de {totalPages} ({totalLeads} lead{totalLeads !== 1 ? "s" : ""})
            </span>
            <Button
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages}
              variant="outline"
              className="btn-secondary"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        )}
        </>
        )}

        {/* Modal de Editar/Adicionar Lead */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Lead" : "Adicionar Lead"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>Telefone *</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div>
                <Label>Origem</Label>
                <select
                  className="input-field"
                  value={formData.source}
                  onChange={(e) => setFormData({...formData, source: e.target.value})}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="messenger">Messenger</option>
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select
                  className="input-field"
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                >
                  <option value="new">Novo</option>
                  <option value="contacted">Contatado</option>
                  <option value="hot">Quente</option>
                  <option value="cold">Frio</option>
                  <option value="converted">Convertido</option>
                </select>
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal de Converter Lead em Paciente */}
        <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Converter Lead em Paciente</DialogTitle>
            </DialogHeader>
            {convertingLead && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="font-semibold">{convertingLead.name}</p>
                <p className="text-sm text-gray-600">{convertingLead.phone}</p>
                <p className="text-sm text-gray-600">{convertingLead.email}</p>
              </div>
            )}
            <form onSubmit={handleConvertSubmit} className="space-y-4">
              <div>
                <Label>Data de Nascimento *</Label>
                <Input 
                  type="date" 
                  value={convertData.birthdate} 
                  onChange={(e) => setConvertData({...convertData, birthdate: e.target.value})} 
                  required 
                />
              </div>
              <div>
                <Label>Endereço (opcional)</Label>
                <Input 
                  value={convertData.address} 
                  onChange={(e) => setConvertData({...convertData, address: e.target.value})} 
                  placeholder="Rua, Número, Cidade, Estado"
                />
              </div>
              <Button type="submit" className="w-full btn-primary">
                Converter em Paciente
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-700">
                Tem certeza que deseja excluir o lead <strong>{leadToDelete?.name}</strong>?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
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
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Excluir Lead
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
