export const CHANNEL_META = {
  whatsapp: { label: "WhatsApp", dot: "bg-green-500" },
  instagram: { label: "Instagram", dot: "bg-pink-500" },
  messenger: { label: "Messenger", dot: "bg-blue-500" },
};

export const formatPhone = (value) => {
  const raw = String(value || "");
  if (!/^\+?\d{10,13}$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "");
  const m = digits.match(/^(55)?(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `${m[1] ? "+55 " : ""}${m[2]} ${m[3]}-${m[4]}` : raw;
};

export const getInitials = (name) => {
  const parts = (name || "").replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};
