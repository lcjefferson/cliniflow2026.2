import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", birthdate: "", address: "" });

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      const response = await api.get("/patients");
      setPatients(response.data);
    } catch (error) {
      // Não mostrar erro se for 401 (usuário será redirecionado)
      if (error.response?.status !== 401) {
      toast.error("Erro ao carregar pacientes");
      }
    }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/patients", formData);
      toast.success("Paciente cadastrado!");
      setShowDialog(false);
      setFormData({ name: "", email: "", phone: "", birthdate: "", address: "" });
      loadPatients();
    } catch (error) {
      // Não mostrar erro se for 401 (usuário será redirecionado)
      if (error.response?.status !== 401) {
      toast.error("Erro ao cadastrar paciente");
      }
    }
    }
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

        <div className="grid gap-6">
          {patients.map((patient) => (
            <div key={patient.id} className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{patient.name}</h3>
                  <div className="mt-2 space-y-1">
                    <p className="text-gray-600">{patient.email}</p>
                    <p className="text-gray-600">{patient.phone}</p>
                    <p className="text-gray-600">Nascimento: {patient.birthdate}</p>
                    {patient.address && <p className="text-gray-600">{patient.address}</p>}
                  </div>
                </div>
                <Button variant="outline" className="btn-secondary">
                  <Eye className="w-4 h-4 mr-2" />
                  Ver Prontuário
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Paciente</DialogTitle>
              <DialogDescription>
                Cadastre um novo paciente no sistema
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome Completo</Label>
                <Input data-testid="patient-name-input" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input data-testid="patient-email-input" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input data-testid="patient-phone-input" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required />
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <Input data-testid="patient-birthdate-input" type="date" value={formData.birthdate} onChange={(e) => setFormData({...formData, birthdate: e.target.value})} required />
              </div>
              <div>
                <Label>Endereço</Label>
                <Input data-testid="patient-address-input" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
              </div>
              <Button type="submit" data-testid="submit-patient-button" className="w-full btn-primary">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}