import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, DollarSign, ChevronLeft, ChevronRight, CheckCircle, XCircle, X, AlertCircle, Clock, Edit, Trash2, TrendingDown, TrendingUp, Upload, Paperclip } from "lucide-react";
import PatientCombobox from "../components/PatientCombobox";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterWithDebt, setFilterWithDebt] = useState(false);
  const [filterStatus, setFilterStatus] = useState(""); // all, paid, pending
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);
  const [patientDebts, setPatientDebts] = useState({});
  
  // Transaction Form Data
  const [formData, setFormData] = useState({
    patient_id: "",
    appointment_id: "",
    amount: "",
    payment_method: "cash",
    description: "",
    transaction_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    status: "paid"
  });

  // Expense Form Data
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    amount: "",
    category: "general",
    date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    recipient: "",
    notes: ""
  });
  const [expenseFile, setExpenseFile] = useState(null);
  const [showDeleteExpenseDialog, setShowDeleteExpenseDialog] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [showDeleteTransactionDialog, setShowDeleteTransactionDialog] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const promises = [
        api.get("/transactions", { params: { limit: 500 } }),
        api.get("/appointments"),
        api.get("/patients", { params: { page: 1, page_size: 500, need_debt: true } }),
        api.get("/revenue/total"),
      ];
      if (isSuperUser) {
        promises.push(api.get("/expenses"));
      }
      const results = await Promise.all(promises);
      setTransactions(results[0].data);
      setAppointments(results[1].data);
      setPatients(results[2].data);
      setTotalRevenue(results[3].data.total_revenue);
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
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      if (editingExpenseId) {
        // Edit mode (JSON payload)
        // Note: File upload is separate or needs a different approach if we want to support it in edit
        // For simplicity in edit, we might skip file update or handle it if changed
        // But the PUT endpoint expects JSON usually unless we change it to multipart
        
        // Let's check if we have a file to upload. If so, we might need a separate endpoint or logic
        // But standard PUT for data + optional attachment is tricky.
        // Let's assume for now we send JSON for data update.
        
        const payload = {
            description: expenseForm.description,
            amount: parseFloat(expenseForm.amount),
            category: expenseForm.category,
            date: expenseForm.date,
            recipient: expenseForm.recipient,
            notes: expenseForm.notes
        };

        await api.put(`/expenses/${editingExpenseId}`, payload);
        
        // If there's a file, we might want to upload it separately or handle it
        if (expenseFile) {
             const formData = new FormData();
             formData.append('file', expenseFile);
             await api.post(`/expenses/${editingExpenseId}/attachments`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
             });
        }

        toast.success("Despesa atualizada com sucesso!");
      } else {
        // Create mode (Multipart)
        const formData = new FormData();
        formData.append('description', expenseForm.description);
        formData.append('amount', expenseForm.amount);
        formData.append('category', expenseForm.category);
        formData.append('date', expenseForm.date);
        if (expenseForm.recipient) formData.append('recipient', expenseForm.recipient);
        if (expenseForm.notes) formData.append('notes', expenseForm.notes);
        
        if (expenseFile) {
          formData.append('file', expenseFile);
        }

        await api.post("/expenses", formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
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

  const handleEditExpense = (expense) => {
    setEditingExpenseId(expense.id);
    setExpenseForm({
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date.split('T')[0],
        recipient: expense.recipient || "",
        notes: expense.notes || ""
    });
    setExpenseFile(null); // Reset file input
    setShowExpenseDialog(true);
  };

  const handleCloseExpenseDialog = () => {
      setShowExpenseDialog(false);
      setEditingExpenseId(null);
      setExpenseForm({
        description: "",
        amount: "",
        category: "general",
        date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        recipient: "",
        notes: ""
      });
      setExpenseFile(null);
  };

  const handleDeleteExpense = (id) => {
    setExpenseToDelete(id);
    setShowDeleteExpenseDialog(true);
  };

  const confirmDeleteExpense = async () => {
    try {
      if (!expenseToDelete) return;
      await api.delete(`/expenses/${expenseToDelete}`);
      toast.success("Despesa excluída com sucesso");
      loadData();
    } catch (error) {
      toast.error("Erro ao excluir despesa");
    }
    setShowDeleteExpenseDialog(false);
    setExpenseToDelete(null);
  };

  const handleDownloadAttachment = async (attachmentId, filename) => {
    try {
      const response = await api.get(`/expenses/attachment/${attachmentId}`, {
        responseType: 'blob'
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
    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount)
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
      
      setShowDialog(false);
      setEditingId(null);
      setFormData({
        patient_id: "",
        appointment_id: "",
        amount: "",
        payment_method: "cash",
        description: "",
        transaction_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        status: "paid"
      });
      loadData();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar transação" : "Erro ao registrar pagamento/débito");
    }
  };

  const handleEdit = (transaction) => {
    setEditingId(transaction.id);
    setFormData({
      patient_id: transaction.patient_id,
      appointment_id: transaction.appointment_id || "",
      amount: transaction.amount.toString(),
      payment_method: transaction.payment_method,
      description: transaction.description,
      transaction_date: transaction.transaction_date,
      status: transaction.status || "paid"
    });
    setShowDialog(true);
  };

  const handleDelete = (transactionId) => {
    setTransactionToDelete(transactionId);
    setShowDeleteTransactionDialog(true);
  };

  const confirmDeleteTransaction = async () => {
    try {
      if (!transactionToDelete) return;
      await api.delete(`/transactions/${transactionToDelete}`);
      toast.success("Transação deletada!");
      loadData();
    } catch (error) {
      toast.error("Erro ao deletar transação");
    }
    setShowDeleteTransactionDialog(false);
    setTransactionToDelete(null);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setFormData({
      patient_id: "",
      appointment_id: "",
      amount: "",
      payment_method: "cash",
      description: "",
      transaction_date: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
      status: "paid"
    });
  };

  const getPatientName = (patientId) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.name : "Paciente";
  };

  const getPaymentMethodLabel = (method) => {
    const labels = {
      cash: "Dinheiro",
      card: "Cartão",
      pix: "PIX",
      transfer: "Transferência",
      check: "Cheque",
      promissory: "Promissória",
      payment_link: "Link de Pagamento"
    };
    return labels[method] || method;
  };

  // Filtros e Pesquisa
  const filteredTransactions = transactions.filter(trans => {
    const matchesSearch = getPatientName(trans.patient_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
                         trans.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPayment = !filterPaymentMethod || trans.payment_method === filterPaymentMethod;
    const matchesDateStart = !filterDateStart || trans.transaction_date >= filterDateStart;
    const matchesDateEnd = !filterDateEnd || trans.transaction_date <= filterDateEnd;
    const matchesDebt = !filterWithDebt || (patientDebts[trans.patient_id] > 0);
    const matchesStatus = !filterStatus || trans.status === filterStatus;
    
    return matchesSearch && matchesPayment && matchesDateStart && matchesDateEnd && matchesDebt && matchesStatus;
  });

  // Calcular total filtrado
  const filteredTotal = filteredTransactions.reduce((sum, trans) => sum + trans.amount, 0);

  // Paginação
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentTransactions = filteredTransactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

  // Render Functions para Reutilização
  const renderRevenueFilters = () => (
    <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <Label className="text-sm font-semibold mb-2 block">Pesquisar</Label>
          <Input
            placeholder="Paciente ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-sm font-semibold mb-2 block">Status do Pagamento</Label>
          <select
            className="input-field"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="paid">Pagos</option>
            <option value="pending">Pendentes/Débitos</option>
          </select>
        </div>
        <div>
          <Label className="text-sm font-semibold mb-2 block">Forma de Pagamento</Label>
          <select
            className="input-field"
            value={filterPaymentMethod}
            onChange={(e) => setFilterPaymentMethod(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="cash">Dinheiro</option>
            <option value="card">Cartão</option>
            <option value="pix">PIX</option>
            <option value="transfer">Transferência</option>
            <option value="check">Cheque</option>
            <option value="promissory">Promissória</option>
            <option value="payment_link">Link de Pagamento</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-sm font-semibold mb-2 block">Data Inicial</Label>
          <Input
            type="date"
            value={filterDateStart}
            onChange={(e) => setFilterDateStart(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-sm font-semibold mb-2 block">Data Final</Label>
          <Input
            type="date"
            value={filterDateEnd}
            onChange={(e) => setFilterDateEnd(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-sm font-semibold mb-2 block">Pacientes com Débito</Label>
          <select
            className="input-field"
            value={filterWithDebt}
            onChange={(e) => setFilterWithDebt(e.target.value === "true")}
          >
            <option value="false">Todos os Pacientes</option>
            <option value="true">Apenas com Débito</option>
          </select>
        </div>
      </div>
      {(searchTerm || filterPaymentMethod || filterDateStart || filterDateEnd || filterWithDebt || filterStatus) && (
        <div className="mt-4 flex items-center justify-between">
          <Button
            onClick={() => {
              setSearchTerm("");
              setFilterPaymentMethod("");
              setFilterDateStart("");
              setFilterDateEnd("");
              setFilterWithDebt(false);
              setFilterStatus("");
            }}
            variant="outline"
            className="btn-secondary text-sm"
          >
            <X className="w-4 h-4 mr-2" />
            Limpar Filtros
          </Button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {filteredTransactions.length} transação(ões)
            </span>
            <span className="text-sm font-bold text-green-600">
              Total: R$ {filteredTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  const renderRevenueCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-8 shadow-lg">
        <div className="flex items-center justify-between text-white">
          <div>
            <p className="text-green-100 text-sm mb-2">
              {(searchTerm || filterPaymentMethod || filterDateStart || filterDateEnd || filterStatus || filterWithDebt) ? "Pagamentos Recebidos (Filtrado)" : "Total Recebido"}
            </p>
            <h2 className="text-4xl font-bold">
              R$ {filteredTransactions.filter(t => t.status === 'paid').reduce((sum, t) => sum + t.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-green-100 text-sm mt-2">
              {filteredTransactions.filter(t => t.status === 'paid').length} transações pagas
            </p>
          </div>
          <CheckCircle className="w-20 h-20 opacity-30" />
        </div>
      </div>

      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 shadow-lg">
        <div className="flex items-center justify-between text-white">
          <div>
            <p className="text-orange-100 text-sm mb-2">
              {(searchTerm || filterPaymentMethod || filterDateStart || filterDateEnd || filterStatus || filterWithDebt) ? "Débitos Pendentes (Filtrado)" : "Total Pendente"}
            </p>
            <h2 className="text-4xl font-bold">
              R$ {filteredTransactions.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <p className="text-orange-100 text-sm mt-2">
              {filteredTransactions.filter(t => t.status === 'pending').length} débitos pendentes
            </p>
          </div>
          <Clock className="w-20 h-20 opacity-30" />
        </div>
      </div>
    </div>
  );

  const renderRevenueList = () => (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-bold text-gray-900 mb-6">Histórico de Transações</h3>
      
      <div className="space-y-4">
        {currentTransactions.map((transaction) => (
          <div key={transaction.id} className="border-b border-gray-200 pb-4 last:border-0">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-semibold text-gray-900">
                    {getPatientName(transaction.patient_id)}
                  </h4>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                    {getPaymentMethodLabel(transaction.payment_method)}
                  </span>
                  {transaction.status === "pending" && (
                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Pendente
                    </span>
                  )}
                  {patientDebts[transaction.patient_id] > 0 && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Débito: R$ {patientDebts[transaction.patient_id].toFixed(2)}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-sm">{transaction.description}</p>
                <p className="text-gray-500 text-xs mt-1">
                  {new Date(transaction.transaction_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className={`text-2xl font-bold ${transaction.status === 'pending' ? 'text-orange-600' : 'text-green-600'}`}>
                    R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  {transaction.status === "pending" && (
                    <p className="text-xs text-orange-600 mt-1">Aguardando pagamento</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(transaction)}
                    className="text-blue-500 hover:text-blue-700 p-2"
                    title="Editar transação"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(transaction.id)}
                    className="text-red-500 hover:text-red-700 p-2"
                    title="Deletar transação"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}

        {transactions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Nenhuma transação registrada ainda</p>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            variant="outline"
            className="btn-secondary"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-gray-700">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            variant="outline"
            className="btn-secondary"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="p-6">
        {isSuperUser ? (
          <Tabs defaultValue="revenues" className="w-full space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Gestão Financeira</h1>
                <p className="text-gray-500">Gerencie receitas e despesas da clínica</p>
              </div>
              <TabsList className="grid w-full md:w-[400px] grid-cols-2">
                <TabsTrigger value="revenues">Receitas</TabsTrigger>
                <TabsTrigger value="expenses">Despesas</TabsTrigger>
              </TabsList>
            </div>

            {/* Card de Lucro Líquido (Visível apenas para Super User) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Receita Total</p>
                    <h3 className="text-2xl font-bold text-green-600 mt-1">
                      R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="p-2 bg-green-50 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Despesas Totais</p>
                    <h3 className="text-2xl font-bold text-red-600 mt-1">
                      R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="p-2 bg-red-50 rounded-lg">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  </div>
                </div>
              </div>

              <div className={`rounded-xl p-6 shadow-sm border ${
                (totalRevenue - totalExpenses) >= 0 
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' 
                  : 'bg-gradient-to-br from-red-500 to-red-600 text-white'
              }`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium opacity-90">Lucro Líquido</p>
                    <h3 className="text-3xl font-bold mt-1">
                      R$ {(totalRevenue - totalExpenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="p-2 bg-white/20 rounded-lg">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                </div>
              </div>
            </div>

            <TabsContent value="revenues" className="space-y-6">
              {/* Cabeçalho da Aba Receitas */}
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Transações e Receitas</h2>
                <Button onClick={() => setShowDialog(true)} className="btn-primary">
                  <Plus className="w-5 h-5 mr-2" />
                  Registrar Pagamento
                </Button>
              </div>
              
              {renderRevenueFilters()}
              {renderRevenueCards()}
              {renderRevenueList()}
            </TabsContent>

            <TabsContent value="expenses" className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Controle de Despesas</h2>
                <Button onClick={() => setShowExpenseDialog(true)} className="bg-red-600 hover:bg-red-700 text-white">
                  <Plus className="w-5 h-5 mr-2" />
                  Registrar Despesa
                </Button>
              </div>

              {/* Lista de Despesas */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4 font-semibold text-gray-900">Descrição</th>
                        <th className="px-6 py-4 font-semibold text-gray-900">Categoria</th>
                        <th className="px-6 py-4 font-semibold text-gray-900">Data</th>
                        <th className="px-6 py-4 font-semibold text-gray-900">Beneficiário</th>
                        <th className="px-6 py-4 font-semibold text-gray-900 text-right">Valor</th>
                        <th className="px-6 py-4 font-semibold text-gray-900 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                            Nenhuma despesa registrada
                          </td>
                        </tr>
                      ) : (
                        expenses.map((expense) => (
                          <tr key={expense.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{expense.description}</div>
                              {expense.notes && <div className="text-xs text-gray-500 mt-1">{expense.notes}</div>}
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                {expense.category === 'staff' ? 'Colaboradores' :
                                 expense.category === 'supplier' ? 'Fornecedores' :
                                 expense.category === 'supplies' ? 'Suprimentos' : 'Geral'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {new Date(expense.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {expense.recipient || '-'}
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-red-600">
                              - R$ {expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex justify-center gap-2">
                                {expense.attachments && expense.attachments.map((att) => (
                                  <Button 
                                    key={att.id}
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleDownloadAttachment(att.id, att.filename)}
                                    title={`Baixar ${att.filename}`}
                                  >
                                    <Paperclip className="w-4 h-4 text-blue-600" />
                                  </Button>
                                ))}
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleEditExpense(expense)}
                                  title="Editar Despesa"
                                >
                                  <Edit className="w-4 h-4 text-gray-500" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  title="Excluir Despesa"
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          // Layout Original para não-SuperUser
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h1 className="text-4xl font-bold text-gray-900">Faturamento</h1>
              <Button onClick={() => setShowDialog(true)} className="btn-primary">
                <Plus className="w-5 h-5 mr-2" />
                Registrar Pagamento
              </Button>
            </div>
            {renderRevenueFilters()}
            {renderRevenueCards()}
            {renderRevenueList()}
          </div>
        )}
      </div>

      {/* Modal de Transações (Existente) */}
      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Transação" : "Registrar Pagamento/Débito"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Status da Transação *</Label>
              <select
                className="input-field"
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value})}
              >
                <option value="paid">Pagamento Recebido</option>
                <option value="pending">Débito Pendente</option>
              </select>
            </div>

            <div>
              <Label className="mb-2 block">Paciente *</Label>
              <PatientCombobox
                patients={patients}
                value={formData.patient_id}
                onChange={(patientId) => setFormData({...formData, patient_id: patientId})}
                placeholder="Busque ou selecione um paciente..."
              />
            </div>
            <div>
              <Label>Agendamento (opcional)</Label>
              <select
                className="input-field"
                value={formData.appointment_id}
                onChange={(e) => setFormData({...formData, appointment_id: e.target.value})}
              >
                <option value="">Nenhum</option>
                {appointments
                  .filter(a => a.patient_id === formData.patient_id)
                  .map(a => (
                    <option key={a.id} value={a.id}>
                      {new Date(a.appointment_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} - {a.appointment_time}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Forma de Pagamento *</Label>
                <select
                  className="input-field"
                  value={formData.payment_method}
                  onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
                >
                  <option value="cash">Dinheiro</option>
                  <option value="card">Cartão</option>
                  <option value="pix">PIX</option>
                  <option value="transfer">Transferência</option>
                  <option value="check">Cheque</option>
                  <option value="promissory">Promissória</option>
                  <option value="payment_link">Link de Pagamento</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Data da Transação *</Label>
              <Input
                type="date"
                value={formData.transaction_date}
                onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
                required
              />
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Ex: Consulta, Procedimento, etc."
                required
              />
            </div>
            <Button type="submit" className="w-full btn-primary">
              {editingId ? "Atualizar Transação" : "Registrar Pagamento"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Novo Modal de Despesas */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Despesa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateExpense} className="space-y-4">
            <div>
              <Label>Descrição *</Label>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                required
                placeholder="Ex: Pagamento de Salário, Compra de Luvas..."
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Categoria *</Label>
                <select
                  className="input-field"
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                >
                  <option value="staff">Colaboradores</option>
                  <option value="supplier">Fornecedores</option>
                  <option value="supplies">Suprimentos</option>
                  <option value="general">Despesas Gerais</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data *</Label>
                <Input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Beneficiário (Opcional)</Label>
                <Input
                  value={expenseForm.recipient}
                  onChange={(e) => setExpenseForm({...expenseForm, recipient: e.target.value})}
                  placeholder="Quem recebeu?"
                />
              </div>
            </div>

            <div>
              <Label>Comprovante / Anexo (Opcional)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="file"
                  onChange={(e) => setExpenseFile(e.target.files[0])}
                  className="cursor-pointer"
                />
              </div>
            </div>

            <div>
              <Label>Observações (Opcional)</Label>
              <Input
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({...expenseForm, notes: e.target.value})}
              />
            </div>

            <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white">
              {editingExpenseId ? "Salvar Alterações" : "Registrar Saída"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteExpenseDialog} onOpenChange={setShowDeleteExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão de Despesa</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-700">
              Tem certeza que deseja excluir esta despesa?
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteExpenseDialog(false);
                setExpenseToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmDeleteExpense}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Excluir Despesa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showDeleteTransactionDialog} onOpenChange={setShowDeleteTransactionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-700">
              Tem certeza que deseja deletar esta transação?
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteTransactionDialog(false);
                setTransactionToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteTransaction}
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}