import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/api";
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfessionalsPage() {
  const [professionals, setProfessionals] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [formData, setFormData] = useState({ name: "", specialty: "", email: "", phone: "", color: "" });
  const { user } = useAuth();
  const isAdmin = (user?.role?.is_admin) || (user?.user_type === "admin") || (user?.user_type === "superuser");
  const canManage = isAdmin || (user?.user_type === "consultor");

  const colorOptions = [
    "bg-blue-500","bg-blue-600","bg-blue-700",
    "bg-indigo-500","bg-indigo-600","bg-indigo-700",
    "bg-purple-500","bg-purple-600","bg-purple-700",
    "bg-violet-500","bg-violet-600","bg-violet-700",
    "bg-fuchsia-500","bg-fuchsia-600","bg-fuchsia-700",
    "bg-pink-500","bg-pink-600","bg-pink-700",
    "bg-sky-500","bg-sky-600","bg-sky-700",
    "bg-cyan-500","bg-cyan-600","bg-cyan-700",
    "bg-teal-500","bg-teal-600","bg-teal-700",
  ];

  useEffect(() => {
    loadProfessionals();
  }, []);

  const loadProfessionals = async () => {
    const response = await api.get("/professionals");
    setProfessionals(response.data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/professionals/${editingId}`, formData);
        toast.success("Profissional atualizado!");
      } else {
        await api.post("/professionals", formData);
        toast.success("Profissional cadastrado!");
      }
      setShowDialog(false);
      setEditingId(null);
      setFormData({ name: "", specialty: "", email: "", phone: "", color: "" });
      loadProfessionals();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar profissional" : "Erro ao cadastrar profissional");
    }
  };

  const handleEdit = (prof) => {
    setEditingId(prof.id);
    setFormData({
      name: prof.name,
      specialty: prof.specialty,
      email: prof.email,
      phone: prof.phone,
      color: prof.color || ""
    });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/professionals/${id}`);
      toast.success("Profissional removido!");
      loadProfessionals();
    } catch (error) {
      toast.error("Erro ao remover profissional");
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData({ name: "", specialty: "", email: "", phone: "", color: "" });
  };

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Profissionais</h1>
          {canManage && (
            <Button onClick={() => setShowDialog(true)} data-testid="add-professional-button" className="btn-primary">
              <Plus className="w-5 h-5 mr-2" />
              Adicionar Profissional
            </Button>
          )}
        </div>

        <div className="grid gap-6">
          {professionals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((prof) => (
            <div key={prof.id} className="bg-white rounded-2xl p-6 shadow-lg" data-testid={`professional-${prof.id}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{prof.name}</h3>
                  <p className="text-blue-600">{prof.specialty}</p>
                  <p className="text-gray-600 mt-2">{prof.email}</p>
                  <p className="text-gray-600">{prof.phone}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-sm text-gray-600">Cor:</span>
                    <div className={`w-4 h-4 rounded ${prof.color || "bg-gray-300"}`}></div>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(prof)}
                      data-testid={`edit-professional-${prof.id}`}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(prof.id)}
                      data-testid={`delete-professional-${prof.id}`}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent data-testid="professional-dialog">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Profissional" : "Adicionar Profissional"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  data-testid="professional-name-input"
                  required
                />
              </div>
              <div>
                <Label>Especialidade</Label>
                <Input
                  value={formData.specialty}
                  onChange={(e) => setFormData({...formData, specialty: e.target.value})}
                  data-testid="professional-specialty-input"
                  required
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  data-testid="professional-email-input"
                  required
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  data-testid="professional-phone-input"
                  required
                />
              </div>
              <div>
                <Label>Cor</Label>
                <select
                  className="input-field"
                  value={formData.color}
                  onChange={(e) => setFormData({...formData, color: e.target.value})}
                >
                  <option value="">Selecione uma cor</option>
                  {colorOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {colorOptions.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setFormData({...formData, color: c})}
                      className={`w-7 h-7 rounded ${c} border-2 ${formData.color === c ? 'border-black' : 'border-transparent'}`}
                      aria-label={c}
                      title={c}
                    />
                  ))}
                </div>
              </div>
              <Button type="submit" data-testid="submit-professional-button" className="w-full btn-primary">
                {editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Paginação */}
        {Math.ceil(professionals.length / itemsPerPage) > 1 && (
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
              Página {currentPage} de {Math.ceil(professionals.length / itemsPerPage)}
            </span>
            <Button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === Math.ceil(professionals.length / itemsPerPage)}
              variant="outline"
              className="btn-secondary"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
