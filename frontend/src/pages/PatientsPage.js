import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Edit, Trash2, Eye, ChevronLeft, ChevronRight, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PatientDetailDialog from "../components/PatientDetailDialog";

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", birthdate: "", address: "", cpf: "" });
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [filterDebt, setFilterDebt] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState(null);

  useEffect(() => {
    loadPatients();
  }, [sortBy, order, filterDebt, currentPage]);

  const loadPatients = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/patients", {
        params: { page: currentPage, page_size: pageSize, sort_by: sortBy, order, has_debt: filterDebt },
      });
      setPatients(response.data);
    } catch (error) {
      setError(error);
      toast.error("Erro ao carregar pacientes");
    } finally {
      setLoading(false);
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
      setFormData({ name: "", email: "", phone: "", birthdate: "", address: "", cpf: "" });
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
      address: patient.address || "",
      cpf: patient.cpf || ""
    });
    setShowDialog(true);
  };

  const handleDelete = (patient) => {
    setPatientToDelete(patient);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!patientToDelete) return;
    try {
      await api.delete(`/patients/${patientToDelete.id}`);
      toast.success("Paciente removido!");
      loadPatients();
    } catch (error) {
      console.error("Error deleting patient:", error);
      toast.error("Erro ao remover paciente");
    } finally {
      setShowDeleteDialog(false);
      setPatientToDelete(null);
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData({ name: "", email: "", phone: "", birthdate: "", address: "", cpf: "" });
  };

  const handleViewDetails = (patient) => {
    setSelectedPatient(patient);
    setShowDetailDialog(true);
  };

  const handleCloseDetailDialog = () => {
    setShowDetailDialog(false);
    setSelectedPatient(null);
  };

  const handleUpdatePatient = (updatedPatient) => {
    setPatients(prevPatients => 
      prevPatients.map(p => p.id === updatedPatient.id ? updatedPatient : p)
    );
    setSelectedPatient(updatedPatient);
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

        {/* Barra de Pesquisa e Filtros */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="flex-1">
              <Label className="text-sm font-semibold mb-2 block">Pesquisar Paciente</Label>
              <Input
                placeholder="Nome, telefone ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm font-semibold mb-2 block">Ordenação</Label>
              <select
                className="input-field w-full"
                value={`${sortBy}:${order}`}
                onChange={(e) => {
                  const [sb, ord] = e.target.value.split(":");
                  setSortBy(sb);
                  setOrder(ord);
                  setCurrentPage(1);
                }}
              >
                <option value="created_at:desc">Mais recentes</option>
                <option value="created_at:asc">Mais antigos</option>
                <option value="name:asc">Nome (A-Z)</option>
                <option value="name:desc">Nome (Z-A)</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="filterDebt"
                type="checkbox"
                checked={filterDebt}
                onChange={(e) => { setFilterDebt(e.target.checked); setCurrentPage(1); }}
              />
              <Label htmlFor="filterDebt" className="text-sm font-semibold">Apenas com débito</Label>
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
              {patients.filter(p => {
                if (!searchTerm) return true;
                const patientName = p.name || "";
                const patientEmail = p.email || "";
                const patientPhone = p.phone || "";
                return patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       patientPhone.includes(searchTerm) ||
                       patientEmail.toLowerCase().includes(searchTerm.toLowerCase());
              }).length} resultado(s) encontrado(s)
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading ? (
            <div className="flex justify-center items-center p-10 col-span-full">
              <p className="text-lg text-gray-600">Carregando pacientes...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-10 bg-red-50 border border-red-200 rounded-2xl col-span-full">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-lg text-red-700 font-semibold mb-2">Erro ao Carregar Pacientes</p>
              <p className="text-gray-600 text-center mb-6">Não foi possível buscar a lista de pacientes. Verifique sua conexão ou tente novamente.</p>
              <Button onClick={() => loadPatients()} className="btn-primary">
                <X className="w-4 h-4 mr-2" />
                Tentar Novamente
              </Button>
            </div>
          ) : patients
            .filter(p => {
              if (!searchTerm) return true;
              const patientName = p.name || "";
              const patientEmail = p.email || "";
              const patientPhone = p.phone || "";
              return patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     patientPhone.includes(searchTerm) ||
                     patientEmail.toLowerCase().includes(searchTerm.toLowerCase());
            })
            .map((patient) => (
            <div key={patient.id} className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{patient.name}</h3>
                    {patient.total_debt > 0 && (
                      <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                        <AlertCircle className="w-4 h-4" />
                        Débito: R$ {patient.total_debt.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-gray-600">{patient.email}</p>
                    <p className="text-gray-600">{patient.phone}</p>
                    <p className="text-gray-600">Nascimento: {patient.birthdate}</p>
                    {patient.cpf && <p className="text-gray-600">CPF: {patient.cpf}</p>}
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
                    onClick={() => handleDelete(patient)}
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
                <Label>Telefone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: formatPhone(e.target.value)})} />
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <Input type="date" value={formData.birthdate} onChange={(e) => setFormData({...formData, birthdate: e.target.value})} />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={formData.cpf} onChange={(e) => setFormData({...formData, cpf: e.target.value})} />
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Paginação (server-side: uma página por vez) */}
        {patients.length > 0 && (
          <div className="flex justify-center items-center gap-4 mt-8">
            <Button
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 1}
              variant="outline"
              className="btn-secondary"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-gray-700">
              Página {currentPage}
              {patients.length >= pageSize && " (há mais)"}
            </span>
            <Button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={patients.length < pageSize}
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
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir o paciente <strong>{patientToDelete?.name}</strong>?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-red-600">
                <strong>Atenção:</strong> Esta ação não pode ser desfeita e removerá todos os dados associados.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setPatientToDelete(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="bg-red-500 hover:bg-red-600 text-white"
                  onClick={confirmDelete}
                >
                  Confirmar Exclusão
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
