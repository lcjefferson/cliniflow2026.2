import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CalendarPage() {
  const [appointments, setAppointments] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [patients, setPatients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [services, setServices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showLeadDialog, setShowLeadDialog] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [formData, setFormData] = useState({
    patient_id: "",
    professional_id: "",
    service_id: "",
    room_id: "",
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: "",
    notes: ""
  });
  const [leadFormData, setLeadFormData] = useState({
    name: "",
    phone: "",
    email: "",
    source: "whatsapp",
    status: "new",
    notes: ""
  });

  useEffect(() => {
    loadAppointments();
    loadData();
  }, [selectedDate]);

  const loadAppointments = async () => {
    try {
      const response = await api.get(`/appointments?date=${selectedDate}`);
      setAppointments(response.data);
    } catch (error) {
      toast.error("Erro ao carregar agendamentos");
    }
  };

  const loadData = async () => {
    try {
      const [prof, pat, serv, room, leadResp] = await Promise.all([
        api.get("/professionals"),
        api.get("/patients"),
        api.get("/services"),
        api.get("/rooms"),
        api.get("/leads")
      ]);
      setProfessionals(prof.data);
      setPatients(pat.data);
      setServices(serv.data);
      setRooms(room.data);
      setLeads(leadResp.data);
    } catch (error) {
      console.error("Erro ao carregar dados");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/appointments", formData);
      toast.success("Agendamento criado!");
      setShowDialog(false);
      setFormData({
        patient_id: "",
        professional_id: "",
        service_id: "",
        room_id: "",
        appointment_date: new Date().toISOString().split('T')[0],
        appointment_time: "",
        notes: ""
      });
      loadAppointments();
    } catch (error) {
      toast.error("Erro ao criar agendamento");
    }
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/leads", leadFormData);
      toast.success("Lead criado com sucesso!");
      setShowLeadDialog(false);
      setLeadFormData({
        name: "",
        phone: "",
        email: "",
        source: "whatsapp",
        status: "new",
        notes: ""
      });
      loadData(); // Reload leads data
    } catch (error) {
      toast.error("Erro ao criar lead");
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/appointments/${id}?status=${status}`);
      toast.success("Status atualizado!");
      loadAppointments();
    } catch (error) {
      toast.error("Erro ao atualizar status");
    }
  };

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900" data-testid="calendar-page-title">Calendário</h1>
          <div className="flex gap-3">
            <Button onClick={() => setShowLeadDialog(true)} variant="outline" className="btn-secondary">
              <Plus className="w-5 h-5 mr-2" />
              Novo Lead
            </Button>
            <Button onClick={() => setShowDialog(true)} className="btn-primary">
              <Plus className="w-5 h-5 mr-2" />
              Novo Agendamento
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <Label>Selecionar Data</Label>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Agendamentos - {new Date(selectedDate).toLocaleDateString('pt-BR', { dateStyle: 'full' })}
          </h2>
          
          {appointments.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CalendarIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p>Nenhum agendamento para esta data</p>
            </div>
          ) : (
            <div className="space-y-4">
              {appointments.map((apt) => {
                const patient = patients.find(p => p.id === apt.patient_id);
                const professional = professionals.find(p => p.id === apt.professional_id);
                const service = services.find(s => s.id === apt.service_id);
                
                return (
                  <div key={apt.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl font-bold text-blue-600">{apt.appointment_time}</span>
                          <span className={`status-badge status-${apt.status}`}>
                            {apt.status === 'scheduled' && 'Agendado'}
                            {apt.status === 'confirmed' && 'Confirmado'}
                            {apt.status === 'completed' && 'Concluído'}
                            {apt.status === 'cancelled' && 'Cancelado'}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-900">{patient?.name || 'Paciente'}</p>
                        <p className="text-gray-600">{professional?.name || 'Profissional'} - {service?.name || 'Serviço'}</p>
                        {apt.notes && <p className="text-sm text-gray-500 mt-2">{apt.notes}</p>}
                      </div>
                      <div className="flex gap-2">
                        {apt.status === 'scheduled' && (
                          <Button onClick={() => updateStatus(apt.id, 'confirmed')} variant="outline" size="sm">
                            Confirmar
                          </Button>
                        )}
                        {apt.status === 'confirmed' && (
                          <Button onClick={() => updateStatus(apt.id, 'completed')} variant="outline" size="sm">
                            Concluir
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Novo Agendamento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Pesquisar Lead (opcional)</Label>
                <Input
                  placeholder="Digite o nome do lead para filtrar..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                />
                {leadSearch && leads.filter(l => l.name.toLowerCase().includes(leadSearch.toLowerCase())).length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto border rounded-lg">
                    {leads
                      .filter(l => l.name.toLowerCase().includes(leadSearch.toLowerCase()))
                      .map(lead => (
                        <div
                          key={lead.id}
                          className="p-2 hover:bg-blue-50 cursor-pointer flex justify-between items-center"
                          onClick={() => {
                            setLeadSearch(lead.name);
                            // Opcional: preencher outros campos com dados do lead
                          }}
                        >
                          <div>
                            <p className="font-medium">{lead.name}</p>
                            <p className="text-sm text-gray-500">{lead.phone}</p>
                          </div>
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">Lead</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Paciente</Label>
                  <select
                    className="input-field"
                    value={formData.patient_id}
                    onChange={(e) => setFormData({...formData, patient_id: e.target.value})}
                    required
                  >
                    <option value="">Selecione</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Profissional</Label>
                  <select
                    className="input-field"
                    value={formData.professional_id}
                    onChange={(e) => setFormData({...formData, professional_id: e.target.value})}
                    required
                  >
                    <option value="">Selecione</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Serviço</Label>
                  <select
                    className="input-field"
                    value={formData.service_id}
                    onChange={(e) => setFormData({...formData, service_id: e.target.value})}
                    required
                  >
                    <option value="">Selecione</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Sala</Label>
                  <select
                    className="input-field"
                    value={formData.room_id}
                    onChange={(e) => setFormData({...formData, room_id: e.target.value})}
                    required
                  >
                    <option value="">Selecione</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={formData.appointment_date}
                    onChange={(e) => setFormData({...formData, appointment_date: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Horário</Label>
                  <Input
                    type="time"
                    value={formData.appointment_time}
                    onChange={(e) => setFormData({...formData, appointment_time: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                />
              </div>
              <Button type="submit" className="w-full btn-primary">Agendar</Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={showLeadDialog} onOpenChange={setShowLeadDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleLeadSubmit} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={leadFormData.name}
                  onChange={(e) => setLeadFormData({...leadFormData, name: e.target.value})}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Telefone *</Label>
                  <Input
                    value={leadFormData.phone}
                    onChange={(e) => setLeadFormData({...leadFormData, phone: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={leadFormData.email}
                    onChange={(e) => setLeadFormData({...leadFormData, email: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Origem</Label>
                  <Select value={leadFormData.source} onValueChange={(value) => setLeadFormData({...leadFormData, source: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="google">Google</SelectItem>
                      <SelectItem value="indicacao">Indicação</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={leadFormData.status} onValueChange={(value) => setLeadFormData({...leadFormData, status: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Novo</SelectItem>
                      <SelectItem value="contacted">Contatado</SelectItem>
                      <SelectItem value="qualified">Qualificado</SelectItem>
                      <SelectItem value="converted">Convertido</SelectItem>
                      <SelectItem value="lost">Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Input
                  value={leadFormData.notes}
                  onChange={(e) => setLeadFormData({...leadFormData, notes: e.target.value})}
                />
              </div>
              <Button type="submit" className="w-full btn-primary">Criar Lead</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}