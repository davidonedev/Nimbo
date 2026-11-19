package com.agendepro.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.ArrayList;
import java.util.List;

/**
 * CORS do backend, configurado por {@code CORS_ALLOWED_ORIGINS} (lista separada por vírgula;
 * {@code CORS_ORIGIN}, o nome antigo, continua valendo como alternativa — ver application.yml).
 *
 * <ul>
 *   <li>Origem exata: {@code https://nimbo-dusky.vercel.app}.</li>
 *   <li>Padrão com curinga, para os domínios de preview da Vercel: {@code https://nimbo-*.vercel.app}.
 *       Use sempre um prefixo ou sufixo do SEU projeto; um curinga que cubra qualquer origem ({@code *}) é ignorado.</li>
 *   <li>Barra final é descartada ({@code https://x.vercel.app/} vira {@code https://x.vercel.app}); o navegador nunca envia barra.</li>
 * </ul>
 *
 * Sem credenciais: a autenticação é só o JWT no header {@code Authorization}, não há cookies. Assim, mesmo com
 * origens por padrão, a API nunca precisa do par "curinga + credenciais", que é inválido.
 * Este bean é usado pelo Spring Security e também pelo {@code RateLimitFilter}, que roda antes e precisa
 * devolver os mesmos cabeçalhos CORS nas respostas 429.
 */
@Slf4j
@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.origins}") String rawOrigins) {
        CorsConfiguration configuration = buildConfiguration(rawOrigins);
        log.info("CORS: origens exatas={} padrões={}", configuration.getAllowedOrigins(), configuration.getAllowedOriginPatterns());

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    static CorsConfiguration buildConfiguration(String rawOrigins) {
        List<String> exact = new ArrayList<>();
        List<String> patterns = new ArrayList<>();

        for (String entry : (rawOrigins == null ? "" : rawOrigins).split(",")) {
            String origin = normalizeOrigin(entry);
            if (origin.isEmpty()) continue;

            if (origin.contains("*")) {
                if (isTooBroad(origin)) {
                    log.warn("CORS: padrão '{}' ignorado por liberar qualquer origem. Use algo como https://nimbo-*.vercel.app", origin);
                    continue;
                }
                patterns.add(origin);
            } else {
                exact.add(origin);
            }
        }

        if (exact.isEmpty() && patterns.isEmpty()) {
            log.warn("CORS: nenhuma origem válida em CORS_ALLOWED_ORIGINS; o navegador vai bloquear todas as chamadas do front.");
        }

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(exact);
        configuration.setAllowedOriginPatterns(patterns);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Content-Type", "Authorization", "Accept", "X-Device-Token"));
        configuration.setAllowCredentials(false);
        configuration.setMaxAge(3600L); // o navegador reaproveita o preflight por 1 h: menos OPTIONS, menos chance de falha
        return configuration;
    }

    /**
     * Deixa só "esquema://host[:porta]", que é o que o navegador envia no cabeçalho Origin. Corrige o que costuma
     * ser colado errado no painel do Render: espaços, aspas ao redor ("https://x.app"), barra final e caminho
     * (https://x.app/api). Sem isso a origem nunca bate e o navegador mostra só "Erro de CORS".
     */
    static String normalizeOrigin(String raw) {
        String origin = raw.trim().replaceAll("^[\"']+|[\"']+$", "").trim();
        origin = origin.replaceFirst("^([a-zA-Z][a-zA-Z0-9+.-]*://[^/]*).*$", "$1");
        while (origin.endsWith("/")) origin = origin.substring(0, origin.length() - 1);
        return origin;
    }

    /** "*", "https://*", "http://**"... liberam qualquer site. */
    private static boolean isTooBroad(String pattern) {
        String host = pattern.replaceFirst("^[a-zA-Z][a-zA-Z0-9+.-]*://", "");
        return host.replace("*", "").replace(".", "").isEmpty();
    }
}
