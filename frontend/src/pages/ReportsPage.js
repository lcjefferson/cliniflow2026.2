import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { FileDown, FileSpreadsheet, Calendar, Users, DollarSign, Activity, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import StatCard from "../components/StatCard";
import { PageHeader } from "../components/ListKit";
import { PAYMENT_METHODS, formatDay, toYMD } from "../lib/finance";
import { STATUS_META } from "../lib/appointmentStatus";

const REPORT_TYPES = [
  { id: "appointments", label: "Agendamentos", icon: Calendar, description: "Histórico de atendimentos com status e valores" },
  { id: "patients", label: "Pacientes", icon: Users, description: "Cadastros com contato e data de entrada" },
  { id: "financial", label: "Financeiro", icon: DollarSign, description: "Pagamentos recebidos e débitos pendentes" },
];

const RECORD_LABELS = {
  appointments: ["agendamento", "agendamentos"],
  patients: ["paciente", "pacientes"],
  financial: ["transação", "transações"],
};

const getPresets = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysAgo = (n) => new Date(y, m, now.getDate() - n);
  return [
    { id: "month", label: "Este mês", start: toYMD(new Date(y, m, 1)), end: toYMD(new Date(y, m + 1, 0)) },
    { id: "last-month", label: "Mês passado", start: toYMD(new Date(y, m - 1, 1)), end: toYMD(new Date(y, m, 0)) },
    { id: "30d", label: "Últimos 30 dias", start: toYMD(daysAgo(29)), end: toYMD(now) },
    { id: "year", label: "Este ano", start: toYMD(new Date(y, 0, 1)), end: toYMD(new Date(y, 11, 31)) },
    { id: "all", label: "Tudo", start: "", end: "" },
  ];
};

const dateInputClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10";

