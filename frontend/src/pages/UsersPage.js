import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    user_type: "consultor",
    professional_id: "",
    is_admin: false
  });

  useEffect(() => {
    loadUsers();
    loadProfessionals();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get("/users");
      setUsers(response.data);
    } catch (error) {
      toast.error("Erro ao carregar usuários");
    }
  };

  const loadProfessionals = async () => {
    try {
      const response = await api.get("/professionals");
      setProfessionals(response.data);
    } catch (error) {
      console.error("Erro ao carregar profissionais");
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      user_type: user.user_type || "consultor",
      professional_id: user.professional_id || "",
      is_admin: user.role?.is_admin || false
    });
    setShowDialog(true);
  };

  const handleNewUser = () => {
    setEditingUser(null);
    setFormData({
      name: "",
      email: "",
      password: "",
      user_type: "consultor",
      professional_id: "",
      is_admin: false
    });
    setShowDialog(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        // Editar usuário existente
        const updateData = {
          name: formData.name,
          email: formData.email,
          user_type: formData.user_type,
          professional_id: formData.professional_id,
          is_admin: formData.is_admin
        };
        await api.put(`/users/${editingUser.id}`, updateData);
        toast.success("Usuário atualizado!");
      } else {
        // Criar novo usuário
        if (!formData.password) {
          toast.error("Senha é obrigatória para novo usuário");
          return;
        }
        await api.post("/auth/register", formData);
        toast.success("Usuário criado com sucesso!");
      }
      setShowDialog(false);
      setEditingUser(null);
      setFormData({
        name: "",
        email: "",
        password: "",
        user_type: "consultor",
        professional_id: "",
        is_admin: false
      });
      loadUsers();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || (editingUser ? "Erro ao atualizar usuário" : "Erro ao criar usuário");
      toast.error(errorMsg);
    }
  };

  const handleDelete = (user) => {
    setUserToDelete(user);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;

    try {
      await api.delete(`/users/${userToDelete.id}`);
      toast.success("Usuário deletado!");
      setShowDeleteDialog(false);
      setUserToDelete(null);
      loadUsers();
    } catch (error) {
      toast.error("Erro ao deletar usuário");
      setShowDeleteDialog(false);
      setUserToDelete(null);
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingUser(null);
    setFormData({
      name: "",
      email: "",
      password: "",
      user_type: "consultor",
      professional_id: "",
      is_admin: false
    });
  };

  const getUserTypeBadge = (userType) => {
    const styles = {
      admin: "bg-purple-100 text-purple-700",
      consultor: "bg-blue-100 text-blue-700",
      profissional: "bg-green-100 text-green-700"
    };
    const labels = {
      admin: "Super Usuário",
      consultor: "Consultor",
      profissional: "Profissional"
    };
    return <span className={`px-3 py-1 rounded-full text-sm font-semibold ${styles[userType] || styles.consultor}`}>
      {labels[userType] || "Consultor"}
    </span>;
  };

  const getProfessionalName = (professionalId) => {
    const prof = professionals.find(p => p.id === professionalId);
    return prof ? prof.name : "-";
  };

  // Paginação
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentUsers = users.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(users.length / itemsPerPage);

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Gerenciar Usuários</h1>
          <Button onClick={handleNewUser} className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Adicionar Usuário
          </Button>
        </div>

        <div className="grid gap-6">
          {currentUsers.map((user) => (
            <div key={user.id} className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
                    {getUserTypeBadge(user.user_type)}
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-600">Email: {user.email}</p>
                    {user.user_type === "profissional" && user.professional_id && (
                      <p className="text-gray-600">
                        Profissional vinculado: {getProfessionalName(user.professional_id)}
                      </p>
                    )}
                    <p className="text-sm text-gray-500">
                      Criado em: {new Date(user.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(user)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(user)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
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

        {/* Modal de Criar/Editar Usuário */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingUser ? "Editar Usuário" : "Adicionar Novo Usuário"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  required 
                  placeholder="Nome completo do usuário"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => setFormData({...formData, email: e.target.value})} 
                  required 
                  placeholder="email@exemplo.com"
                />
              </div>
              {!editingUser && (
                <div>
                  <Label>Senha *</Label>
                  <Input 
                    type="password" 
                    value={formData.password} 
                    onChange={(e) => setFormData({...formData, password: e.target.value})} 
                    required 
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                  />
                </div>
              )}
              <div>
                <Label>Tipo de Usuário</Label>
                <select
                  className="input-field"
                  value={formData.user_type}
                  onChange={(e) => setFormData({...formData, user_type: e.target.value})}
                >
                  <option value="admin">Super Usuário</option>
                  <option value="consultor">Consultor</option>
                  <option value="profissional">Profissional</option>
                </select>
              </div>
              {formData.user_type === "profissional" && (
                <div>
                  <Label>Profissional Vinculado</Label>
                  <select
                    className="input-field"
                    value={formData.professional_id}
                    onChange={(e) => setFormData({...formData, professional_id: e.target.value})}
                  >
                    <option value="">Selecione um profissional</option>
                    {professionals.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={formData.is_admin}
                  onChange={(e) => setFormData({...formData, is_admin: e.target.checked})}
                />
                <Label htmlFor="is_admin">Permissão de Administrador</Label>
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingUser ? "Salvar Alterações" : "Criar Usuário"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal de Confirmação de Exclusão */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">
                Tem certeza que deseja deletar o usuário <strong>{userToDelete?.name}</strong>?
              </p>
              <p className="text-sm text-gray-500">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowDeleteDialog(false);
                    setUserToDelete(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
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
