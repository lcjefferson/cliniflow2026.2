import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Edit, Trash2, Eye, ChevronLeft, ChevronRight, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PatientDetailDialog from "../components/PatientDetailDialog";

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", birthdate: "", address: "" });
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [patientDebts, setPatientDebts] = useState({});

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      const response = await api.get("/patients");
      setPatients(response.data);
      
      // Load debts for each patient
      const debtsPromises = response.data.map(p => 
        api.get(`/patients/${p.id}/debts`).catch(() => ({ data: { total_debt: 0 } }))
      );
      const debtsResults = await Promise.all(debtsPromises);
      
      const debtsMap = {};
      response.data.forEach((p, index) => {
        debtsMap[p.id] = debtsResults[index].data.total_debt;
      });
      setPatientDebts(debtsMap);
    } catch (error) {
      toast.error("Erro ao carregar pacientes");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/patients/${editingId}`, formData);
        toast.success("Paciente atualizado!");
      } else {
        await api.post("/patients", formData);
        toast.success("Paciente cadastrado!");
      }
      
      setShowDialog(false);
      setEditingId(null);
      setFormData({ name: "", email: "", phone: "", birthdate: "", address: "" });
      loadPatients();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar paciente" : "Erro ao cadastrar paciente");
    }
  };

  const handleEdit = (patient) => {
    setEditingId(patient.id);
    setFormData({
      name: patient.name,
      email: patient.email,
      phone: patient.phone,
      birthdate: patient.birthdate,
      address: patient.address || ""
    });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/patients/${id}`);
      toast.success("Paciente removido!");
      loadPatients();
    } catch (error) {
      toast.error("Erro ao remover paciente");
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData({ name: "", email: "", phone: "", birthdate: "", address: "" });
  };

  const handleViewDetails = (patient) => {
    setSelectedPatient(patient);
    setShowDetailDialog(true);
  };

  const handleCloseDetailDialog = () => {
    setShowDetailDialog(false);
    setSelectedPatient(null);
  };

  const handleUpdatePatient = async () => {
    await loadPatients();
  };
  const formatPhone = (value) => {
    const digits = (value || "").replace(/\D/g, "").slice(0, 11);
    const part1 = digits.slice(0, 2);
    const part2 = digits.slice(2, 7);
    const part3 = digits.slice(7, 11);
    if (digits.length <= 2) return part1 ? `(${part1}` : "";
    if (digits.length <= 7) return `(${part1}) ${part2}`;
    return `(${part1}) ${part2}-${part3}`;
  };

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900" data-testid="patients-page-title">Pacientes</h1>
          <Button onClick={() => setShowDialog(true)} className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Adicionar Paciente
          </Button>
        </div>

        {/* Barra de Pesquisa */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label className="text-sm font-semibold mb-2 block">Pesquisar Paciente</Label>
              <Input
                placeholder="Nome, telefone ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {searchTerm && (
              <Button
                onClick={() => setSearchTerm("")}
                variant="outline"
                className="btn-secondary"
              >
                <X className="w-4 h-4 mr-2" />
                Limpar
              </Button>
            )}
          </div>
          {searchTerm && (
            <p className="mt-3 text-sm text-gray-600">
              {patients.filter(p => 
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.phone.includes(searchTerm) ||
                p.email.toLowerCase().includes(searchTerm.toLowerCase())
              ).length} resultado(s) encontrado(s)
            </p>
          )}
        </div>

        <div className="grid gap-6">
          {patients
            .filter(p => {
              if (!searchTerm) return true;
              return p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     p.phone.includes(searchTerm) ||
                     p.email.toLowerCase().includes(searchTerm.toLowerCase());
            })
            .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
            .map((patient) => (
            <div key={patient.id} className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{patient.name}</h3>
                    {patientDebts[patient.id] > 0 && (
                      <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                        <AlertCircle className="w-4 h-4" />
                        Débito: R$ {patientDebts[patient.id].toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-gray-600">{patient.email}</p>
                    <p className="text-gray-600">{patient.phone}</p>
                    <p className="text-gray-600">Nascimento: {patient.birthdate}</p>
                    {patient.address && <p className="text-gray-600">{patient.address}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewDetails(patient)}
                    className="text-purple-500 hover:text-purple-700"
                    title="Ver Detalhes"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleEdit(patient)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(patient.id)}
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
              <DialogTitle>{editingId ? "Editar Paciente" : "Adicionar Paciente"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div>
                <Label>Telefone *</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: formatPhone(e.target.value)})} required />
              </div>
              <div>
                <Label>Data de Nascimento *</Label>
                <Input type="date" value={formData.birthdate} onChange={(e) => setFormData({...formData, birthdate: e.target.value})} required />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Paginação */}
        {Math.ceil(patients.length / itemsPerPage) > 1 && (
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
              Página {currentPage} de {Math.ceil(patients.length / itemsPerPage)}
            </span>
            <Button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === Math.ceil(patients.length / itemsPerPage)}
              variant="outline"
              className="btn-secondary"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* Patient Detail Dialog */}
        <PatientDetailDialog
          patient={selectedPatient}
          isOpen={showDetailDialog}
          onClose={handleCloseDetailDialog}
          onUpdate={handleUpdatePatient}
        />
      </div>
    </Layout>
  );
}
