package com.agendepro.security;

import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/** Interpretação da lista CORS_ALLOWED_ORIGINS (unitário, sem Spring). */
class CorsConfigTest {

    @Test
    void parsesExactOriginsAndPatternsAndIgnoresBlanksAndTrailingSlashes() {
        CorsConfiguration c = CorsConfig.buildConfiguration(
                " https://nimbo-dusky.vercel.app/ , ,http://localhost:5173,https://nimbo-*.vercel.app");

        assertThat(c.getAllowedOrigins()).containsExactly("https://nimbo-dusky.vercel.app", "http://localhost:5173");
        assertThat(c.getAllowedOriginPatterns()).containsExactly("https://nimbo-*.vercel.app");
        assertThat(c.checkOrigin("https://nimbo-dusky.vercel.app")).isEqualTo("https://nimbo-dusky.vercel.app");
        assertThat(c.checkOrigin("https://nimbo-abc123-time.vercel.app")).isNotNull();
        assertThat(c.checkOrigin("https://outro.vercel.app")).isNull();
        assertThat(c.getAllowCredentials()).isNotEqualTo(true);
    }

    @Test
    void toleratesQuotesAndPathsPastedIntoTheEnvVar() {
        for (String raw : new String[]{
                "\"https://nimbo-dusky.vercel.app\"", "'https://nimbo-dusky.vercel.app'",
                "https://nimbo-dusky.vercel.app/api", "\"https://nimbo-dusky.vercel.app/\"",
                " https://nimbo-dusky.vercel.app/api/ "}) {
            CorsConfiguration c = CorsConfig.buildConfiguration(raw);
            assertThat(c.getAllowedOrigins()).as(raw).containsExactly("https://nimbo-dusky.vercel.app");
            assertThat(c.checkOrigin("https://nimbo-dusky.vercel.app")).as(raw).isNotNull();
        }
        assertThat(CorsConfig.buildConfiguration("\"https://nimbo-*.vercel.app\"").getAllowedOriginPatterns())
                .containsExactly("https://nimbo-*.vercel.app");
    }

    @Test
    void wildcardThatWouldAllowEverythingIsIgnored() {
        for (String raw : new String[]{"*", "https://*", "http://**", "https://*.*", "https://nimbo-dusky.vercel.app,*"}) {
            CorsConfiguration c = CorsConfig.buildConfiguration(raw);
            assertThat(c.checkOrigin("https://qualquer-site.com")).as(raw).isNull();
        }
    }

    @Test
    void transitionListWithCustomDomainWwwAndOldVercelAddress() {
        CorsConfiguration c = CorsConfig.buildConfiguration(
                "https://seudominio.com, https://www.seudominio.com/ ,https://nimbo-dusky.vercel.app,https://nimbo-*.vercel.app");

        assertThat(c.getAllowedOrigins()).containsExactly(
                "https://seudominio.com", "https://www.seudominio.com", "https://nimbo-dusky.vercel.app");
        assertThat(c.checkOrigin("https://seudominio.com")).isNotNull();
        assertThat(c.checkOrigin("https://www.seudominio.com")).isNotNull();
        assertThat(c.checkOrigin("https://nimbo-dusky.vercel.app")).isNotNull();
        assertThat(c.checkOrigin("https://seudominio.com.evil.com")).isNull();
        assertThat(c.checkOrigin("https://app.seudominio.com")).isNull(); // subdomínio não listado
        assertThat(c.getAllowedHeaders()).contains("X-Device-Token");
    }

    @Test
    void emptyListAllowsNoOrigin() {
        for (String raw : new String[]{"", "  ", " , ,", null}) {
            CorsConfiguration c = CorsConfig.buildConfiguration(raw);
            assertThat(c.checkOrigin("https://nimbo-dusky.vercel.app")).as("[" + raw + "]").isNull();
        }
    }
}
