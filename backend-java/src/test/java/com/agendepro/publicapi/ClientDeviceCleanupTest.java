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
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Aparelhos reconhecidos: o que expirou é apagado e cada cliente guarda no máximo 10 (os de uso mais antigo saem). */
class ClientDeviceCleanupTest extends AbstractIntegrationTest {

    @Autowired private ClientDeviceService devices;
    @Autowired private ClientDeviceCleanupService cleanup;
    @Autowired private ClientDeviceRepository repository;
    @Autowired private TestFixtures fixtures;

    private ClientDevice device(Tenant t, Client c, String hash, Instant expiresAt, Instant lastUsedAt) {
        return repository.save(ClientDevice.builder().tenantId(t.getId()).clientId(c.getId()).tokenHash(hash)
                .expiresAt(expiresAt).lastUsedAt(lastUsedAt).build());
    }

    @Test
    void cleanupDeletesOnlyExpiredDevices() {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        Client c = fixtures.client(t);
        String tag = java.util.UUID.randomUUID().toString().replace("-", "");
        ClientDevice expired = device(t, c, "exp-" + tag, Instant.now().minus(Duration.ofDays(1)), Instant.now().minus(Duration.ofDays(91)));
        ClientDevice valid = device(t, c, "ok-" + tag, Instant.now().plus(Duration.ofDays(30)), Instant.now());

        assertThat(cleanup.deleteExpired(Instant.now())).isGreaterThanOrEqualTo(1);

        assertThat(repository.findById(expired.getId())).isEmpty();
        assertThat(repository.findById(valid.getId())).isPresent();
    }

    @Test
    void issuingBeyondTheLimitKeepsTheTenMostRecentlyUsed() {
        Tenant t = fixtures.tenant(TenantPlan.BASIC);
        Client c = fixtures.client(t);
        String tag = java.util.UUID.randomUUID().toString().replace("-", "");
        // 10 aparelhos antigos, do menos ao mais usado
        for (int i = 0; i < 10; i++) {
            device(t, c, "old-" + i + "-" + tag, Instant.now().plus(Duration.ofDays(60)), Instant.now().minus(Duration.ofDays(30 - i)));
        }

        String token = devices.issue(t, c); // o 11º: o menos usado (old-0) sai

        List<ClientDevice> left = repository.findByClientIdOrderByLastUsedAtDesc(c.getId());
        assertThat(left).hasSize(ClientDeviceService.MAX_DEVICES_PER_CLIENT);
        assertThat(left).extracting(ClientDevice::getTokenHash).doesNotContain("old-0-" + tag);
        assertThat(devices.resolve(t, token)).isPresent(); // o recém-criado continua válido
    }
}
