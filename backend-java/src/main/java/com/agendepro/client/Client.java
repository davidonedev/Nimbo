package com.agendepro.client;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

import java.time.Instant;
import java.util.UUID;

/** Porta do model Client (schema.prisma). */
@Entity
@Table(name = "clients", uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "email"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Client {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(nullable = false, length = 150)
    private String name;

    /** null = cliente criado pelo agendamento por celular (sem e-mail). */
    @Column(length = 180)
    private String email;

    private String phone;

    /** Celular só com dígitos e DDI 55 (formato de WhatsappService.normalizePhone); chave do agendamento por celular. */
    @Column(name = "phone_e164", length = 20)
    private String phoneE164;

    /** null = autenticado via Google. */
    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "email_verified", nullable = false)
    @Builder.Default
    private Boolean emailVerified = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PrePersist
    void prePersist() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
        phoneE164 = normalizePhone(phone);
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
        phoneE164 = normalizePhone(phone);
    }

    /** "(19) 98179-4567" → "5519981794567"; null se não houver dígitos suficientes (DDD + número). Mesma regra da V8. */
    public static String normalizePhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        if (digits.length() < 10) return null;
        return digits.startsWith("55") && digits.length() >= 12 ? digits : "55" + digits;
    }
}
