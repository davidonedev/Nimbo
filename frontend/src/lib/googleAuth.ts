/** Client id do login com Google (VITE_GOOGLE_CLIENT_ID). Vazio = o recurso não está configurado neste ambiente. */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** O botão "Continuar com Google" só existe quando há client id; sem ele, o provider do Google quebra a tela. */
export const isGoogleLoginEnabled = GOOGLE_CLIENT_ID.trim().length > 0;
