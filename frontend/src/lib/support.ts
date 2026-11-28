/** WhatsApp do suporte do Nimbo (só dígitos com DDI/DDD), definido em VITE_SUPPORT_WHATSAPP. Vazio = sem link. */
export const SUPPORT_WHATSAPP: string = ((import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) ?? '').replace(/\D/g, '');

export const supportWhatsappUrl = (): string | null => (SUPPORT_WHATSAPP ? `https://wa.me/${SUPPORT_WHATSAPP}` : null);
