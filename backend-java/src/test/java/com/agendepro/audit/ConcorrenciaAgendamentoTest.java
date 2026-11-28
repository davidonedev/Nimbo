package com.agendepro.audit;

import com.agendepro.appointment.Appointment;
import com.agendepro.appointment.AppointmentStatus;
import com.agendepro.client.Client;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Corridas que passam por caminhos de escrita diferentes, todos protegidos pelo mesmo trava por profissional e dia:
 * reservar x remarcar para o mesmo horário, dois clientes remarcando para o mesmo horário e o cliente cancelando enquanto
 * o dono aprova. Em todas: um só vence, nenhum erro 5xx e o estado final é coerente.
 */
class ConcorrenciaAgendamentoTest extends AuditBase {

    private ResultActions reschedule(Ctx c, Appointment a, Client who, String day, String time) throws Exception {
        return mockMvc.perform(patch("/api/public/" + c.tenant.getSlug() + "/appointments/" + a.getId() + "/reschedule")
                .header("X-Device-Token", fixtures.deviceToken(c.tenant, who))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"clientId\":\"" + who.getId() + "\",\"date\":\"" + day + "\",\"startTime\":\"" + time + "\"}"));
    }

    private ResultActions cancel(Ctx c, Appointment a, Client who) throws Exception {
        return mockMvc.perform(patch("/api/public/" + c.tenant.getSlug() + "/appointments/" + a.getId() + "/cancel")
                .header("X-Device-Token", fixtures.deviceToken(c.tenant, who))
                .contentType(MediaType.APPLICATION_JSON).content("{\"clientId\":\"" + who.getId() + "\"}"));
    }

    @Test
    void q8_bookingAndReschedulingIntoTheSameSlotAtTheSameTime_onlyOneWins() throws Exception {
        Ctx c = ctx();
        Client holder = clientWithPhone(c.tenant, uniquePhone());
        String day = LocalDate.now(SP).plusDays(2).toString();
        Appointment existing = appt(c, holder, day, "09:00", "09:30", AppointmentStatus.CONFIRMED);

        List<Integer> statuses = runConcurrently(2, i -> {
            try {
                if (i == 0) return reschedule(c, existing, holder, day, "15:00");
                return mockMvc.perform(post("/api/public/" + c.tenant.getSlug() + "/book").contentType(MediaType.APPLICATION_JSON)
                        .content(bookBody(c, "Corredor", uniquePhone(), day, "15:00")));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });

        assertThat(statuses).filteredOn(s -> s >= 500).as("nenhum 5xx: %s", statuses).isEmpty();
        assertThat(statuses).containsOnlyOnce(200); // um vence, o outro recebe 409
        long at1500 = appointmentsOf(c.tenant).stream()
                .filter(a -> a.getStatus() != AppointmentStatus.CANCELLED && a.getStartTime().equals("15:00")).count();
        assertThat(at1500).isEqualTo(1);
    }

    @Test
    void q9_twoClientsReschedulingIntoTheSameSlot_onlyOneWins() throws Exception {
        Ctx c = ctx();
        String day = LocalDate.now(SP).plusDays(2).toString();
        Client c1 = clientWithPhone(c.tenant, uniquePhone());
        Client c2 = clientWithPhone(c.tenant, uniquePhone());
        Appointment a1 = appt(c, c1, day, "09:00", "09:30", AppointmentStatus.CONFIRMED);
        Appointment a2 = appt(c, c2, day, "10:00", "10:30", AppointmentStatus.CONFIRMED);

        List<Integer> statuses = runConcurrently(2, i -> {
            try {
                return i == 0 ? reschedule(c, a1, c1, day, "16:00") : reschedule(c, a2, c2, day, "16:00");
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });

        assertThat(statuses).filteredOn(s -> s >= 500).as("nenhum 5xx: %s", statuses).isEmpty();
        assertThat(statuses).containsOnlyOnce(200).filteredOn(s -> s != 200).containsOnly(409);
        long at1600 = appointmentsOf(c.tenant).stream().filter(a -> a.getStartTime().equals("16:00")).count();
        assertThat(at1600).isEqualTo(1);
    }

    @Test
    void q10_clientCancelsWhileOwnerApproves_neverA5xx_andFinalStateIsCoherent() throws Exception {
        Ctx c = ctx();
        String token = adminToken(c.tenant);
        Client client = clientWithPhone(c.tenant, uniquePhone());
        Appointment a = appt(c, client, LocalDate.now(SP).plusDays(2).toString(), "11:00", "11:30", AppointmentStatus.PENDING);

        List<Integer> statuses = runConcurrently(2, i -> {
            try {
                return i == 0 ? cancel(c, a, client) : patchStatus(token, a.getId(), "confirmed");
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });

        assertThat(statuses).filteredOn(s -> s >= 500).as("nenhum 5xx: %s", statuses).isEmpty();
        AppointmentStatus fin = reload(a).getStatus();
        assertThat(fin).isIn(AppointmentStatus.CANCELLED, AppointmentStatus.CONFIRMED);
        // se terminou CANCELADO, o horario tem de estar livre para outra pessoa
        if (fin == AppointmentStatus.CANCELLED) {
            assertThat(slots(c, a.getDate())).contains("11:00");
        }
    }

    private List<Integer> runConcurrently(int n, java.util.function.IntFunction<ResultActions> action) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(n);
        try {
            CyclicBarrier barrier = new CyclicBarrier(n);
            List<Future<Integer>> futures = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                final int idx = i;
                futures.add(pool.submit(() -> {
                    barrier.await();
                    return action.apply(idx).andReturn().getResponse().getStatus();
                }));
            }
            List<Integer> out = new ArrayList<>();
            for (Future<Integer> f : futures) out.add(f.get());
            return out;
        } finally {
            pool.shutdownNow();
        }
    }
}
