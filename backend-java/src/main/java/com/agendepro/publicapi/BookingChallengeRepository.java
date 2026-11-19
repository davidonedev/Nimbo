package com.agendepro.publicapi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface BookingChallengeRepository extends JpaRepository<BookingChallenge, UUID> {

    Optional<BookingChallenge> findByIdAndTenantId(UUID id, UUID tenantId);

    /** Quantos códigos foram pedidos para o celular desde {@code since} (trava de abuso de envio). */
    long countByTenantIdAndPhoneE164AndCreatedAtAfter(UUID tenantId, String phoneE164, Instant since);
}
