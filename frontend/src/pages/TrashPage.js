import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { ArchiveRestore, History, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader, SearchField, EmptyState, ListSkeleton, ListPager } from "../components/ListKit";
import { getErrorMessage } from "../utils/apiError";

const PAGE_SIZE = 30;

const FIELD_LABELS = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  birthdate: "Nascimento",
  address: "Endereço",
  city: "Cidade",
  profession: "Profissão",
  cpf: "CPF",
  image_voice_consent: "Autorização de imagem e voz",
  observations: "Observações",
};

// Datas ISO com fuso (ex.: 2026-11-23T23:34:10+00:00) mostradas no horário local.
const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const showValue = (value) => {
  if (value === null || value === undefined || value === "") return <em className="text-slate-400">vazio</em>;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
};

function TabButton({ active, icon: Icon, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function TrashTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [toRestore, setToRestore] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (appliedSearch) params.search = appliedSearch;
      const res = await api.get("/admin/patients-trash", { params });
      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível carregar a lixeira."));
    } finally {
      setLoading(false);
    }
  }, [page, appliedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmRestore = async () => {
    if (!toRestore) return;
    setRestoringId(toRestore.patient_id);
    try {
      await api.post(`/admin/patients-trash/${toRestore.patient_id}/restore`);
      toast.success(`${toRestore.name || "Paciente"} restaurado(a)!`);
      setToRestore(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Não foi possível restaurar o paciente."));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div>
      <div className="border-b border-slate-200 p-3 md:p-4">
        <SearchField value={search} onChange={setSearch} placeholder="Buscar paciente excluído pelo nome" className="max-w-md" />
      </div>
      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <EmptyState
          icon={ArchiveRestore}
          title="Erro ao carregar"
          text={error}
          action={<Button variant="outline" onClick={load}>Tentar de novo</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ArchiveRestore}
          title="Nenhum paciente na lixeira"
          text="Os pacientes excluídos aparecem aqui e podem ser restaurados com um clique."
        />
      ) : (
        <ul>
          {items.map((it) => (
            <li key={`${it.patient_id}-${it.deleted_at}`} className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{it.name || "(sem nome)"}</p>
                <p className="text-xs text-slate-500">
                  {it.phone || "sem telefone"}
                  {it.cpf ? ` · CPF ${it.cpf}` : ""}
                  {` · ${it.appointments_count} agendamento(s) · ${it.attachments_count} anexo(s) · ${it.treatments_count} tratamento(s)`}
                </p>
                <p className="text-xs text-slate-400">
                  Excluído em {formatDateTime(it.deleted_at)}
                  {it.deleted_by_name ? ` por ${it.deleted_by_name}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setToRestore(it)} disabled={restoringId === it.patient_id} className="flex-shrink-0">
                {restoringId === it.patient_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArchiveRestore className="mr-2 h-4 w-4" />}
                Restaurar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ListPager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <Dialog open={!!toRestore} onOpenChange={(open) => { if (!open) setToRestore(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurar paciente</DialogTitle>
            <DialogDescription>
              Restaurar <strong className="text-slate-900">{toRestore?.name}</strong> devolve o cadastro completo (dados, anexos e
              tratamentos) e reconecta os {toRestore?.appointments_count || 0} agendamento(s) que ele tinha.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setToRestore(null)}>Cancelar</Button>
            <Button onClick={confirmRestore} disabled={!!restoringId}>Restaurar paciente</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toRevert, setToRevert] = useState(null);
  const [reverting, setReverting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/admin/patient-audit", { params: { page, page_size: PAGE_SIZE } });
      setItems(Array.isArray(res.data?.items) ? res.data.items : []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      setError(getErrorMessage(err, "Não foi possível carregar o histórico."));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmRevert = async () => {
    if (!toRevert) return;
    setReverting(true);
    try {
      await api.post(`/admin/patient-audit/${toRevert.id}/revert`);
      toast.success("Alteração desfeita!");
      setToRevert(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Não foi possível desfazer a alteração."));
    } finally {
      setReverting(false);
    }
  };

  return (
    <div>
      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <EmptyState
          icon={History}
          title="Erro ao carregar"
          text={error}
          action={<Button variant="outline" onClick={load}>Tentar de novo</Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhuma alteração registrada ainda"
          text="Quando alguém mudar dados de um paciente, o antes e o depois aparecem aqui."
        />
      ) : (
        <ul>
          {items.map((it) => {
            const fields = Object.entries(it.changes || {});
            return (
              <li key={it.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{it.patient_name || "Paciente não encontrado"}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(it.at)}
                      {it.user_name ? ` · ${it.user_name}` : ""}
                      {it.revert_of ? " · (desfez uma alteração)" : ""}
                    </p>
                  </div>
                  {it.reverted_at ? (
                    <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Desfeita em {formatDateTime(it.reverted_at)}
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setToRevert(it)} className="flex-shrink-0">
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Desfazer
                    </Button>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {fields.map(([field, change]) => (
                    <li key={field} className="text-xs text-slate-600">
                      <span className="font-medium text-slate-700">{FIELD_LABELS[field] || field}:</span>{" "}
                      <span className="rounded bg-red-50 px-1 text-red-700">{showValue(change?.antes)}</span>
                      {" → "}
                      <span className="rounded bg-green-50 px-1 text-green-700">{showValue(change?.depois)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      <ListPager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <Dialog open={!!toRevert} onOpenChange={(open) => { if (!open) setToRevert(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Desfazer alteração</DialogTitle>
            <DialogDescription>
              Os campos abaixo de <strong className="text-slate-900">{toRevert?.patient_name}</strong> voltam ao valor que tinham antes
              desta alteração. O próprio "desfazer" também fica registrado no histórico.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {Object.entries(toRevert?.changes || {}).map(([field, change]) => (
              <li key={field}>
                <span className="font-medium">{FIELD_LABELS[field] || field}:</span> {showValue(change?.depois)} {" → "}
                <strong>{showValue(change?.antes)}</strong>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setToRevert(null)}>Cancelar</Button>
            <Button onClick={confirmRevert} disabled={reverting}>
              {reverting ? "Desfazendo..." : "Desfazer alteração"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TrashPage() {
  const [tab, setTab] = useState("trash");
  return (
    <Layout>
      <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
        <PageHeader
          title="Lixeira e histórico"
          subtitle="Recupere pacientes excluídos e veja ou desfaça alterações nos cadastros."
        />
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex gap-2 border-b border-slate-200 px-3">
            <TabButton active={tab === "trash"} icon={ArchiveRestore} onClick={() => setTab("trash")}>
              Pacientes excluídos
            </TabButton>
            <TabButton active={tab === "history"} icon={History} onClick={() => setTab("history")}>
              Alterações
            </TabButton>
          </div>
          {tab === "trash" ? <TrashTab /> : <HistoryTab />}
        </div>
      </div>
    </Layout>
  );
}
