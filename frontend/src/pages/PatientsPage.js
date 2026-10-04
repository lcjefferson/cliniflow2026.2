import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import {
  Plus, Pencil, Trash2, Eye, ChevronLeft, ChevronRight, X, AlertCircle, Search, Users, Phone, Cake, MapPin, RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PatientDetailDialog from "../components/PatientDetailDialog";
import ContactAvatar from "../components/ContactAvatar";

const EMPTY_FORM = {
  name: "", email: "", phone: "", birthdate: "", address: "", city: "", profession: "", cpf: "", image_voice_consent: false,
};

const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Mais recentes" },
  { value: "created_at:asc", label: "Mais antigos" },
  { value: "name:asc", label: "Nome (A-Z)" },
  { value: "name:desc", label: "Nome (Z-A)" },
];

const SEARCH_DEBOUNCE_MS = 400;
const PAGE_SIZE = 50;

const controlClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10";

const maskPhone = (value) => {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  const part1 = digits.slice(0, 2);
  const part2 = digits.slice(2, 7);
  const part3 = digits.slice(7, 11);
  if (digits.length <= 2) return part1 ? `(${part1}` : "";
  if (digits.length <= 7) return `(${part1}) ${part2}`;
  return `(${part1}) ${part2}-${part3}`;
};

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDate = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "";
};

