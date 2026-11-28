package com.agendepro.publicapi;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.client.Client;
import com.agendepro.tenant.Tenant;
import com.agendepro.tenant.TenantPlan;
import com.agendepro.testsupport.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** O ponto de entrada do agendador (e não só o método transacional) tem de apagar de fato os aparelhos vencidos. */
class ClientDeviceScheduledCleanupTest extends AbstractIntegrationTest {

    @Autowired private ClientDeviceCleanupService cleanup;
    @Autowired private ClientDeviceRepository repository;
    @Autowired private TestFixtures fixtures;

    @Test
    void theScheduledEntryPointActuallyDeletesExpiredDevices() {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        Client c = fixtures.client(t);
        String tag = java.util.UUID.randomUUID().toString().replace("-", "");
        ClientDevice expired = repository.save(ClientDevice.builder().tenantId(t.getId()).clientId(c.getId())
                .tokenHash("sched-exp-" + tag).expiresAt(Instant.now().minus(Duration.ofDays(1)))
                .lastUsedAt(Instant.now().minus(Duration.ofDays(91))).build());

        cleanup.cleanOnSchedule(); // exatamente o que o @Scheduled chama (habilitado por padrao)

        assertThat(repository.findById(expired.getId())).isEmpty();
    }
}
