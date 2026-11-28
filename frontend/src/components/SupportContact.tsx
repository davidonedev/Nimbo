import { supportWhatsappUrl } from '@/lib/support';

/** Como falar com o suporte do Nimbo: link do WhatsApp quando configurado; senão, orienta pelo canal do cadastro. */
export function SupportContact({ className = 'underline' }: { className?: string }) {
  const url = supportWhatsappUrl();
  return url
    ? <a href={url} target="_blank" rel="noopener noreferrer" className={className}>WhatsApp do suporte do Nimbo</a>
    : <span>o suporte do Nimbo (pelo WhatsApp informado no seu cadastro)</span>;
}