const getBirthInfo = (birthdate) => {
  const m = String(birthdate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return birthdate ? { label: String(birthdate), age: null } : null;
  const [, y, mo, d] = m.map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1;
  return { label: `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`, age: age >= 0 && age < 130 ? age : null };
};

function DebtBadge({ value }) {
  if (!(value > 0)) return null;
  return (
    <span className="status-badge whitespace-nowrap bg-red-50 text-red-700 ring-red-600/20 tabular-nums">
      {formatCurrency(value)}
    </span>
  );
}

function IconAction({ onClick, title, tone = "default", children }) {
  const tones = {
    default: "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
    primary: "text-slate-400 hover:bg-blue-50 hover:text-blue-600",
    danger: "text-slate-400 hover:bg-red-50 hover:text-red-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-lg p-2 transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("created_at");
  const [order, setOrder] = useState("desc");
  const [filterDebt, setFilterDebt] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState(null);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term === appliedSearch) return;
    const timer = setTimeout(() => setAppliedSearch(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm, appliedSearch]);

  useEffect(() => {
    loadPatients(1);
  }, [sortBy, order, filterDebt, appliedSearch]);

  const loadPatients = async (page = currentPage) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, page_size: PAGE_SIZE, sort_by: sortBy, order, has_debt: filterDebt };
      if (appliedSearch) params.search = appliedSearch;
      const response = await api.get("/patients", { params });
      setPatients(Array.isArray(response.data) ? response.data : []);
      setCurrentPage(page);
    } catch (err) {
      setError(err);
      toast.error("Erro ao carregar pacientes");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/patients/${editingId}`, formData);
        toast.success("Paciente atualizado!");
      } else {
        await api.post("/patients", formData);
        toast.success("Paciente cadastrado!");
      }
      handleCloseDialog();
      loadPatients();
    } catch (err) {
      toast.error(editingId ? "Erro ao atualizar paciente" : "Erro ao cadastrar paciente");
    }
  };

  const openNewPatient = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowDialog(true);
  };

  const handleEdit = (patient) => {
    setEditingId(patient.id);
    setFormData({
      name: patient.name || "",
      email: patient.email || "",
      phone: patient.phone || "",
      birthdate: patient.birthdate || "",
      address: patient.address || "",
      city: patient.city || "",
      profession: patient.profession || "",
      cpf: patient.cpf || "",
      image_voice_consent: !!patient.image_voice_consent,
    });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const handleDelete = (patient) => {
    setPatientToDelete(patient);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!patientToDelete) return;
    try {
      await api.delete(`/patients/${patientToDelete.id}`);
      toast.success("Paciente removido!");
      loadPatients();
    } catch (err) {
      console.error("Error deleting patient:", err);
      toast.error("Erro ao remover paciente");
    } finally {
      setShowDeleteDialog(false);
      setPatientToDelete(null);
    }
  };

  const handleViewDetails = (patient) => {
    setSelectedPatient(patient);
    setShowDetailDialog(true);
  };

  const handleCloseDetailDialog = () => {
    setShowDetailDialog(false);
    setSelectedPatient(null);
  };

  const handleUpdatePatient = (updatedPatient) => {
    setPatients((prev) => prev.map((p) => (p.id === updatedPatient.id ? updatedPatient : p)));
    setSelectedPatient(updatedPatient);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setAppliedSearch("");
    setFilterDebt(false);
  };

  const hasFilters = Boolean(appliedSearch || filterDebt);
  const hasMore = patients.length >= PAGE_SIZE;
  const rangeStart = patients.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = rangeStart ? rangeStart + patients.length - 1 : 0;
  const showSkeleton = loading && (!loaded || patients.length === 0);

  const renderActions = (patient) => (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      <IconAction onClick={() => handleViewDetails(patient)} title="Ver ficha" tone="primary">
        <Eye className="h-4 w-4" />
      </IconAction>
      <IconAction onClick={() => handleEdit(patient)} title="Editar paciente">
        <Pencil className="h-4 w-4" />
      </IconAction>
      <IconAction onClick={() => handleDelete(patient)} title="Excluir paciente" tone="danger">
        <Trash2 className="h-4 w-4" />
      </IconAction>
    </div>
  );

  const subtitle = () => {
    if (!loaded) return "Carregando...";
    if (hasFilters) {
      const n = patients.length;
      return `${n}${hasMore ? "+" : ""} ${n === 1 ? "paciente encontrado" : "pacientes encontrados"}`;
    }
    return "Cadastro, ficha e histórico dos pacientes";
  };

  return (
    <Layout>
      <div>
        <div className="mb-6 flex items-start justify-between gap-3 sm:items-end">
          <div className="min-w-0">
            <h1 className="text-2xl text-slate-900 md:text-3xl" data-testid="patients-page-title">Pacientes</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle()}</p>
          </div>
          <Button onClick={openNewPatient} className="flex-shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            Novo paciente
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Busca e filtros */}
          <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:items-center md:p-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone ou e-mail"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setAppliedSearch(searchTerm.trim());
                  }
                }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => { setSearchTerm(""); setAppliedSearch(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                className={`${controlClass} min-w-0 flex-1 sm:w-44 sm:flex-none`}
                value={`${sortBy}:${order}`}
                onChange={(e) => {
                  const [sb, ord] = e.target.value.split(":");
                  setSortBy(sb);
                  setOrder(ord);
                }}
                aria-label="Ordenação"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setFilterDebt((v) => !v)}
                aria-pressed={filterDebt}
                className={`inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
                  filterDebt
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <AlertCircle className="h-4 w-4" />
                Com débito
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className={`relative transition-opacity ${loading && !showSkeleton ? "opacity-60" : ""}`}>
            {showSkeleton ? (
              <ul aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <li key={i} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                      <div className="h-2.5 w-1/5 animate-pulse rounded bg-slate-100" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : error ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-500">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">Não foi possível carregar os pacientes</p>
                <p className="mt-1 text-xs text-slate-500">Verifique sua conexão e tente novamente.</p>
                <Button variant="outline" size="sm" onClick={() => loadPatients()} className="mt-4 gap-2 border-slate-200">
                  <RotateCw className="h-4 w-4" />
                  Tentar novamente
                </Button>
              </div>
            ) : patients.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Users className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  {hasFilters ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {hasFilters ? "Ajuste a busca ou limpe os filtros." : "Cadastre o primeiro paciente da clínica."}
                </p>
                {hasFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4 border-slate-200">
                    Limpar filtros
                  </Button>
                ) : (
                  <Button size="sm" onClick={openNewPatient} className="mt-4 gap-2">
                    <Plus className="h-4 w-4" />
                    Novo paciente
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Tabela (desktop) */}
                <table className="hidden w-full text-sm md:table">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-medium text-slate-500">
                      <th className="w-full px-4 py-2.5 font-medium">Paciente</th>
                      <th className="px-4 py-2.5 font-medium">Telefone</th>
                      <th className="px-4 py-2.5 font-medium">Nascimento</th>
                      <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Cidade</th>
                      <th className="hidden px-4 py-2.5 font-medium xl:table-cell">Cadastro</th>
                      <th className="px-4 py-2.5"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((patient) => {
                      const birth = getBirthInfo(patient.birthdate);
                      return (
                        <tr
                          key={patient.id}
                          onClick={() => handleViewDetails(patient)}
                          className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                        >
                          <td className="w-full max-w-0 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <ContactAvatar size="sm" name={patient.name} seed={patient.id} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-medium text-slate-900">{patient.name}</p>
                                  <DebtBadge value={patient.total_debt} />
                                </div>
                                {(patient.email || patient.cpf) && (
                                  <p className="truncate text-xs text-slate-500">
                                    {patient.email || `CPF ${patient.cpf}`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{patient.phone || "—"}</td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">
                            {birth ? (
                              <>
                                {birth.label}
                                {birth.age !== null && <span className="ml-1.5 text-xs text-slate-400">{birth.age} anos</span>}
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 lg:table-cell">
                            {patient.city || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 xl:table-cell">
                            {formatDate(patient.created_at)}
                          </td>
                          <td className="w-px whitespace-nowrap px-2 py-3">{renderActions(patient)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Cards (mobile) */}
                <ul className="md:hidden">
                  {patients.map((patient) => {
                    const birth = getBirthInfo(patient.birthdate);
                    return (
                      <li
                        key={patient.id}
                        onClick={() => handleViewDetails(patient)}
                        className="cursor-pointer border-b border-slate-100 px-3 py-3 last:border-0 active:bg-slate-50"
                      >
                        <div className="flex items-start gap-3">
                          <ContactAvatar size="sm" name={patient.name} seed={patient.id} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-medium text-slate-900">{patient.name}</p>
                              <DebtBadge value={patient.total_debt} />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              {patient.phone && (
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Phone className="h-3 w-3" />
                                  {patient.phone}
                                </span>
                              )}
                              {birth && (
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Cake className="h-3 w-3" />
                                  {birth.age !== null ? `${birth.age} anos` : birth.label}
                                </span>
                              )}
                              {patient.city && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {patient.city}
                                </span>
                              )}
                            </div>
                            {patient.email && <p className="mt-1 truncate text-xs text-slate-500">{patient.email}</p>}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center justify-between pl-12">
                          <span className="text-[11px] tabular-nums text-slate-400">
                            {patient.created_at ? `Desde ${formatDate(patient.created_at)}` : ""}
                          </span>
                          {renderActions(patient)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Paginação (server-side, sem total) */}
          {loaded && !error && (patients.length > 0 || currentPage > 1) && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2.5 text-xs text-slate-500 md:px-4">
              <span className="tabular-nums">
                {rangeStart ? `${rangeStart}–${rangeEnd}` : "Nenhum resultado nesta página"}
              </span>
              {(currentPage > 1 || hasMore) && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => loadPatients(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-1 tabular-nums">Página {currentPage}</span>
                  <button
                    type="button"
                    onClick={() => loadPatients(currentPage + 1)}
                    disabled={!hasMore || loading}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal de Criar/Editar Paciente */}
        <Dialog open={showDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar paciente" : "Novo paciente"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Atualize os dados cadastrais." : "Preencha os dados para cadastrar o paciente."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" id="patient-form">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="patient-name">Nome *</Label>
                <Input id="patient-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-phone">Telefone</Label>
                <Input
                  id="patient-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                  placeholder="(11) 98765-4321"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-email">E-mail</Label>
                <Input id="patient-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-birthdate">Data de nascimento</Label>
                <Input id="patient-birthdate" type="date" value={formData.birthdate} onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-cpf">CPF</Label>
                <Input id="patient-cpf" value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="patient-address">Endereço</Label>
                <Input id="patient-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Rua, número, bairro" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-city">Cidade</Label>
                <Input id="patient-city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patient-profession">Profissão</Label>
                <Input id="patient-profession" value={formData.profession} onChange={(e) => setFormData({ ...formData, profession: e.target.value })} />
              </div>
              <label
                htmlFor="patient_image_voice_consent"
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2"
              >
                <input
                  type="checkbox"
                  id="patient_image_voice_consent"
                  checked={!!formData.image_voice_consent}
                  onChange={(e) => setFormData({ ...formData, image_voice_consent: e.target.checked })}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm leading-snug text-slate-600">
                  Autorizo o uso da minha imagem e voz para fins institucionais e de comunicação da instituição.
                </span>
              </label>
              <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
                <Button type="submit">{editingId ? "Salvar alterações" : "Cadastrar paciente"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <PatientDetailDialog
          patient={selectedPatient}
          isOpen={showDetailDialog}
          onClose={handleCloseDetailDialog}
          onUpdate={handleUpdatePatient}
        />

        {/* Confirmação de exclusão */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Excluir paciente</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir <strong className="text-slate-900">{patientToDelete?.name}</strong>? Esta ação não
                pode ser desfeita e remove todos os dados associados.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setPatientToDelete(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
                Excluir paciente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
