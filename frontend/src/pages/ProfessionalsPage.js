import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/api";
import { Plus, Pencil, Trash2, Mail, Phone, Stethoscope, Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ContactAvatar from "../components/ContactAvatar";
import {
  PageHeader, SearchField, IconAction, EmptyState, ListPager, ConfirmDeleteDialog, usePagedList, normalizeText,
} from "../components/ListKit";

const EMPTY_FORM = { name: "", specialty: "", email: "", phone: "", color: "" };
const PAGE_SIZE = 12;

const COLOR_OPTIONS = [
  "bg-blue-500", "bg-blue-600", "bg-blue-700",
  "bg-indigo-500", "bg-indigo-600", "bg-indigo-700",
  "bg-purple-500", "bg-purple-600", "bg-purple-700",
  "bg-violet-500", "bg-violet-600", "bg-violet-700",
  "bg-fuchsia-500", "bg-fuchsia-600", "bg-fuchsia-700",
  "bg-pink-500", "bg-pink-600", "bg-pink-700",
  "bg-sky-500", "bg-sky-600", "bg-sky-700",
  "bg-cyan-500", "bg-cyan-600", "bg-cyan-700",
  "bg-teal-500", "bg-teal-600", "bg-teal-700",
];

const avatarTone = (color) => (color ? `${color} text-white` : undefined);

export default function ProfessionalsPage() {
  const [professionals, setProfessionals] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const { user } = useAuth();
  const isAdmin = (user?.role?.is_admin) || (user?.user_type === "admin") || (user?.user_type === "superuser");
  const canManage = isAdmin || (user?.user_type === "consultor");

  useEffect(() => {
    loadProfessionals();
  }, []);

  const loadProfessionals = async () => {
    try {
      const response = await api.get("/professionals");
      setProfessionals(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error("Erro ao carregar profissionais");
    } finally {
      setLoaded(true);
    }
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
      handleCloseDialog();
      loadProfessionals();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar profissional" : "Erro ao cadastrar profissional");
    }
  };

  const openNew = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  };

  const handleEdit = (prof) => {
    setEditingId(prof.id);
    setFormData({
      name: prof.name || "",
      specialty: prof.specialty || "",
      email: prof.email || "",
      phone: prof.phone || "",
      color: prof.color || "",
    });
    setShowDialog(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/professionals/${toDelete.id}`);
      toast.success("Profissional removido!");
      loadProfessionals();
    } catch (error) {
      toast.error("Erro ao remover profissional");
    } finally {
      setToDelete(null);
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const term = normalizeText(searchTerm.trim());
  const filtered = term
    ? professionals.filter((p) => [p.name, p.specialty, p.email, p.phone].some((v) => normalizeText(v).includes(term)))
    : professionals;
  const { page, setPage, pageItems } = usePagedList(filtered, PAGE_SIZE);

  const subtitle = !loaded
    ? "Carregando..."
    : `${professionals.length} ${professionals.length === 1 ? "profissional cadastrado" : "profissionais cadastrados"}`;

  return (
    <Layout>
      <div>
        <PageHeader
          title="Profissionais"
          subtitle={subtitle}
          action={canManage && (
            <Button onClick={openNew} data-testid="add-professional-button" className="gap-2">
              <Plus className="h-4 w-4" />
              Novo profissional
            </Button>
          )}
        />

        {professionals.length > 0 && (
          <SearchField
            value={searchTerm}
            onChange={(v) => { setSearchTerm(v); setPage(1); }}
            placeholder="Buscar profissional"
            className="mb-4 sm:max-w-sm"
          />
        )}

        {!loaded ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <EmptyState
              icon={Stethoscope}
              title={term ? "Nenhum profissional encontrado" : "Nenhum profissional cadastrado"}
              text={term ? "Tente outro termo de busca." : "Cadastre a equipe para usar na agenda."}
              action={!term && canManage && (
                <Button size="sm" onClick={openNew} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Novo profissional
                </Button>
              )}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pageItems.map((prof) => (
                <div
                  key={prof.id}
                  className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  data-testid={`professional-${prof.id}`}
                >
                  <div className="flex items-start gap-3">
                    <ContactAvatar name={prof.name} seed={prof.id} tone={avatarTone(prof.color)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{prof.name}</p>
                      <p className="truncate text-sm text-slate-500">{prof.specialty || "Sem especialidade"}</p>
                    </div>
                    {canManage && (
                      <div className="-mr-2 -mt-1 flex flex-shrink-0">
                        <IconAction onClick={() => handleEdit(prof)} title="Editar profissional" data-testid={`edit-professional-${prof.id}`}>
                          <Pencil className="h-4 w-4" />
                        </IconAction>
                        <IconAction onClick={() => setToDelete(prof)} title="Excluir profissional" tone="danger" data-testid={`delete-professional-${prof.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </IconAction>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm text-slate-600">
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      <span className="truncate">{prof.email || <span className="text-slate-400">Sem e-mail</span>}</span>
                    </p>
                    <p className="flex items-center gap-2 tabular-nums">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                      {prof.phone || <span className="text-slate-400">Sem telefone</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {filtered.length > PAGE_SIZE && (
              <ListPager
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onChange={setPage}
                className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm"
              />
            )}
          </>
        )}

        <Dialog open={showDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-testid="professional-dialog">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar profissional" : "Novo profissional"}</DialogTitle>
              <DialogDescription>A cor escolhida identifica o profissional na agenda.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="prof-name">Nome *</Label>
                <div className="flex items-center gap-3">
                  <ContactAvatar size="sm" name={formData.name} seed={editingId || formData.name} tone={avatarTone(formData.color)} />
                  <Input
                    id="prof-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="professional-name-input"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="prof-specialty">Especialidade *</Label>
                <Input
                  id="prof-specialty"
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  data-testid="professional-specialty-input"
                  placeholder="Ex.: Biomédica esteta"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-email">E-mail *</Label>
                <Input
                  id="prof-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="professional-email-input"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prof-phone">Telefone *</Label>
                <Input
                  id="prof-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  data-testid="professional-phone-input"
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Cor na agenda</Label>
                <div className="grid grid-cols-9 gap-2">
                  {COLOR_OPTIONS.map((c) => {
                    const selected = formData.color === c;
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setFormData({ ...formData, color: selected ? "" : c })}
                        className={`flex aspect-square items-center justify-center rounded-lg ${c} transition-transform hover:scale-105 ${
                          selected ? "ring-2 ring-slate-900 ring-offset-2" : ""
                        }`}
                        aria-label={c}
                        aria-pressed={selected}
                        title={c}
                      >
                        {selected && <Check className="h-4 w-4 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
                <Button type="submit" data-testid="submit-professional-button">
                  {editingId ? "Salvar alterações" : "Cadastrar profissional"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDeleteDialog
          open={!!toDelete}
          title="Excluir profissional"
          name={toDelete?.name}
          confirmLabel="Excluir profissional"
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      </div>
    </Layout>
  );
}
