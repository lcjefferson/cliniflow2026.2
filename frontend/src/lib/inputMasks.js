/** Máscara telefone BR: (11) 98765-4321 (até 11 dígitos). */
export function maskPhone(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  const part1 = digits.slice(0, 2);
  const part2 = digits.slice(2, 7);
  const part3 = digits.slice(7, 11);
  if (digits.length <= 2) return part1 ? `(${part1}` : "";
  if (digits.length <= 7) return `(${part1}) ${part2}`;
  return `(${part1}) ${part2}-${part3}`;
}

/** Máscara CPF: 000.000.000-00 */
export function maskCpf(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 9);
  const p4 = digits.slice(9, 11);
  if (digits.length <= 3) return p1;
  if (digits.length <= 6) return `${p1}.${p2}`;
  if (digits.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}
