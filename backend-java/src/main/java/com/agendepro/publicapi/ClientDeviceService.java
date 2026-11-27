package com.agendepro.publicapi;

import com.agendepro.client.Client;
import com.agendepro.common.AppException;
import com.agendepro.tenant.Tenant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Aparelho reconhecido (header {@code X-Device-Token}): prova de posse do cliente. Compartilhado pelo agendamento por
 * celular (PhoneBookingService) e pelas rotas "do cliente" (listar, cancelar e remarcar), que só aceitam o dono do token.
 */
@Service
@RequiredArgsConstructor
public class ClientDeviceService {

    static final Duration DEVICE_TTL = Duration.ofDays(90);
    /** Aparelhos guardados por cliente: cada login do portal cria um; passando disso, os de uso mais antigo saem. */
    static final int MAX_DEVICES_PER_CLIENT = 10;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final ClientDeviceRepository deviceRepository;

    /** Aparelho válido (existe neste estabelecimento e não expirou) ou vazio. */
    public Optional<ClientDevice> resolve(Tenant t, String token) {
        if (token == null || token.isBlank() || token.length() > 200) return Optional.empty();
        return deviceRepository.findByTokenHashAndTenantId(sha256(token.trim()), t.getId())
                .filter(d -> d.getExpiresAt().isAfter(Instant.now()));
    }

    /** Renova a validade do aparelho (uso recente prolonga o reconhecimento). */
    public void touch(ClientDevice device) {
        device.setLastUsedAt(Instant.now());
        device.setExpiresAt(Instant.now().plus(DEVICE_TTL));
        deviceRepository.save(device);
    }

    /** Cria um aparelho reconhecido e devolve o token em claro (só aqui; no banco fica o hash). */
    @Transactional
    public String issue(Tenant t, Client client) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        deviceRepository.save(ClientDevice.builder()
                .tenantId(t.getId()).clientId(client.getId()).tokenHash(sha256(token))
                .expiresAt(Instant.now().plus(DEVICE_TTL)).build());
        trimOldDevices(client.getId());
        return token;
    }

    /** Mantém só os {@link #MAX_DEVICES_PER_CLIENT} aparelhos de uso mais recente do cliente. */
    private void trimOldDevices(UUID clientId) {
        List<ClientDevice> devices = deviceRepository.findByClientIdOrderByLastUsedAtDesc(clientId);
        if (devices.size() > MAX_DEVICES_PER_CLIENT) {
            deviceRepository.deleteAll(devices.subList(MAX_DEVICES_PER_CLIENT, devices.size()));
        }
    }

    /**
     * Cliente dono do token. Sem token válido (ausente, inventado, expirado ou de outro estabelecimento) → 403
     * DEVICE_REQUIRED. Se {@code claimedClientId} veio, tem de ser o mesmo cliente do token.
     */
    public UUID requireClientId(Tenant t, String token, UUID claimedClientId) {
        ClientDevice device = resolve(t, token).orElseThrow(ClientDeviceService::deviceRequired);
        if (claimedClientId != null && !claimedClientId.equals(device.getClientId())) throw deviceRequired();
        touch(device);
        return device.getClientId();
    }

    private static AppException deviceRequired() {
        return new AppException("Confirme seu celular neste aparelho para ver ou alterar seus agendamentos.", 403, "DEVICE_REQUIRED");
    }

    static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
