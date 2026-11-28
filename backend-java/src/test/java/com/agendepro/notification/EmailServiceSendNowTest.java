package com.agendepro.notification;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import org.thymeleaf.TemplateEngine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;

/** EmailService.sendNow: o resultado precisa dizer a verdade (a fila decide nova tentativa por ele). */
class EmailServiceSendNowTest {

    private EmailService service(String smtpUser, JavaMailSender sender) {
        EmailService service = new EmailService(sender, Mockito.mock(TemplateEngine.class));
        ReflectionTestUtils.setField(service, "smtpUser", smtpUser);
        ReflectionTestUtils.setField(service, "mailFrom", "Nimbo <noreply@example.com>");
        ReflectionTestUtils.setField(service, "enabled", true);
        return service;
    }

    @Test
    void whenEmailIsTurnedOff_nothingIsSentEvenWithSmtpConfigured() {
        JavaMailSender sender = Mockito.mock(JavaMailSender.class);
        EmailService off = service("user", sender);
        ReflectionTestUtils.setField(off, "enabled", false);

        assertThat(off.sendNow("dono@example.com", "Assunto", "Texto")).isEqualTo(EmailService.SendResult.NOT_CONFIGURED);
        off.sendVerificationEmail("cliente@example.com", "Ana", "Barbearia", "https://exemplo/verificar");

        Mockito.verifyNoInteractions(sender);
    }

    @Test
    void inProductionTheRecoveryLinkNeverGoesToTheLog() {
        EmailService s = service("", Mockito.mock(JavaMailSender.class));
        ReflectionTestUtils.setField(s, "activeProfiles", "prod");
        assertThat((String) ReflectionTestUtils.invokeMethod(s, "linkForLog", "https://site/reset?token=segredo")).doesNotContain("segredo");
        ReflectionTestUtils.setField(s, "activeProfiles", "");
        assertThat((String) ReflectionTestUtils.invokeMethod(s, "linkForLog", "https://site/reset?token=segredo")).contains("segredo");
    }

    @Test
    void withoutSmtpUser_isNotConfigured_andNothingIsSent() {
        JavaMailSender sender = Mockito.mock(JavaMailSender.class);

        assertThat(service("", sender).sendNow("dono@example.com", "Assunto", "Texto")).isEqualTo(EmailService.SendResult.NOT_CONFIGURED);

        Mockito.verifyNoInteractions(sender);
    }

    @Test
    void whenTheServerAccepts_isSent() {
        JavaMailSender sender = Mockito.mock(JavaMailSender.class);
        Mockito.when(sender.createMimeMessage()).thenReturn(new MimeMessage((Session) null));

        assertThat(service("user", sender).sendNow("dono@example.com", "Assunto", "Texto")).isEqualTo(EmailService.SendResult.SENT);

        Mockito.verify(sender).send(any(MimeMessage.class));
    }

    @Test
    void whenTheServerFails_isFailed_insteadOfThrowing() {
        JavaMailSender sender = Mockito.mock(JavaMailSender.class);
        Mockito.when(sender.createMimeMessage()).thenReturn(new MimeMessage((Session) null));
        Mockito.doThrow(new org.springframework.mail.MailSendException("fora do ar")).when(sender).send(any(MimeMessage.class));

        assertThat(service("user", sender).sendNow("dono@example.com", "Assunto", "Texto")).isEqualTo(EmailService.SendResult.FAILED);
    }
}
