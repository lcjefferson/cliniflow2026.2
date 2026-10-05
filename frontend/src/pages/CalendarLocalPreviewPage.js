import React from "react";
import CalendarAppointmentCard from "../components/CalendarAppointmentCard";
import {
  DEFAULT_CALENDAR_DENSITY,
  getCalendarLayoutClasses,
  getMonthCellLimit,
} from "../lib/calendarDensity";
import { STATUS_META, getAppointmentCardBackground } from "../lib/appointmentStatus";

const PROFESSIONAL_COLORS = {
  helena: "bg-blue-500",
  ricardo: "bg-teal-500",
  juliana: "bg-purple-500",
};

const MOCK = [
  { id: 1, status: "scheduled", prof: "helena", patient: "Maria Silva", time: "08:00", end: "08:45" },
  { id: 2, status: "waiting", prof: "ricardo", patient: "João Pereira", time: "09:30", end: "10:00" },
  { id: 3, status: "in_progress", prof: "juliana", patient: "Ana Costa", time: "11:00", end: "11:30" },
  { id: 4, status: "completed", prof: "helena", patient: "Carlos Mendes", time: "14:00", end: "14:45" },
  { id: 5, status: "cancelled", prof: "ricardo", patient: "Beatriz Lima", time: "16:15", end: "17:00" },
  { id: 6, status: "scheduled", prof: "juliana", patient: "Pedro Santos", time: "17:30", end: "18:00" },
];

function renderCard(apt, variant, density) {
  const profColor = PROFESSIONAL_COLORS[apt.prof];
  const status = STATUS_META[apt.status] || STATUS_META.scheduled;
  const appointment = {
    id: apt.id,
    status: apt.status,
    appointment_time: apt.time,
    appointment_time_end: apt.end,
    roomName: "Sala 2",
  };
  return (
    <CalendarAppointmentCard
      key={`${variant}-${apt.id}`}
      variant={variant}
      density={density}
      appointment={appointment}
      patientName={apt.patient}
      professionalName={
        apt.prof === "helena" ? "Dra. Helena" : apt.prof === "ricardo" ? "Dr. Ricardo" : "Dra. Juliana"
      }
      serviceLabel="Consulta"
      professionalColorClass={getAppointmentCardBackground(appointment, profColor)}
      statusLabel={status.label}
      statusBadgeClassName={status.className}
      onClick={() => {}}
    />
  );
}

export default function CalendarLocalPreviewPage() {
  const density = DEFAULT_CALENDAR_DENSITY;
  const layout = getCalendarLayoutClasses(density);
  const monthLimit = getMonthCellLimit(density);
  const visible = MOCK.slice(0, monthLimit);
  const hidden = MOCK.length - visible.length;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
          <h1 className="text-xl font-bold text-slate-900">Preview local — cards do calendário</h1>
          <p className="text-sm text-slate-600 mt-1">
            Mesmos componentes do calendário real.{" "}
            <a href="/calendar" className="text-blue-600 hover:underline">
              Ir para /calendar
            </a>{" "}
            (requer login).
          </p>
        </div>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-slate-900 border-b border-slate-200">
            Visão mês — até {monthLimit} cards por dia
          </h2>
          <div className="grid grid-cols-7 gap-px bg-slate-200">
            <div className={`col-span-2 md:col-span-1 ${layout.monthCell} p-1.5 flex flex-col bg-[#f5f8ff]`}>
              <span className="h-6 w-6 mb-1 inline-flex items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                5
              </span>
              <div className={`${layout.monthStack} min-w-0`}>
                {visible.map((apt) => renderCard(apt, "month", density))}
                {hidden > 0 ? (
                  <span className="px-1.5 text-xs font-medium text-slate-500">+{hidden} mais</span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-slate-900 border-b border-slate-200">
            Visão semana
          </h2>
          <div className="grid md:grid-cols-3 gap-px bg-slate-200">
            <div className={`${layout.weekColumn} p-1.5 flex flex-col bg-white`}>
              <div className={`flex-1 ${layout.weekStack}`}>
                {MOCK.slice(0, 4).map((apt) => renderCard(apt, "week", density))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-slate-900 border-b border-slate-200">
            Visão dia
          </h2>
          <div className="space-y-2 p-3 md:p-4">
            {MOCK.map((apt) => renderCard(apt, "list", density))}
          </div>
        </section>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col gap-3 md:flex-row md:items-start md:gap-8">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
              Profissionais · cor do card (agendado)
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {Object.entries(PROFESSIONAL_COLORS).map(([key, color]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm ${color}`} />
                  <span className="text-sm text-slate-700">{key}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="md:ml-auto md:border-l md:border-slate-200 md:pl-8">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
              Status · cor do card
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {Object.values(STATUS_META).map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-full ${item.dot}`} />
                  <span className="text-sm text-slate-700">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
