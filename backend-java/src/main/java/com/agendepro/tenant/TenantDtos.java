package com.agendepro.tenant;

import com.agendepro.appointment.AppointmentDtos;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** DTOs de tenant — porta de tenant.controller.ts. */
public final class TenantDtos {

    private TenantDtos() {
    }

    /** Limite do texto de uma imagem (data URL base64 ≈ 1,5 MB de arquivo). */
    public static final int MAX_IMAGE_CHARS = 2_000_000;

    public record TenantResponse(
            UUID id, String slug, String name, String ownerName, String email, String phone, String address,
            TenantStatus status, TenantPlan plan, Double monthlyPrice, String primaryColor, String adminColor,
            String logoUrl, String bannerUrl, Boolean isOpen, Integer minAdvanceMinutes,
            String whatsappApiUrl, String whatsappApiKey, String whatsappInstance, String whatsappTemplate,
            Instant createdAt, Instant updatedAt
    ) {
        public static TenantResponse from(Tenant t) {
            return new TenantResponse(t.getId(), t.getSlug(), t.getName(), t.getOwnerName(), t.getEmail(),
                    t.getPhone(), t.getAddress(), t.getStatus(), t.getPlan(), t.getMonthlyPrice(),
                    t.getPrimaryColor(), t.getAdminColor(), t.getLogoUrl(), t.getBannerUrl(), t.getIsOpen(),
                    t.getMinAdvanceMinutes(), t.getWhatsappApiUrl(), t.getWhatsappApiKey(), t.getWhatsappInstance(),
                    t.getWhatsappTemplate(), t.getCreatedAt(), t.getUpdatedAt());
        }

        /** Para o papel PROFESSIONAL: mesmos campos, mas sem a integração de WhatsApp (URL, chave e instância são do dono). */
        public static TenantResponse forProfessional(Tenant t) {
            TenantResponse full = from(t);
            return new TenantResponse(full.id(), full.slug(), full.name(), full.ownerName(), full.email(), full.phone(),
                    full.address(), full.status(), full.plan(), full.monthlyPrice(), full.primaryColor(), full.adminColor(),
                    full.logoUrl(), full.bannerUrl(), full.isOpen(), full.minAdvanceMinutes(),
                    null, null, null, null, full.createdAt(), full.updatedAt());
        }
    }

    public record TenantCounts(long professionals, long services, long clients, long appointments) {
    }

    /**
     * Porta exata de `res.json({success:true, data: tenant})` em getMyTenant()
     * (tenant.controller.ts), onde `tenant` vem de `prisma.tenant.findUnique({include:{_count:...}})`
     * — ou seja, os campos do tenant FLAT no nível raiz do objeto, com `_count` como
     * mais uma propriedade (não aninhado sob "tenant"/"counts"). O frontend
     * (getMyTenantApi) espera exatamente esse formato; aninhar quebra a tela de admin.
     */
    public record TenantWithCountsResponse(
            UUID id, String slug, String name, String ownerName, String email, String phone, String address,
            TenantStatus status, TenantPlan plan, Double monthlyPrice, String primaryColor, String adminColor,
            String logoUrl, String bannerUrl, Boolean isOpen, Integer minAdvanceMinutes,
            String whatsappApiUrl, String whatsappApiKey, String whatsappInstance, String whatsappTemplate,
            Instant createdAt, Instant updatedAt,
            @JsonProperty("_count") TenantCounts count
    ) {
        public static TenantWithCountsResponse from(Tenant t, TenantCounts counts) {
            return new TenantWithCountsResponse(t.getId(), t.getSlug(), t.getName(), t.getOwnerName(), t.getEmail(),
                    t.getPhone(), t.getAddress(), t.getStatus(), t.getPlan(), t.getMonthlyPrice(),
                    t.getPrimaryColor(), t.getAdminColor(), t.getLogoUrl(), t.getBannerUrl(), t.getIsOpen(),
                    t.getMinAdvanceMinutes(), t.getWhatsappApiUrl(), t.getWhatsappApiKey(), t.getWhatsappInstance(),
                    t.getWhatsappTemplate(), t.getCreatedAt(), t.getUpdatedAt(), counts);
        }
    }

    /**
     * Campo ausente (null) = não mexe. Texto vazio ("") = limpa o campo opcional (logo, banner, telefone, cor do
     * painel, WhatsApp...). Os limites de tamanho espelham as colunas, para o painel receber 422 com mensagem
     * em vez de um erro genérico do banco.
     */
    public record UpdateSettingsRequest(
            @Size(min = 2, max = 150, message = "O nome deve ter entre 2 e 150 caracteres") String name,
            @Size(min = 2, max = 150, message = "O nome do responsável deve ter entre 2 e 150 caracteres") String ownerName,
            @Size(max = 30, message = "O telefone deve ter no máximo 30 caracteres") String phone,
            @Size(max = 255, message = "O endereço deve ter no máximo 255 caracteres") String address,
            @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Cor inválida (use o formato #RRGGBB)") String primaryColor,
            @Pattern(regexp = "^(#[0-9A-Fa-f]{6})?$", message = "Cor inválida (use o formato #RRGGBB)") String adminColor,
            @Size(max = MAX_IMAGE_CHARS, message = "A imagem do logo é grande demais (máx. ~1,5 MB)") String logoUrl,
            @Size(max = MAX_IMAGE_CHARS, message = "A imagem do banner é grande demais (máx. ~1,5 MB)") String bannerUrl,
            Boolean isOpen,
            @Min(0) @Max(1440) Integer minAdvanceMinutes,
            @Size(max = 300, message = "A URL da API do WhatsApp deve ter no máximo 300 caracteres") String whatsappApiUrl,
            @Size(max = 300, message = "A chave da API do WhatsApp deve ter no máximo 300 caracteres") String whatsappApiKey,
            @Size(max = 150, message = "O nome da instância deve ter no máximo 150 caracteres") String whatsappInstance,
            @Size(max = 2000, message = "O template do WhatsApp deve ter no máximo 2000 caracteres") String whatsappTemplate
    ) {
    }

    public record DashboardStats(long pending, long confirmed, long completed, long totalClients, double totalRevenue) {
    }

    public record DashboardToday(List<AppointmentDtos.AppointmentResponse> appointments, double revenue) {
    }

    public record DashboardResponse(DashboardToday today, DashboardStats stats) {
    }

    public record GroupStat(String name, double revenue, long count) {
    }

    public record RevenueResponse(double total, long count, Map<String, Double> byDate,
                                   List<GroupStat> byService, List<GroupStat> byProfessional) {
    }
}
