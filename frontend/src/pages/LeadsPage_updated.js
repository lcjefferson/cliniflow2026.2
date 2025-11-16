import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Edit, Trash2, Filter } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [formData, setFormData] = useState({ name: "", phone: "", email: "", source: "whatsapp", status: "new", notes: "" });

  useEffect(() => {
    loadLeads();
  }, [filterStatus]);

  const loadLeads = async () => {
    try {
      const params = filterStatus ? `?status=${filterStatus}` : "";
      const response = await api.get(`/leads${params}`);
      setLeads(response.data);
    } catch (error) {
      toast.error("Erro ao carregar leads");
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

  const handleDelete = async (id) => {
    try {
      await api.delete(`/leads/${id}`);
      toast.success("Lead removido!");
      loadLeads();
    } catch (error) {
      toast.error("Erro ao remover lead");
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

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900" data-testid="leads-page-title">Leads</h1>
          <div className="flex gap-4">
            <select 
              className="input-field w-48" 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="new">Novos</option>
              <option value="hot">Quentes</option>
              <option value="converted">Convertidos</option>
            </select>
            <Button onClick={() => setShowDialog(true)} className="btn-primary">
              <Plus className="w-5 h-5 mr-2" />
              Adicionar Lead
            </Button>
          </div>
        </div>

        <div className="grid gap-6">
          {leads.map((lead) => (
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
                  <button
                    onClick={() => handleEdit(lead)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(lead.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Lead" : "Adicionar Lead"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>Telefone</Label>
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
      </div>
    </Layout>
  );
}
