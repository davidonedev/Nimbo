package com.agendepro.publicapi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ClientDeviceRepository extends JpaRepository<ClientDevice, UUID> {

    Optional<ClientDevice> findByTokenHashAndTenantId(String tokenHash, UUID tenantId);
}
