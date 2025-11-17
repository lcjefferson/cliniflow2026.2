import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, ChevronLeft, ChevronRight, X } from "lucide-react";
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
  const [services, setServices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showNewPatientDialog, setShowNewPatientDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [newPatientData, setNewPatientData] = useState({
    name: "",
    email: "",
    phone: "",
    birthdate: "",
    address: ""
  });
  
  const [formData, setFormData] = useState({
    patient_id: "",
    professional_id: "",
    service_id: "",
    room_id: "",
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: "",
    amount: "",
    paid: false,
    notes: ""
  });

  // Cores para cada profissional
  const professionalColors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-yellow-500",
    "bg-red-500",
    "bg-indigo-500",
    "bg-teal-500",
  ];

  useEffect(() => {
    loadMonthAppointments();
    loadData();
  }, [currentDate]);

  const loadMonthAppointments = async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const response = await api.get(`/appointments`);
      setAppointments(response.data);
    } catch (error) {
      toast.error("Erro ao carregar agendamentos");
    }
  };

  const loadData = async () => {
    try {
      const [prof, pat, serv, room] = await Promise.all([
        api.get("/professionals"),
        api.get("/patients"),
        api.get("/services"),
        api.get("/rooms")
      ]);
      setProfessionals(prof.data);
      setPatients(pat.data);
      setServices(serv.data);
      setRooms(room.data);
    } catch (error) {
      console.error("Erro ao carregar dados");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAppointment) {
        await api.put(`/appointments/${editingAppointment.id}`, formData);
        toast.success("Agendamento atualizado!");
      } else {
        await api.post("/appointments", formData);
        toast.success("Agendamento criado!");
      }
      setShowDialog(false);
      setEditingAppointment(null);
      setFormData({
        patient_id: "",
        professional_id: "",
        service_id: "",
        room_id: "",
        appointment_date: new Date().toISOString().split('T')[0],
        appointment_time: "",
        amount: "",
        paid: false,
        notes: ""
      });
      loadMonthAppointments();
    } catch (error) {
      toast.error(editingAppointment ? "Erro ao atualizar agendamento" : "Erro ao criar agendamento");
    }
  };

  const handleEditAppointment = (appointment) => {
    setEditingAppointment(appointment);
    setFormData({
      patient_id: appointment.patient_id,
      professional_id: appointment.professional_id,
      service_id: appointment.service_id,
      room_id: appointment.room_id,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      amount: appointment.amount || "",
      paid: appointment.paid || false,
      notes: appointment.notes || ""
    });
    setShowDetailsDialog(false);
    setShowDialog(true);
  };

  const handleDeleteAppointment = async (appointmentId) => {
    if (!window.confirm("Tem certeza que deseja deletar este agendamento?")) {
      return;
    }
    try {
      await api.delete(`/appointments/${appointmentId}`);
      toast.success("Agendamento deletado!");
      setShowDetailsDialog(false);
      loadMonthAppointments();
    } catch (error) {
      toast.error("Erro ao deletar agendamento");
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingAppointment(null);
    setFormData({
      patient_id: "",
      professional_id: "",
      service_id: "",
      room_id: "",
      appointment_date: new Date().toISOString().split('T')[0],
      appointment_time: "",
      amount: "",
      paid: false,
      notes: ""
    });
  };

  const handleNewPatientSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post("/patients", newPatientData);
      toast.success("Paciente criado com sucesso!");
      setShowNewPatientDialog(false);
      setNewPatientData({
        name: "",
        email: "",
        phone: "",
        birthdate: "",
        address: ""
      });
      loadData();
      // Automaticamente selecionar o novo paciente no formulário
      setFormData({...formData, patient_id: response.data.id});
    } catch (error) {
      toast.error("Erro ao criar paciente");
    }
  };

  const handleDayDoubleClick = (date) => {
    if (!date) return;
    setFormData({
      ...formData,
      appointment_date: date
    });
    setShowDialog(true);
  };

  const getProfessionalColor = (professionalId) => {
    const index = professionals.findIndex(p => p.id === professionalId);
    return professionalColors[index % professionalColors.length];
  };

  const getProfessionalName = (professionalId) => {
    const prof = professionals.find(p => p.id === professionalId);
    return prof ? prof.name : "Profissional";
  };

  const getPatientName = (patientId) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.name : "Paciente";
  };

  const getServiceName = (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    return service ? service.name : "Serviço";
  };

  // Gerar dias do mês
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Dias do mês anterior (vazios)
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ day: null, date: null });
    }
    
    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({ 
        day, 
        date: date.toISOString().split('T')[0],
        isToday: date.toDateString() === new Date().toDateString()
      });
    }
    
    return days;
  };

  const getAppointmentsForDay = (date) => {
    if (!date) return [];
    return appointments.filter(apt => apt.appointment_date === date);
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const openAppointmentDetails = (appointment) => {
    setSelectedAppointment(appointment);
    setShowDetailsDialog(true);
  };

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Calendário</h1>
          <div className="flex gap-3">
            <Button onClick={() => setShowDialog(true)} className="btn-primary">
              <Plus className="w-5 h-5 mr-2" />
              Novo Agendamento
            </Button>
          </div>
        </div>

        {/* Navegação do Mês */}
        <div className="flex items-center justify-between mb-6 bg-white rounded-2xl p-6 shadow-lg">
          <Button onClick={previousMonth} variant="outline" className="btn-secondary">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-2xl font-bold text-gray-900">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <Button onClick={nextMonth} variant="outline" className="btn-secondary">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Grade do Calendário */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {/* Cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 gap-2 mb-4">
            {weekDays.map((day, index) => (
              <div key={index} className="text-center font-bold text-gray-700 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Dias do mês */}
          <div className="grid grid-cols-7 gap-2">
            {generateCalendarDays().map((dayObj, index) => (
              <div
                key={index}
                onDoubleClick={() => handleDayDoubleClick(dayObj.date)}
                className={`min-h-[120px] border rounded-lg p-2 cursor-pointer ${
                  dayObj.day ? 'bg-white hover:bg-gray-50' : 'bg-gray-100'
                } ${dayObj.isToday ? 'border-blue-500 border-2' : 'border-gray-200'}`}
              >
                {dayObj.day && (
                  <>
                    <div className={`text-sm font-semibold mb-2 ${
                      dayObj.isToday ? 'text-blue-600' : 'text-gray-700'
                    }`}>
                      {dayObj.day}
                    </div>
                    
                    {/* Agendamentos do dia */}
                    <div className="space-y-1">
                      {getAppointmentsForDay(dayObj.date).map((apt, aptIndex) => (
                        <button
                          key={aptIndex}
                          onClick={() => openAppointmentDetails(apt)}
                          className={`w-full text-left text-xs px-2 py-1 rounded text-white hover:opacity-80 transition-opacity truncate ${
                            getProfessionalColor(apt.professional_id)
                          }`}
                        >
                          {apt.appointment_time} - {getProfessionalName(apt.professional_id)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Legenda de Profissionais */}
        <div className="mt-6 bg-white rounded-2xl shadow-lg p-6">
          <h3 className="font-bold text-gray-900 mb-4">Profissionais</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {professionals.map((prof, index) => (
              <div key={prof.id} className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded ${professionalColors[index % professionalColors.length]}`}></div>
                <span className="text-sm text-gray-700">{prof.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Modal de Detalhes do Agendamento */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Detalhes do Agendamento</DialogTitle>
            </DialogHeader>
            {selectedAppointment && (
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-600">Paciente</Label>
                  <p className="font-semibold">{getPatientName(selectedAppointment.patient_id)}</p>
                </div>
                <div>
                  <Label className="text-gray-600">Profissional</Label>
                  <p className="font-semibold">{getProfessionalName(selectedAppointment.professional_id)}</p>
                </div>
                <div>
                  <Label className="text-gray-600">Serviço</Label>
                  <p className="font-semibold">{getServiceName(selectedAppointment.service_id)}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-600">Data</Label>
                    <p className="font-semibold">
                      {new Date(selectedAppointment.appointment_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Horário</Label>
                    <p className="font-semibold">{selectedAppointment.appointment_time}</p>
                  </div>
                </div>
                {selectedAppointment.notes && (
                  <div>
                    <Label className="text-gray-600">Observações</Label>
                    <p className="text-sm">{selectedAppointment.notes}</p>
                  </div>
                )}
                <div>
                  <Label className="text-gray-600">Status</Label>
                  <p className="font-semibold capitalize">{selectedAppointment.status || "Agendado"}</p>
                </div>
                
                {/* Botões de Ação */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button 
                    onClick={() => handleEditAppointment(selectedAppointment)} 
                    className="flex-1 btn-primary"
                  >
                    Editar Agendamento
                  </Button>
                  <Button 
                    onClick={() => handleDeleteAppointment(selectedAppointment.id)} 
                    variant="destructive"
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                  >
                    Deletar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Novo Agendamento */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
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
                          onClick={() => setLeadSearch(lead.name)}
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
                  <div className="flex justify-between items-center mb-2">
                    <Label>Paciente</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewPatientDialog(true)}
                      className="text-xs"
                    >
                      + Novo Paciente
                    </Button>
                  </div>
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
              <Button type="submit" className="w-full btn-primary">
                {editingAppointment ? "Salvar Alterações" : "Agendar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal de Novo Lead */}
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

        {/* Modal de Novo Paciente */}
        <Dialog open={showNewPatientDialog} onOpenChange={setShowNewPatientDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Adicionar Novo Paciente</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleNewPatientSubmit} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={newPatientData.name}
                  onChange={(e) => setNewPatientData({...newPatientData, name: e.target.value})}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={newPatientData.email}
                    onChange={(e) => setNewPatientData({...newPatientData, email: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Telefone *</Label>
                  <Input
                    value={newPatientData.phone}
                    onChange={(e) => setNewPatientData({...newPatientData, phone: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Data de Nascimento *</Label>
                <Input
                  type="date"
                  value={newPatientData.birthdate}
                  onChange={(e) => setNewPatientData({...newPatientData, birthdate: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input
                  value={newPatientData.address}
                  onChange={(e) => setNewPatientData({...newPatientData, address: e.target.value})}
                  placeholder="Rua, Número, Cidade, Estado"
                />
              </div>
              <Button type="submit" className="w-full btn-primary">Adicionar Paciente</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
