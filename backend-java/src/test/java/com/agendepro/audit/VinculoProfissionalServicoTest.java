package com.agendepro.audit;

import com.agendepro.catalog.ServiceOffering;
import com.agendepro.professional.Professional;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Caso do Max Barber: um profissional e um serviço, mas sem vínculo entre os dois. O cliente via "Nenhum profissional
 * faz todos esses serviços". Cobre o reparo dos dados existentes e as duas formas de não voltar a acontecer.
 */
class VinculoProfissionalServicoTest extends AuditBase {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private DataSource dataSource;
    @Autowired private com.agendepro.catalog.ServiceOfferingRepository serviceRepository;

    private void runRepairMigration() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource("db/migration/V14__repair_professional_service_links.sql"));
        }
    }

    private long linksOf(Professional p) {
        return jdbc.queryForObject("SELECT count(*) FROM professional_services WHERE professional_id = ?", Long.class, p.getId());
    }

    private Ctx unlinkedShop() {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        Professional p = fixtures.professional(t);              // sem nenhum vínculo
        ServiceOffering s = fixtures.service(t, 30.0, 30);      // sem nenhum vínculo
        return new Ctx(t, p, s);
    }

    private List<UUID> serviceIdsShownPublicly(Tenant t) throws Exception {
        JsonNode data = json.readTree(mockMvc.perform(get("/api/public/" + t.getSlug() + "/professionals"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        List<UUID> out = new ArrayList<>();
        data.forEach(p -> p.get("services").forEach(s -> out.add(UUID.fromString(s.get("serviceId").asText()))));
        return out;
    }

    @Test
    void theMaxBarberCase_isUnbookableWithoutLinks_andFixedByTheRepair() throws Exception {
        Ctx c = unlinkedShop();

        assertThat(serviceIdsShownPublicly(c.tenant)).isEmpty();   // o front não acha profissional para o serviço
        assertThat(slots(c, date)).isEmpty();                      // e o backend também não oferece horário

        runRepairMigration();

        assertThat(serviceIdsShownPublicly(c.tenant)).containsExactly(c.service.getId());
        assertThat(slots(c, date)).isNotEmpty();
    }

    @Test
    void theRepairIsIdempotent_andLeavesAlreadyLinkedProfessionalsAlone() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        ServiceOffering s1 = fixtures.service(t, 30.0, 30);
        ServiceOffering s2 = fixtures.service(t, 50.0, 45);
        Professional p1 = professional(t, s1, "08:00", "18:00", new Integer[]{1, 2, 3, 4, 5});
        linkRepository.save(com.agendepro.professional.ProfessionalServiceLink.of(p1.getId(), s2.getId()));
        Professional p2 = professional(t, s1, "08:00", "18:00", new Integer[]{1, 2, 3, 4, 5}); // só faz s1

        runRepairMigration();
        runRepairMigration();

        assertThat(linksOf(p1)).isEqualTo(2);
        assertThat(linksOf(p2)).isEqualTo(1); // s2 já tinha o p1: o p2 NÃO ganha s2 sem o dono escolher
    }

    @Test
    void theRepairDoesNotCrossTenants() throws Exception {
        Ctx broken = unlinkedShop();
        Tenant other = fixtures.tenant(TenantPlan.BASIC);
        Professional otherPro = fixtures.professional(other);

        runRepairMigration();

        assertThat(linksOf(broken.professional)).isEqualTo(1);
        // o profissional do outro estabelecimento não tem serviço lá, então continua sem vínculo
        assertThat(linksOf(otherPro)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM professional_services WHERE professional_id = ? AND service_id = ?",
                Long.class, otherPro.getId(), broken.service.getId())).isZero();
    }

    @Test
    void creatingAServiceLinksItToTheExistingProfessionals_soTheClientCanBook() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        Professional p = fixtures.professional(t);
        String token = adminToken(t);

        String created = mockMvc.perform(post("/api/admin/services").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Cabelo\",\"price\":30,\"duration\":30}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID serviceId = UUID.fromString(json.readTree(created).get("data").get("id").asText());

        assertThat(linksOf(p)).isEqualTo(1);
        assertThat(serviceIdsShownPublicly(t)).containsExactly(serviceId);
        assertThat(slots(new Ctx(t, p, serviceRepository.findById(serviceId).orElseThrow()), date)).isNotEmpty();
    }

    @Test
    void creatingAProfessionalWithoutChoosingServices_linksAllTheServices() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        ServiceOffering s1 = fixtures.service(t, 30.0, 30);
        ServiceOffering s2 = fixtures.service(t, 50.0, 45);
        String token = adminToken(t);

        mockMvc.perform(post("/api/admin/professionals").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Ronald\",\"serviceIds\":[]}"))
                .andExpect(status().isCreated());

        assertThat(serviceIdsShownPublicly(t)).containsExactlyInAnyOrder(s1.getId(), s2.getId());
    }

    @Test
    void creatingAProfessionalWithChosenServices_linksOnlyThose() throws Exception {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        ServiceOffering s1 = fixtures.service(t, 30.0, 30);
        fixtures.service(t, 50.0, 45);
        String token = adminToken(t);

        mockMvc.perform(post("/api/admin/professionals").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Ronald\",\"serviceIds\":[\"" + s1.getId() + "\"]}"))
                .andExpect(status().isCreated());

        assertThat(serviceIdsShownPublicly(t)).containsExactly(s1.getId());
    }

    @Test
    void editingAProfessionalWithAnEmptyList_keepsThemUnlinkedOnPurpose() throws Exception {
        Ctx c = ctx(); // profissional vinculado a um serviço
        String token = adminToken(c.tenant);

        mockMvc.perform(patch("/api/admin/professionals/" + c.professional.getId()).header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"serviceIds\":[]}"))
                .andExpect(status().isOk());

        assertThat(linksOf(c.professional)).isZero(); // na edição a lista vazia é uma escolha do dono
    }
}
