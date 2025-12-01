import React, { useState, useEffect } from "react";
import api from "../services/api";
import { 
  FileText, Paperclip, Stethoscope, Activity, Users, 
  X, Upload, Trash2, Plus, Edit, Save, AlertCircle,
  Download, CheckCircle, Clock, MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PatientDetailDialog({ patient, isOpen, onClose, onUpdate }) {
  const [activeTab, setActiveTab] = useState("info");
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [services, setServices] = useState([]);
  const [debts, setDebts] = useState({ total_debt: 0, unpaid_appointments: [] });
  const [loading, setLoading] = useState(false);
  
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
    date: new Date().toISOString().split('T')[0],
    service_id: "",
    service_name: "",
    description: "",
    professional_id: "",
    professional_name: "",
    status: "completed"
  });

  // Medical Record form state
  const [showMedicalRecordDialog, setShowMedicalRecordDialog] = useState(false);
  const [showDeleteRecordDialog, setShowDeleteRecordDialog] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
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

  useEffect(() => {
    if (isOpen && patient) {
      loadPatientData();
    }
  }, [isOpen, patient]);

  const loadPatientData = async () => {
    try {
      setLoading(true);
      const [recordsRes, profsRes, servicesRes, debtsRes, appointmentsRes] = await Promise.all([
        api.get(`/patients/${patient.id}/medical-records`),
        api.get(`/professionals`),
        api.get(`/services`),
        api.get(`/patients/${patient.id}/debts`),
        api.get(`/appointments?patient_id=${patient.id}`)
      ]);

      // Filter records for this patient
      setMedicalRecords(recordsRes.data);
      
      // Get professionals from appointments automatically
      const appointmentProfs = appointmentsRes.data || [];
      const uniqueProfIds = [...new Set(appointmentProfs.map(a => a.professional_id).filter(Boolean))];
      const profsFromAppointments = profsRes.data.filter(p => uniqueProfIds.includes(p.id));
      setProfessionals(profsFromAppointments.length > 0 ? profsFromAppointments : profsRes.data);
      
      setServices(servicesRes.data);
      setDebts(debtsRes.data);

      // Load anamnese if exists
      if (patient.anamnese) {
        setAnamnese(patient.anamnese);
      }
    } catch (error) {
      console.error("Error loading patient data:", error);
      toast.error("Erro ao carregar dados do paciente");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande! Tamanho máximo: 10MB");
      return;
    }

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result.split(',')[1];
        
        const attachment = {
          filename: file.name,
          file_data: base64,
          file_type: file.type,
          size_bytes: file.size
        };

        await api.post(`/patients/${patient.id}/attachments`, attachment);
        toast.success("Arquivo anexado com sucesso!");
        loadPatientData(); // Reload patient data immediately
        onUpdate(); // Refresh patient data in parent
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Erro ao anexar arquivo");
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm("Tem certeza que deseja deletar este anexo?")) return;
    
    try {
      await api.delete(`/patients/${patient.id}/attachments/${attachmentId}`);
      toast.success("Anexo removido!");
      onUpdate();
    } catch (error) {
      toast.error("Erro ao remover anexo");
    }
  };

  const handleDownloadAttachment = (attachment) => {
    const link = document.createElement('a');
    link.href = `data:${attachment.file_type};base64,${attachment.file_data}`;
    link.download = attachment.filename;
    link.click();
  };

  const handleSaveAnamnese = async () => {
    try {
      await api.put(`/patients/${patient.id}/anamnese`, anamnese);
      toast.success("Anamnese salva com sucesso!");
      onUpdate();
    } catch (error) {
      toast.error("Erro ao salvar anamnese");
    }
  };

  const handleAddTreatment = async () => {
    if (!treatmentForm.service_id) {
      toast.error("Selecione um serviço");
      return;
    }

    try {
      await api.post(`/patients/${patient.id}/treatments`, treatmentForm);
      toast.success("Tratamento adicionado!");
      setShowTreatmentDialog(false);
      setTreatmentForm({
        date: new Date().toISOString().split('T')[0],
        service_id: "",
        service_name: "",
        description: "",
        professional_id: "",
        professional_name: "",
        status: "completed"
      });
      onUpdate();
    } catch (error) {
      toast.error("Erro ao adicionar tratamento");
    }
  };

  const handleDeleteTreatment = async (treatmentId) => {
    if (!window.confirm("Tem certeza que deseja deletar este tratamento?")) return;
    
    try {
      await api.delete(`/patients/${patient.id}/treatments/${treatmentId}`);
      toast.success("Tratamento removido!");
      onUpdate();
    } catch (error) {
      toast.error("Erro ao remover tratamento");
    }
  };

  const handleServiceChange = (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    if (service) {
      setTreatmentForm({
        ...treatmentForm,
        service_id: serviceId,
        service_name: service.name
      });
    }
  };

  const handleProfessionalChange = (professionalId) => {
    const prof = professionals.find(p => p.id === professionalId);
    if (prof) {
      setTreatmentForm({
        ...treatmentForm,
        professional_id: professionalId,
        professional_name: prof.name
      });
    }
  };

  const handleAddMedicalRecord = async (sendWhatsApp = false) => {
    try {
      let recordId;
      
      if (editingRecord) {
        const response = await api.put(`/medical-records/${editingRecord.id}`, medicalRecordForm);
        recordId = editingRecord.id;
        toast.success("Prontuário atualizado com sucesso!");
      } else {
        const payload = { ...medicalRecordForm, patient_id: patient.id };
        const response = await api.post("/medical-records", payload);
        recordId = response.data.id;
        toast.success("Prontuário criado com sucesso!");
      }

      if (sendWhatsApp && patient.phone) {
        try {
          await api.post("/medical-records/send-whatsapp", {
            record_id: recordId,
            patient_phone: patient.phone,
            patient_name: patient.name
          });
          toast.success("Prontuário enviado via WhatsApp!");
        } catch (error) {
          const errorMessage = error.response?.data?.detail || "Erro ao enviar via WhatsApp. O prontuário foi salvo, mas o envio falhou.";
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
      loadPatientData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || (editingRecord ? "Erro ao atualizar prontuário" : "Erro ao criar prontuário");
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
        patient_name: patient.name
      }, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `prontuario_${patient.name}_${new Date().toISOString().split('T')[0]}.pdf`);
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
      toast.success("Prontuário excluído com sucesso!");
      setShowDeleteRecordDialog(false);
      setRecordToDelete(null);
      loadPatientData();
    } catch (error) {
      toast.error("Erro ao excluir prontuário");
    }
  };

  const handleUseTemplate = (templateType) => {
    let content = "";
    
    if (templateType === "receita") {
      content = "RECEITA MÉDICA\n\nPaciente: " + patient.name + "\nData: " + new Date().toLocaleDateString('pt-BR') + "\n\nMedicamentos Prescritos:\n1. [Medicamento 1] - [Posologia]\n2. [Medicamento 2] - [Posologia]\n\nObservações:\n[Instruções de uso]\n\n___________________________\nDr(a). [Nome]\nCRM: [Número]";
    } else if (templateType === "atestado") {
      content = "ATESTADO MÉDICO\n\nAtesto para os devidos fins que o(a) paciente " + patient.name + " esteve sob meus cuidados médicos e necessita de afastamento de suas atividades por [X] dias, a partir de " + new Date().toLocaleDateString('pt-BR') + ".\n\nCID: [Código se aplicável]\n\nObservações:\n[Observações adicionais]\n\n___________________________\nDr(a). [Nome]\nCRM: [Número]\nData: " + new Date().toLocaleDateString('pt-BR');
    } else {
      content = "PRONTUÁRIO MÉDICO\n\nPaciente: " + patient.name + "\nData da Consulta: " + new Date().toLocaleDateString('pt-BR') + "\n\nQueixa Principal:\n[Descrever sintomas]\n\nHistória da Doença Atual:\n[Histórico]\n\nExame Físico:\n[Resultados do exame]\n\nDiagnóstico:\n[Diagnóstico]\n\nTratamento Proposto:\n[Tratamento]\n\nMedicações:\n[Lista de medicações]\n\nObservações:\n[Observações adicionais]";
    }
    
    setMedicalRecordForm({
      ...medicalRecordForm,
      record_type: templateType,
      observations: content,
      template_used: templateType === "receita" ? "Receita Médica" : templateType === "atestado" ? "Atestado Médico" : "Prontuário Completo"
    });
    toast.success("Template aplicado!");
  };

  if (!patient) return null;

  const tabs = [
    { id: "info", label: "Informações", icon: FileText },
    { id: "attachments", label: "Anexos", icon: Paperclip },
    { id: "records", label: "Prontuários", icon: Stethoscope },
    { id: "treatments", label: "Tratamentos", icon: Activity },
    { id: "anamnese", label: "Anamnese", icon: FileText },
    { id: "professionals", label: "Profissionais", icon: Users }
  ];

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] w-[95vw] md:w-auto flex flex-col p-0 overflow-hidden">
        <div className="flex-shrink-0 p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div>
                <span className="text-2xl">{patient.name}</span>
                {debts.total_debt > 0 && (
                  <span className="ml-4 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                    Débito: R$ {debts.total_debt.toFixed(2)}
                  </span>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 overflow-x-auto mt-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4" style={{minHeight: 0}}>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Carregando...</div>
          ) : (
            <>
              {/* Info Tab */}
              {activeTab === "info" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Email</Label>
                      <p className="text-gray-900">{patient.email}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Telefone</Label>
                      <p className="text-gray-900">{patient.phone}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Data de Nascimento</Label>
                      <p className="text-gray-900">{patient.birthdate}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-gray-700">Endereço</Label>
                      <p className="text-gray-900">{patient.address || "Não informado"}</p>
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

              {/* Attachments Tab */}
              {activeTab === "attachments" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Anexos</h3>
                    <label className="btn-primary cursor-pointer inline-flex items-center">
                      <Upload className="w-4 h-4 mr-2" />
                      Adicionar Arquivo
                      <input type="file" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>

                  {patient.attachments && patient.attachments.length > 0 ? (
                    <div className="grid gap-3">
                      {patient.attachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <Paperclip className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900">{att.filename}</p>
                              <p className="text-sm text-gray-500">
                                {(att.size_bytes / 1024).toFixed(2)} KB - {new Date(att.upload_date).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDownloadAttachment(att)}
                              className="text-blue-500 hover:text-blue-700"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteAttachment(att.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
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
                    <h3 className="text-lg font-semibold">Prontuários do Paciente</h3>
                    <Button onClick={() => setShowMedicalRecordDialog(true)} className="btn-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Prontuário
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
                              className="flex items-center gap-1 px-2 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition ml-auto"
                              title="Excluir prontuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Stethoscope className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Nenhum prontuário cadastrado</p>
                    </div>
                  )}
                </div>
              )}

              {/* Treatments Tab */}
              {activeTab === "treatments" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Tratamentos Realizados</h3>
                    <p className="text-sm text-gray-500">
                      Baseado nos agendamentos do paciente
                    </p>
                  </div>

                  {patient.treatments && patient.treatments.length > 0 ? (
                    <div className="space-y-3">
                      {patient.treatments.map((treatment) => (
                        <div key={treatment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold text-gray-900">{treatment.service_name}</h4>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  treatment.status === 'completed' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {treatment.status === 'completed' ? 'Concluído' : 'Em andamento'}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">
                                Data: {new Date(treatment.date).toLocaleDateString('pt-BR')}
                              </p>
                              {treatment.professional_name && (
                                <p className="text-sm text-gray-600">
                                  Profissional: {treatment.professional_name}
                                </p>
                              )}
                              {treatment.description && (
                                <p className="text-sm text-gray-600 mt-2">{treatment.description}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteTreatment(treatment.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
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

              {/* Professionals Tab */}
              {activeTab === "professionals" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold mb-4">Profissionais que Atenderam</h3>
                  {professionals.length > 0 ? (
                    <div className="grid gap-4">
                      {professionals.map((prof) => (
                        <div key={prof.id} className="border rounded-lg p-4 hover:bg-gray-50">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">{prof.name}</h4>
                              <p className="text-sm text-gray-600">{prof.specialty}</p>
                              <p className="text-sm text-gray-500 mt-1">
                                {prof.appointment_count} agendamento(s)
                              </p>
                            </div>
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Users className="w-16 h-16 mx-auto mb-4 opacity-30" />
                      <p>Nenhum profissional registrado ainda</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>


    {/* Treatment Dialog - Moved outside main dialog */}
    <Dialog open={showTreatmentDialog} onOpenChange={setShowTreatmentDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Tratamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Data do Tratamento *</Label>
            <Input
              type="date"
              value={treatmentForm.date}
              onChange={(e) => setTreatmentForm({...treatmentForm, date: e.target.value})}
            />
          </div>
          <div>
            <Label>Serviço Realizado *</Label>
            <select
              className="input-field"
              value={treatmentForm.service_id}
              onChange={(e) => handleServiceChange(e.target.value)}
            >
              <option value="">Selecione um serviço</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Profissional (opcional)</Label>
            <select
              className="input-field"
              value={treatmentForm.professional_id}
              onChange={(e) => handleProfessionalChange(e.target.value)}
            >
              <option value="">Nenhum</option>
              {professionals.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Status</Label>
            <select
              className="input-field"
              value={treatmentForm.status}
              onChange={(e) => setTreatmentForm({...treatmentForm, status: e.target.value})}
            >
              <option value="completed">Concluído</option>
              <option value="in_progress">Em andamento</option>
            </select>
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <textarea
              className="input-field"
              value={treatmentForm.description}
              onChange={(e) => setTreatmentForm({...treatmentForm, description: e.target.value})}
              placeholder="Observações sobre o tratamento"
              rows={3}
            />
          </div>
          <Button onClick={handleAddTreatment} className="w-full btn-primary">
            Adicionar Tratamento
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
          <DialogTitle>{editingRecord ? "Editar Prontuário" : "Novo Prontuário"} - {patient?.name}</DialogTitle>
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
              <option value="prontuario">Prontuário Completo</option>
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
            <Label>Conteúdo Completo do Prontuário</Label>
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
              disabled={!patient.phone}
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              Salvar e Enviar WhatsApp
            </Button>
          </div>
          {!patient.phone && (
            <p className="text-xs text-amber-600 text-center mt-2">
              ⚠️ Paciente não tem telefone cadastrado
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Dialog de Confirmação de Exclusão */}
    <Dialog open={showDeleteRecordDialog} onOpenChange={setShowDeleteRecordDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-700">
            Tem certeza que deseja excluir este prontuário?
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
    </>
  );
}
