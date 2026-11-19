package com.agendepro.publicapi;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/** Pedido de agendamento por celular aguardando o código de confirmação (tabela booking_challenges, V8). */
@Entity
@Table(name = "booking_challenges")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BookingChallenge {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "phone_e164", nullable = false, length = 20)
    private String phoneE164;

    @Column(name = "client_name", nullable = false, length = 150)
    private String clientName;

    /** null = qualquer profissional; escolhido na confirmação. */
    @Column(name = "professional_id")
    private UUID professionalId;

    /** UUIDs separados por vírgula, na ordem escolhida pelo cliente. */
    @Column(name = "service_ids", nullable = false)
    private String serviceIds;

    @Column(nullable = false, length = 10)
    private String date;

    @Column(name = "start_time", nullable = false, length = 5)
    private String startTime;

    @Column(length = 500)
    private String notes;

    @Column(name = "code_hash", nullable = false, length = 64)
    private String codeHash;

    @Column(nullable = false)
    @Builder.Default
    private Integer attempts = 0;

    @Column(name = "send_count", nullable = false)
    @Builder.Default
    private Integer sendCount = 1;

    @Column(name = "last_sent_at", nullable = false)
    @Builder.Default
    private Instant lastSentAt = Instant.now();

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "consumed_at")
    private Instant consumedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
