import React, { useState, useEffect, useRef } from "react";
import api from "../services/api";
import OdontogramSelector from "./OdontogramSelector";
import FaceHarmonizationSelector, { faceRegions } from "./FaceHarmonizationSelector";
import { 
  FileText, Paperclip, Stethoscope, Activity, 
  X, Upload, Trash2, Plus, Minus, Edit, Save, AlertCircle,
  Download, CheckCircle, Clock, MessageSquare, DollarSign,
  Folder, FolderOpen, Calculator, Check, ChevronsUpDown
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDate } from "../utils/dateUtils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PatientDetailDialog({ patient, isOpen, onClose, onUpdate }) {
  const [activeTab, setActiveTab] = useState("info");
  const [detailedPatient, setDetailedPatient] = useState(patient);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [allProfessionals, setAllProfessionals] = useState([]);
  const [services, setServices] = useState([]);
  const [debts, setDebts] = useState({ total_debt: 0, unpaid_appointments: [] });
  const [appointmentsList, setAppointmentsList] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transactionForm, setTransactionForm] = useState({
    amount: "",
    payment_method: "cash",
    description: "",
    transaction_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    status: "paid",
    appointment_id: ""
  });
  const [openServiceCombobox, setOpenServiceCombobox] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  
  // Anamnese state
  const [anamnese, setAnamnese] = useState({
    chronic_diseases: "",
    allergies_medical: "",
    current_medications: "",
    surgery_history: "",
    mental_health: "",
    previous_treatments: "",
    prosthetics: "",
    implants: "",
    pain_history: "",
    periodontal_issues: "",
    facial_surgeries: "",
    oral_hygiene_products: "",
    medication_allergies: "",
    material_allergies: "",
    substance_allergies: ""
  });

  // Treatment form state
  const [showTreatmentDialog, setShowTreatmentDialog] = useState(false);
  const [treatmentForm, setTreatmentForm] = useState({
    name: "",
    start_date: new Date().toISOString().split('T')[0],
    description: "",
    prescribed_medications: "",
    frequency: "",
    estimated_duration: "",
    professional_id: "",
    status: "ongoing",
    selected_teeth: [],
    face_regions: []
  });
  const [treatmentView, setTreatmentView] = useState("teeth"); // teeth or face
  const [showDeleteTreatmentDialog, setShowDeleteTreatmentDialog] = useState(false);
  const [treatmentToDelete, setTreatmentToDelete] = useState(null);
  const [showDeleteAttachmentDialog, setShowDeleteAttachmentDialog] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState(null);
  const [attachmentPreviews, setAttachmentPreviews] = useState({});
  const [attachmentFullPreviews, setAttachmentFullPreviews] = useState({});
  const itemRefs = useRef(new Map());
  const ioRef = useRef(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [imagePreviewTitle, setImagePreviewTitle] = useState("");
  const [imagePreviewTemp, setImagePreviewTemp] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageScale, setImageScale] = useState(1);
  const [imagePos, setImagePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [attachmentFolders, setAttachmentFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState('ALL');

  // Medical Record form state
  const [showMedicalRecordDialog, setShowMedicalRecordDialog] = useState(false);
  const [showDeleteRecordDialog, setShowDeleteRecordDialog] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editingTreatment, setEditingTreatment] = useState(null);
  const [medicalRecordForm, setMedicalRecordForm] = useState({
    record_type: "prontuario",
    diagnosis: "",
    symptoms: "",
    treatment: "",
    medications: "",
    observations: "",
    doctor_name: "",
    professional_council_type: "CRM",
    professional_registration: "",
    crm: "",  // Mantido para compatibilidade
    template_used: ""
  });

  // Budget state
  const [budgets, setBudgets] = useState([]);
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    description: "",
    date: new Date().toISOString().split('T')[0],
    treatments: [],
    total_value: "",
    professional_id: "",
    observations: ""
  });
  const [editingBudget, setEditingBudget] = useState(null);
  const [showDeleteBudgetDialog, setShowDeleteBudgetDialog] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState(null);

  useEffect(() => {
    if (isOpen && patient) {
      setDetailedPatient(patient);
      loadPatientData(patient.id);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollPosition;
    }
  }, [detailedPatient]);

  useEffect(() => {
    const fetchTabData = async () => {
      if (!isOpen || !detailedPatient) return;
      try {
        if (activeTab === 'revenue' && transactions.length === 0) {
          const res = await api.get(`/transactions`, { params: { patient_id: detailedPatient.id, sort_by: 'created_at', order: 'desc', limit: 100 } });
          setTransactions(res.data || []);
          if (appointmentsList.length === 0) {
            const appts = await api.get(`/appointments`, { params: { patient_id: detailedPatient.id, sort_by: 'appointment_date', order: 'desc', limit: 200 } });
            setAppointmentsList(appts.data || []);
          }
        }
        if (activeTab === 'records' && medicalRecords.length === 0) {
          const res = await api.get(`/medical-records`, { params: { patient_id: detailedPatient.id, sort_by: 'created_at', order: 'desc', limit: 100 } });
          setMedicalRecords(res.data || []);
        }
        if (activeTab === 'treatments') {
          if (allProfessionals.length === 0) {
            const profsRes = await api.get(`/professionals`);
            const allClinicProfessionals = profsRes.data || [];
            setProfessionals(allClinicProfessionals);
            setAllProfessionals(allClinicProfessionals);
          }
          if (services.length === 0) {
            const sRes = await api.get('/services');
            setServices(sRes.data || []);
          }
        }
        if (activeTab === 'budgets') {
          const res = await api.get(`/patients/${detailedPatient.id}/budgets`);
          setBudgets(res.data || []);
          
          if (services.length === 0) {
            const sRes = await api.get('/services');
            setServices(sRes.data || []);
          }
          if (allProfessionals.length === 0) {
            const profsRes = await api.get(`/professionals`);
            setAllProfessionals(profsRes.data || []);
            setProfessionals(profsRes.data || []);
          }
        }
      } catch (e) {}
    };
    fetchTabData();
  }, [activeTab, isOpen, detailedPatient]);

  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      // Reset all states when dialog is closed for data integrity
      setDetailedPatient(null);
      setActiveTab('info');
      setMedicalRecords([]);
      setProfessionals([]);
      setDebts({ total_debt: 0, unpaid_appointments: [] });
      setAnamnese({
        chronic_diseases: "",
        allergies_medical: "",
        current_medications: "",
        surgery_history: "",
        mental_health: "",
        previous_treatments: "",
        prosthetics: "",
        implants: "",
        pain_history: "",
        periodontal_issues: "",
        facial_surgeries: "",
        oral_hygiene_products: "",
        medication_allergies: "",
        material_allergies: "",
        substance_allergies: ""
      });
    }
    onClose();
  };

  const handleTreatmentDialogOpenChange = (isOpen) => {
    if (!isOpen) {
      setEditingTreatment(null);
      setTreatmentForm({
        name: "",
        start_date: new Date().toISOString().split('T')[0],
        description: "",
        prescribed_medications: "",
        frequency: "",
        estimated_duration: "",
        professional_id: "",
        status: "ongoing",
        selected_teeth: [],
        face_regions: []
      });
      setTreatmentView("teeth");
    }
    setShowTreatmentDialog(isOpen);
  };

  const loadPatientData = async (patientId) => {
    if (!patientId) return;

    if (scrollRef.current) {
      setScrollPosition(scrollRef.current.scrollTop);
    }

    try {
      setLoading(true);

      const noCacheConfig = {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      };

      const [patientRes, debtsRes] = await Promise.all([
        api.get(`/patients/${patientId}`, noCacheConfig),
        api.get(`/patients/${patientId}/debts`, noCacheConfig)
      ]);

      setDetailedPatient(patientRes.data);
      setAttachmentFolders(patientRes.data.attachment_folders || []);
      setMedicalRecords([]);
      
      // Carregamentos pesados movidos para lazy-load por aba
      setAppointmentsList([]);
      setProfessionals([]);
      setAllProfessionals([]);
      setServices([]);
      setDebts(debtsRes.data);
      setTransactions([]);

      if (patientRes.data.anamnese) {
        setAnamnese(patientRes.data.anamnese);
      } else {
        // Limpa o estado da anamnese se o paciente não tiver uma
        setAnamnese({
          chronic_diseases: "",
          allergies_medical: "",
          current_medications: "",
          surgery_history: "",
          mental_health: "",
          previous_treatments: "",
          prosthetics: "",
          implants: "",
          pain_history: "",
          periodontal_issues: "",
          facial_surgeries: "",
          oral_hygiene_products: "",
          medication_allergies: "",
          material_allergies: "",
          substance_allergies: ""
        });
      }
      return patientRes.data; // Retorna os dados do paciente atualizado
    } catch (error) {
      console.error("Error loading patient data:", error);
      toast.error("Erro ao carregar dados do paciente");
    } finally {
      setLoading(false);
    }
  };

  const handleEditTreatment = (treatment) => {
    setEditingTreatment(treatment);
    setTreatmentForm({
      name: treatment.name || "",
      start_date: treatment.start_date || new Date().toISOString().split('T')[0],
      description: treatment.description || "",
      prescribed_medications: treatment.prescribed_medications || "",
      frequency: treatment.frequency || "",
      estimated_duration: treatment.estimated_duration || "",
      professional_id: treatment.professional_id || "",
      status: treatment.status || "ongoing",
      service_id: treatment.service_id || "",
      selected_teeth: treatment.selected_teeth || [],
      face_regions: treatment.face_regions || []
    });
    setTreatmentView((treatment.face_regions && treatment.face_regions.length > 0) ? "face" : "teeth");
    setShowTreatmentDialog(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande! Tamanho máximo: 10MB");
      return;
    }

    const originalToast = toast.loading("Enviando arquivo...");

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result.split(',')[1];
        
        const attachment = {
          filename: file.name,
          file_data: base64,
          file_type: file.type,
          size_bytes: file.size
        };

        await api.post(`/patients/${detailedPatient.id}/attachments`, attachment);
        toast.success("Arquivo anexado com sucesso!", { id: originalToast });
        
        // Reload data inside modal and refresh parent list
        const updatedPatient = await loadPatientData(patient.id);
        onUpdate(updatedPatient);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao anexar arquivo:", error);
      const errorMessage = error.response?.data?.detail || "Falha no upload. Tente novamente.";
      toast.error(errorMessage, { id: originalToast });
    }
  };

        useEffect(() => {
            const prefetchPreviewFor = async (attId) => {
                if (attachmentPreviews[attId]) return;
                try {
                    const res = await api.get(`/patients/${detailedPatient.id}/attachments/${attId}/download`, { params: { preview: true, format: 'webp' }, responseType: 'blob' });
                    const url = URL.createObjectURL(res.data);
                    setAttachmentPreviews((prev) => (prev[attId] ? prev : { ...prev, [attId]: url }));
                } catch {}
            };
            const prefetchModalFor = async (attId) => {
                if (attachmentFullPreviews[attId]) return;
                try {
                    const res = await api.get(`/patients/${detailedPatient.id}/attachments/${attId}/download`, { params: { modal: true, format: 'webp' }, responseType: 'blob' });
                    const url = URL.createObjectURL(res.data);
                    setAttachmentFullPreviews((prev) => (prev[attId] ? prev : { ...prev, [attId]: url }));
                } catch {}
            };
            if (activeTab !== 'attachments') return;
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.getAttribute('data-att-id');
                        if (id) {
                            prefetchPreviewFor(id);
                            prefetchModalFor(id);
                        }
                        observer.unobserve(entry.target);
                    }
                });
            }, { root: scrollRef.current, rootMargin: '200px', threshold: 0.1 });
            itemRefs.current.forEach((el) => { if (el) observer.observe(el); });
            ioRef.current = observer;
            return () => { try { observer.disconnect(); } catch {} };
        }, [activeTab, detailedPatient?.attachments, detailedPatient?.id]);

  useEffect(() => {
    if (!isOpen) {
      Object.values(attachmentPreviews).forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      setAttachmentPreviews({});
      Object.values(attachmentFullPreviews).forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      setAttachmentFullPreviews({});
      itemRefs.current.clear();
    }
  }, [isOpen]);

  useEffect(() => {
    const ids = new Set(detailedPatient?.attachments?.map((a) => a.id) || []);
    Object.entries(attachmentPreviews).forEach(([id, url]) => {
      if (!ids.has(id)) {
        try { URL.revokeObjectURL(url); } catch {}
        setAttachmentPreviews((p) => {
          const { [id]: _, ...rest } = p;
          return rest;
        });
      }
    });
    Object.entries(attachmentFullPreviews).forEach(([id, url]) => {
      if (!ids.has(id)) {
        try { URL.revokeObjectURL(url); } catch {}
        setAttachmentFullPreviews((p) => {
          const { [id]: _, ...rest } = p;
          return rest;
        });
      }
    });
  }, [detailedPatient?.attachments]);

  const handleDeleteAttachment = async (attachmentId) => {
    try {
      await api.delete(`/patients/${detailedPatient.id}/attachments/${attachmentId}`);
      toast.success("Anexo removido!");
      const updatedPatient = await loadPatientData(patient.id);
      onUpdate(updatedPatient);
    } catch (error) {
      toast.error("Erro ao remover anexo");
    }
  };

  const handleCreateFolder = async () => {
    const name = window.prompt("Nome da pasta");
    if (!name) return;
    try {
      const res = await api.post(`/patients/${detailedPatient.id}/attachment-folders`, { name });
      const updated = await loadPatientData(detailedPatient.id);
      onUpdate(updated);
      setAttachmentFolders((prev) => [...prev, res.data]);
    } catch (e) {
      toast.error("Erro ao criar pasta");
    }
  };

  const handleDropToFolder = async (folderId, e) => {
    e.preventDefault();
    const attachmentId = e.dataTransfer.getData('text/plain');
    if (!attachmentId) return;
    try {
      await api.put(`/patients/${detailedPatient.id}/attachments/${attachmentId}/move`, { folder_id: folderId });
      const updated = await loadPatientData(detailedPatient.id);
      onUpdate(updated);
      setSelectedFolderId(folderId);
    } catch (err) {
      toast.error("Erro ao mover anexo");
    }
  };

  const handleDropToUnassigned = async (e) => {
    e.preventDefault();
    const attachmentId = e.dataTransfer.getData('text/plain');
    if (!attachmentId) return;
    try {
      await api.put(`/patients/${detailedPatient.id}/attachments/${attachmentId}/move`, { folder_id: null });
      const updated = await loadPatientData(detailedPatient.id);
      onUpdate(updated);
      setSelectedFolderId(null);
    } catch (err) {
      toast.error("Erro ao mover anexo");
    }
  };

  const refreshPreview = async (id) => {
    const att = detailedPatient?.attachments?.find((a) => a.id === id);
    if (!att || !(att.file_type && att.file_type.startsWith('image/'))) return;
    try {
      const res = await api.get(`/patients/${detailedPatient.id}/attachments/${att.id}/download`, { params: { preview: true }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const prev = attachmentPreviews[id];
      if (prev) {
        try { URL.revokeObjectURL(prev); } catch {}
      }
      setAttachmentPreviews((p) => ({ ...p, [id]: url }));
    } catch (err) {}
  };

  const handleOpenImage = async (att) => {
    if (!(att.file_type && att.file_type.startsWith('image/'))) return;
    const fullCached = attachmentFullPreviews[att.id] || null;
    const previewUrl = attachmentPreviews[att.id] || null;
    const initialUrl = fullCached || previewUrl || null;
    setImagePreviewTitle(att.filename);
    setImageScale(1);
    setImagePos({ x: 0, y: 0 });
    setImagePreviewOpen(true);
    if (initialUrl) {
      setImagePreviewUrl(initialUrl);
      setImagePreviewTemp(false);
    }
    // Busque em paralelo a versão otimizada para o lightbox
    try {
      setImageLoading(true);
      if (!fullCached) {
        const res = await api.get(`/patients/${detailedPatient.id}/attachments/${att.id}/download`, { params: { modal: true, format: 'webp' }, responseType: 'blob' });
        const fullUrl = URL.createObjectURL(res.data);
        setAttachmentFullPreviews((prev) => (prev[att.id] ? prev : { ...prev, [att.id]: fullUrl }));
        setImagePreviewUrl(fullUrl);
        setImagePreviewTemp(false);
      }
    } catch (err) {
      // Se falhar, mantenha o preview da grade
    } finally {
      setImageLoading(false);
    }
  };

  const handleCloseImage = () => {
    if (imagePreviewUrl && imagePreviewTemp) {
      try { URL.revokeObjectURL(imagePreviewUrl); } catch {}
    }
    setImagePreviewUrl(null);
    setImagePreviewOpen(false);
    setImagePreviewTemp(false);
    setImageScale(1);
    setImagePos({ x: 0, y: 0 });
  };

  const handleWheelZoom = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setImageScale((s) => Math.min(5, Math.max(1, s + delta)));
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - imagePos.x, y: e.clientY - imagePos.y };
  };
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setImagePos({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
  };
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    setIsDragging(true);
    dragStartRef.current = { x: t.clientX - imagePos.x, y: t.clientY - imagePos.y };
  };
  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const t = e.touches[0];
    setImagePos({ x: t.clientX - dragStartRef.current.x, y: t.clientY - dragStartRef.current.y });
  };
  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleDownloadAttachment = async (attachment) => {
    try {
      const response = await api.get(`/patients/${detailedPatient.id}/attachments/${attachment.id}/download`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = attachment.filename;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error('Erro ao baixar o anexo.');
    }
  };

  const handleSaveAnamnese = async () => {
    try {
      await api.put(`/patients/${patient.id}/anamnese`, anamnese);
      toast.success("Anamnese salva com sucesso!");
      const updatedPatient = await loadPatientData(patient.id);
      onUpdate(updatedPatient);
    } catch (error) {
      toast.error("Erro ao salvar anamnese");
    }
  };

  const handleCreateBudget = async (e) => {
    e.preventDefault();
    try {
      if (editingBudget) {
        await api.put(`/budgets/${editingBudget.id}`, {
          ...budgetForm,
          patient_id: detailedPatient.id
        });
        toast.success("Orçamento atualizado com sucesso!");
      } else {
        await api.post('/budgets', {
          ...budgetForm,
          patient_id: detailedPatient.id
        });
        toast.success("Orçamento criado com sucesso!");
      }
      
      setShowBudgetDialog(false);
      setEditingBudget(null);
      setBudgetForm({
        description: "",
        date: new Date().toISOString().split('T')[0],
        treatments: [],
        total_value: "",
        professional_id: "",
        observations: ""
      });
      // Refresh budgets
      const res = await api.get(`/patients/${detailedPatient.id}/budgets`);
      setBudgets(res.data || []);
    } catch (error) {
      toast.error(editingBudget ? "Erro ao atualizar orçamento" : "Erro ao criar orçamento");
    }
  };

  const handleEditBudget = (budget) => {
    setEditingBudget(budget);
    
    // Convert string treatments to objects
    const treatments = (budget.treatments || []).map(t => {
      if (typeof t === 'string') return { name: t, value: 0, teeth: [] };
      return { ...t, teeth: t.teeth || [] };
    });

    setBudgetForm({
      description: budget.description || "",
      date: budget.date || new Date().toISOString().split('T')[0],
      treatments: treatments,
      total_value: budget.total_value || "",
      professional_id: budget.professional_id || "",
      observations: budget.observations || ""
    });
    setShowBudgetDialog(true);
  };

  const handleDeleteBudget = (budget) => {
    setBudgetToDelete(budget);
    setShowDeleteBudgetDialog(true);
  };

  const confirmDeleteBudget = async () => {
    if (!budgetToDelete) return;
    try {
      await api.delete(`/budgets/${budgetToDelete.id}`);
      toast.success("Orçamento excluído com sucesso!");
      setShowDeleteBudgetDialog(false);
      setBudgetToDelete(null);
      // Refresh budgets
      const res = await api.get(`/patients/${detailedPatient.id}/budgets`);
      setBudgets(res.data || []);
    } catch (error) {
      toast.error("Erro ao excluir orçamento");
    }
  };

  const handleDownloadBudgetPDF = async (budget) => {
    try {
      const response = await api.get(`/budgets/${budget.id}/pdf`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `Orcamento_${detailedPatient.name}_${budget.date}.pdf`;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error('Erro ao baixar PDF do orçamento.');
    }
  };

  const handleDateChange = (e) => {
    const { value } = e.target;
    setTreatmentForm({ ...treatmentForm, start_date: value });

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value)) {
      toast.error("Formato de data inválido. Use AAAA-MM-DD.");
    }
  };

  const handleAddTreatment = async () => {
    if (!treatmentForm.name || !treatmentForm.start_date || !treatmentForm.service_id) {
      toast.error("Preencha todos os campos obrigatórios: Serviço, Nome e Data de Início.");
      return;
    }

    try {
      setShowTreatmentDialog(false);
      const payload = {
        ...treatmentForm,
        professional_id: (treatmentForm.professional_id || "").trim() || undefined,
      };
      const { data: newTreatment } = await api.post(`/patients/${detailedPatient.id}/treatments`, payload);
      toast.success("Tratamento adicionado!");
      setTreatmentForm({
        name: "",
        start_date: new Date().toISOString().split('T')[0],
        description: "",
        prescribed_medications: "",
        frequency: "",
        estimated_duration: "",
        professional_id: "",
        status: "ongoing",
        service_id: "",
        selected_teeth: [],
        face_regions: []
      });
      setTreatmentView("teeth");
      setDetailedPatient(prev => ({
        ...prev,
        treatments: [...(prev?.treatments || []), newTreatment]
      }));
    } catch (error) {
      console.error("Erro ao adicionar tratamento:", error);
      toast.error("Erro ao adicionar tratamento");
    }
  };

  const handleUpdateTreatment = async () => {
    if (!treatmentForm.name || !treatmentForm.start_date || !treatmentForm.service_id) {
      toast.error("Preencha todos os campos obrigatórios: Serviço, Nome e Data de Início.");
      return;
    }

    try {
      setShowTreatmentDialog(false);
      const payload = {
        ...treatmentForm,
        professional_id: (treatmentForm.professional_id || "").trim() || undefined,
      };
      const { data: updatedTreatment } = await api.put(`/patients/${detailedPatient.id}/treatments/${editingTreatment.id}`, payload);
      toast.success("Tratamento atualizado com sucesso!");
      setEditingTreatment(null);
      setDetailedPatient(prev => ({
        ...prev,
        treatments: (prev?.treatments || []).map(t => t.id === updatedTreatment.id ? updatedTreatment : t)
      }));
    } catch (error) {
      toast.error("Erro ao atualizar tratamento");
    }
  };

  const handleDeleteTreatment = (treatmentId) => {
    setTreatmentToDelete(treatmentId);
    setShowDeleteTreatmentDialog(true);
  };

  const confirmDeleteTreatment = async () => {
    if (!treatmentToDelete) return;
    try {
      await api.delete(`/patients/${detailedPatient.id}/treatments/${treatmentToDelete}`);
      toast.success("Tratamento removido!");
      setShowDeleteTreatmentDialog(false);
      setTreatmentToDelete(null);
      setDetailedPatient(prev => ({
        ...prev,
        treatments: (prev?.treatments || []).filter(t => t.id !== treatmentToDelete)
      }));
    } catch (error) {
      toast.error("Erro ao remover tratamento");
    }
  };



  const handleAddMedicalRecord = async (sendWhatsApp = false) => {
    try {
      let recordId;
      
      if (editingRecord) {
        const response = await api.put(`/medical-records/${editingRecord.id}`, medicalRecordForm);
        recordId = editingRecord.id;
        toast.success("Documento atualizado com sucesso!");
      } else {
        const payload = { ...medicalRecordForm, patient_id: detailedPatient.id };
        const response = await api.post("/medical-records", payload);
        recordId = response.data.id;
        toast.success("Documento criado com sucesso!");
      }

      if (sendWhatsApp && detailedPatient.phone) {
        try {
          await api.post("/medical-records/send-whatsapp", {
            record_id: recordId,
            patient_phone: detailedPatient.phone,
            patient_name: detailedPatient.name
          });
          toast.success("Documento enviado via WhatsApp!");
        } catch (error) {
          const errorMessage = error.response?.data?.detail || "Erro ao enviar via WhatsApp. O documento foi salvo, mas o envio falhou.";
          toast.error(errorMessage);
        }
      }

      setShowMedicalRecordDialog(false);
      setEditingRecord(null);
      setMedicalRecordForm({
        record_type: "prontuario",
        diagnosis: "",
        symptoms: "",
        treatment: "",
        medications: "",
        observations: "",
        doctor_name: "",
        professional_council_type: "CRM",
        professional_registration: "",
        crm: "",
        template_used: ""
      });
      const updated = await loadPatientData(detailedPatient.id);
      onUpdate(updated);
    } catch (error) {
      const errorMessage = error.response?.data?.detail || (editingRecord ? "Erro ao atualizar documento" : "Erro ao criar documento");
      toast.error(errorMessage);
    }
  };
  
  const handleEditRecord = (record) => {
    setEditingRecord(record);
    setMedicalRecordForm({
      record_type: record.record_type || "prontuario",
      diagnosis: record.diagnosis || "",
      symptoms: record.symptoms || "",
      treatment: record.treatment || "",
      medications: record.medications || "",
      observations: record.observations || "",
      doctor_name: record.doctor_name || "",
      professional_council_type: record.professional_council_type || "CRM",
      professional_registration: record.professional_registration || record.crm || "",
      crm: record.crm || "",
      template_used: record.template_used || ""
    });
    setShowMedicalRecordDialog(true);
  };
  
  const handleDownloadPDF = async (record) => {
    try {
      const response = await api.post("/medical-records/generate-pdf", {
        record_id: record.id,
        patient_name: detailedPatient.name
      }, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `documento_${detailedPatient.name}_${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success("PDF baixado com sucesso!");
    } catch (error) {
      toast.error("Erro ao baixar PDF");
    }
  };
  
  const handleDeleteRecord = (record) => {
    setRecordToDelete(record);
    setShowDeleteRecordDialog(true);
  };
  
  const confirmDeleteRecord = async () => {
    if (!recordToDelete) return;
    
    try {
      await api.delete(`/medical-records/${recordToDelete.id}`);
      toast.success("Documento excluído com sucesso!");
      setShowDeleteRecordDialog(false);
      setRecordToDelete(null);
      const updated = await loadPatientData(detailedPatient.id);
      onUpdate(updated);
    } catch (error) {
      toast.error("Erro ao excluir documento");
    }
  };

  const handleUseTemplate = (templateType) => {
    let content = "";
    
    if (templateType === "receita") {
      content = "RECEITA MÉDICA\n\nPaciente: " + detailedPatient.name + "\nData: " + new Date().toLocaleDateString('pt-BR') + "\n\nMedicamentos Prescritos:\n1. [Medicamento 1] - [Posologia]\n2. [Medicamento 2] - [Posologia]\n\nObservações:\n[Instruções de uso]\n\n___________________________\nDr(a). [Nome]\nCRM: [Número]";
    } else if (templateType === "atestado") {
      content = "ATESTADO MÉDICO\n\nAtesto para os devidos fins que o(a) paciente " + detailedPatient.name + " esteve sob meus cuidados médicos e necessita de afastamento de suas atividades por [X] dias, a partir de " + new Date().toLocaleDateString('pt-BR') + ".\n\nCID: [Código se aplicável]\n\nObservações:\n[Observações adicionais]\n\n___________________________\nDr(a). [Nome]\nCRM: [Número]\nData: " + new Date().toLocaleDateString('pt-BR');
    } else {
      content = "DOCUMENTO MÉDICO\n\nPaciente: " + detailedPatient.name + "\nData da Consulta: " + new Date().toLocaleDateString('pt-BR') + "\n\nQueixa Principal:\n[Descrever sintomas]\n\nHistória da Doença Atual:\n[Histórico]\n\nExame Físico:\n[Resultados do exame]\n\nDiagnóstico:\n[Diagnóstico]\n\nTratamento Proposto:\n[Tratamento]\n\nMedicações:\n[Lista de medicações]\n\nObservações:\n[Observações adicionais]";
    }
    
    setMedicalRecordForm({
      ...medicalRecordForm,
      record_type: templateType,
      observations: content,
      template_used: templateType === "receita" ? "Receita Médica" : templateType === "atestado" ? "Atestado Médico" : "Documento Completo"
    });
    toast.success("Template aplicado!");
  };

  if (!detailedPatient) return null;

  const tabs = [
    { id: "info", label: "Informações", icon: FileText },
    { id: "attachments", label: "Anexos", icon: Paperclip },
    { id: "records", label: "Documentos", icon: Stethoscope },
    { id: "treatments", label: "Tratamentos", icon: Activity },
    { id: "anamnese", label: "Anamnese", icon: FileText },
    { id: "budgets", label: "Orçamentos", icon: Calculator },
    { id: "revenue", label: "Faturamento", icon: DollarSign }
  ];

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] w-[95vw] md:w-full flex flex-col p-0 overflow-hidden rounded-2xl">
        <div className="flex-shrink-0 p-6 pb-0">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold text-gray-900">{detailedPatient.name}</span>
            {debts.total_debt > 0 && (
              <span className="ml-4 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                Débito: R$ {debts.total_debt.toFixed(2)}
              </span>
            )}
          </div>
        </DialogTitle>
        <DialogDescription>Visualize e gerencie os dados do paciente</DialogDescription>
      </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto mt-6 pb-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm whitespace-nowrap transition-all rounded-xl ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md transform scale-[1.02]"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 bg-white border border-transparent hover:border-gray-200"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-gray-500"}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-6 pt-4 w-full" style={{minHeight: 0}}>          {loading ? (
            <div className="text-center py-8 text-gray-500">Carregando...</div>
          ) : (
            <>
              {/* Info Tab */}
              {activeTab === "info" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Email</Label>
                      <p className="text-gray-900">{detailedPatient.email}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Telefone</Label>
                      <p className="text-gray-900">{detailedPatient?.phone || "Não informado"}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Data de Nascimento</Label>
                      <p className="text-gray-900">{detailedPatient.birthdate}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Endereço</Label>
                      <p className="text-gray-900">{detailedPatient.address || "Não informado"}</p>
                    </div>
                  </div>

                  {debts.total_debt > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-6">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-red-900">Débitos Pendentes</h4>
                          <p className="text-sm text-red-700 mt-1">
                            Total: R$ {debts.total_debt.toFixed(2)} ({debts.debt_count} agendamento(s) não pago(s))
                          </p>
                          <div className="mt-3 space-y-2">
                            {debts.unpaid_appointments.slice(0, 3).map((app) => (
                              <div key={app.id} className="text-sm text-red-800 flex justify-between">
                                <span>{new Date(app.appointment_date).toLocaleDateString('pt-BR')} às {app.appointment_time}</span>
                                <span className="font-semibold">R$ {app.amount?.toFixed(2) || "0.00"}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Budgets Tab */}
              {activeTab === "budgets" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Orçamentos</h3>
                    <Button onClick={() => {
                      setEditingBudget(null);
                      setBudgetForm({
                        description: "",
                        date: new Date().toISOString().split('T')[0],
                        treatments: [],
                        total_value: "",
                        professional_id: "",
                        observations: ""
                      });
                      setShowBudgetDialog(true);
                    }} className="btn-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Novo Orçamento
                    </Button>
                  </div>

                  {budgets.length > 0 ? (
                    <div className="space-y-3">
                      {budgets.map((budget) => (
                        <div key={budget.id} className="border rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold text-gray-900">{budget.description}</h4>
                                <span className="text-sm text-gray-500">{formatDate(budget.date)}</span>
                              </div>
                              <p className="text-sm text-gray-600">
                                Valor Total: R$ {Number(budget.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                              {budget.professional_id && (
                                <p className="text-sm text-gray-600">
                                  Profissional: {allProfessionals.find(p => p.id === budget.professional_id)?.name || "Não informado"}
                                </p>
                              )}
                              {budget.treatments && budget.treatments.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-semibold text-gray-500">Tratamentos:</p>
                                  <ul className="list-disc list-inside text-sm text-gray-600">
                                    {budget.treatments.map((t, i) => (
                                      <li key={i}>
                                        {typeof t === 'string' ? t : `${t.name} - R$ ${Number(t.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {budget.observations && (
                                <p className="text-sm text-gray-500 mt-2 italic">{budget.observations}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDownloadBudgetPDF(budget)}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                              >
                                <Download className="w-4 h-4" />
                                PDF
                              </button>
                              <button
                                onClick={() => handleEditBudget(budget)}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 transition"
                              >
                                <Edit className="w-4 h-4" />
                                Editar
                              </button>
                              <button
                                onClick={() => handleDeleteBudget(budget)}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                                Excluir
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Calculator className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Nenhum orçamento registrado</p>
                    </div>
                  )}
                </div>
              )}

              {/* Revenue Tab */}
              {activeTab === "revenue" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Faturamento do Paciente</h3>
                    <Button onClick={() => { 
                      setEditingTransaction(null); 
                      setTransactionForm({
                        amount: "",
                        payment_method: "cash",
                        description: "",
                        transaction_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
                        status: "paid",
                        appointment_id: ""
                      });
                      setShowTransactionDialog(true); 
                    }} className="btn-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Faturamento
                    </Button>
                  </div>

                  {transactions.length > 0 ? (
                    <div className="space-y-3">
                      {transactions.map((t) => (
                        <div key={t.id} className="border rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-xl font-bold text-gray-900">R$ {Number(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${t.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {t.status === 'paid' ? 'Pago' : 'Pendente'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700">{t.description}</p>
                              <p className="text-xs text-gray-500 mt-1">{new Date(t.transaction_date || t.created_at).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                              {t.appointment_id && (
                                <p className="text-xs text-gray-500">Vinculado ao agendamento: {t.appointment_id}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setEditingTransaction(t);
                                  setTransactionForm({
                                    amount: t.amount,
                                    payment_method: t.payment_method || 'cash',
                                    description: t.description || '',
                                    transaction_date: (t.transaction_date || new Date().toISOString().split('T')[0]).split('T')[0],
                                    status: t.status || 'paid',
                                    appointment_id: t.appointment_id || ''
                                  });
                                  setShowTransactionDialog(true);
                                }}
                                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await api.delete(`/transactions/${t.id}`);
                                    toast.success("Faturamento excluído!");
                                    const updated = await loadPatientData(detailedPatient.id);
                                    onUpdate(updated);
                                  } catch (error) {
                                    toast.error("Erro ao excluir faturamento");
                                  }
                                }}
                                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Nenhum faturamento registrado</p>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments Tab */}
              {activeTab === "attachments" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Anexos</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={handleCreateFolder} className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">
                        <Plus className="w-4 h-4 mr-1 inline" />
                        Nova pasta
                      </button>
                      <label className="btn-primary cursor-pointer inline-flex items-center">
                        <Upload className="w-4 h-4 mr-2" />
                        Adicionar Arquivo
                        <input type="file" className="hidden" onChange={handleFileUpload} />
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 mb-4">
                    <button
                      onClick={() => setSelectedFolderId('ALL')}
                      className={`group relative flex items-center gap-2 px-3 py-2 rounded-md border shadow-sm transition ${selectedFolderId === 'ALL' ? 'bg-yellow-100 border-yellow-300 ring-2 ring-yellow-300' : 'bg-white hover:bg-yellow-50 border-gray-200'}`}
                      onDragOver={(e) => e.preventDefault()}
                      aria-label="Todas as pastas"
                    >
                      {selectedFolderId === 'ALL' ? (
                        <FolderOpen className="w-5 h-5 text-yellow-700" />
                      ) : (
                        <Folder className="w-5 h-5 text-yellow-600" />
                      )}
                      <span className={`text-sm ${selectedFolderId === 'ALL' ? 'text-yellow-800 font-semibold' : 'text-gray-800'}`}>Todas</span>
                    </button>
                    <button
                      onClick={() => setSelectedFolderId(null)}
                      className={`group relative flex items-center gap-2 px-3 py-2 rounded-md border shadow-sm transition ${selectedFolderId === null ? 'bg-yellow-100 border-yellow-300 ring-2 ring-yellow-300' : 'bg-white hover:bg-yellow-50 border-gray-200'}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropToUnassigned(e)}
                      aria-label="Sem pasta"
                    >
                      {selectedFolderId === null ? (
                        <FolderOpen className="w-5 h-5 text-yellow-700" />
                      ) : (
                        <Folder className="w-5 h-5 text-yellow-600" />
                      )}
                      <span className={`text-sm ${selectedFolderId === null ? 'text-yellow-800 font-semibold' : 'text-gray-800'}`}>Sem pasta</span>
                    </button>
                    {attachmentFolders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFolderId(f.id)}
                        className={`group relative flex items-center gap-2 px-3 py-2 rounded-md border shadow-sm transition ${selectedFolderId === f.id ? 'bg-yellow-100 border-yellow-300 ring-2 ring-yellow-300' : 'bg-white hover:bg-yellow-50 border-gray-200'}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropToFolder(f.id, e)}
                        aria-label={f.name}
                        title="Arraste anexos para mover para esta pasta"
                      >
                        {selectedFolderId === f.id ? (
                          <FolderOpen className="w-5 h-5 text-yellow-700" />
                        ) : (
                          <Folder className="w-5 h-5 text-yellow-600" />
                        )}
                        <span className={`text-sm truncate max-w-[10rem] ${selectedFolderId === f.id ? 'text-yellow-800 font-semibold' : 'text-gray-800'}`}>{f.name}</span>
                      </button>
                    ))}
                  </div>

                  {detailedPatient?.attachments && detailedPatient?.attachments?.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {(detailedPatient?.attachments || [])
                        .filter((att) => selectedFolderId === 'ALL' ? true : (selectedFolderId === null ? !att.folder_id : att.folder_id === selectedFolderId))
                        .map((att) => (
                        <div
                          key={att.id}
                          data-att-id={att.id}
                          ref={(el) => { if (el) itemRefs.current.set(att.id, el); }}
                          className="group border rounded-lg overflow-hidden bg-white"
                          draggable
                          onDragStart={(e) => { try { e.dataTransfer.setData('text/plain', att.id); } catch {} }}
                        >
                          <div className="aspect-square bg-gray-100 flex items-center justify-center">
                            {att.file_type?.startsWith('image/') ? (
                              <picture>
                                <source srcSet={attachmentPreviews[att.id] || `${process.env.REACT_APP_BACKEND_URL}/api/patients/${detailedPatient.id}/attachments/${att.id}/download?preview=true&format=webp&token=${encodeURIComponent(localStorage.getItem('token') || '')}`} type="image/webp" />
                                <img
                                  src={attachmentPreviews[att.id] || `${process.env.REACT_APP_BACKEND_URL}/api/patients/${detailedPatient.id}/attachments/${att.id}/download?preview=true&token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
                                  alt={att.filename}
                                  loading="eager"
                                  decoding="async"
                                  fetchpriority="high"
                                  onClick={() => handleOpenImage(att)}
                                  className="w-full h-full object-cover cursor-zoom-in"
                                />
                              </picture>
                            ) : (
                              <div className="flex flex-col items-center text-gray-500">
                                <Paperclip className="w-8 h-8 mb-2" />
                                <span className="text-xs">{att.file_type?.split('/')[1] || 'arquivo'}</span>
                              </div>
                            )}
                          </div>
                          <div className="p-3 flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{att.filename}</p>
                              <p className="text-xs text-gray-500">{(att.size_bytes / 1024).toFixed(2)} KB - {new Date(att.upload_date).toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => handleDownloadAttachment(att)} className="text-blue-500 hover:text-blue-700">
                                <Download className="w-4 h-4" />
                              </button>
                              <button onClick={() => { setAttachmentToDelete(att.id); setShowDeleteAttachmentDialog(true); }} className="text-red-500 hover:text-red-700">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Paperclip className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Nenhum arquivo anexado</p>
                    </div>
                  )}
                </div>
              )}

              {/* Medical Records Tab */}
              {activeTab === "records" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Documentos do Paciente</h3>
                    <Button onClick={() => setShowMedicalRecordDialog(true)} className="btn-primary">
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar Documento
                      </Button>
                  </div>
                  {medicalRecords.length > 0 ? (
                    <div className="space-y-4">
                      {medicalRecords.map((record) => (
                        <div key={record.id} className="border rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start mb-2">
                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                              {record.record_type}
                            </span>
                            <span className="text-sm text-gray-500">
                              {new Date(record.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          {record.diagnosis && (
                            <div className="mt-2">
                              <span className="font-semibold text-gray-700">Diagnóstico:</span>
                              <p className="text-gray-600">{record.diagnosis}</p>
                            </div>
                          )}
                          {record.observations && (
                            <div className="mt-2">
                              <span className="font-semibold text-gray-700">Conteúdo:</span>
                              <p className="text-gray-600 line-clamp-2">{record.observations}</p>
                            </div>
                          )}
                          
                          {/* Action buttons */}
                          <div className="flex gap-2 mt-4 pt-3 border-t">
                            <button
                              onClick={() => handleDownloadPDF(record)}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition"
                            >
                              <Download className="w-4 h-4" />
                              Baixar PDF
                            </button>
                            <button
                              onClick={() => handleEditRecord(record)}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 transition"
                            >
                              <Edit className="w-4 h-4" />
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(record)}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                              Excluir
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Stethoscope className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Nenhum documento cadastrado</p>
                    </div>
                  )}
                </div>
              )}

              {/* Treatments Tab */}
            {activeTab === "treatments" && (
              <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Tratamentos Realizados</h3>
                    <Button 
                      onClick={() => {
                        setEditingTreatment(null);
                        setTreatmentForm({
                          name: "",
                          start_date: new Date().toISOString().split('T')[0],
                          description: "",
                          prescribed_medications: "",
                          frequency: "",
                          estimated_duration: "",
                          professional_id: "",
                          status: "ongoing",
                          service_id: "",
                          selected_teeth: [],
                          face_regions: []
                        });
                        setShowTreatmentDialog(true);
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-all duration-300 shadow-md hover:shadow-lg"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Tratamento
                    </Button>
                  </div>

                  {detailedPatient?.treatments && detailedPatient.treatments.length > 0 ? (
                    <div className="space-y-3">
                      {detailedPatient.treatments.map((treatment) => (
                        <div key={treatment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold text-gray-900">{treatment.name}</h4>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  treatment.status === 'completed' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {treatment.status === 'completed' ? 'Concluído' : 'Em andamento'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">
                                Data: {formatDate(treatment.start_date)}
                              </p>
                              <p className="text-sm text-gray-600">
                                Profissional: {(() => {
                                  const pid = (treatment.professional_id || '').trim();
                                  const p = allProfessionals.find(x => x.id === pid) || professionals.find(x => x.id === pid);
                                  return p ? p.name : 'Não informado';
                                })()}
                              </p>
                              {treatment.description && (
                                <p className="text-sm text-gray-600 mt-2">{treatment.description}</p>
                              )}

                              {/* Selected Regions/Teeth Display */}
                              {(treatment.selected_teeth?.length > 0 || treatment.face_regions?.length > 0) && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {treatment.selected_teeth?.length > 0 && (
                                    <div className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                                      <span className="font-semibold">Dentes:</span> {treatment.selected_teeth.join(', ')}
                                    </div>
                                  )}
                                  {treatment.face_regions?.length > 0 && (
                                    <div className="text-xs bg-pink-50 text-pink-700 px-2 py-1 rounded border border-pink-100">
                                      <span className="font-semibold">Harmonização:</span> {
                                        treatment.face_regions.map(id => {
                                          const region = faceRegions.find(r => r.id === id);
                                          return region ? region.name : id;
                                        }).join(', ')
                                      }
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          <div className="flex gap-2 mt-4 pt-3 border-t">
                            <button
                              onClick={() => handleEditTreatment(treatment)}
                              className="flex items-center gap-1 px-2 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                              title="Editar tratamento"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteTreatment(treatment.id)}
                              className="flex items-center gap-1 px-2 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition"
                              title="Excluir tratamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Activity className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Nenhum tratamento cadastrado</p>
                    </div>
                  )}
                </div>
              )}

              {/* Anamnese Tab */}
              {activeTab === "anamnese" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Anamnese</h3>
                    <Button onClick={handleSaveAnamnese} className="btn-primary">
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Anamnese
                    </Button>
                  </div>

                  {/* Histórico Médico */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-3">Histórico Médico</h4>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm">Doenças Crônicas</Label>
                        <textarea
                          className="input-field mt-1"
                          value={anamnese.chronic_diseases}
                          onChange={(e) => setAnamnese({...anamnese, chronic_diseases: e.target.value})}
                          placeholder="Diabetes, hipertensão, etc."
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Alergias Médicas</Label>
                        <textarea
                          className="input-field mt-1"
                          value={anamnese.allergies_medical}
                          onChange={(e) => setAnamnese({...anamnese, allergies_medical: e.target.value})}
                          placeholder="Alergias conhecidas"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Medicamentos em Uso</Label>
                        <textarea
                          className="input-field mt-1"
                          value={anamnese.current_medications}
                          onChange={(e) => setAnamnese({...anamnese, current_medications: e.target.value})}
                          placeholder="Medicamentos que o paciente toma regularmente"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Histórico de Cirurgias</Label>
                        <textarea
                          className="input-field mt-1"
                          value={anamnese.surgery_history}
                          onChange={(e) => setAnamnese({...anamnese, surgery_history: e.target.value})}
                          placeholder="Cirurgias realizadas anteriormente"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Condições de Saúde Mental</Label>
                        <textarea
                          className="input-field mt-1"
                          value={anamnese.mental_health}
                          onChange={(e) => setAnamnese({...anamnese, mental_health: e.target.value})}
                          placeholder="Ansiedade, depressão, etc."
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Histórico Odontológico */}
                  <div className="bg-green-50 rounded-lg p-4">
                    <h4 className="font-semibold text-green-900 mb-3">Histórico Odontológico</h4>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm">Tratamentos Prévios</Label>
                        <textarea
                          className="input-field mt-1"
                          value={anamnese.previous_treatments}
                          onChange={(e) => setAnamnese({...anamnese, previous_treatments: e.target.value})}
                          placeholder="Tratamentos odontológicos anteriores"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Próteses</Label>
                        <Input
                          value={anamnese.prosthetics}
                          onChange={(e) => setAnamnese({...anamnese, prosthetics: e.target.value})}
                          placeholder="Tipo de próteses"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Implantes</Label>
                        <Input
                          value={anamnese.implants}
                          onChange={(e) => setAnamnese({...anamnese, implants: e.target.value})}
                          placeholder="Implantes dentários"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Histórico de Dores</Label>
                        <textarea
                          className="input-field mt-1"
                          value={anamnese.pain_history}
                          onChange={(e) => setAnamnese({...anamnese, pain_history: e.target.value})}
                          placeholder="Dores dentárias ou faciais"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Problemas Periodontais</Label>
                        <Input
                          value={anamnese.periodontal_issues}
                          onChange={(e) => setAnamnese({...anamnese, periodontal_issues: e.target.value})}
                          placeholder="Gengivite, periodontite, etc."
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Cirurgias Prévias na Face</Label>
                        <Input
                          value={anamnese.facial_surgeries}
                          onChange={(e) => setAnamnese({...anamnese, facial_surgeries: e.target.value})}
                          placeholder="Cirurgias faciais realizadas"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Produtos de Higiene Bucal</Label>
                        <Input
                          value={anamnese.oral_hygiene_products}
                          onChange={(e) => setAnamnese({...anamnese, oral_hygiene_products: e.target.value})}
                          placeholder="Pasta de dente, enxaguante, etc."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Alergias Específicas */}
                  <div className="bg-red-50 rounded-lg p-4">
                    <h4 className="font-semibold text-red-900 mb-3">Alergias Específicas</h4>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm">Alergias a Medicamentos</Label>
                        <Input
                          value={anamnese.medication_allergies}
                          onChange={(e) => setAnamnese({...anamnese, medication_allergies: e.target.value})}
                          placeholder="Penicilina, anestésicos, etc."
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Alergias a Materiais</Label>
                        <Input
                          value={anamnese.material_allergies}
                          onChange={(e) => setAnamnese({...anamnese, material_allergies: e.target.value})}
                          placeholder="Látex, níquel, etc."
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Alergias a Substâncias</Label>
                        <Input
                          value={anamnese.substance_allergies}
                          onChange={(e) => setAnamnese({...anamnese, substance_allergies: e.target.value})}
                          placeholder="Metais, produtos químicos, etc."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Transaction Dialog */}
    <Dialog open={showTransactionDialog} onOpenChange={(open) => {
      setShowTransactionDialog(open);
      if (!open) {
        setEditingTransaction(null);
        setTransactionForm({
          amount: "",
          payment_method: "cash",
          description: "",
          transaction_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
          status: "paid",
          appointment_id: ""
        });
      }
  }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingTransaction ? "Editar Faturamento" : "Adicionar Faturamento"}</DialogTitle>
          <DialogDescription>Preencha os dados do faturamento</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Valor *</Label>
            <Input
              type="number"
              step="0.01"
              value={transactionForm.amount}
              onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Método de Pagamento</Label>
            <select
              className="input-field"
              value={transactionForm.payment_method}
              onChange={(e) => setTransactionForm({ ...transactionForm, payment_method: e.target.value })}
            >
              <option value="cash">Dinheiro</option>
              <option value="card">Cartão</option>
              <option value="pix">Pix</option>
              <option value="transfer">Transferência</option>
              <option value="check">Cheque</option>
              <option value="promissory">Promissória</option>
              <option value="payment_link">Link de Pagamento</option>
            </select>
          </div>
          <div>
            <Label>Descrição *</Label>
            <Input
              value={transactionForm.description}
              onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={transactionForm.transaction_date}
                onChange={(e) => setTransactionForm({ ...transactionForm, transaction_date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="input-field"
                value={transactionForm.status}
                onChange={(e) => setTransactionForm({ ...transactionForm, status: e.target.value })}
              >
                <option value="paid">Pago</option>
                <option value="pending">Pendente</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Vincular a um Agendamento (opcional)</Label>
            <select
              className="input-field"
              value={transactionForm.appointment_id}
              onChange={(e) => setTransactionForm({ ...transactionForm, appointment_id: e.target.value })}
            >
              <option value="">Nenhum</option>
              {appointmentsList.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('pt-BR')} {a.appointment_time} — {a.notes || 'Agendamento'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowTransactionDialog(false)}>Cancelar</Button>
          <Button onClick={async () => {
            try {
              const payload = {
                patient_id: detailedPatient.id,
                appointment_id: transactionForm.appointment_id || undefined,
                amount: Number(transactionForm.amount),
                payment_method: transactionForm.payment_method,
                description: transactionForm.description,
                transaction_date: transactionForm.transaction_date,
                status: transactionForm.status
              };
              if (editingTransaction) {
                await api.put(`/transactions/${editingTransaction.id}`, payload);
                toast.success("Faturamento atualizado!");
              } else {
                await api.post(`/transactions`, payload);
                toast.success("Faturamento adicionado!");
              }
              setShowTransactionDialog(false);
              const updated = await loadPatientData(detailedPatient.id);
              onUpdate(updated);
            } catch (error) {
              toast.error(editingTransaction ? "Erro ao atualizar faturamento" : "Erro ao adicionar faturamento");
            }
          }} className="btn-primary">
            {editingTransaction ? "Salvar Alterações" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={imagePreviewOpen} onOpenChange={(open) => { if (!open) handleCloseImage(); }}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] p-0">
        <DialogDescription className="sr-only">Visualização da imagem do anexo</DialogDescription>
        <div className="relative w-full h-full bg-black/80">
          {imageLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-10 w-10 rounded-full border-4 border-white/60 border-t-transparent animate-spin" />
            </div>
          )}
          {imagePreviewUrl && (
            <div
              className={`w-full h-full overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              onWheel={handleWheelZoom}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <img
                src={imagePreviewUrl}
                alt={imagePreviewTitle}
                draggable={false}
                className="select-none block mx-auto"
                style={{
                  transform: `translate(${imagePos.x}px, ${imagePos.y}px) scale(${imageScale})`,
                  transformOrigin: 'center center',
                  maxHeight: '85vh',
                  maxWidth: '100%',
                  objectFit: 'contain'
                }}
              />
            </div>
          )}
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button className="btn-primary px-3 py-2" onClick={() => setImageScale((s) => Math.min(5, s + 0.2))}><Plus className="w-4 h-4" /></button>
            <button className="btn-primary px-3 py-2" onClick={() => setImageScale((s) => Math.max(1, s - 0.2))}><Minus className="w-4 h-4" /></button>
            <button className="btn-secondary px-3 py-2" onClick={() => { setImageScale(1); setImagePos({ x: 0, y: 0 }); }}>Resetar</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Treatment Dialog - Moved outside main dialog */}
    <Dialog open={showTreatmentDialog} onOpenChange={handleTreatmentDialogOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTreatment ? "Editar Tratamento" : "Adicionar Tratamento"}</DialogTitle>
          <DialogDescription>Preencha os dados do tratamento</DialogDescription>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <div className="space-y-4">
            {/* Campos Obrigatórios */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="service-select">Serviço Realizado <span className="text-red-500">*</span></Label>
                <Popover open={openServiceCombobox} onOpenChange={setOpenServiceCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openServiceCombobox}
                      className="w-full justify-between font-normal"
                    >
                      {treatmentForm.service_id
                        ? services.find((s) => s.id === treatmentForm.service_id)?.name
                        : "Selecionar serviço..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white z-[9999]" align="start">
                    <Command className="bg-white">
                      <CommandInput placeholder="Buscar serviço..." />
                      <CommandList className="max-h-[300px] overflow-y-auto">
                        <CommandEmpty>Nenhum serviço encontrado.</CommandEmpty>
                        <CommandGroup>
                          {services.map((service) => (
                            <CommandItem
                              key={service.id}
                              value={service.name}
                              onSelect={() => {
                                setTreatmentForm(prev => ({
                                  ...prev,
                                  service_id: service.id,
                                  name: service.name
                                }));
                                setOpenServiceCombobox(false);
                              }}
                              className="cursor-pointer hover:bg-gray-100"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  treatmentForm.service_id === service.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {service.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="treatment-name">Nome do Tratamento <span className="text-red-500">*</span></Label>
                  <Input
                    id="treatment-name"
                    value={treatmentForm.name}
                    onChange={(e) => setTreatmentForm({ ...treatmentForm, name: e.target.value })}
                    placeholder="Ex: Clareamento Dental"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start-date">Data de Início <span className="text-red-500">*</span></Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={treatmentForm.start_date}
                    onChange={handleDateChange}
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="professional-select">Profissional Responsável</Label>
                <select
                  id="professional-select"
                  className="input-field"
                  value={treatmentForm.professional_id}
                  onChange={(e) => setTreatmentForm({ ...treatmentForm, professional_id: e.target.value.trim() })}
                >
                  <option value="">Selecionar profissional</option>
                  {allProfessionals.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status-select">Status</Label>
                <select
                  id="status-select"
                  className="input-field"
                  value={treatmentForm.status}
                  onChange={(e) => setTreatmentForm({ ...treatmentForm, status: e.target.value })}
                >
                  <option value="ongoing">Em andamento</option>
                  <option value="completed">Concluído</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <textarea
                id="description"
                rows="4"
                className="w-full p-2 border rounded"
                value={treatmentForm.description}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, description: e.target.value })}
                placeholder="Descreva o tratamento em detalhes"
              ></textarea>
            </div>
          </div>

          {/* Regiões do Tratamento */}
          <div className="space-y-4 pt-4 border-t">
              <h4 className="font-semibold text-md">Regiões do Tratamento</h4>
              
              <div className="flex justify-center gap-4 bg-gray-50 p-2 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTreatmentView('teeth')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${treatmentView === 'teeth' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Odontograma
                </button>
                <button
                  type="button"
                  onClick={() => setTreatmentView('face')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${treatmentView === 'face' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Harmonização Facial
                </button>
              </div>

              <div className="border rounded-lg p-4 bg-white min-h-[400px] flex items-center justify-center">
                {treatmentView === 'teeth' ? (
                  <div className="animate-in fade-in duration-300 w-full">
                    <p className="text-sm text-gray-500 mb-4 text-center">Selecione os dentes envolvidos no tratamento</p>
                    <OdontogramSelector
                      selectedTeeth={treatmentForm.selected_teeth || []}
                      onToggle={(toothNum) => {
                        setTreatmentForm(prev => {
                          const current = prev.selected_teeth || [];
                          const exists = current.includes(toothNum);
                          return {
                            ...prev,
                            selected_teeth: exists 
                              ? current.filter(t => t !== toothNum)
                              : [...current, toothNum]
                          };
                        });
                      }}
                      readOnly={false}
                    />
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-300 w-full flex flex-col items-center">
                    <p className="text-sm text-gray-500 mb-4 text-center">Selecione as regiões da face envolvidas</p>
                    <FaceHarmonizationSelector
                      selectedRegions={treatmentForm.face_regions || []}
                      onToggle={(regionId) => {
                        setTreatmentForm(prev => {
                          const current = prev.face_regions || [];
                          const exists = current.includes(regionId);
                          return {
                            ...prev,
                            face_regions: exists 
                              ? current.filter(r => r !== regionId)
                              : [...current, regionId]
                          };
                        });
                      }}
                      readOnly={false}
                    />
                  </div>
                )}
              </div>
            </div>

          {/* Campos Opcionais */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-semibold text-md">Informações Adicionais (Opcional)</h4>
            <div className="space-y-2">
              <Label htmlFor="prescribed-medications">Medicamentos Prescritos</Label>
              <Input
                id="prescribed-medications"
                value={treatmentForm.prescribed_medications}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, prescribed_medications: e.target.value })}
                placeholder="Ex: Amoxicilina 500mg"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="frequency">Frequência</Label>
                <Input
                  id="frequency"
                  value={treatmentForm.frequency}
                  onChange={(e) => setTreatmentForm({ ...treatmentForm, frequency: e.target.value })}
                  placeholder="Ex: 1 vez por semana"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimated-duration">Duração Estimada</Label>
                <Input
                  id="estimated-duration"
                  value={treatmentForm.estimated_duration}
                  onChange={(e) => setTreatmentForm({ ...treatmentForm, estimated_duration: e.target.value })}
                  placeholder="Ex: 3 meses"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end p-6 bg-gray-50">
          <Button variant="outline" onClick={() => setShowTreatmentDialog(false)} className="mr-2">
            Cancelar
          </Button>
          <Button onClick={editingTreatment ? handleUpdateTreatment : handleAddTreatment}>
            {editingTreatment ? "Salvar Alterações" : "Adicionar Tratamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Medical Record Dialog */}
    <Dialog open={showMedicalRecordDialog} onOpenChange={(open) => {
      setShowMedicalRecordDialog(open);
      if (!open) setEditingRecord(null);
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] w-[95vw] md:w-auto overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingRecord ? "Editar Documento" : "Novo Documento"} - {patient?.name}</DialogTitle>
          <DialogDescription>Crie ou edite um documento do paciente</DialogDescription>
        </DialogHeader>
        
        {/* Templates Rápidos */}
        <div className="mb-4">
          <Label className="text-sm font-semibold mb-2 block">Templates Disponíveis</Label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleUseTemplate("prontuario")}
              className="p-3 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-center"
            >
              <FileText className="w-6 h-6 text-blue-500 mx-auto mb-1" />
              <span className="text-sm font-medium">Prontuário</span>
            </button>
            <button
              onClick={() => handleUseTemplate("receita")}
              className="p-3 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-center"
            >
              <FileText className="w-6 h-6 text-green-500 mx-auto mb-1" />
              <span className="text-sm font-medium">Receita</span>
            </button>
            <button
              onClick={() => handleUseTemplate("atestado")}
              className="p-3 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all text-center"
            >
              <FileText className="w-6 h-6 text-purple-500 mx-auto mb-1" />
              <span className="text-sm font-medium">Atestado</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Tipo de Documento *</Label>
            <select
              className="input-field"
              value={medicalRecordForm.record_type}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, record_type: e.target.value})}
            >
              <option value="prontuario">Documento Completo</option>
              <option value="receita">Receita Médica</option>
              <option value="atestado">Atestado Médico</option>
            </select>
          </div>

          <div>
            <Label>Sintomas</Label>
            <textarea
              className="input-field min-h-[80px]"
              value={medicalRecordForm.symptoms}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, symptoms: e.target.value})}
              placeholder="Descreva os sintomas apresentados pelo paciente"
            />
          </div>

          <div>
            <Label>Diagnóstico</Label>
            <Input
              value={medicalRecordForm.diagnosis}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, diagnosis: e.target.value})}
              placeholder="Diagnóstico médico"
            />
          </div>

          <div>
            <Label>Conteúdo Completo do Documento</Label>
            <textarea
              className="input-field min-h-[300px] font-mono text-sm"
              value={medicalRecordForm.observations}
              onChange={(e) => setMedicalRecordForm({...medicalRecordForm, observations: e.target.value})}
              placeholder="Inclua todos os detalhes: sintomas, diagnóstico, tratamento proposto, medicações prescritas, observações, etc."
            />
            <p className="text-xs text-gray-500 mt-1">
              Dica: Inclua tratamento, medicações e todas as informações relevantes aqui
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label>Nome do Profissional</Label>
              <Input
                value={medicalRecordForm.doctor_name}
                onChange={(e) => setMedicalRecordForm({...medicalRecordForm, doctor_name: e.target.value})}
                placeholder="Dr(a). Nome Completo"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Tipo de Registro</Label>
              <select
                value={medicalRecordForm.professional_council_type}
                onChange={(e) => setMedicalRecordForm({...medicalRecordForm, professional_council_type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="CRM">CRM - Médico</option>
                <option value="CRO">CRO - Odontologia</option>
                <option value="COREN">COREN - Enfermagem</option>
                <option value="CREFITO">CREFITO - Fisioterapia</option>
                <option value="CRP">CRP - Psicologia</option>
                <option value="CREFONO">CREFONO - Fonoaudiologia</option>
                <option value="CRN">CRN - Nutrição</option>
                <option value="CRBM">CRBM - Biomedicina</option>
                <option value="CRBIO">CRBIO - Biologia</option>
                <option value="CRFA">CRFA - Farmácia</option>
                <option value="CREFITO">CREFITO - Fisioterapia</option>
                <option value="COFFITO">COFFITO - Terapia Ocupacional</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label>Número de Registro</Label>
              <Input
                value={medicalRecordForm.professional_registration}
                onChange={(e) => {
                  setMedicalRecordForm({
                    ...medicalRecordForm, 
                    professional_registration: e.target.value,
                    crm: e.target.value  // Mantém sincronizado para compatibilidade
                  });
                }}
                placeholder={`${medicalRecordForm.professional_council_type}/UF (ex: 12345/SP)`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => handleAddMedicalRecord(false)} variant="outline">
              <Save className="w-5 h-5 mr-2" />
              Salvar
            </Button>
            <Button 
              onClick={() => handleAddMedicalRecord(true)} 
              className="btn-primary"
              disabled={!detailedPatient?.phone}
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Salvar e Enviar WhatsApp
            </Button>
          </div>
          {!detailedPatient?.phone && (
            <p className="text-xs text-amber-600 text-center mt-2">
              ⚠️ Paciente não tem telefone cadastrado
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingBudget ? "Editar Orçamento" : "Novo Orçamento"}</DialogTitle>
          <DialogDescription>{editingBudget ? "Edite os dados do orçamento" : "Preencha os dados do orçamento"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreateBudget} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Descrição</Label>
              <Input
                required
                value={budgetForm.description}
                onChange={(e) => setBudgetForm({...budgetForm, description: e.target.value})}
                placeholder="Ex: Tratamento de Canal"
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                required
                value={budgetForm.date}
                onChange={(e) => setBudgetForm({...budgetForm, date: e.target.value})}
              />
            </div>
          </div>

          <div>
            <Label>Tratamentos</Label>
            <div className="flex gap-2 mb-2">
              <select
                className="flex-1 input-field"
                id="service-select"
                onChange={(e) => {
                  const serviceName = e.target.value;
                  if (serviceName) {
                     const service = services.find(s => s.name === serviceName);
                     const price = service ? (service.price || 0) : 0;
                     
                     setBudgetForm(prev => {
                        const newTreatments = [...prev.treatments, { name: serviceName, value: price, teeth: [] }];
                        const newTotal = newTreatments.reduce((sum, t) => sum + Number(t.value || 0), 0);
                        return {
                           ...prev,
                           treatments: newTreatments,
                           total_value: newTotal
                        };
                     });
                     e.target.value = "";
                  }
                }}
              >
                <option value="">Selecione um serviço...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.name}>{s.name} - R$ {Number(s.price || 0).toFixed(2)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-4">
                {budgetForm.treatments.map((t, i) => (
                    <div key={i} className="bg-white p-3 rounded-lg border shadow-sm space-y-3">
                        <div className="flex items-center gap-3">
                            <span className="flex-1 font-medium text-gray-800">{t.name || t}</span>
                            
                            <div className="flex items-center gap-2">
                               <span className="text-xs text-gray-500">R$</span>
                               <Input 
                                  type="number" 
                                  className="w-24 h-8 text-right" 
                                  value={t.value !== undefined ? t.value : 0}
                                  onChange={(e) => {
                                     const newVal = Number(e.target.value);
                                     setBudgetForm(prev => {
                                        const newTreatments = [...prev.treatments];
                                        if (typeof newTreatments[i] === 'string') {
                                           newTreatments[i] = { name: newTreatments[i], value: newVal, teeth: [] };
                                        } else {
                                           newTreatments[i] = { ...newTreatments[i], value: newVal };
                                        }
                                        const newTotal = newTreatments.reduce((sum, item) => sum + Number(item.value || 0), 0);
                                        return { ...prev, treatments: newTreatments, total_value: newTotal };
                                     });
                                  }}
                               />
                            </div>
                            
                            <button
                                type="button"
                                onClick={() => setBudgetForm(prev => {
                                   const newTreatments = prev.treatments.filter((_, idx) => idx !== i);
                                   const newTotal = newTreatments.reduce((sum, item) => sum + Number(item.value || 0), 0);
                                   return { ...prev, treatments: newTreatments, total_value: newTotal };
                                })}
                                className="text-gray-400 hover:text-red-600 p-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Odontogram Section */}
                        <div className="border-t pt-2">
                           <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Dentes Selecionados: {t.teeth && t.teeth.length > 0 ? t.teeth.join(', ') : 'Nenhum'}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs h-6"
                                onClick={() => {
                                   // Toggle visibility of odontogram for this item? 
                                   // Or just always show it? Let's use a collapsible details/summary approach or just show it if expanded.
                                   // For simplicity, let's toggle a local state? 
                                   // React state inside map is tricky without a child component.
                                   // Let's use a simple state array for expanded items or just show it.
                                   // Given the complexity, maybe just show it always or use a simple toggle class.
                                   // Actually, let's use a details element for native toggle behavior without extra state!
                                }}
                              >
                              </Button>
                           </div>
                           
                           <details className="group">
                              <summary className="flex items-center cursor-pointer text-sm text-blue-600 hover:text-blue-800 select-none mb-2">
                                 <Stethoscope className="w-4 h-4 mr-1" />
                                 { (t.teeth && t.teeth.length > 0) || (t.face_regions && t.face_regions.length > 0) ? 'Editar Regiões' : 'Selecionar Regiões' }
                              </summary>
                              
                              <div className="mt-2 flex flex-col gap-4">
                                {/* Toggle Type */}
                                <div className="flex justify-center gap-4 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newTreatments = [...budgetForm.treatments];
                                      newTreatments[i] = { ...newTreatments[i], _view: 'teeth' };
                                      setBudgetForm(prev => ({ ...prev, treatments: newTreatments }));
                                    }}
                                    className={`px-3 py-1 rounded-md text-sm transition-colors ${(!t._view || t._view === 'teeth') ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
                                  >
                                    Odontograma
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newTreatments = [...budgetForm.treatments];
                                      newTreatments[i] = { ...newTreatments[i], _view: 'face' };
                                      setBudgetForm(prev => ({ ...prev, treatments: newTreatments }));
                                    }}
                                    className={`px-3 py-1 rounded-md text-sm transition-colors ${(t._view === 'face') ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
                                  >
                                    Harmonização Facial
                                  </button>
                                </div>

                                {(!t._view || t._view === 'teeth') && (
                                    <div className="animate-in fade-in duration-300">
                                        <OdontogramSelector 
                                            selectedTeeth={t.teeth || []} 
                                            onToggle={(toothNum) => {
                                                setBudgetForm(prev => {
                                                    const newTreatments = [...prev.treatments];
                                                    const currentTeeth = newTreatments[i].teeth || [];
                                                    
                                                    let newTeeth;
                                                    if (currentTeeth.includes(toothNum)) {
                                                        newTeeth = currentTeeth.filter(n => n !== toothNum);
                                                    } else {
                                                        newTeeth = [...currentTeeth, toothNum];
                                                    }
                                                    
                                                    newTreatments[i] = { ...newTreatments[i], teeth: newTeeth };
                                                    return { ...prev, treatments: newTreatments };
                                                });
                                            }} 
                                        />
                                    </div>
                                )}

                                {(t._view === 'face') && (
                                    <div className="animate-in fade-in duration-300">
                                        <FaceHarmonizationSelector 
                                            selectedRegions={t.face_regions || []} 
                                            onToggle={(regionId) => {
                                                setBudgetForm(prev => {
                                                    const newTreatments = [...prev.treatments];
                                                    const currentRegions = newTreatments[i].face_regions || [];
                                                    
                                                    let newRegions;
                                                    if (currentRegions.includes(regionId)) {
                                                        newRegions = currentRegions.filter(n => n !== regionId);
                                                    } else {
                                                        newRegions = [...currentRegions, regionId];
                                                    }
                                                    
                                                    newTreatments[i] = { ...newTreatments[i], face_regions: newRegions };
                                                    return { ...prev, treatments: newTreatments };
                                                });
                                            }} 
                                        />
                                    </div>
                                )}
                              </div>
                           </details>
                        </div>
                    </div>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <Label>Valor Total (R$)</Label>
                <Input
                    type="number"
                    step="0.01"
                    required
                    readOnly
                    className="bg-gray-100 font-bold"
                    value={budgetForm.total_value}
                    placeholder="0.00"
                />
             </div>
             <div>
                <Label>Profissional Responsável</Label>
                <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    value={budgetForm.professional_id}
                    onChange={(e) => setBudgetForm({...budgetForm, professional_id: e.target.value})}
                >
                    <option value="">Selecione...</option>
                    {allProfessionals.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
             </div>
          </div>

          <div>
             <Label>Observações</Label>
             <textarea
                className="input-field min-h-[100px]"
                value={budgetForm.observations}
                onChange={(e) => setBudgetForm({...budgetForm, observations: e.target.value})}
                placeholder="Observações adicionais..."
             />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowBudgetDialog(false)}>
                Cancelar
            </Button>
            <Button type="submit" className="btn-primary">
                Salvar Orçamento
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {/* Dialog de Confirmação de Exclusão */}
    <Dialog open={showDeleteRecordDialog} onOpenChange={setShowDeleteRecordDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <DialogDescription>Confirme a exclusão do documento</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-700">
            Tem certeza que deseja excluir este documento?
          </p>
          <p className="text-sm text-red-600">
            <strong>Atenção:</strong> Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteRecordDialog(false);
                setRecordToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={confirmDeleteRecord}
            >
              Confirmar Exclusão
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Dialog de Confirmação de Exclusão de Tratamento */}
    <Dialog open={showDeleteTreatmentDialog} onOpenChange={setShowDeleteTreatmentDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <DialogDescription>Confirme a exclusão do tratamento</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-700">
            Tem certeza que deseja excluir este tratamento?
          </p>
          <p className="text-sm text-red-600">
            <strong>Atenção:</strong> Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteTreatmentDialog(false);
                setTreatmentToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={confirmDeleteTreatment}
            >
              Confirmar Exclusão
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Dialog de Confirmação de Exclusão de Anexo */}
    <Dialog open={showDeleteAttachmentDialog} onOpenChange={setShowDeleteAttachmentDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <DialogDescription>Confirme a exclusão do anexo</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-700">
            Tem certeza que deseja excluir este anexo?
          </p>
          <p className="text-sm text-red-600">
            <strong>Atenção:</strong> Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteAttachmentDialog(false);
                setAttachmentToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={async () => {
                if (!attachmentToDelete) return;
                await handleDeleteAttachment(attachmentToDelete);
                setShowDeleteAttachmentDialog(false);
                setAttachmentToDelete(null);
              }}
            >
              Confirmar Exclusão
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Dialog de Confirmação de Exclusão de Orçamento */}
    <Dialog open={showDeleteBudgetDialog} onOpenChange={setShowDeleteBudgetDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <DialogDescription>Confirme a exclusão do orçamento</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-700">
            Tem certeza que deseja excluir este orçamento?
          </p>
          <p className="text-sm text-red-600">
            <strong>Atenção:</strong> Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteBudgetDialog(false);
                setBudgetToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={confirmDeleteBudget}
            >
              Confirmar Exclusão
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
