import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import api from "../services/api";
import { FileDown, FileSpreadsheet, Calendar, Users, DollarSign, Activity, Check, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import StatCard from "../components/StatCard";
import { PageHeader } from "../components/ListKit";
import { PAYMENT_METHODS, formatBRL, formatDay, toYMD } from "../lib/finance";
import { STATUS_META } from "../lib/appointmentStatus";
import { buildReportPdf } from "../lib/reportPdf";

const REPORT_TYPES = [
  { id: "appointments", label: "Agendamentos", icon: Calendar, description: "Atendimentos com serviços, status e valores" },
  { id: "patients", label: "Pacientes", icon: Users, description: "Cadastros com contato e data de entrada" },
  { id: "financial", label: "Financeiro", icon: DollarSign, description: "Pagamentos recebidos e débitos pendentes" },
];

const RECORD_LABELS = {
  appointments: ["agendamento", "agendamentos"],
  patients: ["paciente", "pacientes"],
  financial: ["lançamento", "lançamentos"],
};

const APPOINTMENT_STATUS_TONE = { completed: "green", cancelled: "red", in_progress: "amber", waiting: "blue" };

const statusLabel = (status) => STATUS_META[status]?.label || status || "";
const paidState = (r) => (r.paid ? "paid" : r.paid_amount > 0 ? "partial" : "none");
const PAID_LABEL = { paid: "Sim", partial: "Parcial", none: "Não" };
const PAID_TONE = { paid: "green", partial: "amber" };
const paymentLabel = (method) => PAYMENT_METHODS[method] || method || "";

// Each report knows how to turn API rows into PDF columns, Excel rows and summary cards.
const REPORTS = {
  appointments: {
    title: "Relatório de Agendamentos",
    file: "relatorio_agendamentos",
    sheet: "Agendamentos",
    landscape: true,
    columns: [
      { header: "Data", key: "dateLabel", width: 22 },
      { header: "Hora", key: "time", width: 15 },
      { header: "Paciente", key: "patient_name" },
      { header: "Profissional", key: "professional_name", width: 42 },
      { header: "Serviços", key: "services" },
      { header: "Status", key: "statusLabel", width: 26, tone: (r) => APPOINTMENT_STATUS_TONE[r.status] },
      { header: "Pago", key: "paidLabel", width: 16, align: "center", tone: (r) => PAID_TONE[paidState(r)] },
      { header: "Valor", key: "amountLabel", width: 28, align: "right" },
    ],
    decorate: (r) => ({
      ...r,
      dateLabel: formatDay(r.date),
      statusLabel: statusLabel(r.status),
      paidLabel: PAID_LABEL[paidState(r)],
      amountLabel: formatBRL(r.amount),
    }),
    excelRow: (r) => ({
      Data: formatDay(r.date),
      Hora: r.time,
      Paciente: r.patient_name,
      Profissional: r.professional_name,
      Serviços: r.services,
      Status: statusLabel(r.status),
      Pago: PAID_LABEL[paidState(r)],
      Valor: r.amount,
      "Valor pago": r.paid_amount ?? 0,
    }),
    summary: (s) => [
      { label: "Agendamentos", value: String(s.count) },
      { label: "Cancelados", value: String(s.cancelled), tone: s.cancelled ? "red" : undefined },
      { label: "Valor total*", value: formatBRL(s.total), tone: "blue" },
      { label: "Pago", value: formatBRL(s.paid_total), tone: "green" },
    ],
    footnote: "* Exclui cancelados. Valores dos lançamentos financeiros vinculados ao agendamento ou do mesmo paciente no mesmo dia.",
  },
  patients: {
    title: "Relatório de Pacientes",
    file: "relatorio_pacientes",
    sheet: "Pacientes",
    columns: [
      { header: "Nome", key: "name" },
      { header: "E-mail", key: "email" },
      { header: "Telefone", key: "phone", width: 30 },
      { header: "Nascimento", key: "birthLabel", width: 22 },
      { header: "Cidade", key: "city", width: 28 },
      { header: "Cadastro", key: "createdLabel", width: 20 },
    ],
    decorate: (r) => ({ ...r, birthLabel: formatDay(r.birthdate), createdLabel: formatDay(r.created_at) }),
    excelRow: (r) => ({
      Nome: r.name,
      "E-mail": r.email || "",
      Telefone: r.phone || "",
      Nascimento: formatDay(r.birthdate),
      Cidade: r.city || "",
      Cadastro: formatDay(r.created_at),
    }),
    summary: (s) => [{ label: "Pacientes cadastrados", value: String(s.count), tone: "blue" }],
  },
  financial: {
    title: "Relatório Financeiro",
    file: "relatorio_financeiro",
    sheet: "Financeiro",
    columns: [
      { header: "Data", key: "dateLabel", width: 21 },
      { header: "Paciente", key: "patient_name" },
      { header: "Descrição", key: "description" },
      { header: "Forma", key: "methodLabel", width: 24 },
      { header: "Status", key: "statusLabel", width: 20, tone: (r) => (r.status === "paid" ? "green" : "amber") },
      { header: "Valor", key: "amountLabel", width: 26, align: "right" },
    ],
    decorate: (r) => ({
      ...r,
      dateLabel: formatDay(r.date),
      methodLabel: paymentLabel(r.payment_method),
      statusLabel: r.status === "paid" ? "Pago" : "Pendente",
      amountLabel: formatBRL(r.amount),
    }),
    excelRow: (r) => ({
      Data: formatDay(r.date),
      Paciente: r.patient_name,
      Descrição: r.description,
      "Forma de pagamento": paymentLabel(r.payment_method),
      Status: r.status === "paid" ? "Pago" : "Pendente",
      Valor: r.amount,
    }),
    summary: (s) => [
      { label: "Lançamentos", value: String(s.count) },
      { label: "Recebido", value: formatBRL(s.paid_total), tone: "green" },
      { label: "Pendente", value: formatBRL(s.pending_total), tone: "amber" },
      { label: "Total", value: formatBRL(s.total), tone: "blue" },
    ],
  },
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
  const thisMonth = getPresets()[0];
  const [reportType, setReportType] = useState("appointments");
  const [dateStart, setDateStart] = useState(thisMonth.start);
  const [dateEnd, setDateEnd] = useState(thisMonth.end);
  const [generating, setGenerating] = useState(false);

  const [stats, setStats] = useState(null);
  const [professionalsCount, setProfessionalsCount] = useState(null);
  const [clinic, setClinic] = useState(null);

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState(false);

  const invalidRange = Boolean(dateStart && dateEnd && dateStart > dateEnd);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => setStats({}));
    api.get("/professionals").then((r) => setProfessionalsCount((r.data || []).length)).catch(() => setProfessionalsCount(0));
    api.get("/settings/clinic").then((r) => setClinic(r.data || null)).catch(() => setClinic(null));
  }, []);

  useEffect(() => {
    if (invalidRange) return undefined;
    let cancelled = false;
    setReportLoading(true);
    setReportError(false);
    const timer = setTimeout(async () => {
      try {
        const params = {};
        if (dateStart) params.date_from = dateStart;
        if (dateEnd) params.date_to = dateEnd;
        const res = await api.get(`/reports/${reportType}`, { params });
        if (!cancelled) setReport({ type: reportType, ...res.data });
      } catch (error) {
        if (!cancelled) {
          setReport(null);
          setReportError(true);
          toast.error(error.response?.status === 403 ? "Sem permissão para gerar relatórios" : "Erro ao carregar dados do relatório");
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reportType, dateStart, dateEnd, invalidRange]);

  const periodLabel = () => {
    if (dateStart && dateEnd) return `Período: ${formatDay(dateStart)} a ${formatDay(dateEnd)}`;
    if (dateStart) return `Período: a partir de ${formatDay(dateStart)}`;
    if (dateEnd) return `Período: até ${formatDay(dateEnd)}`;
    return "Período: todos os registros";
  };

  const fileName = (base, ext) => `${base}_${dateStart || "inicio"}_a_${dateEnd || toYMD(new Date())}.${ext}`;

  const triggerDownload = (href, name) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    link.click();
  };

  const generateReport = (format) => {
    const def = REPORTS[reportType];
    if (!report || report.type !== reportType) return;
    setGenerating(true);
    try {
      const truncatedNote = report.truncated ? "Atenção: o período tem mais registros do que o limite exportado. Reduza o período para ver tudo." : null;
      if (format === "pdf") {
        const doc = buildReportPdf({
          title: def.title,
          period: periodLabel(),
          clinic,
          columns: def.columns,
          rows: report.rows.map(def.decorate),
          summary: def.summary(report.summary),
          landscape: def.landscape,
          truncatedNote,
          footnote: def.footnote,
        });
        triggerDownload(doc.output("datauristring"), fileName(def.file, "pdf"));
      } else {
        const ws = XLSX.utils.json_to_sheet(report.rows.map(def.excelRow));
        const headers = Object.keys(def.excelRow(report.rows[0] || {}));
        ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, def.sheet);
        const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
        triggerDownload(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`, fileName(def.file, "xlsx"));
      }
      toast.success(format === "pdf" ? "Relatório PDF gerado!" : "Relatório Excel gerado!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar relatório");
    } finally {
      setGenerating(false);
    }
  };

  const ready = !reportLoading && !reportError && report?.type === reportType && !invalidRange;
  const rowCount = ready ? report.summary?.count ?? report.rows.length : 0;
  const [singular, plural] = RECORD_LABELS[reportType];
  const presets = getPresets();
  const activePreset = presets.find((p) => p.start === dateStart && p.end === dateEnd);

  const fmtCount = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR"));
  const statCards = [
    { label: "Agendamentos", value: fmtCount(stats?.appointmentsTotal), icon: Calendar, tone: "from-blue-500 to-blue-600" },
    { label: "Pacientes", value: fmtCount(stats?.patientsTotal), icon: Users, tone: "from-purple-500 to-purple-600" },
    { label: "Recebido", value: stats ? formatBRL(stats.revenuePaid) : "—", icon: DollarSign, tone: "from-green-500 to-green-600" },
    { label: "Profissionais", value: fmtCount(professionalsCount), icon: Activity, tone: "from-orange-500 to-orange-600" },
  ];

  return (
    <Layout>
      <div>
        <PageHeader title="Relatórios" subtitle="Exporte os dados da clínica em PDF ou Excel" />

        <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          {statCards.map((s) => (
            <StatCard key={s.label} {...s} />
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
              <div className="text-sm text-slate-600">
                {invalidRange ? (
                  <span className="text-slate-400">Ajuste o período para continuar.</span>
                ) : reportLoading ? (
                  <span className="inline-flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Buscando registros...</span>
                ) : reportError ? (
                  <span className="text-red-600">Não foi possível carregar os dados.</span>
                ) : (
                  <>
                    <strong className="font-semibold tabular-nums text-slate-900">{rowCount.toLocaleString("pt-BR")}</strong>{" "}
                    {rowCount === 1 ? singular : plural}
                    <span className="text-slate-400"> · {periodLabel().replace("Período: ", "")}</span>
                    {report?.truncated && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> Muitos registros: apenas parte será exportada. Reduza o período.
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button onClick={() => generateReport("pdf")} disabled={!ready || generating} className="gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                  Baixar PDF
                </Button>
                <Button
                  onClick={() => generateReport("excel")}
                  disabled={!ready || generating}
                  className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
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
