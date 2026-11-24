// Converte qualquer erro de API em um TEXTO seguro para exibir ao usuário.
//
// O FastAPI devolve `detail` como texto em erros comuns, mas como LISTA DE OBJETOS em erros de
// validação (422). Passar essa lista direto para um toast/JSX faz o React lançar
// "Objects are not valid as a React child" e a tela inteira fica branca.

const FIELD_LABELS = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  birthdate: "Data de nascimento",
  address: "Endereço",
  city: "Cidade",
  profession: "Profissão",
  cpf: "CPF",
  observations: "Observações",
  password: "Senha",
};

const formatValidationItem = (item) => {
  if (item == null) return "";
  if (typeof item === "string") return item;
  if (typeof item !== "object") return String(item);
  const loc = Array.isArray(item.loc) ? item.loc.filter((p) => p !== "body" && p !== "query") : [];
  const field = loc.length ? String(loc[loc.length - 1]) : "";
  const label = FIELD_LABELS[field] || field;
  const msg = typeof item.msg === "string" ? item.msg : typeof item.message === "string" ? item.message : "valor inválido";
  return label ? `${label}: ${msg}` : msg;
};

export const detailToText = (detail) => {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map(formatValidationItem).filter(Boolean).join("; ");
  }
  if (typeof detail === "object") return formatValidationItem(detail);
  return String(detail);
};

export const isNetworkError = (error) => !!error && !error.response && (!!error.request || error.code === "ECONNABORTED" || error.code === "ERR_NETWORK");

export const getErrorMessage = (error, fallback = "Ocorreu um erro. Tente novamente.") => {
  if (!error) return fallback;
  if (error.response) {
    const text = detailToText(error.response.data?.detail);
    if (text) return text;
    if (error.response.status >= 500) return `${fallback} (erro no servidor, tente novamente em instantes)`;
    return fallback;
  }
  if (error.code === "ECONNABORTED") {
    return "A conexão demorou demais para responder. Verifique sua internet e tente novamente.";
  }
  if (isNetworkError(error)) {
    return "Falha de conexão com o servidor. Verifique sua internet e tente novamente.";
  }
  return typeof error.message === "string" && error.message ? error.message : fallback;
};
