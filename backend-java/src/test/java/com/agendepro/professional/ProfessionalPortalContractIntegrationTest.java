package com.agendepro.professional;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.catalog.ServiceOffering;
import com.agendepro.client.Client;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contrato que o portal do profissional (front: ProfessionalContext e telas /professional/**)
 * espera dos endpoints /api/professional/**. Se um destes testes quebrar, uma tela do front quebra.
 */
class ProfessionalPortalContractIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private TestFixtures fixtures;
    @Autowired private AuthTestHelper authHelper;

    private final String date = LocalDate.now().plusDays(3).toString();

    private String token(Tenant t, Professional p) throws Exception {
        String email = "prof-" + UUID.randomUUID() + "@example.com";
        fixtures.professionalUser(t, p, email, "senha123");
        return "Bearer " + authHelper.login(mockMvc, email, "senha123");
    }

    @Test
    void everyEndpointTheProfessionalPortalLoadsOnStartupAnswers200WithTheExpectedShape() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional me = fixtures.professional(t);
        ServiceOffering svc = fixtures.service(t, 80.0, 60);
        Client client = fixtures.client(t); // o back aceita cliente sem telefone: o front tem de tolerar null
        fixtures.appointment(t, me, client, svc, date, "09:00", "10:00");
        String auth = token(t, me);

        mockMvc.perform(get("/api/professional/me").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(me.getId().toString()))
                .andExpect(jsonPath("$.data.name").value(me.getName()))
                .andExpect(jsonPath("$.data.workingHoursStart").value("08:00"))
                .andExpect(jsonPath("$.data.workingHoursEnd").value("18:00"))
                .andExpect(jsonPath("$.data.workingDays", hasSize(7)))
                .andExpect(jsonPath("$.data.services").isArray());

        mockMvc.perform(get("/api/professional/services").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(svc.getId().toString()))
                .andExpect(jsonPath("$.data[0].name").value(svc.getName()))
                .andExpect(jsonPath("$.data[0].price").value(80.0))
                .andExpect(jsonPath("$.data[0].duration").value(60));

        mockMvc.perform(get("/api/professional/appointments").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].professionalId").value(me.getId().toString()))
                .andExpect(jsonPath("$.data[0].clientId").value(client.getId().toString()))
                .andExpect(jsonPath("$.data[0].serviceId").value(svc.getId().toString()))
                .andExpect(jsonPath("$.data[0].date").value(date))
                .andExpect(jsonPath("$.data[0].startTime").value("09:00"))
                .andExpect(jsonPath("$.data[0].status").exists())
                .andExpect(jsonPath("$.data[0].price").value(80.0))
                .andExpect(jsonPath("$.data[0].client.name").value(client.getName()));

        mockMvc.perform(get("/api/professional/clients").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].name").value(client.getName()))
                .andExpect(jsonPath("$.data[0].email").value(client.getEmail()))
                .andExpect(jsonPath("$.data[0].phone").value(nullValue()));

        mockMvc.perform(get("/api/professional/professionals").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id").value(me.getId().toString()));

        mockMvc.perform(get("/api/professional/blocked-slots").header("Authorization", auth)).andExpect(status().isOk());
        mockMvc.perform(get("/api/professional/products").header("Authorization", auth)).andExpect(status().isOk());
    }

    @Test
    void tenantEndpointServesBrandingButNotTheOwnersWhatsappIntegration() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        t.setPrimaryColor("#7c3aed");
        t.setWhatsappApiUrl("https://wa.example.com");
        t.setWhatsappApiKey("chave-secreta-do-dono");
        t.setWhatsappInstance("instancia-x");
        Tenant saved = fixtures.saveTenant(t);
        String auth = token(saved, fixtures.professional(saved));

        mockMvc.perform(get("/api/professional/tenant").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(saved.getId().toString()))
                .andExpect(jsonPath("$.data.name").value(saved.getName()))
                .andExpect(jsonPath("$.data.primaryColor").value("#7c3aed"))
                .andExpect(jsonPath("$.data.whatsappApiKey").value(nullValue()))
                .andExpect(jsonPath("$.data.whatsappApiUrl").value(nullValue()))
                .andExpect(content().string(not(containsString("chave-secreta-do-dono"))));
    }

    @Test
    void professionalCanBookOwnAgendaAndUpdateOwnScheduleAsTheScreensDo() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.PRO);
        Professional me = fixtures.professional(t);
        ServiceOffering svc = fixtures.service(t, 50.0, 30);
        String auth = token(t, me);

        // Nova reserva com cliente novo (formulário da Agenda): o profissional informado é o próprio.
        String body = "{\"professionalId\":\"" + me.getId() + "\",\"serviceId\":\"" + svc.getId() + "\",\"date\":\"" + date
                + "\",\"startTime\":\"11:00\",\"clientName\":\"Cliente Novo\",\"clientEmail\":\"novo-" + UUID.randomUUID()
                + "@example.com\",\"clientPhone\":\"11999990000\"}";
        mockMvc.perform(post("/api/professional/appointments").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.professionalId").value(me.getId().toString()));

        // O cliente recém-criado passa a aparecer na lista dele.
        mockMvc.perform(get("/api/professional/clients").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].phone").value("11999990000"));

        // Tela "Meu horário" (ProfSettingsView): PATCH /me devolve o profissional atualizado.
        mockMvc.perform(patch("/api/professional/me").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workingHoursStart\":\"10:00\",\"workingHoursEnd\":\"16:00\",\"workingDays\":[1,2,3]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.workingHoursStart").value("10:00"))
                .andExpect(jsonPath("$.data.workingDays", hasSize(3)));
    }

    @Test
    void expiredOrInvalidTokenGets401SoTheFrontCanSendTheUserBackToLogin() throws Exception {
        mockMvc.perform(get("/api/professional/me").header("Authorization", "Bearer token-invalido"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/professional/me")).andExpect(status().isUnauthorized());
    }
}
