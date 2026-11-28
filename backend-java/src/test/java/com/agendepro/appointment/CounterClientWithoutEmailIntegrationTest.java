package com.agendepro.appointment;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.client.ClientRepository;
import com.agendepro.professional.Professional;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Cliente de balcão: o dono só precisa do nome e do celular (WhatsApp); o e-mail não é pedido. */
class CounterClientWithoutEmailIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authHelper;
    @Autowired private ClientRepository clientRepository;

    private String ownerToken(Tenant t) throws Exception {
        fixtures.admin(t, "dono-" + t.getSlug() + "@example.com", "senha123");
        return authHelper.login(mockMvc, "dono-" + t.getSlug() + "@example.com", "senha123");
    }

    private ResultActions book(String token, Professional p, ServiceOffering s, String time, String clientJson) throws Exception {
        String date = LocalDate.now().plusDays(2).toString();
        String body = "{\"professionalId\":\"" + p.getId() + "\",\"serviceId\":\"" + s.getId() + "\",\"date\":\"" + date
                + "\",\"startTime\":\"" + time + "\"," + clientJson + "}";
        return mockMvc.perform(post("/api/admin/appointments").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void aNewClientNeedsOnlyNameAndPhone() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        String token = ownerToken(t);
        Professional p = fixtures.professional(t);
        ServiceOffering s = fixtures.service(t, 40, 30);

        book(token, p, s, "10:00", "\"clientName\":\"Seu Zé\",\"clientPhone\":\"(11) 97777-1111\"")
                .andExpect(status().isCreated());

        Client saved = clientRepository.findFirstByTenantIdAndPhoneE164OrderByCreatedAtAsc(t.getId(), "5511977771111").orElseThrow();
        assertThat(saved.getName()).isEqualTo("Seu Zé");
        assertThat(saved.getEmail()).isNull();
    }

    @Test
    void theSamePhoneReusesTheClientAndKeepsTheirName() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        String token = ownerToken(t);
        Professional p = fixtures.professional(t);
        ServiceOffering s = fixtures.service(t, 40, 30);

        book(token, p, s, "10:00", "\"clientName\":\"Maria Souza\",\"clientPhone\":\"(11) 96666-2222\"").andExpect(status().isCreated());
        book(token, p, s, "11:00", "\"clientName\":\"Mari\",\"clientPhone\":\"11 96666 2222\"").andExpect(status().isCreated());

        assertThat(clientRepository.findAll().stream().filter(c -> t.getId().equals(c.getTenantId())).toList()).hasSize(1);
        assertThat(clientRepository.findFirstByTenantIdAndPhoneE164OrderByCreatedAtAsc(t.getId(), "5511966662222").orElseThrow().getName())
                .isEqualTo("Maria Souza");
    }

    @Test
    void phoneIsRequiredAndMustBeValid() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        String token = ownerToken(t);
        Professional p = fixtures.professional(t);
        ServiceOffering s = fixtures.service(t, 40, 30);

        book(token, p, s, "10:00", "\"clientName\":\"Sem Celular\",\"clientEmail\":\"x-" + t.getSlug() + "@example.com\"")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CLIENT_DATA_REQUIRED"));
        book(token, p, s, "10:00", "\"clientName\":\"Curto\",\"clientPhone\":\"1234\"")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PHONE"));
    }
}
