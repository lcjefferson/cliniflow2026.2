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
      return 6;
    case "comfortable":
      return 5;
    case "spacious":
      return 4;
    default:
      return 5;
  }
}

/** Alturas mínimas das colunas/células do calendário por densidade. */
export function getCalendarLayoutClasses(density) {
  const d = normalizeDensity(density);
  const layouts = {
    compact: {
      monthCell: "min-h-[120px] lg:min-h-[168px]",
      monthEmptyCell: "min-h-[120px] lg:min-h-[168px]",
      weekColumn: "min-h-[360px] lg:min-h-[500px]",
      weekStack: "space-y-1.5",
      monthStack: "space-y-1",
    },
    comfortable: {
      monthCell: "min-h-[150px] lg:min-h-[220px]",
      monthEmptyCell: "min-h-[150px] lg:min-h-[220px]",
      weekColumn: "min-h-[420px] lg:min-h-[580px]",
      weekStack: "space-y-2",
      monthStack: "space-y-1",
    },
    spacious: {
      monthCell: "min-h-[170px] lg:min-h-[250px]",
      monthEmptyCell: "min-h-[170px] lg:min-h-[250px]",
      weekColumn: "min-h-[480px] lg:min-h-[660px]",
      weekStack: "space-y-2.5",
      monthStack: "space-y-1.5",
    },
  };
  return layouts[d];
}
