import React from "react";
import { normalizeDensity } from "../lib/calendarDensity";

const STYLE_BY_DENSITY = {
  compact: {
    month: {
      root: "gap-1.5 rounded py-0.5 pl-2 pr-1.5 text-xs",
      time: "text-xs",
      patient: "text-xs font-semibold",
      sub: "text-[10px]",
      dot: "w-2 h-2",
    },
    week: {
      root: "gap-2 rounded-md border border-slate-200 p-2",
      time: "text-xs",
      patient: "text-xs font-semibold",
      sub: "text-[11px]",
      dot: "w-2.5 h-2.5",
      bar: "w-1.5",
    },
    mobile: {
      root: "gap-3 rounded-lg p-3",
      time: "text-sm",
      patient: "text-sm font-semibold",
      sub: "text-xs",
      dot: "w-2.5 h-2.5",
      bar: "w-1.5",
      timeCol: "w-16",
    },
    list: {
      root: "gap-4 px-4 py-3",
      time: "text-sm",
      patient: "text-sm font-medium",
      sub: "text-xs",
      bar: "w-1.5",
      timeCol: "w-24",
    },
  },
  comfortable: {
    month: {
      root: "gap-1.5 rounded-md py-1.5 pl-2 pr-2 text-sm",
      time: "text-xs font-semibold",
      patient: "text-sm font-semibold leading-tight",
      sub: "text-[11px]",
      dot: "w-2.5 h-2.5",
    },
    week: {
      root: "gap-2.5 rounded-lg border border-slate-200 p-3",
      time: "text-sm font-semibold",
      patient: "text-sm font-semibold leading-snug",
      sub: "text-xs",
      dot: "w-3 h-3",
      bar: "w-2",
    },
    mobile: {
      root: "gap-3.5 rounded-xl p-4",
      time: "text-base",
      patient: "text-base font-semibold",
      sub: "text-sm",
      dot: "w-3 h-3",
      bar: "w-2",
      timeCol: "w-[4.25rem]",
    },
    list: {
      root: "gap-5 px-5 py-4",
      time: "text-base font-semibold",
      patient: "text-base font-semibold",
      sub: "text-sm",
      bar: "w-2",
      timeCol: "w-28",
    },
  },
  spacious: {
    month: {
      root: "gap-2 rounded-md py-2 pl-2.5 pr-2 text-sm",
      time: "text-sm font-semibold",
      patient: "text-sm font-bold leading-snug line-clamp-2",
      sub: "text-xs",
      dot: "w-3 h-3",
    },
    week: {
      root: "gap-3 rounded-lg border border-slate-200 p-3.5 shadow-sm",
      time: "text-base font-semibold",
      patient: "text-base font-bold leading-snug line-clamp-2",
      sub: "text-sm",
      dot: "w-3.5 h-3.5",
      bar: "w-2",
    },
    mobile: {
      root: "gap-4 rounded-xl p-4",
      time: "text-lg",
      patient: "text-lg font-bold",
      sub: "text-sm",
      dot: "w-3.5 h-3.5",
      bar: "w-2",
      timeCol: "w-[4.5rem]",
    },
    list: {
      root: "gap-5 px-6 py-5",
      time: "text-lg font-semibold",
      patient: "text-lg font-bold",
      sub: "text-sm",
      bar: "w-2",
      timeCol: "w-32",
    },
  },
};

function cancelledPatientClass(cancelled, base) {
  return cancelled ? "text-slate-400 line-through" : base;
}

