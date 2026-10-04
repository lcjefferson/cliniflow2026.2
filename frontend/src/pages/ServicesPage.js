import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/api";
import { Plus, Pencil, Trash2, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PageHeader, SearchField, IconAction, EmptyState, ListSkeleton, ListPager, ConfirmDeleteDialog, usePagedList, normalizeText,
} from "../components/ListKit";

const EMPTY_FORM = { name: "", description: "" };
const PAGE_SIZE = 20;

const formatPrice = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ServicesPage() {
  const [services, setServices] = useState([]);
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
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      const response = await api.get("/services");
      setServices(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error("Erro ao carregar serviços");
    } finally {
      setLoaded(true);
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
      handleCloseDialog();
      loadServices();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar serviço" : "Erro ao cadastrar serviço");
    }
  };

  const openNew = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  };

  const handleEdit = (service) => {
    setEditingId(service.id);
    setFormData({ name: service.name || "", description: service.description || "" });
    setShowDialog(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/services/${toDelete.id}`);
      toast.success("Serviço removido!");
      loadServices();
    } catch (error) {
      toast.error("Erro ao remover serviço");
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
    ? services.filter((s) => normalizeText(s.name).includes(term) || normalizeText(s.description).includes(term))
    : services;
  const { page, setPage, pageItems } = usePagedList(filtered, PAGE_SIZE);

  const subtitle = !loaded
    ? "Carregando..."
    : `${services.length} ${services.length === 1 ? "serviço cadastrado" : "serviços cadastrados"}`;

  return (
    <Layout>
      <div>
        <PageHeader
          title="Serviços"
          subtitle={subtitle}
          testId="services-page-title"
          action={canManage && (
            <Button onClick={openNew} data-testid="add-service-button" className="gap-2">
              <Plus className="h-4 w-4" />
              Novo serviço
            </Button>
          )}
        />

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {services.length > 0 && (
            <div className="border-b border-slate-200 p-3 md:p-4">
              <SearchField
                value={searchTerm}
                onChange={(v) => { setSearchTerm(v); setPage(1); }}
                placeholder="Buscar serviço"
                className="sm:max-w-sm"
              />
            </div>
          )}

          {!loaded ? (
            <ListSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title={term ? "Nenhum serviço encontrado" : "Nenhum serviço cadastrado"}
              text={term ? "Tente outro termo de busca." : "Cadastre os procedimentos oferecidos pela clínica."}
              action={!term && canManage && (
                <Button size="sm" onClick={openNew} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Novo serviço
                </Button>
              )}
            />
          ) : (
            <ul>
              {pageItems.map((service) => (
                <li
                  key={service.id}
                  className="flex items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-0 hover:bg-slate-50/60 md:px-4"
                  data-testid={`service-${service.id}`}
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-medium text-slate-900">{service.name}</p>
                      {service.duration_minutes > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          {service.duration_minutes} min
                        </span>
                      )}
                      {service.price > 0 && (
                        <span className="status-badge bg-emerald-50 text-emerald-700 ring-emerald-600/20 tabular-nums">
                          {formatPrice(service.price)}
                        </span>
                      )}
                    </div>
                    {service.description && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{service.description}</p>
                    )}
                  </div>
                  {canManage && (
                    <div className="-my-1 flex flex-shrink-0">
                      <IconAction onClick={() => handleEdit(service)} title="Editar serviço">
                        <Pencil className="h-4 w-4" />
                      </IconAction>
                      <IconAction onClick={() => setToDelete(service)} title="Excluir serviço" tone="danger">
                        <Trash2 className="h-4 w-4" />
                      </IconAction>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <ListPager page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
        </div>

        <Dialog open={showDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="sm:max-w-md" data-testid="service-dialog">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar serviço" : "Novo serviço"}</DialogTitle>
              <DialogDescription>Os serviços ficam disponíveis no agendamento e nas campanhas.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="service-name">Nome do serviço *</Label>
                <Input
                  id="service-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex.: Limpeza de pele"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="service-description">Descrição *</Label>
                <Textarea
                  id="service-description"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
                <Button type="submit">{editingId ? "Salvar alterações" : "Cadastrar serviço"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDeleteDialog
          open={!!toDelete}
          title="Excluir serviço"
          name={toDelete?.name}
          confirmLabel="Excluir serviço"
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      </div>
    </Layout>
  );
}
