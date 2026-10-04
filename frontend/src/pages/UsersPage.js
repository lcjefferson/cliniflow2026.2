import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { Plus, Pencil, Trash2, UserCog, ShieldCheck, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ContactAvatar from "../components/ContactAvatar";
import {
  PageHeader, SearchField, IconAction, EmptyState, ListSkeleton, ListPager, ConfirmDeleteDialog, usePagedList, normalizeText,
} from "../components/ListKit";

const USER_TYPES = {
  superuser: { label: "Super usuário", className: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  admin: { label: "Administrador", className: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  consultor: { label: "Consultor", className: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  profissional: { label: "Profissional", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  profissional_admin: { label: "Profissional admin", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
};

const TYPE_FILTERS = [
  { id: "", label: "Todos" },
  { id: "admins", label: "Administradores", types: ["superuser", "admin"] },
  { id: "consultores", label: "Consultores", types: ["consultor"] },
  { id: "profissionais", label: "Profissionais", types: ["profissional", "profissional_admin"] },
];

const PROFESSIONAL_TYPES = ["profissional", "profissional_admin"];

const EMPTY_FORM = { name: "", email: "", password: "", user_type: "consultor", professional_id: "", is_admin: false };
const PAGE_SIZE = 20;

const formatDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "";
};

function TypeBadge({ user }) {
  const meta = USER_TYPES[user.user_type] || USER_TYPES.consultor;
  const extraAdmin = user.role?.is_admin && !["superuser", "admin"].includes(user.user_type);
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`status-badge whitespace-nowrap ${meta.className}`}>{meta.label}</span>
      {extraAdmin && (
        <span className="status-badge whitespace-nowrap bg-slate-50 text-slate-600 ring-slate-500/20" title="Permissão de administrador">
          <ShieldCheck className="mr-0.5 h-3 w-3" />
          Admin
        </span>
      )}
    </span>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [professionals, setProfessionals] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    loadUsers();
    loadProfessionals();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get("/users");
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoaded(true);
    }
  };

  const loadProfessionals = async () => {
    try {
      const response = await api.get("/professionals");
      setProfessionals(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erro ao carregar profissionais");
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || "",
      email: user.email || "",
      password: "",
      user_type: user.user_type || "consultor",
      professional_id: user.professional_id || "",
      is_admin: user.role?.is_admin || false,
    });
    setShowDialog(true);
  };

  const handleNewUser = () => {
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const updateData = {
          name: formData.name,
          email: formData.email,
          user_type: formData.user_type,
          professional_id: formData.professional_id,
          is_admin: formData.is_admin,
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        await api.put(`/users/${editingUser.id}`, updateData);
        toast.success("Usuário atualizado!");
      } else {
        if (!formData.password) {
          toast.error("Senha é obrigatória para novo usuário");
          return;
        }
        await api.post("/auth/register", formData);
        toast.success("Usuário criado com sucesso!");
      }
      handleCloseDialog();
      loadUsers();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || (editingUser ? "Erro ao atualizar usuário" : "Erro ao criar usuário");
      toast.error(errorMsg);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.delete(`/users/${toDelete.id}`);
      toast.success("Usuário excluído!");
      loadUsers();
    } catch (error) {
      toast.error("Erro ao excluir usuário");
    } finally {
      setToDelete(null);
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingUser(null);
    setFormData(EMPTY_FORM);
  };

  const getProfessionalName = (professionalId) => professionals.find((p) => p.id === professionalId)?.name;

  const term = normalizeText(searchTerm.trim());
  const activeFilter = TYPE_FILTERS.find((f) => f.id === typeFilter);
  const filtered = users.filter((u) => {
    if (activeFilter?.types && !activeFilter.types.includes(u.user_type || "consultor")) return false;
    return !term || normalizeText(u.name).includes(term) || normalizeText(u.email).includes(term);
  });
  const { page, setPage, pageItems } = usePagedList(filtered, PAGE_SIZE);
  const hasFilters = Boolean(term || typeFilter);

  const subtitle = !loaded
    ? "Carregando..."
    : `${users.length} ${users.length === 1 ? "usuário com acesso" : "usuários com acesso"} ao sistema`;

  const renderActions = (u) => (
    <div className="flex items-center justify-end gap-0.5">
      <IconAction onClick={() => handleEdit(u)} title="Editar usuário">
        <Pencil className="h-4 w-4" />
      </IconAction>
      {u.id !== currentUser?.id && (
        <IconAction onClick={() => setToDelete(u)} title="Excluir usuário" tone="danger">
          <Trash2 className="h-4 w-4" />
        </IconAction>
      )}
    </div>
  );

  const linkedProfessional = (u) =>
    PROFESSIONAL_TYPES.includes(u.user_type) && u.professional_id ? getProfessionalName(u.professional_id) : null;

  return (
    <Layout>
      <div>
        <PageHeader
          title="Usuários"
          subtitle={subtitle}
          action={(
            <Button onClick={handleNewUser} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo usuário
            </Button>
          )}
        />

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3 md:flex-row md:items-center md:p-4">
            <SearchField
              value={searchTerm}
              onChange={(v) => { setSearchTerm(v); setPage(1); }}
              placeholder="Buscar por nome ou e-mail"
              className="md:w-72"
            />
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.id || "all"}
                  type="button"
                  onClick={() => { setTypeFilter(f.id); setPage(1); }}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    typeFilter === f.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {!loaded ? (
            <ListSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title={hasFilters ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
              text={hasFilters ? "Ajuste a busca ou o filtro de tipo." : "Crie acessos para a equipe da clínica."}
              action={hasFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchTerm(""); setTypeFilter(""); }}
                  className="border-slate-200"
                >
                  Limpar filtros
                </Button>
              )}
            />
          ) : (
            <>
              {/* Tabela (desktop) */}
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-medium text-slate-500">
                    <th className="w-full px-4 py-2.5 font-medium">Usuário</th>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="hidden whitespace-nowrap px-4 py-2.5 font-medium lg:table-cell">Profissional vinculado</th>
                    <th className="hidden whitespace-nowrap px-4 py-2.5 font-medium xl:table-cell">Criado em</th>
                    <th className="px-4 py-2.5"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="w-full max-w-0 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ContactAvatar size="sm" name={u.name} seed={u.id} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">
                              {u.name}
                              {u.id === currentUser?.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(você)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3"><TypeBadge user={u} /></td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 lg:table-cell">
                        {linkedProfessional(u) || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 xl:table-cell">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="w-px whitespace-nowrap px-2 py-3">{renderActions(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cards (mobile) */}
              <ul className="md:hidden">
                {pageItems.map((u) => (
                  <li key={u.id} className="flex items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-0">
                    <ContactAvatar size="sm" name={u.name} seed={u.id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {u.name}
                        {u.id === currentUser?.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(você)</span>}
                      </p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                      <div className="mt-1.5"><TypeBadge user={u} /></div>
                      {linkedProfessional(u) && (
                        <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                          <Stethoscope className="h-3 w-3 flex-shrink-0" />
                          {linkedProfessional(u)}
                        </p>
                      )}
                    </div>
                    <div className="-my-1 flex-shrink-0">{renderActions(u)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <ListPager page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
        </div>

        {/* Modal de Criar/Editar Usuário */}
        <Dialog open={showDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingUser ? "Editar usuário" : "Novo usuário"}</DialogTitle>
              <DialogDescription>
                {editingUser ? "Atualize os dados de acesso." : "Crie um acesso para um membro da equipe."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="user-name">Nome *</Label>
                <Input
                  id="user-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="user-email">E-mail *</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="user-password">{editingUser ? "Nova senha" : "Senha *"}</Label>
                <Input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editingUser}
                  placeholder={editingUser ? "Deixe em branco para manter a atual" : "Mínimo 6 caracteres"}
                  minLength={6}
                />
              </div>
              <div className={`space-y-1.5 ${PROFESSIONAL_TYPES.includes(formData.user_type) ? "" : "sm:col-span-2"}`}>
                <Label htmlFor="user-type">Tipo de usuário</Label>
                <select
                  id="user-type"
                  className="input-field"
                  value={formData.user_type}
                  onChange={(e) => setFormData({ ...formData, user_type: e.target.value })}
                >
                  {Object.entries(USER_TYPES).map(([value, { label }]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {PROFESSIONAL_TYPES.includes(formData.user_type) && (
                <div className="space-y-1.5">
                  <Label htmlFor="user-professional">Profissional vinculado</Label>
                  <select
                    id="user-professional"
                    className="input-field"
                    value={formData.professional_id}
                    onChange={(e) => setFormData({ ...formData, professional_id: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <label
                htmlFor="is_admin"
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2"
              >
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={formData.is_admin}
                  onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">Permissão de administrador</span>
                  <span className="block text-xs text-slate-500">Libera as ações restritas a administradores.</span>
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
                <Button type="submit">{editingUser ? "Salvar alterações" : "Criar usuário"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDeleteDialog
          open={!!toDelete}
          title="Excluir usuário"
          name={toDelete?.name}
          description="O acesso dele ao sistema será removido. Esta ação não pode ser desfeita."
          confirmLabel="Excluir usuário"
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      </div>
    </Layout>
  );
}
