export const formatDate = (dateString) => {
  if (!dateString) return 'Data não informada';
  const parts = dateString.split('-');
  if (parts.length !== 3) return 'Data inválida';
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
};
