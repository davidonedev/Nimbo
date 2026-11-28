package com.agendepro.publicapi;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClientDeviceRepository extends JpaRepository<ClientDevice, UUID> {

    Optional<ClientDevice> findByTokenHashAndTenantId(String tokenHash, UUID tenantId);

    /** Aparelhos do cliente, o de uso mais recente primeiro. */
    List<ClientDevice> findByClientIdOrderByLastUsedAtDesc(UUID clientId);

    /** Apaga os aparelhos que já expiraram (já não reconhecem ninguém). Devolve quantos. */
    @Modifying
    @Transactional
    @Query("DELETE FROM ClientDevice d WHERE d.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
