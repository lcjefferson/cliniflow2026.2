export const CALENDAR_DENSITY_KEY = "calendarDensity";

export const DENSITY_OPTIONS = [
  { value: "compact", label: "Compacto" },
  { value: "comfortable", label: "Confortável" },
  { value: "spacious", label: "Amplo" },
];

export const DEFAULT_CALENDAR_DENSITY = "comfortable";

export function normalizeDensity(value) {
  if (value === "compact" || value === "comfortable" || value === "spacious") return value;
  return DEFAULT_CALENDAR_DENSITY;
}

export function readStoredDensity() {
  try {
    return normalizeDensity(localStorage.getItem(CALENDAR_DENSITY_KEY));
  } catch {
    return DEFAULT_CALENDAR_DENSITY;
  }
}

export function getMonthCellLimit(density) {
  switch (normalizeDensity(density)) {
    case "compact":
      return 3;
    case "comfortable":
      return 2;
    case "spacious":
      return 2;
    default:
      return 2;
  }
}

/** Alturas mínimas das colunas/células do calendário por densidade. */
export function getCalendarLayoutClasses(density) {
  const d = normalizeDensity(density);
  const layouts = {
    compact: {
      monthCell: "min-h-[92px] lg:min-h-[124px]",
      monthEmptyCell: "min-h-[92px] lg:min-h-[124px]",
      weekColumn: "min-h-[320px] lg:min-h-[440px]",
      weekStack: "space-y-1.5",
      monthStack: "space-y-0.5",
    },
    comfortable: {
      monthCell: "min-h-[116px] lg:min-h-[152px]",
      monthEmptyCell: "min-h-[116px] lg:min-h-[152px]",
      weekColumn: "min-h-[360px] lg:min-h-[500px]",
      weekStack: "space-y-2",
      monthStack: "space-y-1",
    },
    spacious: {
      monthCell: "min-h-[136px] lg:min-h-[176px]",
      monthEmptyCell: "min-h-[136px] lg:min-h-[176px]",
      weekColumn: "min-h-[400px] lg:min-h-[560px]",
      weekStack: "space-y-2.5",
      monthStack: "space-y-1.5",
    },
  };
  return layouts[d];
}
