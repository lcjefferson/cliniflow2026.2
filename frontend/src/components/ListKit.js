import React from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, subtitle, action, testId }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3 sm:items-end">
      <div className="min-w-0">
        <h1 className="text-2xl text-slate-900 md:text-3xl" data-testid={testId}>{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-9 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
          aria-label="Limpar busca"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const ICON_ACTION_TONES = {
  default: "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
  primary: "text-slate-400 hover:bg-blue-50 hover:text-blue-600",
  danger: "text-slate-400 hover:bg-red-50 hover:text-red-600",
};

export function IconAction({ onClick, title, tone = "default", children, ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-lg p-2 transition-colors ${ICON_ACTION_TONES[tone]}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 text-xs text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <ul aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
          <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/5 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ListPager({ page, pageSize, total, onChange, className = "border-t border-slate-200" }) {
  if (!total) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2.5 text-xs text-slate-500 md:px-4 ${className}`}>
      <span className="tabular-nums">{start}–{end} de {total.toLocaleString("pt-BR")}</span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(page - 1)}
            disabled={page === 1}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-1 tabular-nums">Página {page} de {totalPages}</span>
          <button
            type="button"
            onClick={() => onChange(page + 1)}
            disabled={page === totalPages}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function usePagedList(items, pageSize) {
  const [page, setPage] = React.useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  return {
    page: current,
    setPage,
    pageItems: items.slice((current - 1) * pageSize, current * pageSize),
  };
}

export function ConfirmDeleteDialog({ open, title, name, description, confirmLabel = "Excluir", onCancel, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {name ? (
              <>
                Tem certeza que deseja excluir <strong className="text-slate-900">{name}</strong>?{" "}
              </>
            ) : null}
            {description || "Esta ação não pode ser desfeita."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700">{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const normalizeText = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
