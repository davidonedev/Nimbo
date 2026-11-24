package com.agendepro.notification;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Porta de whatsapp.service.ts — integração com Evolution API. Se o tenant não tiver
 * WhatsApp configurado, a mensagem só é logada (paridade com o comportamento de
 * desenvolvimento do Node).
 */
@Slf4j
@Service
public class WhatsappService {

    public static final String REMINDER_24H_TEMPLATE = """
            Olá {{clientName}}! 👋

            Lembrete: você tem um agendamento *amanhã* em *{{tenantName}}*!

            📅 *Data:* {{date}}
            🕐 *Horário:* {{time}}
            ✂️ *Profissional:* {{professional}}
            💈 *Serviço(s):* {{services}}

            Acesse o link abaixo para gerenciar seu agendamento:
            {{portalLink}}

            _Para cancelar, faça isso com pelo menos 1h de antecedência._""";

    public static final String REMINDER_2H_TEMPLATE = """
            Olá {{clientName}}! 🔔

            Daqui a pouco é o seu horário em *{{tenantName}}*!

            🕐 *Horário:* {{time}}
            ✂️ *Profissional:* {{professional}}
            💈 *Serviço(s):* {{services}}

            Te esperamos em breve! 😊""";

    public static final String DEFAULT_TEMPLATE = """
            Olá {{clientName}}! 👋

            Seu agendamento em *{{tenantName}}* foi registrado com sucesso!

            📅 *Data:* {{date}}
            🕐 *Horário:* {{time}}
            ✂️ *Profissional:* {{professional}}
            💈 *Serviços:* {{services}}
            💰 *Total:* {{total}}

            Para confirmar seu cadastro e ativar sua conta, acesse o link abaixo:
            {{verificationLink}}

            _Este link expira em 24 horas. Caso não tenha feito este agendamento, ignore esta mensagem._""";

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{(\\w+)\\}\\}");

    private static final int CONNECT_TIMEOUT_MS = 5_000;
    private static final int READ_TIMEOUT_MS = 10_000;

    private final RestClient restClient;

    public WhatsappService() {
        this(CONNECT_TIMEOUT_MS, READ_TIMEOUT_MS);
    }

    // Sem timeout, um provedor travado prende a thread HTTP (/book) ou a thread única dos agendadores.
    WhatsappService(int connectTimeoutMs, int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeoutMs);
        factory.setReadTimeout(readTimeoutMs);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /** "(11) 99999-9999" / "11999999999" / "5511999999999" → "5511999999999". */
    public String normalizePhone(String phone) {
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("55") && digits.length() >= 12) return digits;
        return "55" + digits;
    }

    public String interpolateTemplate(String template, Map<String, String> vars) {
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            String value = vars.getOrDefault(matcher.group(1), matcher.group(0));
            matcher.appendReplacement(result, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    public record TenantWhatsappConfig(String apiUrl, String apiKey, String instance) {
        public boolean isConfigured() {
            return apiUrl != null && !apiUrl.isBlank()
                    && apiKey != null && !apiKey.isBlank()
                    && instance != null && !instance.isBlank();
        }
    }

    /** Existe um WhatsApp (do estabelecimento ou da plataforma) pronto para enviar? */
    public boolean isAvailable(TenantWhatsappConfig tenantConfig) {
        TenantWhatsappConfig cfg = effectiveConfig(tenantConfig);
        return cfg != null && cfg.isConfigured();
    }

    public enum SendResult {
        /** A API aceitou a mensagem (2xx). */
        SENT,
        /** Nem o estabelecimento nem a plataforma têm WhatsApp configurado: nada foi enviado (só logado). */
        NOT_CONFIGURED,
        /** A API respondeu erro ou ficou fora do ar. */
        FAILED
    }

    /** WhatsApp padrão da plataforma (variáveis WHATSAPP_DEFAULT_*): reserva para quem não configurou o próprio. */
    @Value("${app.whatsapp.default-api-url:}")
    private String defaultApiUrl;
    @Value("${app.whatsapp.default-api-key:}")
    private String defaultApiKey;
    @Value("${app.whatsapp.default-instance:}")
    private String defaultInstance;

    /** A do estabelecimento, se completa; senão a da plataforma, se completa; senão a (incompleta) do estabelecimento. */
    public TenantWhatsappConfig effectiveConfig(TenantWhatsappConfig tenantConfig) {
        if (tenantConfig != null && tenantConfig.isConfigured()) return tenantConfig;
        TenantWhatsappConfig platform = new TenantWhatsappConfig(defaultApiUrl, defaultApiKey, defaultInstance);
        return platform.isConfigured() ? platform : tenantConfig;
    }

    /**
     * Envio síncrono para quem precisa saber se a mensagem saiu (ex.: código de confirmação do agendamento).
     * Diferente de {@link #sendMessage}, devolve o resultado em vez de engolir a falha.
     */
    public SendResult sendNow(TenantWhatsappConfig config, String to, String text) {
        TenantWhatsappConfig cfg = effectiveConfig(config);
        if (cfg == null || !cfg.isConfigured()) {
            logUnsent(to, text);
            return SendResult.NOT_CONFIGURED;
        }
        try {
            post(cfg, to, text);
            return SendResult.SENT;
        } catch (Exception ex) {
            log.error("[whatsapp] Falha ao enviar mensagem: {}", ex.getMessage());
            return SendResult.FAILED;
        }
    }

    private void logUnsent(String to, String text) {
        log.info("\n──────────────────────────────────────────────────────\n" +
                        "[WHATSAPP] Mensagem (sem API configurada)\n  Para: {}\n  Mensagem:\n{}\n" +
                        "──────────────────────────────────────────────────────",
                to, text.lines().map(l -> "    " + l).reduce("", (a, b) -> a + "\n" + b));
    }

    private void post(TenantWhatsappConfig config, String to, String text) {
        String url = config.apiUrl().replaceAll("/$", "") + "/message/sendText/" + config.instance();
        restClient.post()
                .uri(url)
                .header("Content-Type", "application/json")
                .header("apikey", config.apiKey())
                .body(Map.of("number", normalizePhone(to), "text", text))
                .retrieve()
                .toBodilessEntity();
    }

    @Async
    public void sendMessage(TenantWhatsappConfig config, String to, String text) {
        if (config == null || !config.isConfigured()) {
            logUnsent(to, text);
            return;
        }

        try {
            post(config, to, text);
        } catch (Exception ex) {
            log.error("[whatsapp] Falha ao enviar mensagem: {}", ex.getMessage());
        }
    }
}
