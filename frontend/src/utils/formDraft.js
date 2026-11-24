// Rascunhos de formulário guardados no navegador, para que nada digitado se perca se a
// internet cair, a tela recarregar ou o servidor recusar o envio.

const PREFIX = "cliniflow:draft:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // descarta rascunhos com mais de 7 dias

export const loadDraft = (key) => {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.savedAt && Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
};

export const saveDraft = (key, value) => {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ...value, savedAt: Date.now() }));
  } catch (_) {
    // localStorage indisponível ou cheio: o rascunho é só uma proteção extra.
  }
};

export const clearDraft = (key) => {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (_) {}
};

export const newRequestId = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};
