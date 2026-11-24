// Formata datas "só com dia" (YYYY-MM-DD, com ou sem hora) para DD/MM/AAAA SEM passar por
// new Date(), que interpreta a string como UTC e mostra um dia a menos no fuso do Brasil.
export const formatDate = (dateString) => {
  if (!dateString) return 'Data não informada';
  const match = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 'Data inválida';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};
