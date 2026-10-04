export const PAYMENT_METHODS = {
  cash: "Dinheiro",
  card: "Cartão",
  pix: "PIX",
  transfer: "Transferência",
  check: "Cheque",
  promissory: "Promissória",
  payment_link: "Link de pagamento",
};

export const formatBRL = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Date-only strings ("YYYY-MM-DD") are formatted without going through Date, which would shift them a day back in UTC-3.
export const formatDay = (value) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR") : "";
};

export const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
