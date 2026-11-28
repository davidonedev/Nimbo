package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.client.Client;
import com.agendepro.notification.NotificationOutbox;
import com.agendepro.notification.NotificationOutbox.Channel;
import com.agendepro.notification.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Mensagens que o cliente precisa receber: recebimento do pedido e nova aprovação depois de remarcar. */
class NotificacoesAposRemarcarTest extends AuditBase {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private NotificationService notificationService;

    @BeforeEach
    void emptyOutbox() {
        jdbc.update("DELETE FROM notification_outbox");
    }

    @Test
    void approvingAgainAfterARescheduleSendsANewConfirmation() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.PENDING);
        String token = adminToken(c.tenant);

        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());
        assertThat(outboxOf(c.tenant, "APPROVED", Channel.WHATSAPP)).hasSize(1);

        // O cliente remarca: o horário muda e o pedido volta a ficar pendente
        Appointment moved = appointmentRepository.findById(a.getId()).orElseThrow();
        moved.setStartTime("11:00");
        moved.setEndTime("11:30");
        moved.setStatus(AppointmentStatus.PENDING);
        appointmentRepository.save(moved);

        patchStatus(token, a.getId(), "confirmed").andExpect(status().isOk());

        List<NotificationOutbox> approvals = outboxOf(c.tenant, "APPROVED", Channel.WHATSAPP);
        assertThat(approvals).hasSize(2);
        assertThat(approvals).extracting(NotificationOutbox::getBody).anyMatch(b -> b.contains("11:00"));
        assertThat(approvals).extracting(NotificationOutbox::getBody)
                .allMatch(b -> b.contains("/" + c.tenant.getSlug() + "/meus-agendamentos"));
    }

    @Test
    void theSameApprovalIsNeverSentTwice() throws Exception {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.PENDING);

        notificationService.clientApproved(List.of(a));
        notificationService.clientApproved(List.of(a));

        assertThat(outboxOf(c.tenant, "APPROVED", Channel.WHATSAPP)).hasSize(1);
    }

    @Test
    void theClientIsToldTheRequestWasReceivedAndStillNeedsApproval() {
        Ctx c = ctx();
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, date, "10:00", "10:30", AppointmentStatus.PENDING);

        notificationService.clientRequestReceived(List.of(a));
        notificationService.clientRequestReceived(List.of(a)); // repetir não duplica

        List<NotificationOutbox> rows = outboxOf(c.tenant, "CLIENT_REQUEST_RECEIVED", Channel.WHATSAPP);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getBody()).contains("Recebemos o seu pedido").contains("ainda precisa ser aprovado")
                .contains("/" + c.tenant.getSlug() + "/meus-agendamentos");
    }
}
