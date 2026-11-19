package com.agendepro.publicapi;

import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** DTOs do agendamento público por celular (Nome + Celular + código por WhatsApp). */
public final class PhoneBookingDtos {

    private PhoneBookingDtos() {
    }

    public record BookRequest(
            @NotBlank @Size(min = 2, max = 100) String name,
            @NotBlank @Size(max = 30) String phone,
            @NotEmpty @Size(max = 5) List<@NotBlank String> serviceIds,
            /** null = qualquer profissional que faça todos os serviços. */
            String professionalId,
            @NotBlank @Pattern(regexp = "^\\d{4}-\\d{2}-\\d{2}$") String date,
            @NotBlank @Pattern(regexp = "^\\d{2}:\\d{2}(:\\d{2})?$") String startTime,
            @Size(max = 500) String notes,
            /** Token do captcha (Cloudflare Turnstile); obrigatório quando o backend tem a chave configurada. */
            @Size(max = 4096) String captchaToken
    ) {
        public String startTimeHHmm() {
            return startTime.substring(0, 5);
        }
    }

    public record VerifyRequest(
            @NotNull UUID challengeId,
            @NotBlank @Pattern(regexp = "^\\d{6}$", message = "O código tem 6 dígitos") String code
    ) {
    }

    public record ResendRequest(@NotNull UUID challengeId) {
    }

    public record BookedItem(UUID id, UUID serviceId, String serviceName, String startTime, String endTime, double price) {
    }

    public record BookedSummary(String date, UUID professionalId, String professionalName,
                                int totalDuration, double totalPrice, List<BookedItem> items) {
    }

    public record BookedClient(UUID id, String name, String phone) {
    }

    /**
     * Resposta única de book/verify. {@code kind}:
     * <ul>
     *   <li>{@code challenge_required} — código enviado por WhatsApp; usa challengeId/maskedPhone/expiresAt;</li>
     *   <li>{@code booked} — agendamento criado; usa booking/client (e deviceToken quando um aparelho novo foi reconhecido);</li>
     *   <li>{@code pending_confirmation} — estabelecimento sem código automático: horário reservado como pendente, o
     *       cliente confirma pelo WhatsApp do estabelecimento até {@code confirmBy} (null = sem prazo).</li>
     * </ul>
     */
    public record BookResponse(String kind, UUID challengeId, String maskedPhone, Instant expiresAt,
                               BookedSummary booking, BookedClient client, String deviceToken, Instant confirmBy) {
        static BookResponse challenge(UUID id, String maskedPhone, Instant expiresAt) {
            return new BookResponse("challenge_required", id, maskedPhone, expiresAt, null, null, null, null);
        }

        static BookResponse booked(BookedSummary booking, BookedClient client, String deviceToken) {
            return new BookResponse("booked", null, null, null, booking, client, deviceToken, null);
        }

        static BookResponse pending(BookedSummary booking, BookedClient client, Instant confirmBy) {
            return new BookResponse("pending_confirmation", null, null, null, booking, client, null, confirmBy);
        }
    }

    public record ClientConfirmedRequest(@NotEmpty @Size(max = 10) List<@NotNull UUID> appointmentIds) {
    }

    /** Quantos horários pendentes ficaram marcados como "cliente confirmou" (sem prazo, aguardando o dono). */
    public record ClientConfirmedResponse(int confirmed) {
    }

    public record ResendResponse(String maskedPhone, Instant expiresAt) {
    }

    /** Aparelho reconhecido? Preenche o nome/celular e sugere "Repetir último serviço". */
    public record PossessionResponse(boolean recognized, String fullName, String phone, UUID lastServiceId) {
        static PossessionResponse none() {
            return new PossessionResponse(false, null, null, null);
        }
    }
}
