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
        return service;
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
