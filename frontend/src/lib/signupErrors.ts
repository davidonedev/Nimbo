import { ApiError } from './api';

export type SignupField = 'ownerName' | 'email' | 'password' | 'phone' | 'businessName' | 'address' | 'slug';
export type SignupErrors = Partial<Record<SignupField | 'general', string>>;

const SERVER_FIELDS: readonly SignupField[] = ['ownerName', 'email', 'password', 'phone', 'businessName', 'address', 'slug'];

/**
 * Traduz o erro do cadastro de negócio em mensagens úteis para o usuário: e-mail já cadastrado e campo
 * inválido ficam no próprio campo; falha de rede, timeout e servidor indisponível já chegam em português
 * do api.ts. Nunca repassa detalhe interno (o backend devolve só "Erro interno do servidor" nos 500).
 */
export function signupErrors(err: unknown): SignupErrors {
  if (!(err instanceof ApiError)) return { general: 'Erro ao criar conta. Tente novamente.' };

  if (err.code === 'EMAIL_IN_USE') {
    return { email: 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.' };
  }
  if (err.status === 422 && err.details?.length) {
    const fields: SignupErrors = {};
    for (const d of err.details) {
      const key = SERVER_FIELDS.find(f => f === d.field);
      if (key && !fields[key]) fields[key] = d.message;
    }
    return Object.keys(fields).length > 0 ? fields : { general: 'Confira os dados informados e tente novamente.' };
  }
  if (err.status === 429) return { general: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.' };
  return { general: err.message };
}
