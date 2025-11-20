import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [formData, setFormData] = useState({ name: "", description: "" });

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      const response = await api.get("/services");
      setServices(response.data);
    } catch (error) {
      toast.error("Erro ao carregar serviços");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/services/${editingId}`, formData);
        toast.success("Serviço atualizado!");
      } else {
        await api.post("/services", formData);
        toast.success("Serviço cadastrado!");
      }
      
      setShowDialog(false);
      setEditingId(null);
      setFormData({ name: "", description: "" });
      loadServices();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar serviço" : "Erro ao cadastrar serviço");
    }
  };

  const handleEdit = (service) => {
    setEditingId(service.id);
    setFormData({
      name: service.name,
      description: service.description
    });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/services/${id}`);
      toast.success("Serviço removido!");
      loadServices();
    } catch (error) {
      toast.error("Erro ao remover serviço");
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData({ name: "", description: "" });
  };

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900" data-testid="services-page-title">Serviços</h1>
          <Button onClick={() => setShowDialog(true)} data-testid="add-service-button" className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Adicionar Serviço
          </Button>
        </div>

        <div className="grid gap-6">
          {services.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((service) => (
            <div key={service.id} className="bg-white rounded-2xl p-6 shadow-lg" data-testid={`service-${service.id}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">{service.name}</h3>
                  <p className="text-gray-600 mt-2">{service.description}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleEdit(service)} 
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleDelete(service.id)} 
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
          <DialogContent data-testid="service-dialog">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Serviço" : "Adicionar Serviço"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome do Serviço</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
              </div>
              <Button type="submit" className="w-full btn-primary">
                {editingId ? "Atualizar" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Paginação */}
        {Math.ceil(services.length / itemsPerPage) > 1 && (
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
              Página {currentPage} de {Math.ceil(services.length / itemsPerPage)}
            </span>
            <Button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === Math.ceil(services.length / itemsPerPage)}
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
