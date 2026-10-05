import React from "react";
import { normalizeDensity } from "../lib/calendarDensity";

const STYLE_BY_DENSITY = {
  compact: {
    month: {
      root: "gap-0.5 rounded py-1 pl-2 pr-1.5",
      time: "text-xs font-semibold",
      patient: "text-sm font-semibold",
      pro: "text-[10px] leading-tight",
    },
    week: {
      root: "gap-1.5 rounded-md p-2.5",
      time: "text-sm font-semibold",
      patient: "text-sm font-bold leading-snug",
      pro: "text-[11px] leading-tight",
    },
    mobile: {
      root: "gap-3 rounded-lg p-3.5",
      time: "text-base font-semibold",
      patient: "text-base font-bold",
      pro: "text-xs",
      timeCol: "w-[4.5rem]",
    },
    list: {
      root: "gap-4 rounded-xl px-4 py-4",
      time: "text-base font-semibold",
      patient: "text-lg font-bold",
      pro: "text-xs",
      meta: "text-[11px]",
      timeCol: "w-28",
    },
  },
  comfortable: {
    month: {
      root: "gap-0.5 rounded-md py-1.5 pl-2 pr-2",
      time: "text-xs font-semibold",
      patient: "text-base font-semibold leading-tight",
      pro: "text-[11px] leading-tight",
    },
    week: {
      root: "gap-1.5 rounded-lg p-3.5",
      time: "text-base font-semibold",
      patient: "text-base font-bold leading-snug",
      pro: "text-xs leading-tight",
    },
    mobile: {
      root: "gap-3.5 rounded-xl p-4",
      time: "text-lg font-semibold",
      patient: "text-lg font-bold",
      pro: "text-sm",
      timeCol: "w-20",
    },
    list: {
      root: "gap-5 rounded-xl px-5 py-5",
      time: "text-lg font-semibold",
      patient: "text-xl font-bold",
      pro: "text-sm",
      meta: "text-xs",
      timeCol: "w-32",
    },
  },
  spacious: {
    month: {
      root: "gap-1 rounded-md py-2 pl-2.5 pr-2",
      time: "text-sm font-semibold",
      patient: "text-base font-bold leading-snug",
      pro: "text-xs leading-tight",
    },
    week: {
      root: "gap-2 rounded-lg p-4 shadow-sm",
      time: "text-lg font-semibold",
      patient: "text-lg font-bold leading-snug line-clamp-2",
      pro: "text-sm leading-tight",
    },
    mobile: {
      root: "gap-4 rounded-xl p-5",
      time: "text-xl font-semibold",
      patient: "text-xl font-bold",
      pro: "text-sm",
      timeCol: "w-24",
    },
    list: {
      root: "gap-6 rounded-xl px-6 py-6",
      time: "text-xl font-semibold",
      patient: "text-2xl font-bold",
      pro: "text-sm",
      meta: "text-xs",
      timeCol: "w-36",
    },
  },
};

function cardTone(colorClass) {
  const light = /bg-(yellow|amber|lime|white)/.test(colorClass || "");
  if (light) {
    return {
      title: "text-slate-900",
      muted: "text-slate-700",
    };
  }
  return {
    title: "text-white",
    muted: "text-white/80",
  };
}

function nameClass(cancelled, tone) {
  return cancelled ? `${tone.title} line-through opacity-80` : tone.title;
}

export default function CalendarAppointmentCard({
  variant,
  density = "comfortable",
  appointment,
  patientName,
  professionalName,
  serviceLabel,
  professionalColorClass,
  statusLabel,
  statusBadgeClassName,
  tooltip,
  onClick,
}) {
  const d = normalizeDensity(density);
  const styles = STYLE_BY_DENSITY[d][variant];
  const cancelled = appointment?.status === "cancelled";
  const timeEnd = appointment?.appointment_time_end;
  const tone = cardTone(professionalColorClass);
  const shell = `${professionalColorClass} ${cancelled ? "opacity-60" : ""} hover:brightness-110 transition`;

  const proLine =
    professionalName ? (
      <span className={`block truncate ${styles.pro} ${tone.muted}`}>{professionalName}</span>
    ) : null;

  if (variant === "month") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        className={`w-full flex flex-col items-stretch text-left ${styles.root} ${shell}`}
      >
        <span className={`${styles.time} tabular-nums ${tone.title}`}>{appointment.appointment_time}</span>
        <span className={`${styles.patient} truncate ${nameClass(cancelled, tone)}`}>{patientName}</span>
        {proLine}
      </button>
    );
  }

  if (variant === "week") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        className={`w-full flex flex-col items-stretch text-left shadow-sm ${styles.root} ${shell}`}
      >
        <span className={`tabular-nums ${styles.time} ${tone.title}`}>
          {appointment.appointment_time}
          {timeEnd ? <span className={`font-normal ${tone.muted}`}> – {timeEnd}</span> : null}
        </span>
        <span className={`block ${styles.patient} ${nameClass(cancelled, tone)}`}>{patientName}</span>
        {proLine}
      </button>
    );
  }

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-stretch text-left shadow-sm active:brightness-95 ${styles.root} ${shell}`}
      >
        <span className={`${styles.timeCol} flex-shrink-0 tabular-nums ${styles.time} ${tone.title}`}>
          {appointment.appointment_time}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${styles.patient} ${nameClass(cancelled, tone)}`}>{patientName}</span>
          {proLine}
        </span>
      </button>
    );
  }

  const extraMeta = [serviceLabel, appointment?.roomName].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center text-left shadow-sm ${styles.root} ${shell}`}
    >
      <span className={`${styles.timeCol} flex-shrink-0 tabular-nums ${styles.time} ${tone.title}`}>
        {appointment.appointment_time}
        {timeEnd ? <span className={`block font-normal ${tone.muted} text-sm`}>– {timeEnd}</span> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${styles.patient} ${nameClass(cancelled, tone)}`}>{patientName}</span>
        {proLine}
        {extraMeta ? (
          <span className={`block truncate ${styles.meta} ${tone.muted}`}>{extraMeta}</span>
        ) : null}
      </span>
      {statusBadgeClassName ? (
        <span className={`status-badge flex-shrink-0 ${statusBadgeClassName}`}>{statusLabel}</span>
      ) : null}
    </button>
  );
}
