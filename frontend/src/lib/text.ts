/** Minúsculas, sem acento e sem espaços nas pontas: base de toda comparação de busca. */
export const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Só os dígitos (para comparar telefones sem máscara). */
export const digitsOf = (s: string): string => s.replace(/\D/g, '');