export default function CalendarAppointmentCard({
  variant,
  density = "comfortable",
  appointment,
  patientName,
  professionalName,
  serviceLabel,
  professionalColorClass,
  statusDotClass,
  statusLabel,
  statusBadgeClassName,
  tooltip,
  onClick,
}) {
  const d = normalizeDensity(density);
  const styles = STYLE_BY_DENSITY[d][variant];
  const cancelled = appointment?.status === "cancelled";
  const timeEnd = appointment?.appointment_time_end;

  if (variant === "month") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        className={`relative overflow-hidden w-full flex flex-col items-stretch text-left hover:bg-slate-100 ${styles.root} ${
          cancelled ? "text-slate-400" : "text-slate-800"
        }`}
      >
        <span className={`absolute inset-0 opacity-[0.12] ${professionalColorClass}`} />
        <span className={`absolute inset-y-0 left-0 w-[3px] ${professionalColorClass}`} />
        <span className="relative flex items-center gap-1.5 min-w-0">
          <span className={`${styles.dot} rounded-full flex-shrink-0 ${statusDotClass}`} />
          <span className={`${styles.time} tabular-nums flex-shrink-0 text-slate-900`}>
            {appointment.appointment_time}
          </span>
        </span>
        <span className={`relative ${styles.patient} truncate ${cancelledPatientClass(cancelled, "text-slate-900")}`}>
          {patientName}
        </span>
        {professionalName ? (
          <span className={`relative ${styles.sub} truncate text-slate-500`}>{professionalName}</span>
        ) : null}
      </button>
    );
  }

  if (variant === "week") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        className={`relative overflow-hidden w-full flex text-left bg-white hover:border-slate-300 hover:shadow-sm transition ${styles.root}`}
      >
        <span className={`absolute inset-0 opacity-[0.08] ${professionalColorClass}`} />
        <span className={`relative ${styles.bar} self-stretch rounded-full flex-shrink-0 ${professionalColorClass}`} />
        <span className="relative min-w-0 flex-1">
          <span className={`flex items-center gap-1.5 tabular-nums text-slate-900 ${styles.time}`}>
            <span className={`${styles.dot} rounded-full flex-shrink-0 ${statusDotClass}`} title={statusLabel} />
            {appointment.appointment_time}
            {timeEnd ? <span className="font-normal text-slate-400">– {timeEnd}</span> : null}
          </span>
          <span className={`block ${styles.patient} ${cancelledPatientClass(cancelled, "text-slate-900")}`}>
            {patientName}
          </span>
          <span className={`block truncate text-slate-500 ${styles.sub}`}>
            {professionalName}
            {serviceLabel ? ` · ${serviceLabel}` : ""}
          </span>
        </span>
      </button>
    );
  }

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-stretch text-left bg-white border border-slate-200 active:bg-slate-50 ${styles.root}`}
      >
        <span className={`${styles.bar} rounded-full flex-shrink-0 self-stretch ${professionalColorClass}`} />
        <span className={`${styles.timeCol} flex-shrink-0 flex items-start gap-1.5 tabular-nums text-slate-900 ${styles.time}`}>
          <span className={`mt-1 ${styles.dot} rounded-full flex-shrink-0 ${statusDotClass}`} title={statusLabel} />
          {appointment.appointment_time}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${styles.patient} ${cancelledPatientClass(cancelled, "text-slate-900")}`}>
            {patientName}
          </span>
          <span className={`block truncate text-slate-500 ${styles.sub}`}>
            {professionalName}
            {serviceLabel ? ` · ${serviceLabel}` : ""}
          </span>
        </span>
      </button>
    );
  }

  // list (day view desktop)
  const details = [professionalName, serviceLabel, appointment?.roomName].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center text-left hover:bg-slate-50 transition-colors ${styles.root}`}
    >
      <span className={`${styles.timeCol} flex-shrink-0 tabular-nums text-slate-900 ${styles.time}`}>
        {appointment.appointment_time}
        {timeEnd ? <span className="block font-normal text-slate-400 text-sm">– {timeEnd}</span> : null}
      </span>
      <span className={`${styles.bar} self-stretch rounded-full flex-shrink-0 ${professionalColorClass}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${styles.patient} ${cancelledPatientClass(cancelled, "text-slate-900")}`}>
          {patientName}
        </span>
        {details ? <span className={`block truncate text-slate-500 ${styles.sub}`}>{details}</span> : null}
      </span>
      {statusBadgeClassName ? (
        <span className={`status-badge flex-shrink-0 ${statusBadgeClassName}`}>{statusLabel}</span>
      ) : null}
    </button>
  );
}
