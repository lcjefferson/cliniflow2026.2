import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { Plus, DollarSign, ChevronLeft, ChevronRight, CheckCircle, XCircle, X, AlertCircle, Clock, Edit, Trash2 } from "lucide-react";
import PatientCombobox from "../components/PatientCombobox";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RevenuePage() {
  const [transactions, setTransactions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("");
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterWithDebt, setFilterWithDebt] = useState(false);
  const [filterStatus, setFilterStatus] = useState(""); // all, paid, pending
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);
  const [patientDebts, setPatientDebts] = useState({});
  const [formData, setFormData] = useState({
    patient_id: "",
    appointment_id: "",
    amount: "",
    payment_method: "cash",
    description: "",
    transaction_date: new Date().toISOString().split('T')[0],
    status: "paid"
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [trans, appt, pat, rev] = await Promise.all([
        api.get("/transactions"),
        api.get("/appointments"),
        api.get("/patients"),
        api.get("/revenue/total")
      ]);
      setTransactions(trans.data);
      setAppointments(appt.data);
      setPatients(pat.data);
      setTotalRevenue(rev.data.total_revenue);

      // Load debts for each patient
      const debtsPromises = pat.data.map(p => 
        api.get(`/patients/${p.id}/debts`).catch(() => ({ data: { total_debt: 0 } }))
      );
      const debtsResults = await Promise.all(debtsPromises);
      
      const debtsMap = {};
      pat.data.forEach((p, index) => {
        debtsMap[p.id] = debtsResults[index].data.total_debt;
      });
      setPatientDebts(debtsMap);
    } catch (error) {
      toast.error("Erro ao carregar dados de faturamento");
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
        transaction_date: new Date().toISOString().split('T')[0],
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

  const handleDelete = async (transactionId) => {
    if (!window.confirm("Tem certeza que deseja deletar esta transação?")) return;
    
    try {
      await api.delete(`/transactions/${transactionId}`);
      toast.success("Transação deletada!");
      loadData();
    } catch (error) {
      toast.error("Erro ao deletar transação");
    }
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
      transaction_date: new Date().toISOString().split('T')[0],
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
      check: "Cheque"
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

  return (
    <Layout>
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Faturamento</h1>
          <Button onClick={() => setShowDialog(true)} className="btn-primary">
            <Plus className="w-5 h-5 mr-2" />
            Registrar Pagamento
          </Button>
        </div>

        {/* Filtros de Pesquisa */}
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
              <Label className="text-sm font-semibold mb-2 block">Pacientes com Débito de Appointments</Label>
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
                  {filteredTransactions.length} transação(ões) encontrada(s)
                </span>
                <span className="text-sm font-bold text-green-600">
                  Total: R$ {filteredTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Cards de Resumo */}
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

        {/* Lista de Transações */}
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
                      {new Date(transaction.transaction_date).toLocaleDateString('pt-BR')}
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

        {/* Modal de Registrar/Editar Pagamento */}
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
                        {new Date(a.appointment_date).toLocaleDateString('pt-BR')} - {a.appointment_time}
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
      </div>
    </Layout>
  );
}
