import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/api";
import { Plus, Pencil, Trash2, DoorOpen, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, IconAction, EmptyState, ListPager, ConfirmDeleteDialog, usePagedList } from "../components/ListKit";

const EMPTY_FORM = { name: "", capacity: "" };
const PAGE_SIZE = 12;

export default function RoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [toDelete, setToDelete] = useState(null);
  const { user } = useAuth();
  const isAdmin = (user?.role?.is_admin) || (user?.user_type === "admin") || (user?.user_type === "superuser");
  const canManage = isAdmin || (user?.user_type === "consultor");
  const { page, setPage, pageItems } = usePagedList(rooms, PAGE_SIZE);

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const response = await api.get("/rooms");
      setRooms(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error("Erro ao carregar salas");
    } finally {
      setLoaded(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, capacity: parseInt(formData.capacity, 10) };
      if (editingId) {
        await api.put(`/rooms/${editingId}`, payload);
        toast.success("Sala atualizada!");
      } else {
        await api.post("/rooms", payload);
        toast.success("Sala cadastrada!");
      }
      handleCloseDialog();
      loadRooms();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar sala" : "Erro ao cadastrar sala");
    }
  };

  const openNew = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  };

  const handleEdit = (room) => {
    setEditingId(room.id);
    setFormData({ name: room.name || "", capacity: room.capacity != null ? String(room.capacity) : "" });
    setShowDialog(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/rooms/${toDelete.id}`);
      toast.success("Sala removida!");
      loadRooms();
    } catch (error) {
      toast.error("Erro ao remover sala");
    } finally {
      setToDelete(null);
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const subtitle = !loaded
    ? "Carregando..."
    : `${rooms.length} ${rooms.length === 1 ? "sala cadastrada" : "salas cadastradas"}`;

  return (
    <Layout>
      <div>
        <PageHeader
          title="Salas"
          subtitle={subtitle}
          testId="rooms-page-title"
          action={canManage && (
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova sala
            </Button>
          )}
        />

        {!loaded ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[4.5rem] animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <EmptyState
              icon={DoorOpen}
              title="Nenhuma sala cadastrada"
              text="Cadastre as salas para organizar os atendimentos na agenda."
              action={canManage && (
                <Button size="sm" onClick={openNew} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nova sala
                </Button>
              )}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {pageItems.map((room) => (
                <div key={room.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <DoorOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{room.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Users className="h-3 w-3" />
                      {room.capacity != null
                        ? `${room.capacity} ${room.capacity === 1 ? "pessoa" : "pessoas"}`
                        : "Capacidade não informada"}
                    </p>
                  </div>
                  {canManage && (
                    <div className="-mr-2 flex flex-shrink-0">
                      <IconAction onClick={() => handleEdit(room)} title="Editar sala">
                        <Pencil className="h-4 w-4" />
                      </IconAction>
                      <IconAction onClick={() => setToDelete(room)} title="Excluir sala" tone="danger">
                        <Trash2 className="h-4 w-4" />
                      </IconAction>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {rooms.length > PAGE_SIZE && (
              <ListPager
                page={page}
                pageSize={PAGE_SIZE}
                total={rooms.length}
                onChange={setPage}
                className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm"
              />
            )}
          </>
        )}

        <Dialog open={showDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar sala" : "Nova sala"}</DialogTitle>
              <DialogDescription>Salas aparecem como opção ao agendar atendimentos.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="room-name">Nome da sala *</Label>
                <Input
                  id="room-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex.: Sala 1"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room-capacity">Capacidade *</Label>
                <Input
                  id="room-capacity"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  required
                />
              </div>
              <div className="col-span-3 flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
                <Button type="submit">{editingId ? "Salvar alterações" : "Cadastrar sala"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDeleteDialog
          open={!!toDelete}
          title="Excluir sala"
          name={toDelete?.name}
          confirmLabel="Excluir sala"
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      </div>
    </Layout>
  );
}
