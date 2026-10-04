import React from "react";
import { Link } from "react-router-dom";

export default function StatCard({ label, value, hint, icon: Icon, tone, to, testId, wide }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <span className="text-xs sm:text-sm font-medium text-white/80 leading-5">{label}</span>
        <span className="flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/20">
          <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
        </span>
      </div>
      <div className="mt-auto pt-1 sm:pt-2">
        <div className="text-xl sm:text-2xl md:text-[1.75rem] md:leading-9 font-semibold tracking-tight tabular-nums truncate">
          {value}
        </div>
        {hint && <p className="mt-1 text-xs text-white/75 truncate">{hint}</p>}
      </div>
    </>
  );
  const className = `flex flex-col min-w-0 rounded-xl bg-gradient-to-br text-white shadow-sm p-3.5 sm:p-4 md:p-5 ${tone} ${wide ? "col-span-2 lg:col-span-1" : ""}`;
  return to ? (
    <Link to={to} data-testid={testId} className={`${className} hover:shadow-md hover:brightness-105 transition`}>
      {content}
    </Link>
  ) : (
    <div data-testid={testId} className={className}>{content}</div>
  );
}
