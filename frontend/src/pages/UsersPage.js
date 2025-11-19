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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, formData);
        toast.success("Usuário atualizado!");
      }
      setShowDialog(false);
      setEditingUser(null);
      setFormData({
        name: "",
        email: "",
        user_type: "consultor",
        professional_id: "",
        is_admin: false
      });
      loadUsers();
    } catch (error) {
      toast.error("Erro ao atualizar usuário");
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Tem certeza que deseja deletar este usuário?")) return;

    try {
      await api.delete(`/users/${userId}`);
      toast.success("Usuário deletado!");
      loadUsers();
    } catch (error) {
      toast.error("Erro ao deletar usuário");
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingUser(null);
    setFormData({
      name: "",
      email: "",
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
                    onClick={() => handleDelete(user.id)}
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

        {/* Modal de Editar Usuário */}
        <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  required 
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input 
                  type="email" 
                  value={formData.email} 
                  onChange={(e) => setFormData({...formData, email: e.target.value})} 
                  required 
                />
              </div>
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
                Salvar Alterações
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
