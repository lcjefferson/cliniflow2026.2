import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "", duration_minutes: "", price: "" });
  useEffect(() => {
    loadServices();
  }, []);
  const loadServices = async () => {
    try {
      const response = await api.get("/services");
      setServices(response.data);
    } catch (error) {
      if (error.response?.status !== 401) {
        toast.error("Erro ao carregar serviços");
      }
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
      await api.post("/services", {
        ...formData,
        duration_minutes: parseInt(formData.duration_minutes),
        price: parseFloat(formData.price)
      });
      toast.success("Serviço cadastrado!");
      setShowDialog(false);
      setFormData({ name: "", description: "", duration_minutes: "", price: "" });
      loadServices();
        toast.error("Erro ao cadastrar serviço");
  const handleDelete = async (id) => {
      await api.delete(`/services/${id}`);
      toast.success("Serviço removido!");
        toast.error("Erro ao remover serviço");
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
          {services.map((service) => (
            <div key={service.id} className="bg-white rounded-2xl p-6 shadow-lg" data-testid={`service-${service.id}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">{service.name}</h3>
                  <p className="text-gray-600 mt-2">{service.description}</p>
                  <div className="flex gap-6 mt-4">
                    <div>
                      <span className="text-sm text-gray-500">Duração:</span>
                      <p className="text-blue-600 font-semibold">{service.duration_minutes} minutos</p>
                    </div>
                      <span className="text-sm text-gray-500">Preço:</span>
                      <p className="text-green-600 font-semibold">R$ {service.price.toFixed(2)}</p>
                  </div>
                </div>
                <button onClick={() => handleDelete(service.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent data-testid="service-dialog">
            <DialogHeader>
              <DialogTitle>Adicionar Serviço</DialogTitle>
              <DialogDescription>
                Cadastre um novo serviço oferecido pela clínica com preço e duração
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome do Serviço</Label>
                <Input data-testid="service-name-input" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                <Label>Descrição</Label>
                <Input data-testid="service-description-input" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
                <Label>Duração (minutos)</Label>
                <Input data-testid="service-duration-input" type="number" value={formData.duration_minutes} onChange={(e) => setFormData({...formData, duration_minutes: e.target.value})} required />
                <Label>Preço (R$)</Label>
                <Input data-testid="service-price-input" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} required />
              <Button type="submit" data-testid="submit-service-button" className="w-full btn-primary">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
