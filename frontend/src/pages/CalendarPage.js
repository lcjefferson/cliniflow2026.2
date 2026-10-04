import React, { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, ChevronLeft, ChevronRight, X, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import PatientCombobox from "../components/PatientCombobox";
import PatientDetailDialog from "../components/PatientDetailDialog";
import { useAuth } from "../contexts/AuthContext";

/** Data local YYYY-MM-DD (igual às células do calendário). */
function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Garante comparação com células mesmo se a API devolver ISO com hora. */
function appointmentDateKey(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

const STATUS_META = {
  scheduled: { label: "Agendado", className: "status-scheduled", dot: "bg-slate-400" },
  waiting: { label: "Em espera", className: "status-waiting", dot: "bg-violet-500" },
  in_progress: { label: "Em andamento", className: "status-in-progress", dot: "bg-orange-500" },
  completed: { label: "Concluído", className: "status-completed", dot: "bg-green-600" },
  cancelled: { label: "Cancelado", className: "status-cancelled", dot: "bg-red-600" },
};

const getStatusDot = (apt) => (STATUS_META[apt.status] || STATUS_META.scheduled).dot;

const MONTH_CELL_LIMIT = 3;

export default function CalendarPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [patients, setPatients] = useState([]);
  const [services, setServices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month"); // month, week, day
  const [selectedDay, setSelectedDay] = useState(() => toYMD(new Date()));
  const [showMobileFilters, setShowMobileFilters] = useState(false);
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
    address: "",
    city: "",
    profession: ""
  });
  
  const [formData, setFormData] = useState({
    patient_id: "",
    professional_id: "",
    room_id: "",
    // Ajuste de fuso horário: usa data local (YYYY-MM-DD) sem deslocamento
    appointment_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    appointment_time: "",
    appointment_time_end: "",
    notes: "",
    status: "scheduled",
    service_ids: [],
    image_voice_consent: false,
    patient_profession: "",
    patient_address: "",
    patient_city: ""
  });
  const [conflicts, setConflicts] = useState(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState(null);
  const [showPatientDialog, setShowPatientDialog] = useState(false);
  const [selectedPatientForDialog, setSelectedPatientForDialog] = useState(null);
  const [patientNameCache, setPatientNameCache] = useState({});

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
    loadData();
  }, []);

  useEffect(() => {
    loadMonthAppointments();
  }, [currentDate, viewMode]);

  const requestedPatientIdsRef = useRef(new Set());

  const fetchPatientName = (patientId) => {
    const id = patientId != null ? String(patientId) : "";
    if (!id || requestedPatientIdsRef.current.has(id)) return;
    requestedPatientIdsRef.current.add(id);
    api
      .get(`/patients/${id}`)
      .then((res) => {
        const name = res.data?.name;
        if (name) setPatientNameCache((prev) => ({ ...prev, [id]: name }));
      })
      .catch(() => {});
  };

  // Buscar nomes de pacientes que não estão na lista (ex.: além dos 500 carregados)
  useEffect(() => {
    const patientIds = [...new Set((appointments || []).map((a) => (a.patient_id != null ? String(a.patient_id) : null)).filter(Boolean))];
    const missing = patientIds.filter(
      (id) =>
        !patients.some((p) => String(p.id) === id) &&
        !requestedPatientIdsRef.current.has(id)
    );
    missing.forEach((id) => fetchPatientName(id));
  }, [appointments, patients]);

  // Ao abrir o modal do agendamento, garantir que o nome do paciente seja buscado se ainda não tiver
  useEffect(() => {
    if (showDetailsDialog && selectedAppointment?.patient_id) {
      const id = String(selectedAppointment.patient_id);
      const hasInList = patients.some((p) => String(p.id) === id);
      const hasInCache = patientNameCache[id];
      if (!hasInList && !hasInCache) fetchPatientName(id);
    }
  }, [showDetailsDialog, selectedAppointment?.patient_id]);

  // Verificar conflitos automaticamente quando campos importantes mudarem
  useEffect(() => {
    if (showDialog && formData.professional_id && formData.room_id && formData.appointment_date && formData.appointment_time) {
      const timer = setTimeout(() => {
        checkConflicts();
      }, 500); // Debounce de 500ms
      
      return () => clearTimeout(timer);
    }
  }, [formData.professional_id, formData.room_id, formData.appointment_date, formData.appointment_time, formData.appointment_time_end, showDialog]);

  // Profissionais: garantir profissional_id do usuário no formulário para coincidir com o filtro do GET /appointments
  useEffect(() => {
    if (!showDialog || editingAppointment) return;
    const pid = user?.professional_id;
    const ut = user?.user_type;
    if (!pid || (ut !== "profissional" && ut !== "profissional_admin")) return;
    setFormData((prev) => (prev.professional_id ? prev : { ...prev, professional_id: pid }));
  }, [showDialog, editingAppointment, user?.professional_id, user?.user_type]);

  const loadMonthAppointments = async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      let dateFrom;
      let dateTo;
      if (viewMode === "month") {
        dateFrom = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        dateTo = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      } else if (viewMode === "week") {
        const start = new Date(currentDate);
        const dow = start.getDay();
        start.setDate(start.getDate() - dow);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        dateFrom = toYMD(start);
        dateTo = toYMD(end);
      } else {
        const ymd = toYMD(currentDate);
        dateFrom = ymd;
        dateTo = ymd;
      }
      const response = await api.get("/appointments", {
        params: {
          sort_by: "appointment_date",
          order: "asc",
          date_from: dateFrom,
          date_to: dateTo,
          limit: 2000
        }
      });
      setAppointments(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error("Erro ao carregar agendamentos");
    }
  };

  const loadData = async () => {
    try {
      const [prof, serv, room] = await Promise.all([
        api.get("/professionals"),
        api.get("/services"),
        api.get("/rooms")
      ]);
      setProfessionals(Array.isArray(prof.data) ? prof.data : []);
      setServices(Array.isArray(serv.data) ? serv.data : []);
      setRooms(Array.isArray(room.data) ? room.data : []);

      // Carregar todos os pacientes (paginação) para o combobox de agendamento mostrar todos
      const pageSize = 500;
      let allPatients = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await api.get("/patients", {
          params: { page, page_size: pageSize, sort_by: "name", order: "asc" }
        });
        const list = Array.isArray(res.data) ? res.data : [];
        allPatients = allPatients.concat(list);
        hasMore = list.length === pageSize;
        page += 1;
      }
      setPatients(allPatients);
    } catch (error) {
      console.error("Erro ao carregar dados do calendário", error);
      toast.error("Erro ao carregar profissionais, pacientes e salas");
    }
  };

  const checkConflicts = async () => {
    if (!formData.professional_id || !formData.room_id || !formData.appointment_date || !formData.appointment_time) {
      return null;
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
      return response.data;
    } catch (error) {
      console.error("Erro ao verificar conflitos:", error);
      return null;
    } finally {
      setCheckingConflicts(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Verificar conflitos antes de salvar
    const conflictData = await checkConflicts();
    if (conflictData && (conflictData.duplicate || conflictData.has_conflicts)) {
      toast.error("Já existe um agendamento para esta data e horário");
      return;
    }
    
    try {
      const payload = { ...formData };
      delete payload.patient_profession;
      delete payload.patient_address;
      delete payload.patient_city;
      if (editingAppointment) {
        await api.put(`/appointments/${editingAppointment.id}`, payload);
        toast.success("Agendamento atualizado!");
      } else {
        await api.post("/appointments", payload);
        toast.success("Agendamento criado!");
      }
      if (formData.patient_id) {
        try {
          await api.put(`/patients/${formData.patient_id}`, {
            profession: formData.patient_profession ?? "",
            address: formData.patient_address ?? "",
            city: formData.patient_city ?? ""
          });
        } catch (_) {}
      }
      setShowDialog(false);
      setEditingAppointment(null);
      setConflicts(null);
      setFormData({
        patient_id: "",
        professional_id: "",
        room_id: "",
        appointment_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        appointment_time: "",
        appointment_time_end: "",
        notes: "",
        status: "scheduled",
        service_ids: [],
        image_voice_consent: false,
        patient_profession: "",
        patient_address: "",
        patient_city: ""
      });
      await loadMonthAppointments();
    } catch (error) {
      toast.error(editingAppointment ? "Erro ao atualizar agendamento" : "Erro ao criar agendamento");
    }
  };

  const handleEditAppointment = (appointment) => {
    setEditingAppointment(appointment);
    const serviceIds = resolveServiceIdsFromAppointment(appointment);
    const pat = patients.find((p) => String(p.id) === String(appointment.patient_id));
    setFormData({
      patient_id: appointment.patient_id,
      professional_id: appointment.professional_id,
      room_id: appointment.room_id,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      appointment_time_end: appointment.appointment_time_end || "",
      notes: appointment.notes || "",
      status: appointment.status || "scheduled",
      service_ids: serviceIds,
      image_voice_consent: !!appointment.image_voice_consent,
      patient_profession: pat?.profession ?? "",
      patient_address: pat?.address ?? "",
      patient_city: pat?.city ?? ""
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
      await loadMonthAppointments();
    } catch (error) {
      toast.error("Erro ao deletar agendamento");
    }
  };

  const openPatientDialog = async (patientId) => {
    if (!patientId) return;
    let p = patients.find((x) => x.id === patientId);
    if (!p) {
      try {
        const res = await api.get(`/patients/${patientId}`);
        p = res.data;
      } catch {
        toast.error("Paciente não encontrado");
        return;
      }
    }
    setSelectedPatientForDialog(p);
    setShowPatientDialog(true);
  };

  const handlePatientUpdate = (updated) => {
    if (!updated || !updated.id) return;
    setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedPatientForDialog(updated);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingAppointment(null);
    setConflicts(null);
    setFormData({
      patient_id: "",
      professional_id: "",
      room_id: "",
      appointment_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
      appointment_time: "",
      appointment_time_end: "",
      notes: "",
      status: "scheduled",
      service_ids: [],
      image_voice_consent: false,
      patient_profession: "",
      patient_address: "",
      patient_city: ""
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
        address: "",
        city: "",
        profession: ""
      });
      loadData();
      const p = response.data;
      setFormData({
        ...formData,
        patient_id: p.id,
        patient_profession: p.profession ?? "",
        patient_address: p.address ?? "",
        patient_city: p.city ?? ""
      });
    } catch (error) {
      toast.error("Erro ao criar paciente");
    }
  };

  const handleDayDoubleClick = (date) => {
    if (!date) return;
    setConflicts(null);
    setFormData({
      ...formData,
      appointment_date: date
    });
    setShowDialog(true);
  };

  const getProfessionalColor = (professionalId) => {
    const prof = professionals.find(p => p.id === professionalId);
    if (prof && prof.color) return prof.color;
    const index = professionals.findIndex(p => p.id === professionalId);
    return professionalColors[index % professionalColors.length];
  };

  const getProfessionalName = (professionalId) => {
    const prof = professionals.find(p => p.id === professionalId);
    return prof ? prof.name : "Profissional";
  };

  const getPatientName = (patientId) => {
    if (patientId == null || patientId === "") return "Paciente";
    const id = String(patientId);
    const patient = patients.find((p) => String(p.id) === id);
    if (patient?.name) return patient.name;
    if (patientNameCache[id]) return patientNameCache[id];
    return "Paciente";
  };

  const getServiceName = (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    return service ? service.name : "Serviço";
  };

  const getRoomName = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    return room ? room.name : "Sala";
  };

  const resolveServiceIdsFromAppointment = (appointment) => {
    if (!appointment) return [];
    if (Array.isArray(appointment.service_ids) && appointment.service_ids.length) return appointment.service_ids;
    if (appointment.service_id) return [appointment.service_id];
    if (Array.isArray(appointment.service_names) && appointment.service_names.length && services.length) {
      return appointment.service_names
        .map((name) => services.find((s) => s.name === name)?.id)
        .filter(Boolean);
    }
    return [];
  };

  const toggleServiceForForm = (serviceId) => {
    setFormData((prev) => {
      const ids = prev.service_ids || [];
      const next = ids.includes(serviceId) ? ids.filter((id) => id !== serviceId) : [...ids, serviceId];
      return { ...prev, service_ids: next };
    });
  };

  const updateAppointmentStatus = async (id, status) => {
    try {
      await api.put(`/appointments/${id}`, { status });
      await loadMonthAppointments();
      toast.success('Status atualizado');
      if (selectedAppointment && selectedAppointment.id === id) {
        setSelectedAppointment({ ...selectedAppointment, status });
      }
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
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
      // Usa formato local consistente com o restante do sistema
      days.push({ 
        day, 
        date: toYMD(date),
        isToday: date.toDateString() === new Date().toDateString()
      });
    }
    
    return days;
  };

  const getAppointmentsForDay = (date) => {
    if (!date) return [];
    let filtered = appointments.filter((apt) => appointmentDateKey(apt.appointment_date) === date);
    
    // Aplicar filtros
    if (filterProfessional) {
      filtered = filtered.filter(apt => apt.professional_id === filterProfessional);
    }
    if (filterRoom) {
      filtered = filtered.filter(apt => apt.room_id === filterRoom);
    }
    if (filterService) {
      filtered = filtered.filter(apt =>
        apt.service_id === filterService || (Array.isArray(apt.service_ids) && apt.service_ids.includes(filterService))
      );
    }
    
    // Ordenar por hora
    return filtered.sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
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
        date: toYMD(date),
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
      const first = new Date(`${weekDays[0].date}T00:00:00`);
      const last = new Date(`${weekDays[6].date}T00:00:00`);
      if (first.getMonth() === last.getMonth()) {
        return `${first.getDate()} – ${last.getDate()} ${monthNames[last.getMonth()]} ${last.getFullYear()}`;
      }
      const short = (d) => monthNames[d.getMonth()].slice(0, 3).toLowerCase();
      const firstYear = first.getFullYear() !== last.getFullYear() ? ` ${first.getFullYear()}` : "";
      return `${first.getDate()} ${short(first)}${firstYear} – ${last.getDate()} ${short(last)} ${last.getFullYear()}`;
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

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDay(toYMD(new Date()));
  };

  const openDay = (date) => {
    if (!date) return;
    setCurrentDate(new Date(`${date}T00:00:00`));
    setSelectedDay(date);
    setViewMode("day");
  };

  const getServiceLabel = (apt) =>
    Array.isArray(apt.service_names) && apt.service_names.length > 0
      ? apt.service_names.join(", ")
      : apt.service_id ? getServiceName(apt.service_id) : "";

  const getAppointmentTooltip = (apt) =>
    [
      apt.appointment_time,
      getPatientName(apt.patient_id),
      getProfessionalName(apt.professional_id),
      getServiceLabel(apt),
      STATUS_META[apt.status]?.label,
    ].filter(Boolean).join(" · ");

  const renderDayRow = (apt, index) => {
    const status = STATUS_META[apt.status] || STATUS_META.scheduled;
    const details = [getProfessionalName(apt.professional_id), getServiceLabel(apt), apt.room_id ? getRoomName(apt.room_id) : ""]
      .filter(Boolean)
      .join(" · ");
    return (
      <button
        key={apt.id || index}
        onClick={() => openAppointmentDetails(apt)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="w-24 flex-shrink-0 text-sm font-semibold text-slate-900 tabular-nums">
          {apt.appointment_time}
          {apt.appointment_time_end ? <span className="font-normal text-slate-400"> – {apt.appointment_time_end}</span> : null}
        </span>
        <span className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${getProfessionalColor(apt.professional_id)}`} />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium truncate ${apt.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
            {getPatientName(apt.patient_id)}
          </span>
          <span className="block text-xs text-slate-500 truncate">{details}</span>
        </span>
        <span className={`status-badge flex-shrink-0 ${status.className}`}>{status.label}</span>
      </button>
    );
  };

  const renderMobileAppointment = (apt, index) => {
    const serviceLabel = getServiceLabel(apt);
    return (
      <button
        key={apt.id || index}
        onClick={() => openAppointmentDetails(apt)}
        className="w-full flex items-stretch gap-3 text-left bg-white border border-slate-200 rounded-lg p-3 active:bg-slate-50"
      >
        <span className={`w-1.5 rounded-full flex-shrink-0 ${getProfessionalColor(apt.professional_id)}`} />
        <span className="w-16 flex-shrink-0 flex items-start gap-1.5 text-sm font-semibold text-slate-900 tabular-nums">
          <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${getStatusDot(apt)}`} title={STATUS_META[apt.status]?.label} />
          {apt.appointment_time}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium truncate ${apt.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
            {getPatientName(apt.patient_id)}
          </span>
          <span className="block text-xs text-slate-500 truncate">
            {getProfessionalName(apt.professional_id)}{serviceLabel ? ` · ${serviceLabel}` : ""}
          </span>
        </span>
      </button>
    );
  };

  const monthDays = generateCalendarDays();
  const mobileSelectedDay = monthDays.some((d) => d.date === selectedDay)
    ? selectedDay
    : monthDays.find((d) => d.date)?.date;
  const mobileSelectedAppointments = getAppointmentsForDay(mobileSelectedDay);
  const monthCells = [
    ...monthDays,
    ...Array.from({ length: (7 - (monthDays.length % 7)) % 7 }, () => ({ day: null, date: null })),
  ];
  const activeFilterCount = [filterProfessional, filterRoom, filterService].filter(Boolean).length;
  const dayAppointments = viewMode === "day" ? getAppointmentsForDay(toYMD(currentDate)) : [];

  return (
    <Layout>
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 md:mb-6 short:mb-3">
          <div>
            <h1 className="text-2xl md:text-3xl short:text-xl font-bold text-gray-900">Calendário</h1>
            <p className="hidden md:block short:hidden text-sm text-slate-500 mt-1">Agenda de atendimentos da clínica</p>
          </div>
          <Button onClick={() => setShowDialog(true)} className="btn-primary w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Novo Agendamento
          </Button>
        </div>

        {/* Barra de navegação, visualização e filtros */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 md:p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={previousPeriod}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Período anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextPeriod}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Próximo período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={goToToday}
              className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Hoje
            </button>
            <h2 className="flex-1 min-w-0 text-base md:text-xl font-semibold text-slate-900 truncate">
              {getPeriodTitle()}
            </h2>

            <div className="order-last w-full md:order-none md:w-auto flex items-center gap-2">
              <div className="flex-1 md:flex-none grid grid-cols-3 rounded-lg bg-slate-100 p-1">
                {[
                  { value: "month", label: "Mês" },
                  { value: "week", label: "Semana" },
                  { value: "day", label: "Dia" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setViewMode(option.value)}
                    className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      viewMode === option.value
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowMobileFilters((v) => !v)}
                className={`md:hidden short:inline-flex h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium ${
                  showMobileFilters || activeFilterCount ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}
              </button>
            </div>
          </div>

          <div className={`${showMobileFilters ? 'grid' : 'hidden md:grid short:hidden'} grid-cols-1 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-2 md:gap-3 mt-3 pt-3 border-t border-slate-100`}>
            <select
              className="input-field"
              value={filterProfessional}
              onChange={(e) => setFilterProfessional(e.target.value)}
              disabled={user?.user_type === 'profissional_admin' || user?.user_type === 'profissional'}
              aria-label="Profissional"
            >
              <option value="">Todos os profissionais</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              className="input-field"
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value)}
              aria-label="Sala"
            >
              <option value="">Todas as salas</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <select
              className="input-field"
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              aria-label="Serviço"
            >
              <option value="">Todos os serviços</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={() => {
                setFilterProfessional("");
                setFilterRoom("");
                setFilterService("");
              }}
              disabled={!activeFilterCount}
              className="h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <X className="w-4 h-4" />
              Limpar
            </button>
          </div>
        </div>

        {/* Grade do Calendário */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 md:p-0 md:overflow-hidden">
          {viewMode === "month" && (
            <div className="md:hidden">
              <div className="grid grid-cols-7 mb-1">
                {weekDays.map((day, index) => (
                  <div key={index} className="text-center text-[11px] font-medium text-slate-500 py-1">
                    {day.charAt(0)}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((dayObj, index) => {
                  if (!dayObj.day) return <div key={index} />;
                  const cellAppointments = getAppointmentsForDay(dayObj.date);
                  const isSelected = dayObj.date === mobileSelectedDay;
                  return (
                    <button
                      key={index}
                      onClick={() => setSelectedDay(dayObj.date)}
                      className={`h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : dayObj.isToday
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-slate-700 active:bg-slate-100'
                      }`}
                    >
                      <span className="text-sm font-medium leading-none">{dayObj.day}</span>
                      <span className="flex items-center gap-0.5 h-2">
                        {cellAppointments.slice(0, 3).map((apt, i) => (
                          <span
                            key={i}
                            className={`w-2 h-2 rounded-full ${getStatusDot(apt)} ${isSelected ? 'ring-1 ring-white' : ''}`}
                          />
                        ))}
                        {cellAppointments.length > 3 && (
                          <span className={`text-[9px] leading-none font-semibold ${isSelected ? 'text-white' : 'text-slate-500'}`}>
                            +{cellAppointments.length - 3}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-slate-900 first-letter:uppercase">
                    {mobileSelectedDay && new Date(`${mobileSelectedDay}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  <button
                    onClick={() => handleDayDoubleClick(mobileSelectedDay)}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 flex-shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    Agendar
                  </button>
                </div>
                {mobileSelectedAppointments.length > 0 ? (
                  <div className="space-y-2">
                    {mobileSelectedAppointments.map(renderMobileAppointment)}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-6">Nenhum agendamento neste dia</p>
                )}
              </div>
            </div>
          )}

          {viewMode === "month" && (
            <div className="hidden md:block">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {weekDays.map((day, index) => (
                  <div key={index} className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-slate-200">
                {monthCells.map((dayObj, index) => {
                  if (!dayObj.day) {
                    return <div key={index} className="bg-slate-50 min-h-[92px] lg:min-h-[124px]" />;
                  }
                  const cellAppointments = getAppointmentsForDay(dayObj.date);
                  const visible = cellAppointments.slice(0, MONTH_CELL_LIMIT);
                  const hidden = cellAppointments.length - visible.length;
                  return (
                    <div
                      key={index}
                      onDoubleClick={() => handleDayDoubleClick(dayObj.date)}
                      className={`group min-h-[92px] lg:min-h-[124px] p-1.5 flex flex-col ${dayObj.isToday ? 'bg-[#f5f8ff]' : 'bg-white'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <button
                          onClick={() => openDay(dayObj.date)}
                          className={`h-6 min-w-[24px] px-1.5 rounded-full text-xs font-semibold ${
                            dayObj.isToday ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                          title="Ver o dia"
                        >
                          {dayObj.day}
                        </button>
                        <button
                          onClick={() => handleDayDoubleClick(dayObj.date)}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-6 w-6 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-opacity"
                          title="Agendar neste dia"
                          aria-label="Agendar neste dia"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        {visible.map((apt, aptIndex) => (
                          <button
                            key={apt.id || aptIndex}
                            onClick={() => openAppointmentDetails(apt)}
                            title={getAppointmentTooltip(apt)}
                            className={`relative overflow-hidden w-full flex items-center gap-1.5 rounded pl-2 pr-1.5 py-0.5 text-left text-xs hover:bg-slate-100 ${
                              apt.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-800'
                            }`}
                          >
                            <span className={`absolute inset-0 opacity-[0.12] ${getProfessionalColor(apt.professional_id)}`} />
                            <span className={`absolute inset-y-0 left-0 w-[3px] ${getProfessionalColor(apt.professional_id)}`} />
                            <span className={`relative w-2 h-2 rounded-full flex-shrink-0 ${getStatusDot(apt)}`} />
                            <span className="relative font-semibold tabular-nums flex-shrink-0">{apt.appointment_time}</span>
                            <span className="relative truncate">{getProfessionalName(apt.professional_id)}</span>
                          </button>
                        ))}
                        {hidden > 0 && (
                          <button
                            onClick={() => openDay(dayObj.date)}
                            className="px-1.5 text-xs font-medium text-slate-500 hover:text-blue-600"
                          >
                            +{hidden} mais
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === "week" && (
            <div className="md:hidden divide-y divide-slate-200">
              {getWeekDays().map((dayObj, index) => {
                const cellAppointments = getAppointmentsForDay(dayObj.date);
                return (
                  <div key={index} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`flex items-baseline gap-2 ${dayObj.isToday ? 'text-blue-600' : 'text-slate-900'}`}>
                        <span className="text-lg font-semibold">{dayObj.day}</span>
                        <span className="text-sm font-medium">{dayObj.dayName}</span>
                        {dayObj.isToday && <span className="text-xs font-medium">· Hoje</span>}
                      </div>
                      <button
                        onClick={() => handleDayDoubleClick(dayObj.date)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md"
                        aria-label="Agendar neste dia"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {cellAppointments.length > 0 ? (
                      <div className="space-y-2">{cellAppointments.map(renderMobileAppointment)}</div>
                    ) : (
                      <p className="text-xs text-slate-400">Sem agendamentos</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === "week" && (
            <div className="hidden md:grid grid-cols-7 gap-px bg-slate-200">
              {getWeekDays().map((dayObj, index) => {
                const cellAppointments = getAppointmentsForDay(dayObj.date);
                return (
                  <div
                    key={index}
                    onDoubleClick={() => handleDayDoubleClick(dayObj.date)}
                    className={`group flex flex-col min-h-[320px] lg:min-h-[440px] ${dayObj.isToday ? 'bg-[#f5f8ff]' : 'bg-white'}`}
                  >
                    <div className="px-2 py-2 border-b border-slate-100 flex flex-col items-center">
                      <span className={`text-xs font-medium uppercase tracking-wide ${dayObj.isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                        {dayObj.dayName}
                      </span>
                      <button
                        onClick={() => openDay(dayObj.date)}
                        className={`mt-0.5 h-8 w-8 inline-flex items-center justify-center rounded-full text-base font-semibold ${
                          dayObj.isToday ? 'bg-blue-600 text-white' : 'text-slate-900 hover:bg-slate-100'
                        }`}
                        title="Ver o dia"
                      >
                        {dayObj.day}
                      </button>
                    </div>
                    <div className="flex-1 p-1.5 space-y-1.5 min-w-0">
                      {cellAppointments.map((apt, aptIndex) => (
                        <button
                          key={apt.id || aptIndex}
                          onClick={() => openAppointmentDetails(apt)}
                          title={getAppointmentTooltip(apt)}
                          className="relative overflow-hidden w-full flex gap-2 text-left rounded-md border border-slate-200 bg-white p-2 hover:border-slate-300 hover:shadow-sm transition"
                        >
                          <span className={`absolute inset-0 opacity-[0.08] ${getProfessionalColor(apt.professional_id)}`} />
                          <span className={`relative w-1.5 self-stretch rounded-full flex-shrink-0 ${getProfessionalColor(apt.professional_id)}`} />
                          <span className="relative min-w-0">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 tabular-nums">
                              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getStatusDot(apt)}`} />
                              {apt.appointment_time}
                            </span>
                            <span className={`block text-xs truncate ${apt.status === 'cancelled' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                              {getPatientName(apt.patient_id)}
                            </span>
                            <span className="block text-[11px] text-slate-500 truncate">{getProfessionalName(apt.professional_id)}</span>
                          </span>
                        </button>
                      ))}
                      <button
                        onClick={() => handleDayDoubleClick(dayObj.date)}
                        className="w-full opacity-0 group-hover:opacity-100 focus:opacity-100 py-1 inline-flex items-center justify-center gap-1 rounded-md text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-opacity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Agendar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === "day" && (
            <>
              <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:px-4 md:py-3 md:border-b md:border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 first-letter:uppercase">
                  {currentDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                  <span className="ml-2 font-normal text-slate-500">
                    {dayAppointments.length} {dayAppointments.length === 1 ? 'agendamento' : 'agendamentos'}
                  </span>
                </h3>
                <button
                  onClick={() => handleDayDoubleClick(toYMD(currentDate))}
                  className="flex items-center gap-1 text-xs md:text-sm font-medium text-blue-600 hover:text-blue-700 flex-shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Agendar
                </button>
              </div>
              {dayAppointments.length > 0 ? (
                <>
                  <div className="md:hidden space-y-2">{dayAppointments.map(renderMobileAppointment)}</div>
                  <div className="hidden md:block divide-y divide-slate-100">{dayAppointments.map(renderDayRow)}</div>
                </>
              ) : (
                <p className="text-sm text-slate-500 text-center py-12">Nenhum agendamento para este dia</p>
              )}
            </>
          )}
        </div>

        {/* Legenda */}
        <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col gap-3 md:flex-row md:items-start md:gap-8">
          <div className="min-w-0">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
              Profissionais <span className="normal-case tracking-normal text-slate-400">· cor da barra</span>
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {professionals.map((prof, index) => (
                <div key={prof.id} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm ${prof.color || professionalColors[index % professionalColors.length]}`} />
                  <span className="text-sm text-slate-700">{prof.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="md:ml-auto md:border-l md:border-slate-200 md:pl-8 flex-shrink-0">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
              Status <span className="normal-case tracking-normal text-slate-400">· cor da bolinha</span>
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {Object.values(STATUS_META).map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full ${item.dot}`} />
                  <span className="text-sm text-slate-700">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal de Detalhes do Agendamento */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="rounded-2xl shadow-2xl border-0 max-h-[90vh] overflow-hidden flex flex-col p-6">
            <DialogHeader className="flex-shrink-0 pr-8">
              <DialogTitle>Detalhes do Agendamento</DialogTitle>
            </DialogHeader>
            {selectedAppointment && (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 [scrollbar-gutter:stable] space-y-4">
                  <div>
                    <Label className="text-gray-600">Status</Label>
                    <div className="mt-1">
                      <Select
                        value={selectedAppointment.status || 'scheduled'}
                        onValueChange={(value) => updateAppointmentStatus(selectedAppointment.id, value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                        <SelectContent className="z-[100]">
                          <SelectItem value="scheduled">Agendado</SelectItem>
                          <SelectItem value="waiting">Em espera</SelectItem>
                          <SelectItem value="in_progress">Em andamento</SelectItem>
                          <SelectItem value="completed">Concluído</SelectItem>
                          <SelectItem value="cancelled">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-600 block mb-1">Paciente</Label>
                    <button
                      type="button"
                      onClick={() => openPatientDialog(selectedAppointment.patient_id)}
                      className="text-2xl font-bold text-blue-600 hover:text-blue-800 text-left transition-colors"
                    >
                      {getPatientName(selectedAppointment.patient_id)}
                    </button>
                  </div>
                  <div>
                    <Label className="text-gray-600">Profissional</Label>
                    <p className="font-semibold">{getProfessionalName(selectedAppointment.professional_id)}</p>
                  </div>
                  <div>
                    <Label className="text-gray-600">Serviço(s)</Label>
                    {Array.isArray(selectedAppointment.service_names) && selectedAppointment.service_names.length > 0 ? (
                      <ul className="list-disc list-inside font-semibold">
                        {selectedAppointment.service_names.map((name, i) => (
                          <li key={i}>{name}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="font-semibold">{getServiceName(selectedAppointment.service_id)}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-gray-600">Sala</Label>
                    <p className="font-semibold">{getRoomName(selectedAppointment.room_id)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-600">Data</Label>
                      <p className="font-semibold">
                        {new Date(selectedAppointment.appointment_date + 'T00:00:00').toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
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
                    <Label className="text-gray-600">Autorização uso de imagem e voz</Label>
                    <p className="text-sm font-semibold">
                      {selectedAppointment.image_voice_consent ? "Sim" : "Não informado"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 pt-4 border-t flex-shrink-0">
                  <Button
                    onClick={() => handleEditAppointment(selectedAppointment)}
                    className="btn-primary"
                  >
                    Editar Agendamento
                  </Button>
                  <Button
                    onClick={() => handleDeleteAppointment(selectedAppointment)}
                    variant="destructive"
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    Deletar
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Novo Agendamento */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col p-6">
            <DialogHeader className="flex-shrink-0 pr-8">
              <DialogTitle>{editingAppointment ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-5 [scrollbar-gutter:stable] space-y-4">
              {editingAppointment && (
                <div>
                  <Label>Status</Label>
                  <Select
                    value={formData.status || "scheduled"}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="input-field w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="scheduled">Agendado</SelectItem>
                      <SelectItem value="waiting">Em espera</SelectItem>
                      <SelectItem value="in_progress">Em andamento</SelectItem>
                      <SelectItem value="completed">Concluído</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Paciente *</Label>
                  <PatientCombobox
                    patients={patients}
                    value={formData.patient_id}
                    onChange={(patientId) => {
                      const p = patients.find((x) => String(x.id) === String(patientId));
                      setFormData({
                        ...formData,
                        patient_id: patientId,
                        patient_profession: p?.profession ?? "",
                        patient_address: p?.address ?? "",
                        patient_city: p?.city ?? ""
                      });
                    }}
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
                  <Label>Serviços</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between input-field min-h-[40px] font-normal"
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
                                onSelect={() => toggleServiceForForm(s.id)}
                                className="bg-white hover:bg-gray-100 cursor-pointer"
                              >
                                {(formData.service_ids || []).includes(s.id) ? "✓ " : ""}{s.name}
                              </CommandItem>
                            ))}
                          </CommandList>
                        </div>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {(formData.service_ids || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(formData.service_ids || []).map((id) => {
                        const s = services.find((x) => x.id === id);
                        return s ? (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-200 text-sm"
                          >
                            {s.name}
                            <button
                              type="button"
                              onClick={() => toggleServiceForForm(id)}
                              className="hover:bg-gray-300 rounded p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <Label>Profissão</Label>
                  <Input
                    value={formData.patient_profession}
                    onChange={(e) => setFormData({...formData, patient_profession: e.target.value})}
                    placeholder="Profissão do paciente"
                  />
                </div>
                <div>
                  <Label>Endereço</Label>
                  <Input
                    value={formData.patient_address}
                    onChange={(e) => setFormData({...formData, patient_address: e.target.value})}
                    placeholder="Endereço do paciente"
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input
                    value={formData.patient_city}
                    onChange={(e) => setFormData({...formData, patient_city: e.target.value})}
                    placeholder="Cidade do paciente"
                  />
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
                              • {conflict.time}{conflict.time_end ? ` - ${conflict.time_end}` : ''} - Sala: {conflict.room_name}{conflict.patient_name ? ` - Paciente: ${conflict.patient_name}` : ""}
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
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="image_voice_consent"
                  checked={!!formData.image_voice_consent}
                  onChange={(e) => setFormData({...formData, image_voice_consent: e.target.checked})}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="image_voice_consent" className="text-sm font-normal cursor-pointer text-gray-700">
                  Autorizo o uso da minha imagem e voz para fins institucionais e de comunicação da instituição.
                </Label>
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingAppointment ? "Salvar Alterações" : "Agendar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal de Novo Paciente */}
        <Dialog open={showNewPatientDialog} onOpenChange={setShowNewPatientDialog}>
          <DialogContent className="max-w-lg rounded-2xl">
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
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newPatientData.email}
                    onChange={(e) => setNewPatientData({...newPatientData, email: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={newPatientData.phone}
                    onChange={(e) => setNewPatientData({...newPatientData, phone: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <Input
                  type="date"
                  value={newPatientData.birthdate}
                  onChange={(e) => setNewPatientData({...newPatientData, birthdate: e.target.value})}
                />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input
                  value={newPatientData.address}
                  onChange={(e) => setNewPatientData({...newPatientData, address: e.target.value})}
                  placeholder="Rua, Número, Bairro, Estado"
                />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input
                  value={newPatientData.city}
                  onChange={(e) => setNewPatientData({...newPatientData, city: e.target.value})}
                  placeholder="Cidade"
                />
              </div>
              <div>
                <Label>Profissão</Label>
                <Input
                  value={newPatientData.profession}
                  onChange={(e) => setNewPatientData({...newPatientData, profession: e.target.value})}
                  placeholder="Profissão"
                />
              </div>
              <Button type="submit" className="w-full btn-primary">Adicionar Paciente</Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
          <DialogContent className="rounded-2xl">
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

        <PatientDetailDialog
          patient={selectedPatientForDialog}
          isOpen={showPatientDialog}
          onClose={() => setShowPatientDialog(false)}
          onUpdate={handlePatientUpdate}
        />
      </div>
    </Layout>
  );
}
