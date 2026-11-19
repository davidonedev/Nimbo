package com.agendepro.notification;

import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

/**
 * Porta de email.service.ts (Nodemailer) — usa Thymeleaf para o template HTML de
 * verificação de e-mail. Sem SMTP_USER/SMTP_PASS configurados, só loga o link
 * (mesmo comportamento de desenvolvimento do Node).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Value("${spring.mail.username:}")
    private String smtpUser;

    @Value("${app.mail-from}")
    private String mailFrom;

    @Async
    public void sendVerificationEmail(String to, String clientName, String tenantName, String verifyUrl) {
        if (smtpUser == null || smtpUser.isBlank()) {
            log.info("\n─────────────────────────────────────────────\n" +
                            "[EMAIL] Verificação de e-mail (sem SMTP configurado)\n" +
                            "  Para:    {}\n  Link:    {}\n" +
                            "─────────────────────────────────────────────",
                    to, verifyUrl);
            return;
        }

        try {
            Context context = new Context();
            context.setVariable("clientName", clientName);
            context.setVariable("tenantName", tenantName);
            context.setVariable("verifyUrl", verifyUrl);
            String html = templateEngine.process("email/verification", context);

            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(to);
            helper.setSubject("Confirme seu e-mail — " + tenantName);
            helper.setText(html, true);

            mailSender.send(message);
        } catch (Exception ex) {
            log.error("[email] Falha ao enviar verificação: {}", ex.getMessage());
        }
    }

    // ─── Recuperação de conta ───────────────────────────────────────────────────
    // Com SMTP configurado, o link (que contém o token) nunca é logado. Sem SMTP
    // (desenvolvimento), o link é logado para permitir testar o fluxo localmente.

    @Async
    public void sendPasswordReset(String to, String userName, String resetUrl, long ttlMinutes) {
        Context context = new Context();
        context.setVariable("userName", userName);
        context.setVariable("actionUrl", resetUrl);
        context.setVariable("ttlMinutes", ttlMinutes);
        send(to, "Redefinição de senha — Nimbo", "email/password-reset", context, "Redefinição de senha", resetUrl);
    }

    @Async
    public void sendEmailChangeConfirmation(String to, String userName, String confirmUrl, long ttlMinutes) {
        Context context = new Context();
        context.setVariable("userName", userName);
        context.setVariable("actionUrl", confirmUrl);
        context.setVariable("ttlMinutes", ttlMinutes);
        send(to, "Confirme seu novo e-mail — Nimbo", "email/email-change", context, "Confirmação de novo e-mail", confirmUrl);
    }

    @Async
    public void sendEmailChangedNotice(String to, String userName, String newEmail) {
        Context context = new Context();
        context.setVariable("userName", userName);
        context.setVariable("newEmail", newEmail);
        send(to, "Seu e-mail de acesso foi alterado — Nimbo", "email/email-changed", context, "Aviso de e-mail alterado", null);
    }

    /** Um agendamento da lista de "falta confirmar" enviada ao dono. */
    public record OwnerReminderItem(String clientName, String clientPhone, String service, String when) {
    }

    /**
     * Avisa o dono de que há agendamentos que o cliente já confirmou pelo WhatsApp mas que ele ainda não confirmou.
     * {@code timeLeft}: "2 horas" ou "1 hora" (quanto falta para o horário).
     */
    @Async
    public void sendOwnerPendingReminder(String to, String tenantName, String timeLeft, java.util.List<OwnerReminderItem> items, String panelUrl) {
        Context context = new Context();
        context.setVariable("tenantName", tenantName);
        context.setVariable("timeLeft", timeLeft);
        context.setVariable("items", items);
        context.setVariable("panelUrl", panelUrl);
        send(to, (items.size() == 1 ? "Falta confirmar um agendamento" : "Faltam confirmar " + items.size() + " agendamentos")
                        + " — começa em " + timeLeft + " | " + tenantName,
                "email/owner-pending-reminder", context, "Aviso: agendamento sem confirmação (" + timeLeft + ")", panelUrl);
    }

    private void send(String to, String subject, String template, Context context, String devLabel, String devLink) {
        if (smtpUser == null || smtpUser.isBlank()) {
            log.warn("\n─────────────────────────────────────────────\n" +
                            "[EMAIL][DEV] {} (sem SMTP configurado — NÃO use em produção)\n" +
                            "  Para:    {}\n  Link:    {}\n" +
                            "─────────────────────────────────────────────",
                    devLabel, to, devLink == null ? "(sem link)" : devLink);
            return;
        }

        try {
            String html = templateEngine.process(template, context);

            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html, true);

            mailSender.send(message);
        } catch (Exception ex) {
            log.error("[email] Falha ao enviar '{}': {}", devLabel, ex.getMessage());
        }
    }
}
