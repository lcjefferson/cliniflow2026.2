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
import PatientCombobox from "../components/PatientCombobox";

export default function CalendarPage() {
  const [appointments, setAppointments] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [patients, setPatients] = useState([]);
  const [services, setServices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month"); // month, week, day
  const [filterProfessional, setFilterProfessional] = useState("");
  const [filterRoom, setFilterRoom] = useState("");
  const [filterService, setFilterService] = useState("");
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
    appointment_time_end: "",
    notes: ""
  });
  const [conflicts, setConflicts] = useState(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState(null);

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

  // Verificar conflitos automaticamente quando campos importantes mudarem
  useEffect(() => {
    if (showDialog && formData.professional_id && formData.room_id && formData.appointment_date && formData.appointment_time) {
      const timer = setTimeout(() => {
        checkConflicts();
      }, 500); // Debounce de 500ms
      
      return () => clearTimeout(timer);
    }
  }, [formData.professional_id, formData.room_id, formData.appointment_date, formData.appointment_time, formData.appointment_time_end, showDialog]);

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

  const checkConflicts = async () => {
    if (!formData.professional_id || !formData.room_id || !formData.appointment_date || !formData.appointment_time) {
      return;
    }
    
    setCheckingConflicts(true);
    try {
      const params = new URLSearchParams({
        professional_id: formData.professional_id,
        room_id: formData.room_id,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
      });
      
      if (formData.appointment_time_end) {
        params.append("appointment_time_end", formData.appointment_time_end);
      }
      
      if (editingAppointment) {
        params.append("exclude_appointment_id", editingAppointment.id);
      }
      
      const response = await api.get(`/appointments/check-conflicts?${params.toString()}`);
      setConflicts(response.data);
    } catch (error) {
      console.error("Erro ao verificar conflitos:", error);
    } finally {
      setCheckingConflicts(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Verificar conflitos antes de salvar
    await checkConflicts();
    
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
      setConflicts(null);
      setFormData({
        patient_id: "",
        professional_id: "",
        service_id: "",
        room_id: "",
        appointment_date: new Date().toISOString().split('T')[0],
        appointment_time: "",
        appointment_time_end: "",
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
      appointment_time_end: appointment.appointment_time_end || "",
      notes: appointment.notes || ""
    });
    setShowDetailsDialog(false);
    setShowDialog(true);
  };

  const handleDeleteAppointment = async (appointment) => {
    setAppointmentToDelete(appointment);
    setDeleteDialog(true);
  };

  const confirmDeleteAppointment = async () => {
    if (!appointmentToDelete) return;
    
    try {
      await api.delete(`/appointments/${appointmentToDelete.id}`);
      toast.success("Agendamento deletado!");
      setDeleteDialog(false);
      setAppointmentToDelete(null);
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
      appointment_time_end: "",
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
    let filtered = appointments.filter(apt => apt.appointment_date === date);
    
    // Aplicar filtros
    if (filterProfessional) {
      filtered = filtered.filter(apt => apt.professional_id === filterProfessional);
    }
    if (filterRoom) {
      filtered = filtered.filter(apt => apt.room_id === filterRoom);
    }
    if (filterService) {
      filtered = filtered.filter(apt => apt.service_id === filterService);
    }
    
    return filtered;
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const previousPeriod = () => {
    if (viewMode === "month") {
      previousMonth();
    } else if (viewMode === "week") {
      setCurrentDate(new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000));
    } else {
      setCurrentDate(new Date(currentDate.getTime() - 24 * 60 * 60 * 1000));
    }
  };

  const nextPeriod = () => {
    if (viewMode === "month") {
      nextMonth();
    } else if (viewMode === "week") {
      setCurrentDate(new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000));
    } else {
      setCurrentDate(new Date(currentDate.getTime() + 24 * 60 * 60 * 1000));
    }
  };

  const getWeekDays = () => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day;
    startOfWeek.setDate(diff);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push({
        day: date.getDate(),
        date: date.toISOString().split('T')[0],
        dayName: weekDays[i],
        isToday: date.toDateString() === new Date().toDateString()
      });
    }
    return days;
  };

  const getPeriodTitle = () => {
    if (viewMode === "month") {
      return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else if (viewMode === "week") {
      const weekDays = getWeekDays();
      const firstDay = weekDays[0];
      const lastDay = weekDays[6];
      return `${firstDay.day} - ${lastDay.day} ${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else {
      return `${currentDate.getDate()} ${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
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

        {/* Filtros e Visualizações */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Visualização */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Visualização</Label>
              <select
                className="input-field"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
              >
                <option value="month">Mês</option>
                <option value="week">Semana</option>
                <option value="day">Dia</option>
              </select>
            </div>

            {/* Filtro por Profissional */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Profissional</Label>
              <select
                className="input-field"
                value={filterProfessional}
                onChange={(e) => setFilterProfessional(e.target.value)}
              >
                <option value="">Todos</option>
                {professionals.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Filtro por Sala */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Sala</Label>
              <select
                className="input-field"
                value={filterRoom}
                onChange={(e) => setFilterRoom(e.target.value)}
              >
                <option value="">Todas</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Filtro por Serviço */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Serviço</Label>
              <select
                className="input-field"
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
              >
                <option value="">Todos</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          {(filterProfessional || filterRoom || filterService) && (
            <div className="mt-4">
              <Button
                onClick={() => {
                  setFilterProfessional("");
                  setFilterRoom("");
                  setFilterService("");
                }}
                variant="outline"
                className="btn-secondary"
              >
                <X className="w-4 h-4 mr-2" />
                Limpar Filtros
              </Button>
            </div>
          )}
        </div>

        {/* Navegação do Período */}
        <div className="flex items-center justify-between mb-6 bg-white rounded-2xl p-6 shadow-lg">
          <Button onClick={previousPeriod} variant="outline" className="btn-secondary">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-2xl font-bold text-gray-900">
            {getPeriodTitle()}
          </h2>
          <Button onClick={nextPeriod} variant="outline" className="btn-secondary">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Grade do Calendário */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {viewMode === "month" && (
            <>
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
            </>
          )}

          {viewMode === "week" && (
            <>
              {/* Visualização de Semana */}
              <div className="grid grid-cols-7 gap-2">
                {getWeekDays().map((dayObj, index) => (
                  <div
                    key={index}
                    onDoubleClick={() => handleDayDoubleClick(dayObj.date)}
                    className={`min-h-[400px] border rounded-lg p-2 cursor-pointer bg-white hover:bg-gray-50 ${
                      dayObj.isToday ? 'border-blue-500 border-2' : 'border-gray-200'
                    }`}
                  >
                    <div className={`text-center mb-3 ${dayObj.isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                      <div className="font-bold">{dayObj.dayName}</div>
                      <div className="text-2xl font-bold">{dayObj.day}</div>
                    </div>
                    
                    <div className="space-y-2">
                      {getAppointmentsForDay(dayObj.date).map((apt, aptIndex) => (
                        <button
                          key={aptIndex}
                          onClick={() => openAppointmentDetails(apt)}
                          className={`w-full text-left text-xs px-2 py-2 rounded text-white hover:opacity-80 transition-opacity ${
                            getProfessionalColor(apt.professional_id)
                          }`}
                        >
                          <div className="font-semibold">{apt.appointment_time}</div>
                          <div className="truncate">{getProfessionalName(apt.professional_id)}</div>
                          <div className="truncate text-[10px] opacity-80">{getPatientName(apt.patient_id)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {viewMode === "day" && (
            <>
              {/* Visualização de Dia */}
              <div className="space-y-3">
                {getAppointmentsForDay(currentDate.toISOString().split('T')[0])
                  .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
                  .map((apt, index) => (
                    <button
                      key={index}
                      onClick={() => openAppointmentDetails(apt)}
                      className={`w-full text-left p-4 rounded-lg text-white hover:opacity-90 transition-opacity ${
                        getProfessionalColor(apt.professional_id)
                      }`}
                    >
                      <div>
                        <div className="text-2xl font-bold mb-2">{apt.appointment_time}</div>
                        <div className="text-lg font-semibold">{getPatientName(apt.patient_id)}</div>
                        <div className="text-sm opacity-90">{getProfessionalName(apt.professional_id)}</div>
                        <div className="text-sm opacity-80">{getServiceName(apt.service_id)}</div>
                      </div>
                    </button>
                  ))}
                
                {getAppointmentsForDay(currentDate.toISOString().split('T')[0]).length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <p>Nenhum agendamento para este dia</p>
                  </div>
                )}
              </div>
            </>
          )}
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
                    onClick={() => handleDeleteAppointment(selectedAppointment)} 
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Paciente *</Label>
                  <PatientCombobox
                    patients={patients}
                    value={formData.patient_id}
                    onChange={(patientId) => setFormData({...formData, patient_id: patientId})}
                    onCreateNew={() => setShowNewPatientDialog(true)}
                    placeholder="Busque ou selecione um paciente..."
                  />
                </div>
                <div>
                  <Label>Profissional *</Label>
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
                  >
                    <option value="">Selecione</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Sala *</Label>
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
                    onChange={(e) => {
                      setFormData({...formData, appointment_date: e.target.value});
                      setConflicts(null);
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Horário Início</Label>
                  <Input
                    type="time"
                    value={formData.appointment_time}
                    onChange={(e) => {
                      setFormData({...formData, appointment_time: e.target.value});
                      setConflicts(null);
                    }}
                    onBlur={checkConflicts}
                  />
                </div>
                <div>
                  <Label>Horário Fim</Label>
                  <Input
                    type="time"
                    value={formData.appointment_time_end}
                    onChange={(e) => {
                      setFormData({...formData, appointment_time_end: e.target.value});
                      setConflicts(null);
                    }}
                    onBlur={checkConflicts}
                  />
                </div>
              </div>
              
              {/* Alerta de Conflitos */}
              {conflicts && conflicts.has_conflicts && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-red-600 font-bold text-lg">⚠️</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-red-900 mb-2">Conflito de Horário Detectado!</h4>
                      
                      {conflicts.conflicts.professional_conflicts.length > 0 && (
                        <div className="mb-3">
                          <p className="text-sm font-semibold text-red-800 mb-1">👨‍⚕️ Profissional já tem agendamento:</p>
                          {conflicts.conflicts.professional_conflicts.map((conflict, idx) => (
                            <p key={idx} className="text-sm text-red-700 ml-4">
                              • {conflict.time}{conflict.time_end ? ` - ${conflict.time_end}` : ''} - Paciente: {conflict.patient_name}
                            </p>
                          ))}
                        </div>
                      )}
                      
                      {conflicts.conflicts.room_conflicts.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-red-800 mb-1">🚪 Sala já está ocupada:</p>
                          {conflicts.conflicts.room_conflicts.map((conflict, idx) => (
                            <p key={idx} className="text-sm text-red-700 ml-4">
                              • {conflict.time}{conflict.time_end ? ` - ${conflict.time_end}` : ''} - Paciente: {conflict.patient_name}
                            </p>
                          ))}
                        </div>
                      )}
                      
                      <p className="text-xs text-red-600 mt-2">
                        Você pode continuar mesmo com conflitos, mas é recomendado escolher outro horário, profissional ou sala.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {checkingConflicts && (
                <div className="text-center text-sm text-blue-600">
                  Verificando disponibilidade...
                </div>
              )}
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

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-700">
                Tem certeza que deseja excluir este agendamento?
              </p>
              {appointmentToDelete && (
                <div className="mt-3 p-3 bg-gray-50 rounded">
                  <p className="text-sm"><strong>Data:</strong> {appointmentToDelete.appointment_date}</p>
                  <p className="text-sm"><strong>Horário:</strong> {appointmentToDelete.appointment_time}</p>
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
                  setAppointmentToDelete(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmDeleteAppointment}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Excluir Agendamento
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
