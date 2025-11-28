import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Edit, Trash2, Settings, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "../contexts/AuthContext";

export default function FollowUpPage() {
  const { user } = useAuth();
  const isAdmin = user?.role?.is_admin;
  
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
    days_after: 1,
    message_template: "",
    active: true
  });

  useEffect(() => {
    loadFollowUps();
    loadLeads();
    loadPatients();
    if (isAdmin) {
      loadRules();
    }
  }, [isAdmin]);

  const loadFollowUps = async () => {
    try {
      const response = await api.get("/followups");
      setFollowUps(response.data);
    } catch (error) {
      toast.error("Erro ao carregar follow-ups");
    }
  };

  const loadLeads = async () => {
    try {
      const response = await api.get("/leads");
      setLeads(response.data);
    } catch (error) {
      console.error("Erro ao carregar leads");
    }
  };

  const loadPatients = async () => {
    try {
      const response = await api.get("/patients");
      setPatients(response.data);
    } catch (error) {
      console.error("Erro ao carregar pacientes");
    }
  };

  const loadRules = async () => {
    try {
      const response = await api.get("/followup-rules");
      setRules(response.data);
    } catch (error) {
      console.error("Erro ao carregar regras:", error);
      toast.error("Erro ao carregar regras de follow-up");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/followups/${editingId}`, formData);
        toast.success("Follow-up atualizado!");
      } else {
        await api.post("/followups", formData);
        toast.success("Follow-up criado!");
      }
      setShowDialog(false);
      setEditingId(null);
      setFormData({
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
      await api.delete(`/followups/${followUpToDelete.id}`);
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
      await api.put(`/followups/${id}`, { status: "completed" });
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
        await api.put(`/followup-rules/${editingRuleId}`, ruleFormData);
        toast.success("Regra atualizada!");
      } else {
        await api.post("/followup-rules", ruleFormData);
        toast.success("Regra criada!");
      }
      setShowRuleDialog(false);
      setEditingRuleId(null);
      setRuleFormData({
        name: "",
        type: "comercial",
        trigger: "lead_created",
        days_after: 1,
        message_template: "",
        active: true
      });
      loadRules();
    } catch (error) {
      toast.error(editingRuleId ? "Erro ao atualizar regra" : "Erro ao criar regra");
    }
  };

  const handleEditRule = (rule) => {
    setEditingRuleId(rule.id);
    setRuleFormData(rule);
    setShowRuleDialog(true);
  };

  const handleDeleteRule = (rule) => {
    setRuleToDelete(rule);
    setDeleteRuleDialog(true);
  };

  const confirmDeleteRule = async () => {
    if (!ruleToDelete) return;
    
    try {
      await api.delete(`/followup-rules/${ruleToDelete.id}`);
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
      await api.patch(`/followup-rules/${id}/toggle`);
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

  // Paginação
  const currentFollowUps = followUps.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(followUps.length / itemsPerPage);

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Follow-up</h1>
          <div className="flex gap-3">
            {isAdmin && (
              <Button onClick={() => setShowRuleDialog(true)} variant="outline" className="btn-secondary">
                <Settings className="w-5 h-5 mr-2" />
                Gerenciar Regras
              </Button>
            )}
            <Button onClick={() => setShowDialog(true)} className="btn-primary">
              <Plus className="w-5 h-5 mr-2" />
              Novo Follow-up
            </Button>
          </div>
        </div>

        {/* Regras Ativas (apenas para admin) */}
        {isAdmin && rules.length > 0 && (
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

        {/* Lista de Follow-ups */}
        <div className="grid gap-6">
          {currentFollowUps.map((followUp) => (
            <div key={followUp.id} className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">
                      {followUp.lead_id ? getLeadName(followUp.lead_id) : getPatientName(followUp.patient_id)}
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
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(followUp)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {followUps.length === 0 && (
            <div className="text-center py-12 text-gray-500 bg-white rounded-2xl shadow-lg">
              <p>Nenhum follow-up agendado</p>
            </div>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-8">
            <Button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              variant="outline"
              className="btn-secondary"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-gray-700">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              variant="outline"
              className="btn-secondary"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
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
                <Label>Lead (opcional)</Label>
                <select
                  className="input-field"
                  value={formData.lead_id}
                  onChange={(e) => setFormData({...formData, lead_id: e.target.value, patient_id: ""})}
                >
                  <option value="">Selecione um lead</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Paciente (opcional)</Label>
                <select
                  className="input-field"
                  value={formData.patient_id}
                  onChange={(e) => setFormData({...formData, patient_id: e.target.value, lead_id: ""})}
                >
                  <option value="">Selecione um paciente</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
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
                    onChange={(e) => setRuleFormData({...ruleFormData, trigger: e.target.value})}
                  >
                    <option value="lead_created">Lead Criado</option>
                    <option value="appointment_created">Agendamento Criado</option>
                    <option value="appointment_completed">Consulta Concluída</option>
                    <option value="patient_birthday">Pacientes Aniversariantes</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Aguardar *</Label>
                <select
                  className="input-field"
                  value={ruleFormData.days_after}
                  onChange={(e) => setRuleFormData({...ruleFormData, days_after: parseInt(e.target.value)})}
                >
                  <option value={0}>No dia</option>
                  <option value={1}>1 dia depois</option>
                  <option value={2}>2 dias depois</option>
                  <option value={-1}>1 dia antes</option>
                  <option value={-2}>2 dias antes</option>
                </select>
              </div>
              <div>
                <Label>Template da Mensagem *</Label>
                <textarea
                  className="input-field min-h-[120px]"
                  value={ruleFormData.message_template}
                  onChange={(e) => setRuleFormData({...ruleFormData, message_template: e.target.value})}
                  placeholder="Use {nome}, {horario}, {data} como variáveis"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Variáveis disponíveis: {"{nome}"}, {"{horario}"}, {"{data}"}
                </p>
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingRuleId ? "Salvar Alterações" : "Criar Regra"}
              </Button>
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
