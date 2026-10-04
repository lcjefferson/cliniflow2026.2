export const STATUS_META = {
  scheduled: { label: "Agendado", className: "status-scheduled", dot: "bg-slate-400" },
  waiting: { label: "Em espera", className: "status-waiting", dot: "bg-violet-500" },
  in_progress: { label: "Em andamento", className: "status-in-progress", dot: "bg-orange-500" },
  completed: { label: "Concluído", className: "status-completed", dot: "bg-green-600" },
  cancelled: { label: "Cancelado", className: "status-cancelled", dot: "bg-red-600" },
};

export const getStatusMeta = (apt) => STATUS_META[apt?.status] || STATUS_META.scheduled;

export const getStatusDot = (apt) => getStatusMeta(apt).dot;
