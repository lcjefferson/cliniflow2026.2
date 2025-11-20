import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { FileDown, FileSpreadsheet, Calendar, Users, DollarSign, Activity, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export default function ReportsPage() {
  const [reportType, setReportType] = useState("appointments");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [loading, setLoading] = useState(false);

  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [professionals, setProfessionals] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [apptRes, patRes, transRes, profRes] = await Promise.all([
        api.get("/appointments"),
        api.get("/patients"),
        api.get("/transactions"),
        api.get("/professionals")
      ]);
      setAppointments(apptRes.data);
      setPatients(patRes.data);
      setTransactions(transRes.data);
      setProfessionals(profRes.data);
    } catch (error) {
      toast.error("Erro ao carregar dados");
    }
  };

  const getPatientName = (patientId) => {
    const patient = patients.find(p => p.id === patientId);
    return patient ? patient.name : "Desconhecido";
  };

  const getProfessionalName = (professionalId) => {
    const professional = professionals.find(p => p.id === professionalId);
    return professional ? professional.name : "Desconhecido";
  };

  const filterByDate = (data, dateField) => {
    return data.filter(item => {
      const itemDate = item[dateField];
      // Se não tem data, não incluir no relatório
      if (!itemDate) return false;
      
      // Se não tem filtro de data, retornar todos com data válida
      if (!dateStart && !dateEnd) return true;
      
      // Normalizar data para comparação (pode ser string ISO ou date string)
      let normalizedDate = itemDate;
      if (typeof itemDate === 'string') {
        // Se for ISO datetime (2025-11-20T15:24:54), pegar só a data
        normalizedDate = itemDate.split('T')[0];
      }
      
      // Aplicar filtros de data
      if (dateStart && normalizedDate < dateStart) return false;
      if (dateEnd && normalizedDate > dateEnd) return false;
      return true;
    });
  };

  const generateAppointmentsReport = (format) => {
    setLoading(true);
    try {
      const filteredData = filterByDate(appointments, "appointment_date")
        // Filtrar apenas agendamentos com pacientes válidos
        .filter(appt => patients.find(p => p.id === appt.patient_id));
      
      if (format === "pdf") {
        const doc = new jsPDF();
        
        // Título
        doc.setFontSize(18);
        doc.text("Relatório de Agendamentos", 14, 20);
        
        // Período
        doc.setFontSize(10);
        const period = dateStart && dateEnd 
          ? `Período: ${new Date(dateStart).toLocaleDateString('pt-BR')} a ${new Date(dateEnd).toLocaleDateString('pt-BR')}`
          : "Período: Todos os registros";
        doc.text(period, 14, 30);
        
        // Tabela
        const tableData = filteredData.map(appt => [
          new Date(appt.appointment_date).toLocaleDateString('pt-BR'),
          appt.appointment_time,
          getPatientName(appt.patient_id),
          getProfessionalName(appt.professional_id),
          appt.status,
          appt.paid ? "Sim" : "Não",
          `R$ ${appt.amount?.toFixed(2) || "0.00"}`
        ]);
        
        autoTable(doc, {
          startY: 35,
          head: [["Data", "Hora", "Paciente", "Profissional", "Status", "Pago", "Valor"]],
          body: tableData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] }
        });
        
        // Total
        const total = filteredData.reduce((sum, appt) => sum + (appt.amount || 0), 0);
        const finalY = doc.lastAutoTable?.finalY || 35;
        doc.setFontSize(12);
        doc.text(`Total: R$ ${total.toFixed(2)}`, 14, finalY + 10);
        
        // Salvar PDF usando data URL (compatível com sandbox)
        const pdfBase64 = doc.output('datauristring');
        const link = document.createElement('a');
        link.href = pdfBase64;
        link.download = `relatorio_agendamentos_${new Date().toISOString().split('T')[0]}.pdf`;
        link.click();
        toast.success("Relatório PDF gerado!");
        
      } else if (format === "excel") {
        const excelData = filteredData.map(appt => ({
          "Data": new Date(appt.appointment_date).toLocaleDateString('pt-BR'),
          "Hora": appt.appointment_time,
          "Paciente": getPatientName(appt.patient_id),
          "Profissional": getProfessionalName(appt.professional_id),
          "Status": appt.status,
          "Pago": appt.paid ? "Sim" : "Não",
          "Valor": appt.amount || 0
        }));
        
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Agendamentos");
        // Salvar Excel usando data URL (compatível com sandbox)
        const excelBinary = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBinary}`;
        link.download = `relatorio_agendamentos_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        toast.success("Relatório Excel gerado!");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  const generatePatientsReport = (format) => {
    setLoading(true);
    try {
      const filteredData = filterByDate(patients, "created_at");
      
      if (format === "pdf") {
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text("Relatório de Pacientes", 14, 20);
        
        doc.setFontSize(10);
        const period = dateStart && dateEnd 
          ? `Período: ${new Date(dateStart).toLocaleDateString('pt-BR')} a ${new Date(dateEnd).toLocaleDateString('pt-BR')}`
          : "Período: Todos os registros";
        doc.text(period, 14, 30);
        
        const tableData = filteredData.map(patient => [
          patient.name,
          patient.email,
          patient.phone,
          patient.birthdate,
          new Date(patient.created_at).toLocaleDateString('pt-BR')
        ]);
        
        autoTable(doc, {
          startY: 35,
          head: [["Nome", "Email", "Telefone", "Nascimento", "Cadastro"]],
          body: tableData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] }
        });
        
        const finalY = doc.lastAutoTable?.finalY || 35;
        doc.setFontSize(12);
        doc.text(`Total de Pacientes: ${filteredData.length}`, 14, finalY + 10);
        
        // Salvar PDF usando data URL (compatível com sandbox)
        const pdfBase64 = doc.output('datauristring');
        const link = document.createElement('a');
        link.href = pdfBase64;
        link.download = `relatorio_pacientes_${new Date().toISOString().split('T')[0]}.pdf`;
        link.click();
        toast.success("Relatório PDF gerado!");
        
      } else if (format === "excel") {
        const excelData = filteredData.map(patient => ({
          "Nome": patient.name,
          "Email": patient.email,
          "Telefone": patient.phone,
          "Data Nascimento": patient.birthdate,
          "Data Cadastro": new Date(patient.created_at).toLocaleDateString('pt-BR')
        }));
        
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Pacientes");
        // Salvar Excel usando data URL (compatível com sandbox)
        const excelBinary = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBinary}`;
        link.download = `relatorio_pacientes_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        toast.success("Relatório Excel gerado!");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  const generateFinancialReport = (format) => {
    setLoading(true);
    try {
      const filteredData = filterByDate(transactions, "transaction_date")
        // Filtrar apenas transações com pacientes válidos
        .filter(trans => !trans.patient_id || patients.find(p => p.id === trans.patient_id));
      
      if (format === "pdf") {
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text("Relatório Financeiro", 14, 20);
        
        doc.setFontSize(10);
        const period = dateStart && dateEnd 
          ? `Período: ${new Date(dateStart).toLocaleDateString('pt-BR')} a ${new Date(dateEnd).toLocaleDateString('pt-BR')}`
          : "Período: Todos os registros";
        doc.text(period, 14, 30);
        
        const tableData = filteredData.map(trans => [
          new Date(trans.transaction_date).toLocaleDateString('pt-BR'),
          getPatientName(trans.patient_id),
          trans.description,
          trans.payment_method,
          trans.status === "paid" ? "Pago" : "Pendente",
          `R$ ${trans.amount.toFixed(2)}`
        ]);
        
        autoTable(doc, {
          startY: 35,
          head: [["Data", "Paciente", "Descrição", "Forma Pgto", "Status", "Valor"]],
          body: tableData,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] }
        });
        
        const totalPaid = filteredData.filter(t => t.status === "paid").reduce((sum, t) => sum + t.amount, 0);
        const totalPending = filteredData.filter(t => t.status === "pending").reduce((sum, t) => sum + t.amount, 0);
        const finalY = doc.lastAutoTable?.finalY || 35;
        
        doc.setFontSize(12);
        doc.text(`Total Recebido: R$ ${totalPaid.toFixed(2)}`, 14, finalY + 10);
        doc.text(`Total Pendente: R$ ${totalPending.toFixed(2)}`, 14, finalY + 17);
        doc.setFontSize(14);
        doc.text(`Total Geral: R$ ${(totalPaid + totalPending).toFixed(2)}`, 14, finalY + 27);
        
        // Salvar PDF usando data URL (compatível com sandbox)
        const pdfBase64 = doc.output('datauristring');
        const link = document.createElement('a');
        link.href = pdfBase64;
        link.download = `relatorio_financeiro_${new Date().toISOString().split('T')[0]}.pdf`;
        link.click();
        toast.success("Relatório PDF gerado!");
        
      } else if (format === "excel") {
        const excelData = filteredData.map(trans => ({
          "Data": new Date(trans.transaction_date).toLocaleDateString('pt-BR'),
          "Paciente": getPatientName(trans.patient_id),
          "Descrição": trans.description,
          "Forma Pagamento": trans.payment_method,
          "Status": trans.status === "paid" ? "Pago" : "Pendente",
          "Valor": trans.amount
        }));
        
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
        // Salvar Excel usando data URL (compatível com sandbox)
        const excelBinary = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const link = document.createElement('a');
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBinary}`;
        link.download = `relatorio_financeiro_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        toast.success("Relatório Excel gerado!");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  const generateReport = (format) => {
    if (reportType === "appointments") {
      generateAppointmentsReport(format);
    } else if (reportType === "patients") {
      generatePatientsReport(format);
    } else if (reportType === "financial") {
      generateFinancialReport(format);
    }
  };

  const reportTypes = [
    { id: "appointments", label: "Agendamentos", icon: Calendar, description: "Histórico completo de agendamentos" },
    { id: "patients", label: "Pacientes", icon: Users, description: "Lista de pacientes cadastrados" },
    { id: "financial", label: "Financeiro", icon: DollarSign, description: "Transações e faturamento" }
  ];

  return (
    <Layout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Relatórios</h1>
          <p className="text-gray-600">Gere relatórios em PDF ou Excel para análise</p>
        </div>

        {/* Seleção do Tipo de Relatório */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Tipo de Relatório</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reportTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setReportType(type.id)}
                  className={`p-6 border-2 rounded-xl transition-all ${
                    reportType === type.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <Icon className={`w-10 h-10 mb-3 ${reportType === type.id ? "text-blue-500" : "text-gray-400"}`} />
                  <h3 className="font-semibold text-gray-900 mb-1">{type.label}</h3>
                  <p className="text-sm text-gray-600">{type.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtros de Data */}
        <div className="bg-white rounded-2xl p-6 shadow-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div>
              <Label>Data Final</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
          </div>
          {dateStart && dateEnd && (
            <p className="text-sm text-gray-600 mt-3">
              Período selecionado: {new Date(dateStart).toLocaleDateString('pt-BR')} até {new Date(dateEnd).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>

        {/* Botões de Geração */}
        <div className="bg-white rounded-2xl p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Gerar Relatório</h2>
          <div className="flex gap-4">
            <Button
              onClick={() => generateReport("pdf")}
              disabled={loading}
              className="btn-primary flex items-center gap-2"
            >
              <FileDown className="w-5 h-5" />
              {loading ? "Gerando..." : "Gerar PDF"}
            </Button>
            <Button
              onClick={() => generateReport("excel")}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            >
              <FileSpreadsheet className="w-5 h-5" />
              {loading ? "Gerando..." : "Gerar Excel"}
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-4">
            O relatório será baixado automaticamente após a geração.
          </p>
        </div>

        {/* Estatísticas Rápidas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mt-6">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
            <Calendar className="w-8 h-8 mb-3 opacity-80" />
            <p className="text-sm opacity-90">Total Agendamentos</p>
            <p className="text-3xl font-bold">{appointments.length}</p>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
            <Users className="w-8 h-8 mb-3 opacity-80" />
            <p className="text-sm opacity-90">Total Pacientes</p>
            <p className="text-3xl font-bold">{patients.length}</p>
          </div>
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-lg">
            <DollarSign className="w-8 h-8 mb-3 opacity-80" />
            <p className="text-sm opacity-90">Transações</p>
            <p className="text-3xl font-bold">{transactions.length}</p>
          </div>
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
            <Activity className="w-8 h-8 mb-3 opacity-80" />
            <p className="text-sm opacity-90">Profissionais</p>
            <p className="text-3xl font-bold">{professionals.length}</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
