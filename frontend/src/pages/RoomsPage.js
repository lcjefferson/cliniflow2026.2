import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ name: "", capacity: "" });

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const response = await api.get("/rooms");
      setRooms(response.data);
    } catch (error) {
      toast.error("Erro ao carregar salas");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/rooms", { ...formData, capacity: parseInt(formData.capacity) });
      toast.success("Sala cadastrada!");
      setShowDialog(false);
      setFormData({ name: "", capacity: "" });
      loadRooms();
    } catch (error) {
      toast.error("Erro ao cadastrar sala");
    }
  };

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900" data-testid="rooms-page-title">Salas</h1>
          <Button onClick={() => setShowDialog(true)} className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Adicionar Sala
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <div key={room.id} className="bg-white rounded-2xl p-6 shadow-lg card-hover">
              <h3 className="text-xl font-bold text-gray-900 mb-2">{room.name}</h3>
              <p className="text-gray-600">Capacidade: {room.capacity} pessoas</p>
            </div>
          ))}
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Sala</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome da Sala</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>Capacidade</Label>
                <Input type="number" value={formData.capacity} onChange={(e) => setFormData({...formData, capacity: e.target.value})} required />
              </div>
              <Button type="submit" className="w-full btn-primary">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}