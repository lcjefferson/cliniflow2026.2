import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Edit, Trash2, FileText, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function MedicalRecordsPage() {
  const [records, setRecords] = useState([]);
  const [patients, setPatients] = useState([]);
  const [templates, setTemplates] = useState([
    { id: "receita", name: "Receita Médica", type: "receita" },
    { id: "atestado", name: "Atestado Médico", type: "atestado" },
    { id: "prontuario", name: "Prontuário Completo", type: "prontuario" }
  ]);
  const [showDialog, setShowDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [formData, setFormData] = useState({
    patient_id: "",
    record_type: "prontuario",
    diagnosis: "",
    symptoms: "",
    treatment: "",
    medications: "",
    observations: "",
    doctor_name: "",
    crm: "",
    template_used: ""
  });
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    type: "prontuario",
    content: ""
  });

  useEffect(() => {
    loadRecords();
    loadPatients();
  }, []);

  const loadRecords = async () => {
    try {
      const response = await api.get("/medical-records");
      setRecords(response.data);
    } catch (error) {
      toast.error("Erro ao carregar prontuários");
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/medical-records/${editingId}`, formData);
        toast.success("Prontuário atualizado!");
      } else {
        await api.post("/medical-records", formData);
        toast.success("Prontuário criado!");
      }
      setShowDialog(false);
      setEditingId(null);
      setFormData({
        patient_id: "",
        record_type: "prontuario",
        diagnosis: "",
        symptoms: "",
        treatment: "",
        medications: "",
        observations: "",
        doctor_name: "",
        crm: "",
        template_used: ""
      });
      loadRecords();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar prontuário" : "Erro ao criar prontuário");
    }
  };

  const handleEdit = (record) => {
    setEditingId(record.id);
    setFormData({
      patient_id: record.patient_id,
      record_type: record.record_type,
      diagnosis: record.diagnosis || "",
      symptoms: record.symptoms || "",
      treatment: record.treatment || "",
      medications: record.medications || "",
      observations: record.observations || "",
      doctor_name: record.doctor_name || "",
      crm: record.crm || "",
      template_used: record.template_used || ""
    });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar este prontuário?")) return;
    
    try {
      await api.delete(`/medical-records/${id}`);
      toast.success("Prontuário deletado!");
      loadRecords();
    } catch (error) {
      toast.error("Erro ao deletar prontuário");
    }
  };

  const handleUseTemplate = (template) => {
    let content = "";
    
    if (template.type === "receita") {
      content = "RECEITA MÉDICA\n\nPaciente: [Nome do Paciente]\nData: [Data]\n\nMedicamentos Prescritos:\n1. [Medicamento 1] - [Posologia]\n2. [Medicamento 2] - [Posologia]\n\nObservações:\n[Instruções de uso]\n\n___________________________\nDr(a). [Nome]\nCRM: [Número]";
    } else if (template.type === "atestado") {
      content = "ATESTADO MÉDICO\n\nAtesto para os devidos fins que o(a) paciente [Nome do Paciente] esteve sob meus cuidados médicos e necessita de afastamento de suas atividades por [X] dias, a partir de [Data].\n\nCID: [Código se aplicável]\n\nObservações:\n[Observações adicionais]\n\n___________________________\nDr(a). [Nome]\nCRM: [Número]\nData: [Data]";
    } else {
      content = "PRONTUÁRIO MÉDICO\n\nPaciente: [Nome]\nData da Consulta: [Data]\n\nQueixa Principal:\n[Descrever sintomas]\n\nHistória da Doença Atual:\n[Histórico]\n\nExame Físico:\n[Resultados do exame]\n\nDiagnóstico:\n[Diagnóstico]\n\nTratamento Proposto:\n[Tratamento]\n\nMedicações:\n[Lista de medicações]\n\nObservações:\n[Observações adicionais]";
    }
    
    setFormData({
      ...formData,
      record_type: template.type,
      observations: content,
      template_used: template.name
    });
    toast.success(`Template "${template.name}" aplicado!`);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData({
      patient_id: "",
      record_type: "prontuario",
      diagnosis: "",
      symptoms: "",
      treatment: "",
      medications: "",
      observations: "",
      doctor_name: "",
      crm: "",
      template_used: ""
    });
  };

  const getPatientName = (patientId) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.name : "Paciente";
  };

  const getRecordTypeLabel = (type) => {
    const labels = {
      prontuario: "Prontuário",
      receita: "Receita",
      atestado: "Atestado"
    };
    return labels[type] || type;
  };

  // Paginação
  const currentRecords = records.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(records.length / itemsPerPage);

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Prontuários Médicos</h1>
          <Button onClick={() => setShowDialog(true)} className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Novo Prontuário
          </Button>
        </div>

        {/* Templates Rápidos */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Templates Disponíveis</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  setShowDialog(true);
                  handleUseTemplate(template);
                }}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
              >
                <FileText className="w-8 h-8 text-blue-500 mb-2" />
                <h4 className="font-semibold text-gray-900">{template.name}</h4>
                <p className="text-sm text-gray-500 mt-1">Clique para usar este template</p>
              </button>
            ))}
          </div>
        </div>

        {/* Lista de Prontuários */}
        <div className="grid gap-6">
          {currentRecords.map((record) => (
            <div key={record.id} className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-xl font-bold text-gray-900">
                      {getPatientName(record.patient_id)}
                    </h3>
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                      {getRecordTypeLabel(record.record_type)}
                    </span>
                  </div>
                  
                  {record.diagnosis && (
                    <div className="mb-2">
                      <span className="font-semibold text-gray-700">Diagnóstico:</span>
                      <p className="text-gray-600">{record.diagnosis}</p>
                    </div>
                  )}
                  
                  {record.symptoms && (
                    <div className="mb-2">
                      <span className="font-semibold text-gray-700">Sintomas:</span>
                      <p className="text-gray-600">{record.symptoms}</p>
                    </div>
                  )}
                  
                  {record.medications && (
                    <div className="mb-2">
                      <span className="font-semibold text-gray-700">Medicações:</span>
                      <p className="text-gray-600">{record.medications}</p>
                    </div>
                  )}
                  
                  {record.doctor_name && (
                    <p className="text-sm text-gray-500 mt-3">
                      Dr(a). {record.doctor_name} {record.crm && `- CRM: ${record.crm}`}
                    </p>
                  )}
                  
                  <p className="text-xs text-gray-400 mt-2">
                    Criado em: {new Date(record.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(record)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {records.length === 0 && (
            <div className="text-center py-12 text-gray-500 bg-white rounded-2xl shadow-lg">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>Nenhum prontuário cadastrado ainda</p>
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

        {/* Modal de Criar/Editar Prontuário */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Prontuário" : "Novo Prontuário"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Paciente *</Label>
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
                  <Label>Tipo de Documento *</Label>
                  <select
                    className="input-field"
                    value={formData.record_type}
                    onChange={(e) => setFormData({...formData, record_type: e.target.value})}
                  >
                    <option value="prontuario">Prontuário Completo</option>
                    <option value="receita">Receita Médica</option>
                    <option value="atestado">Atestado Médico</option>
                  </select>
                </div>
              </div>

              <div>
                <Label>Sintomas</Label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={formData.symptoms}
                  onChange={(e) => setFormData({...formData, symptoms: e.target.value})}
                  placeholder="Descreva os sintomas apresentados pelo paciente"
                />
              </div>

              <div>
                <Label>Diagnóstico</Label>
                <Input
                  value={formData.diagnosis}
                  onChange={(e) => setFormData({...formData, diagnosis: e.target.value})}
                  placeholder="Diagnóstico médico"
                />
              </div>

              <div>
                <Label>Tratamento Proposto</Label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={formData.treatment}
                  onChange={(e) => setFormData({...formData, treatment: e.target.value})}
                  placeholder="Descreva o tratamento recomendado"
                />
              </div>

              <div>
                <Label>Medicações Prescritas</Label>
                <textarea
                  className="input-field min-h-[80px]"
                  value={formData.medications}
                  onChange={(e) => setFormData({...formData, medications: e.target.value})}
                  placeholder="Liste as medicações e posologia"
                />
              </div>

              <div>
                <Label>Observações / Conteúdo Completo</Label>
                <textarea
                  className="input-field min-h-[200px] font-mono text-sm"
                  value={formData.observations}
                  onChange={(e) => setFormData({...formData, observations: e.target.value})}
                  placeholder="Observações adicionais ou conteúdo completo do documento"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome do Médico</Label>
                  <Input
                    value={formData.doctor_name}
                    onChange={(e) => setFormData({...formData, doctor_name: e.target.value})}
                    placeholder="Dr(a). Nome Completo"
                  />
                </div>
                <div>
                  <Label>CRM</Label>
                  <Input
                    value={formData.crm}
                    onChange={(e) => setFormData({...formData, crm: e.target.value})}
                    placeholder="CRM/UF"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full btn-primary">
                <Save className="w-5 h-5 mr-2" />
                {editingId ? "Salvar Alterações" : "Criar Prontuário"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