function Step({ number, title, children }) {
  return (
    <section className="border-b border-slate-200 p-4 last:border-0 md:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState("appointments");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
    } finally {
      setLoaded(true);
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
      if (!itemDate) return false;
      if (!dateStart && !dateEnd) return true;
      const normalizedDate = typeof itemDate === 'string' ? itemDate.split('T')[0] : itemDate;
      if (dateStart && normalizedDate < dateStart) return false;
      if (dateEnd && normalizedDate > dateEnd) return false;
      return true;
    });
  };

  const getAppointmentRows = () =>
    filterByDate(appointments, "appointment_date").filter(appt => patients.find(p => p.id === appt.patient_id));
  const getPatientRows = () => filterByDate(patients, "created_at");
  const getFinancialRows = () =>
    filterByDate(transactions, "transaction_date").filter(trans => !trans.patient_id || patients.find(p => p.id === trans.patient_id));

  const periodLabel = () => {
    if (dateStart && dateEnd) return `Período: ${formatDay(dateStart)} a ${formatDay(dateEnd)}`;
    if (dateStart) return `Período: a partir de ${formatDay(dateStart)}`;
    if (dateEnd) return `Período: até ${formatDay(dateEnd)}`;
    return "Período: Todos os registros";
  };

  const fileStamp = () => toYMD(new Date());

  const downloadPdf = (doc, name) => {
    const link = document.createElement('a');
    link.href = doc.output('datauristring');
    link.download = `${name}_${fileStamp()}.pdf`;
    link.click();
  };

  const downloadExcel = (rows, sheetName, name) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const excelBinary = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const link = document.createElement('a');
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excelBinary}`;
    link.download = `${name}_${fileStamp()}.xlsx`;
    link.click();
  };

  const startPdf = (title) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(periodLabel(), 14, 30);
    return doc;
  };

  const statusLabel = (status) => STATUS_META[status]?.label || status || "";
  const paymentLabel = (method) => PAYMENT_METHODS[method] || method || "";

  const generateAppointmentsReport = (format) => {
    const filteredData = getAppointmentRows();
    if (format === "pdf") {
      const doc = startPdf("Relatório de Agendamentos");
      autoTable(doc, {
        startY: 35,
        head: [["Data", "Hora", "Paciente", "Profissional", "Status", "Pago", "Valor"]],
        body: filteredData.map(appt => [
          formatDay(appt.appointment_date),
          appt.appointment_time,
          getPatientName(appt.patient_id),
          getProfessionalName(appt.professional_id),
          statusLabel(appt.status),
          appt.paid ? "Sim" : "Não",
          `R$ ${appt.amount?.toFixed(2) || "0.00"}`
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] }
      });
      const total = filteredData.reduce((sum, appt) => sum + (appt.amount || 0), 0);
      const finalY = doc.lastAutoTable?.finalY || 35;
      doc.setFontSize(12);
      doc.text(`Total: R$ ${total.toFixed(2)}`, 14, finalY + 10);
      downloadPdf(doc, "relatorio_agendamentos");
    } else {
      downloadExcel(filteredData.map(appt => ({
        "Data": formatDay(appt.appointment_date),
        "Hora": appt.appointment_time,
        "Paciente": getPatientName(appt.patient_id),
        "Profissional": getProfessionalName(appt.professional_id),
        "Status": statusLabel(appt.status),
        "Pago": appt.paid ? "Sim" : "Não",
        "Valor": appt.amount || 0
      })), "Agendamentos", "relatorio_agendamentos");
    }
  };

  const generatePatientsReport = (format) => {
    const filteredData = getPatientRows();
    if (format === "pdf") {
      const doc = startPdf("Relatório de Pacientes");
      autoTable(doc, {
        startY: 35,
        head: [["Nome", "Email", "Telefone", "Nascimento", "Cadastro"]],
        body: filteredData.map(patient => [
          patient.name,
          patient.email,
          patient.phone,
          formatDay(patient.birthdate),
          formatDay(patient.created_at)
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] }
      });
      const finalY = doc.lastAutoTable?.finalY || 35;
      doc.setFontSize(12);
      doc.text(`Total de Pacientes: ${filteredData.length}`, 14, finalY + 10);
      downloadPdf(doc, "relatorio_pacientes");
    } else {
      downloadExcel(filteredData.map(patient => ({
        "Nome": patient.name,
        "Email": patient.email,
        "Telefone": patient.phone,
        "Data Nascimento": formatDay(patient.birthdate),
        "Data Cadastro": formatDay(patient.created_at)
      })), "Pacientes", "relatorio_pacientes");
    }
  };

  const generateFinancialReport = (format) => {
    const filteredData = getFinancialRows();
    if (format === "pdf") {
      const doc = startPdf("Relatório Financeiro");
      autoTable(doc, {
        startY: 35,
        head: [["Data", "Paciente", "Descrição", "Forma Pgto", "Status", "Valor"]],
        body: filteredData.map(trans => [
          formatDay(trans.transaction_date),
          getPatientName(trans.patient_id),
          trans.description,
          paymentLabel(trans.payment_method),
          trans.status === "paid" ? "Pago" : "Pendente",
          `R$ ${trans.amount.toFixed(2)}`
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] }
      });
      const totalPaid = filteredData.filter(t => t.status === "paid").reduce((sum, t) => sum + t.amount, 0);
      const totalPending = filteredData.filter(t => t.status === "pending").reduce((sum, t) => sum + t.amount, 0);
      const finalY = doc.lastAutoTable?.finalY || 35;
      doc.setFontSize(12);
      doc.text(`Total Recebido: R$ ${totalPaid.toFixed(2)}`, 14, finalY + 10);
      doc.text(`Total Pendente: R$ ${totalPending.toFixed(2)}`, 14, finalY + 17);
      doc.setFontSize(14);
      doc.text(`Total Geral: R$ ${(totalPaid + totalPending).toFixed(2)}`, 14, finalY + 27);
      downloadPdf(doc, "relatorio_financeiro");
    } else {
      downloadExcel(filteredData.map(trans => ({
        "Data": formatDay(trans.transaction_date),
        "Paciente": getPatientName(trans.patient_id),
        "Descrição": trans.description,
        "Forma Pagamento": paymentLabel(trans.payment_method),
        "Status": trans.status === "paid" ? "Pago" : "Pendente",
        "Valor": trans.amount
      })), "Financeiro", "relatorio_financeiro");
    }
  };

  const generateReport = (format) => {
    setLoading(true);
    try {
      if (reportType === "appointments") generateAppointmentsReport(format);
      else if (reportType === "patients") generatePatientsReport(format);
      else if (reportType === "financial") generateFinancialReport(format);
      toast.success(format === "pdf" ? "Relatório PDF gerado!" : "Relatório Excel gerado!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  const rowCount = {
    appointments: () => getAppointmentRows().length,
    patients: () => getPatientRows().length,
    financial: () => getFinancialRows().length,
  }[reportType]();
  const [singular, plural] = RECORD_LABELS[reportType];
  const presets = getPresets();
  const activePreset = presets.find((p) => p.start === dateStart && p.end === dateEnd);
  const invalidRange = dateStart && dateEnd && dateStart > dateEnd;

  const stats = [
    { label: "Agendamentos", value: appointments.length, icon: Calendar, tone: "from-blue-500 to-blue-600" },
    { label: "Pacientes", value: patients.length, icon: Users, tone: "from-purple-500 to-purple-600" },
    { label: "Transações", value: transactions.length, icon: DollarSign, tone: "from-green-500 to-green-600" },
    { label: "Profissionais", value: professionals.length, icon: Activity, tone: "from-orange-500 to-orange-600" },
  ];

  return (
    <Layout>
      <div>
        <PageHeader title="Relatórios" subtitle="Exporte os dados da clínica em PDF ou Excel" />

        <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} value={loaded ? s.value.toLocaleString("pt-BR") : "—"} />
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Step number={1} title="Tipo de relatório">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de relatório">
              {REPORT_TYPES.map((type) => {
                const Icon = type.icon;
                const selected = reportType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setReportType(type.id)}
                    className={`relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selected ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 pr-5">
                      <span className="block text-sm font-medium text-slate-900">{type.label}</span>
                      <span className="block text-xs leading-snug text-slate-500">{type.description}</span>
                    </span>
                    {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </Step>

          <Step number={2} title="Período">
            <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setDateStart(p.start); setDateEnd(p.end); }}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activePreset?.id === p.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">De</span>
                <input type="date" className={dateInputClass} value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Até</span>
                <input type="date" className={dateInputClass} value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
              </label>
            </div>
            {invalidRange && <p className="mt-2 text-xs text-red-600">A data inicial é maior que a final.</p>}
          </Step>

          <Step number={3} title="Exportar">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                {loaded ? (
                  <>
                    <strong className="font-semibold tabular-nums text-slate-900">{rowCount.toLocaleString("pt-BR")}</strong>{" "}
                    {rowCount === 1 ? singular : plural}
                    <span className="text-slate-400"> · {periodLabel().replace("Período: ", "")}</span>
                  </>
                ) : (
                  "Carregando dados..."
                )}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button onClick={() => generateReport("pdf")} disabled={loading || !loaded || invalidRange} className="gap-2">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Baixar PDF
                </Button>
                <Button
                  onClick={() => generateReport("excel")}
                  disabled={loading || !loaded || invalidRange}
                  className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Baixar Excel
                </Button>
              </div>
            </div>
          </Step>
        </div>
      </div>
    </Layout>
  );
}
