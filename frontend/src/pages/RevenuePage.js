import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import {
  Plus, CheckCircle, Clock, Pencil, Trash2, TrendingDown, TrendingUp, Paperclip, ChevronDown, X,
  Receipt, Wallet, Upload,
} from "lucide-react";
import PatientCombobox from "../components/PatientCombobox";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import StatCard from "../components/StatCard";
import ContactAvatar from "../components/ContactAvatar";
import {
  PageHeader, SearchField, IconAction, EmptyState, ListPager, ConfirmDeleteDialog, usePagedList, normalizeText,
} from "../components/ListKit";
import { PAYMENT_METHODS, formatBRL, formatDay } from "../lib/finance";

const EXPENSE_CATEGORIES = {
  staff: { label: "Colaboradores", className: "bg-blue-50 text-blue-700 ring-blue-600/20" },
  supplier: { label: "Fornecedores", className: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  supplies: { label: "Suprimentos", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  general: { label: "Despesas gerais", className: "bg-slate-50 text-slate-600 ring-slate-500/20" },
};

const TRANSACTION_STATUS = {
  paid: { label: "Pago", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", amount: "text-emerald-600" },
  pending: { label: "Pendente", className: "bg-amber-50 text-amber-700 ring-amber-600/20", amount: "text-amber-600" },
};

const STATUS_FILTERS = [
  { id: "", label: "Todos" },
  { id: "paid", label: "Pagos" },
  { id: "pending", label: "Pendentes" },
];

const PAGE_SIZE = 15;

const controlClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10";

const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0];

const emptyTransaction = () => ({
  patient_id: "",
  appointment_id: "",
  amount: "",
  payment_method: "cash",
  description: "",
  transaction_date: todayLocal(),
  status: "paid",
});

const emptyExpense = () => ({
  description: "",
  amount: "",
  category: "general",
  date: todayLocal(),
  recipient: "",
  notes: "",
});

function Badge({ className, children, title }) {
  return <span className={`status-badge whitespace-nowrap ${className}`} title={title}>{children}</span>;
}

export default function RevenuePage() {
  const { user } = useAuth();
  const isSuperUser = user?.user_type === 'superuser';

  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalRevenuePending, setTotalRevenuePending] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterWithDebt, setFilterWithDebt] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [activeTab, setActiveTab] = useState("revenues");
  const [patientDebts, setPatientDebts] = useState({});

  const [formData, setFormData] = useState(emptyTransaction);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [expenseFile, setExpenseFile] = useState(null);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const promises = [
        api.get("/transactions", { params: { limit: 500 } }),
        api.get("/appointments", { params: { limit: 500 } }),
        api.get("/patients", { params: { page: 1, page_size: 300, need_debt: true } }),
        api.get("/dashboard/stats"),
      ];
      if (isSuperUser) {
        promises.push(api.get("/expenses"));
      }
      const results = await Promise.all(promises);
      setTransactions(results[0].data);
      setAppointments(results[1].data);
      setPatients(results[2].data);
      const dashboardStats = results[3].data;
      setTotalRevenue(dashboardStats?.revenuePaid ?? 0);
      setTotalRevenuePending(dashboardStats?.revenuePending ?? 0);
      if (isSuperUser && results[4]) {
        setExpenses(results[4].data);
        setTotalExpenses(results[4].data.reduce((acc, curr) => acc + curr.amount, 0));
      }
      const debtsMap = {};
      results[2].data.forEach((p) => {
        debtsMap[p.id] = p.total_debt ?? 0;
      });
      setPatientDebts(debtsMap);
    } catch (error) {
      toast.error("Erro ao carregar dados de faturamento");
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      if (editingExpenseId) {
        const payload = {
          description: expenseForm.description,
          amount: parseFloat(expenseForm.amount),
          category: expenseForm.category,
          date: expenseForm.date,
          recipient: expenseForm.recipient,
          notes: expenseForm.notes,
        };
        await api.put(`/expenses/${editingExpenseId}`, payload);

        if (expenseFile) {
          const fileData = new FormData();
          fileData.append('file', expenseFile);
          await api.post(`/expenses/${editingExpenseId}/attachments`, fileData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
        toast.success("Despesa atualizada com sucesso!");
      } else {
        const fileData = new FormData();
        fileData.append('description', expenseForm.description);
        fileData.append('amount', expenseForm.amount);
        fileData.append('category', expenseForm.category);
        fileData.append('date', expenseForm.date);
        if (expenseForm.recipient) fileData.append('recipient', expenseForm.recipient);
        if (expenseForm.notes) fileData.append('notes', expenseForm.notes);
        if (expenseFile) {
          fileData.append('file', expenseFile);
        }
        await api.post("/expenses", fileData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success("Despesa registrada com sucesso!");
      }

      handleCloseExpenseDialog();
      loadData();
    } catch (error) {
      console.error(error);
      toast.error(editingExpenseId ? "Erro ao atualizar despesa" : "Erro ao registrar despesa");
    }
  };

  const openNewExpense = () => {
    setEditingExpenseId(null);
    setExpenseForm(emptyExpense());
    setExpenseFile(null);
    setShowExpenseDialog(true);
  };

  const handleEditExpense = (expense) => {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      description: expense.description || "",
      amount: expense.amount,
      category: expense.category || "general",
      date: String(expense.date || "").split('T')[0],
      recipient: expense.recipient || "",
      notes: expense.notes || "",
    });
    setExpenseFile(null);
    setShowExpenseDialog(true);
  };

  const handleCloseExpenseDialog = () => {
    setShowExpenseDialog(false);
    setEditingExpenseId(null);
    setExpenseForm(emptyExpense());
    setExpenseFile(null);
  };

  const confirmDeleteExpense = async () => {
    try {
      if (!expenseToDelete) return;
      await api.delete(`/expenses/${expenseToDelete.id}`);
      toast.success("Despesa excluída com sucesso");
      loadData();
    } catch (error) {
      toast.error("Erro ao excluir despesa");
    }
    setExpenseToDelete(null);
  };

  const handleDownloadAttachment = async (attachmentId, filename) => {
    try {
      const response = await api.get(`/expenses/attachment/${attachmentId}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error("Erro ao baixar anexo");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.patient_id?.trim()) {
      toast.error("Selecione um paciente para salvar a transação.");
      return;
    }
    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
      };

      if (editingId) {
        await api.put(`/transactions/${editingId}`, payload);
        toast.success("Transação atualizada!");
      } else {
        await api.post("/transactions", payload);
        if (formData.status === "paid") {
          toast.success("Pagamento registrado!");
        } else {
          toast.success("Débito registrado!");
        }
      }

      handleCloseDialog();
      loadData();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar transação" : "Erro ao registrar pagamento/débito");
    }
  };

  const openNewTransaction = () => {
    setEditingId(null);
    setFormData(emptyTransaction());
    setShowDialog(true);
  };

  const handleEdit = (transaction) => {
    setEditingId(transaction.id);
    setFormData({
      patient_id: transaction.patient_id,
      appointment_id: transaction.appointment_id || "",
      amount: transaction.amount.toString(),
      payment_method: transaction.payment_method,
      description: transaction.description || "",
      transaction_date: transaction.transaction_date,
      status: transaction.status || "paid",
    });
    setShowDialog(true);
  };

  const confirmDeleteTransaction = async () => {
    try {
      if (!transactionToDelete) return;
      await api.delete(`/transactions/${transactionToDelete.id}`);
      toast.success("Transação deletada!");
      loadData();
    } catch (error) {
      toast.error("Erro ao deletar transação");
    }
    setTransactionToDelete(null);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData(emptyTransaction());
  };

  const getPatientName = (transactionOrPatientId) => {
    const patientId = typeof transactionOrPatientId === "string" ? transactionOrPatientId : transactionOrPatientId?.patient_id;
    const patientName = typeof transactionOrPatientId === "object" && transactionOrPatientId?.patient_name;
    if (patientName) return patientName;
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.name : "Paciente";
  };

  const getPaymentMethodLabel = (method) => PAYMENT_METHODS[method] || method;

  const term = normalizeText(searchTerm.trim());
  const filteredTransactions = transactions.filter(trans => {
    const matchesSearch = !term || normalizeText(getPatientName(trans)).includes(term) ||
                         normalizeText(trans.description).includes(term);
    const matchesPayment = !filterPaymentMethod || trans.payment_method === filterPaymentMethod;
    const matchesDateStart = !filterDateStart || trans.transaction_date >= filterDateStart;
    const matchesDateEnd = !filterDateEnd || trans.transaction_date <= filterDateEnd;
    const matchesDebt = !filterWithDebt || (patientDebts[trans.patient_id] > 0);
    const matchesStatus = !filterStatus || trans.status === filterStatus;
    return matchesSearch && matchesPayment && matchesDateStart && matchesDateEnd && matchesDebt && matchesStatus;
  });

  const filteredTotal = filteredTransactions.reduce((sum, trans) => sum + trans.amount, 0);
  const { page, setPage, pageItems: currentTransactions } = usePagedList(filteredTransactions, PAGE_SIZE);

  const hasFilters = !!(searchTerm || filterPaymentMethod || filterDateStart || filterDateEnd || filterStatus || filterWithDebt);
  const advancedFilterCount = [filterPaymentMethod, filterDateStart, filterDateEnd, filterWithDebt].filter(Boolean).length;
  const paidList = filteredTransactions.filter(t => t.status === 'paid');
  const pendingList = filteredTransactions.filter(t => t.status === 'pending');
  const paidFromList = paidList.reduce((sum, t) => sum + t.amount, 0);
  const pendingFromList = pendingList.reduce((sum, t) => sum + t.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const clearFilters = () => {
    setSearchTerm("");
    setFilterPaymentMethod("");
    setFilterDateStart("");
    setFilterDateEnd("");
    setFilterWithDebt(false);
    setFilterStatus("");
  };

  const withPageReset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const statCards = [
    {
      label: hasFilters ? "Recebido (filtro)" : "Total recebido",
      value: formatBRL(hasFilters ? paidFromList : totalRevenue),
      hint: `${paidList.length} ${paidList.length === 1 ? "transação paga" : "transações pagas"}`,
      icon: CheckCircle,
      tone: "from-green-500 to-green-600",
    },
    {
      label: hasFilters ? "Pendente (filtro)" : "Total pendente",
      value: formatBRL(hasFilters ? pendingFromList : totalRevenuePending),
      hint: `${pendingList.length} ${pendingList.length === 1 ? "débito pendente" : "débitos pendentes"}`,
      icon: Clock,
      tone: "from-orange-500 to-orange-600",
    },
  ];
  if (isSuperUser) {
    statCards.push(
      {
        label: "Despesas",
        value: formatBRL(totalExpenses),
        hint: `${expenses.length} ${expenses.length === 1 ? "lançamento" : "lançamentos"}`,
        icon: TrendingDown,
        tone: "from-rose-500 to-rose-600",
      },
      {
        label: "Lucro líquido",
        value: formatBRL(netProfit),
        hint: "Total recebido − despesas",
        icon: netProfit >= 0 ? TrendingUp : TrendingDown,
        tone: netProfit >= 0 ? "from-blue-500 to-blue-600" : "from-red-500 to-red-600",
      },
    );
  }

  const showExpenses = isSuperUser && activeTab === "expenses";

  const headerAction = showExpenses ? (
    <Button onClick={openNewExpense} className="gap-2 bg-red-600 text-white hover:bg-red-700">
      <Plus className="h-4 w-4" />
      <span className="sm:hidden">Despesa</span>
      <span className="hidden sm:inline">Registrar despesa</span>
    </Button>
  ) : (
    <Button onClick={openNewTransaction} className="gap-2">
      <Plus className="h-4 w-4" />
      <span className="sm:hidden">Lançamento</span>
      <span className="hidden sm:inline">Registrar pagamento</span>
    </Button>
  );

  const renderTransactionActions = (transaction) => (
    <div className="flex items-center justify-end gap-0.5">
      <IconAction onClick={() => handleEdit(transaction)} title="Editar transação">
        <Pencil className="h-4 w-4" />
      </IconAction>
      <IconAction onClick={() => setTransactionToDelete(transaction)} title="Excluir transação" tone="danger">
        <Trash2 className="h-4 w-4" />
      </IconAction>
    </div>
  );

  const renderDebtBadge = (patientId) =>
    patientDebts[patientId] > 0 ? (
      <Badge className="bg-red-50 text-red-700 ring-red-600/20 tabular-nums" title="Débito total do paciente">
        Débito {formatBRL(patientDebts[patientId])}
      </Badge>
    ) : null;

  const renderRevenues = () => (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Filtros */}
      <div className="space-y-3 border-b border-slate-200 p-3 md:p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <SearchField
            value={searchTerm}
            onChange={withPageReset(setSearchTerm)}
            placeholder="Buscar por paciente ou descrição"
            className="md:flex-1"
          />
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id || "all"}
                  type="button"
                  onClick={() => withPageReset(setFilterStatus)(f.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filterStatus === f.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowMobileFilters((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 md:hidden"
              aria-expanded={showMobileFilters}
            >
              Filtros
              {advancedFilterCount > 0 && (
                <span className="rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">{advancedFilterCount}</span>
              )}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMobileFilters ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
        <div className={`${showMobileFilters ? "grid" : "hidden"} grid-cols-2 gap-2 md:grid md:grid-cols-4 md:items-end`}>
          <div className="col-span-2 space-y-1 md:col-span-1">
            <span className="text-xs font-medium text-slate-500">Forma de pagamento</span>
            <select
              className={controlClass}
              value={filterPaymentMethod}
              onChange={(e) => withPageReset(setFilterPaymentMethod)(e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">De</span>
            <input
              type="date"
              className={controlClass}
              value={filterDateStart}
              onChange={(e) => withPageReset(setFilterDateStart)(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Até</span>
            <input
              type="date"
              className={controlClass}
              value={filterDateEnd}
              onChange={(e) => withPageReset(setFilterDateEnd)(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => withPageReset(setFilterWithDebt)(!filterWithDebt)}
            aria-pressed={filterWithDebt}
            className={`col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors md:col-span-1 ${
              filterWithDebt
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Wallet className="h-4 w-4" />
            Pacientes com débito
          </button>
        </div>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/60 px-3 py-2 text-xs md:px-4">
          <span className="text-slate-600">
            {filteredTransactions.length} {filteredTransactions.length === 1 ? "transação" : "transações"}
            <span className="mx-1.5 text-slate-300">·</span>
            Total <strong className="font-semibold tabular-nums text-slate-900">{formatBRL(filteredTotal)}</strong>
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800"
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtros
          </button>
        </div>
      )}

      {filteredTransactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={transactions.length === 0 ? "Nenhuma transação registrada" : "Nenhuma transação encontrada"}
          text={transactions.length === 0 ? "Registre pagamentos e débitos dos pacientes." : "Ajuste a busca ou limpe os filtros."}
          action={transactions.length === 0 ? (
            <Button size="sm" onClick={openNewTransaction} className="gap-2">
              <Plus className="h-4 w-4" />
              Registrar pagamento
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={clearFilters} className="border-slate-200">Limpar filtros</Button>
          )}
        />
      ) : (
        <>
          {/* Tabela (desktop) */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-medium text-slate-500">
                <th className="w-full px-4 py-2.5 font-medium">Paciente</th>
                <th className="px-4 py-2.5 font-medium">Data</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Forma</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                <th className="px-4 py-2.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {currentTransactions.map((transaction) => {
                const status = TRANSACTION_STATUS[transaction.status] || TRANSACTION_STATUS.paid;
                const name = getPatientName(transaction);
                return (
                  <tr key={transaction.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="w-full max-w-0 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ContactAvatar size="sm" name={name} seed={transaction.patient_id} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-slate-900">{name}</p>
                            {renderDebtBadge(transaction.patient_id)}
                          </div>
                          {transaction.description && (
                            <p className="truncate text-xs text-slate-500">{transaction.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{formatDay(transaction.transaction_date)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 lg:table-cell">
                      {getPaymentMethodLabel(transaction.payment_method)}
                    </td>
                    <td className="px-4 py-3"><Badge className={status.className}>{status.label}</Badge></td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${status.amount}`}>
                      {formatBRL(transaction.amount)}
                    </td>
                    <td className="w-px whitespace-nowrap px-2 py-3">{renderTransactionActions(transaction)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Cards (mobile) */}
          <ul className="md:hidden">
            {currentTransactions.map((transaction) => {
              const status = TRANSACTION_STATUS[transaction.status] || TRANSACTION_STATUS.paid;
              const name = getPatientName(transaction);
              return (
                <li key={transaction.id} className="border-b border-slate-100 px-3 py-3 last:border-0">
                  <div className="flex items-start gap-3">
                    <ContactAvatar size="sm" name={name} seed={transaction.patient_id} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
                        <span className={`whitespace-nowrap text-sm font-semibold tabular-nums ${status.amount}`}>
                          {formatBRL(transaction.amount)}
                        </span>
                      </div>
                      {transaction.description && (
                        <p className="truncate text-xs text-slate-500">{transaction.description}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <Badge className={status.className}>{status.label}</Badge>
                        {renderDebtBadge(transaction.patient_id)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between pl-12">
                    <span className="text-[11px] tabular-nums text-slate-400">
                      {formatDay(transaction.transaction_date)} · {getPaymentMethodLabel(transaction.payment_method)}
                    </span>
                    {renderTransactionActions(transaction)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ListPager page={page} pageSize={PAGE_SIZE} total={filteredTransactions.length} onChange={setPage} />
    </div>
  );

  const renderExpenseActions = (expense) => (
    <div className="flex items-center justify-end gap-0.5">
      {(expense.attachments || []).map((att) => (
        <IconAction
          key={att.id}
          onClick={() => handleDownloadAttachment(att.id, att.filename)}
          title={`Baixar ${att.filename}`}
          tone="primary"
        >
          <Paperclip className="h-4 w-4" />
        </IconAction>
      ))}
      <IconAction onClick={() => handleEditExpense(expense)} title="Editar despesa">
        <Pencil className="h-4 w-4" />
      </IconAction>
      <IconAction onClick={() => setExpenseToDelete(expense)} title="Excluir despesa" tone="danger">
        <Trash2 className="h-4 w-4" />
      </IconAction>
    </div>
  );

  const renderExpenses = () => (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {expenses.length === 0 ? (
        <EmptyState
          icon={TrendingDown}
          title="Nenhuma despesa registrada"
          text="Registre salários, fornecedores e compras para acompanhar o lucro."
          action={(
            <Button size="sm" onClick={openNewExpense} className="gap-2 bg-red-600 text-white hover:bg-red-700">
              <Plus className="h-4 w-4" />
              Registrar despesa
            </Button>
          )}
        />
      ) : (
        <>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-medium text-slate-500">
                <th className="w-full px-4 py-2.5 font-medium">Descrição</th>
                <th className="px-4 py-2.5 font-medium">Categoria</th>
                <th className="px-4 py-2.5 font-medium">Data</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Beneficiário</th>
                <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                <th className="px-4 py-2.5"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => {
                const category = EXPENSE_CATEGORIES[expense.category] || EXPENSE_CATEGORIES.general;
                return (
                  <tr key={expense.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="w-full max-w-0 px-4 py-3">
                      <p className="truncate font-medium text-slate-900">{expense.description}</p>
                      {expense.notes && <p className="truncate text-xs text-slate-500">{expense.notes}</p>}
                    </td>
                    <td className="px-4 py-3"><Badge className={category.className}>{category.label}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{formatDay(expense.date)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 lg:table-cell">
                      {expense.recipient || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-red-600">
                      − {formatBRL(expense.amount)}
                    </td>
                    <td className="w-px whitespace-nowrap px-2 py-3">{renderExpenseActions(expense)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <ul className="md:hidden">
            {expenses.map((expense) => {
              const category = EXPENSE_CATEGORIES[expense.category] || EXPENSE_CATEGORIES.general;
              return (
                <li key={expense.id} className="border-b border-slate-100 px-3 py-3 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{expense.description}</p>
                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-red-600">
                      − {formatBRL(expense.amount)}
                    </span>
                  </div>
                  {expense.notes && <p className="truncate text-xs text-slate-500">{expense.notes}</p>}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                      <Badge className={category.className}>{category.label}</Badge>
                      <span className="tabular-nums">{formatDay(expense.date)}</span>
                      {expense.recipient && <span className="truncate">· {expense.recipient}</span>}
                    </div>
                    {renderExpenseActions(expense)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <Layout>
      <div>
        <PageHeader
          title="Faturamento"
          subtitle={isSuperUser ? "Receitas e despesas da clínica" : "Pagamentos e débitos dos pacientes"}
          action={!loadingData && headerAction}
        />

        {loadingData ? (
          <div aria-hidden="true">
            <div className={`mb-6 grid grid-cols-2 gap-3 md:gap-4 ${isSuperUser ? "xl:grid-cols-4" : ""}`}>
              {Array.from({ length: isSuperUser ? 4 : 2 }, (_, i) => (
                <div key={i} className="h-[6.5rem] animate-pulse rounded-xl bg-slate-200/70" />
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
          </div>
        ) : (
          <>
            <div className={`mb-6 grid grid-cols-2 gap-3 md:gap-4 ${isSuperUser ? "xl:grid-cols-4" : ""}`}>
              {statCards.map((card) => (
                <StatCard key={card.label} {...card} />
              ))}
            </div>

            {isSuperUser && (
              <div className="mb-4 flex gap-6 border-b border-slate-200">
                {[
                  { id: "revenues", label: "Receitas", count: transactions.length },
                  { id: "expenses", label: "Despesas", count: expenses.length },
                ].map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-sm font-medium transition-colors ${
                        active ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {tab.label}
                      <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {showExpenses ? renderExpenses() : renderRevenues()}
          </>
        )}
      </div>

      {/* Modal de Transações */}
      <Dialog open={showDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar transação" : "Registrar pagamento ou débito"}</DialogTitle>
            <DialogDescription>Lançamentos pendentes entram no débito do paciente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:col-span-2" role="radiogroup" aria-label="Status da transação">
              {[
                { value: "paid", label: "Pagamento recebido", icon: CheckCircle, active: "text-emerald-700" },
                { value: "pending", label: "Débito pendente", icon: Clock, active: "text-amber-700" },
              ].map((opt) => {
                const selected = formData.status === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setFormData({ ...formData, status: opt.value })}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium transition-colors ${
                      selected ? `bg-white shadow-sm ${opt.active}` : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Paciente *</Label>
              <PatientCombobox
                patients={patients}
                value={formData.patient_id}
                onChange={(patientId) => setFormData({ ...formData, patient_id: patientId, appointment_id: "" })}
                placeholder="Busque ou selecione um paciente..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trans-amount">Valor (R$) *</Label>
              <Input
                id="trans-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trans-method">Forma de pagamento *</Label>
              <select
                id="trans-method"
                className="input-field"
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              >
                {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trans-date">Data *</Label>
              <Input
                id="trans-date"
                type="date"
                value={formData.transaction_date}
                onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trans-appointment">Agendamento</Label>
              <select
                id="trans-appointment"
                className="input-field"
                value={formData.appointment_id}
                onChange={(e) => setFormData({ ...formData, appointment_id: e.target.value })}
                disabled={!formData.patient_id}
              >
                <option value="">Nenhum</option>
                {appointments
                  .filter(a => a.patient_id === formData.patient_id)
                  .map(a => (
                    <option key={a.id} value={a.id}>
                      {formatDay(a.appointment_date)} - {a.appointment_time}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="trans-description">Descrição *</Label>
              <Input
                id="trans-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Ex.: Consulta, procedimento, pacote..."
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancelar</Button>
              <Button type="submit">
                {editingId ? "Salvar alterações" : formData.status === "pending" ? "Registrar débito" : "Registrar pagamento"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Despesas */}
      <Dialog open={showExpenseDialog} onOpenChange={(open) => !open && handleCloseExpenseDialog()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExpenseId ? "Editar despesa" : "Registrar despesa"}</DialogTitle>
            <DialogDescription>Despesas são descontadas do lucro líquido.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateExpense} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="exp-description">Descrição *</Label>
              <Input
                id="exp-description"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                required
                placeholder="Ex.: Salário, compra de luvas..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Valor (R$) *</Label>
              <Input
                id="exp-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-category">Categoria *</Label>
              <select
                id="exp-category"
                className="input-field"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              >
                {Object.entries(EXPENSE_CATEGORIES).map(([value, { label }]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Data *</Label>
              <Input
                id="exp-date"
                type="date"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-recipient">Beneficiário</Label>
              <Input
                id="exp-recipient"
                value={expenseForm.recipient}
                onChange={(e) => setExpenseForm({ ...expenseForm, recipient: e.target.value })}
                placeholder="Quem recebeu?"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="exp-file">Comprovante</Label>
              <label
                htmlFor="exp-file"
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 hover:border-slate-400"
              >
                <Upload className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{expenseFile ? expenseFile.name : "Anexar arquivo (opcional)"}</span>
                {expenseFile && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setExpenseFile(null); }}
                    className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                    aria-label="Remover arquivo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              <input
                id="exp-file"
                type="file"
                className="sr-only"
                onChange={(e) => { setExpenseFile(e.target.files[0] || null); e.target.value = ""; }}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="exp-notes">Observações</Label>
              <Textarea
                id="exp-notes"
                rows={2}
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={handleCloseExpenseDialog}>Cancelar</Button>
              <Button type="submit" className="bg-red-600 text-white hover:bg-red-700">
                {editingExpenseId ? "Salvar alterações" : "Registrar despesa"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!expenseToDelete}
        title="Excluir despesa"
        name={expenseToDelete?.description}
        confirmLabel="Excluir despesa"
        onCancel={() => setExpenseToDelete(null)}
        onConfirm={confirmDeleteExpense}
      />
      <ConfirmDeleteDialog
        open={!!transactionToDelete}
        title="Excluir transação"
        name={transactionToDelete ? `${getPatientName(transactionToDelete)} · ${formatBRL(transactionToDelete.amount)}` : ""}
        confirmLabel="Excluir transação"
        onCancel={() => setTransactionToDelete(null)}
        onConfirm={confirmDeleteTransaction}
      />
    </Layout>
  );
}
