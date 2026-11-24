# Confirmação automática pelo WhatsApp

Quando o dono (ou o profissional) confirma um agendamento, o cliente recebe a mensagem de confirmação **sozinho**, sem
ninguém abrir o WhatsApp. O mesmo vale para recusa e cancelamento. Antes de confirmar, aparece um modal pedindo uma
segunda confirmação (proteção contra toque sem querer).

## Como funciona
1. O toque em **Confirmar** abre o modal "Confirmar agendamento?". Só o "Sim, confirmar" muda o status.
2. O servidor grava a mudança e, na mesma transação, enfileira a mensagem (`notification_outbox`).
3. Logo depois do commit o envio é disparado na hora (segundos), sem esperar o agendador de 15 s. Se falhar, a mensagem
   continua na fila e é tentada de novo (1 min, 5 min, 15 min, 1 h; até 5 tentativas).
4. A tela acompanha o resultado: "Enviando…" e depois "Confirmação enviada para Ana pelo WhatsApp."
5. Se a mensagem **não** sair (WhatsApp não configurado ou falha), a tela mostra o botão "Avisar … no WhatsApp"
   (link `wa.me` com a mensagem pronta) como reserva.

## O que é preciso para enviar sozinho
Uma instância da **Evolution API** conectada a um número de WhatsApp (leitura do QR code). O sistema aceita de dois jeitos:

- **Por estabelecimento:** Configurações → Portal do cliente → Integração WhatsApp (URL da API, chave e nome da instância).
- **Padrão da plataforma** (vale para quem não configurou o próprio), no backend (Render):
  `WHATSAPP_DEFAULT_API_URL`, `WHATSAPP_DEFAULT_API_KEY` e `WHATSAPP_DEFAULT_INSTANCE`.

Sem nenhum dos dois o agendamento funciona normalmente; só o envio automático fica desligado e a tela usa o link de reserva.

## Como conferir
- O modal de confirmação diz se o envio automático está ativo ("a mensagem é enviada automaticamente…" ou "não está ativo").
- `GET /api/admin/notifications/channels` → `{ "whatsappAuto": true|false }` (idem em `/api/professional/...`).
- `GET /api/admin/notifications/status?ids=<id>` → situação de cada aviso (`PENDING`, `SENT`, `SKIPPED`, `FAILED`) e o motivo.
- Motivos comuns: `WhatsApp não configurado` (faltam URL, chave ou instância) e `falha no envio pelo WhatsApp` (instância
  desconectada ou fora do ar; reconecte o QR code).

## Observação sobre o Render gratuito
O serviço dorme por inatividade. Se ele estiver dormindo quando você confirma, a primeira chamada acorda o servidor e o
envio sai assim que ele sobe (a mensagem fica na fila). Veja `docs/KEEP_ALIVE_RENDER.md`.
