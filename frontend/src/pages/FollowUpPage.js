import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function FollowUpPage() {
  const [followups, setFollowups] = useState([]);
  const [leads, setLeads] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ lead_id: "", assigned_to: "", scheduled_date: "", notes: "" });

  useEffect(() => {
    loadFollowups();
    loadLeads();
  }, []);

  const loadFollowups = async () => {
    try {
      const response = await api.get("/followups");
      setFollowups(response.data);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/followups", formData);
      toast.success("Follow-up agendado!");
      setShowDialog(false);
      setFormData({ lead_id: "", assigned_to: "", scheduled_date: "", notes: "" });
      loadFollowups();
    } catch (error) {
      toast.error("Erro ao agendar follow-up");
    }
  };

  const handleComplete = async (id) => {
    try {
      await api.put(`/followups/${id}?status=completed`);
      toast.success("Follow-up concluído!");
      loadFollowups();
    } catch (error) {
      toast.error("Erro ao completar follow-up");
    }
  };

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900" data-testid="followup-page-title">Follow-up</h1>
          <Button onClick={() => setShowDialog(true)} className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Agendar Follow-up
          </Button>
        </div>

        <div className="grid gap-6">
          {followups.map((followup) => {
            const lead = leads.find(l => l.id === followup.lead_id);
            return (
              <div key={followup.id} className="bg-white rounded-2xl p-6 shadow-lg">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900">{lead?.name || "Lead não encontrado"}</h3>
                    <p className="text-gray-600 mt-2">Data agendada: {new Date(followup.scheduled_date).toLocaleDateString('pt-BR')}</p>
                    <p className="text-gray-600">{followup.notes}</p>
                    <span className={`status-badge mt-3 inline-block ${followup.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {followup.status === 'completed' ? 'Concluído' : 'Pendente'}
                    </span>
                  </div>
                  {followup.status === 'pending' && (
                    <Button onClick={() => handleComplete(followup.id)} variant="outline" className="btn-secondary">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Concluir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agendar Follow-up</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Lead</Label>
                <select
                  className="input-field"
                  value={formData.lead_id}
                  onChange={(e) => setFormData({...formData, lead_id: e.target.value})}
                  required
                >
                  <option value="">Selecione um lead</option>
                  {leads.map(lead => (
                    <option key={lead.id} value={lead.id}>{lead.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Data Agendada</Label>
                <Input type="date" value={formData.scheduled_date} onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})} required />
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} required />
              </div>
              <Button type="submit" className="w-full btn-primary">Agendar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}