package com.agendepro.security;

import com.agendepro.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CORS durante a troca para o domínio próprio: a MESMA variável CORS_ALLOWED_ORIGINS lista o domínio principal, o www
 * e o endereço antigo da Vercel (transição), mais o padrão dos previews. Qualquer outra origem continua bloqueada.
 */
@TestPropertySource(properties = "app.cors.origins="
        + "https://seudominio.com,https://www.seudominio.com,https://nimbo-dusky.vercel.app,https://nimbo-*.vercel.app")
class CorsCustomDomainIntegrationTest extends AbstractIntegrationTest {

    private static final String BOOK = "/api/public/qualquer-slug/book";

    @Autowired private MockMvc mockMvc;

    private MockHttpServletRequestBuilder preflight(String origin) {
        return options(BOOK)
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type,x-device-token");
    }

    @Test
    void apexWwwAndOldVercelAddressAreAllowed() throws Exception {
        for (String origin : new String[]{"https://seudominio.com", "https://www.seudominio.com", "https://nimbo-dusky.vercel.app"}) {
            mockMvc.perform(preflight(origin))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", origin))
                    .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
        }
    }

    @Test
    void vercelPreviewsStillWork() throws Exception {
        String preview = "https://nimbo-git-feat-x-meu-time.vercel.app";
        mockMvc.perform(preflight(preview))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", preview));
    }

    @Test
    void preflightAcceptsTheDeviceTokenHeaderUsedByTheBookingPage() throws Exception {
        mockMvc.perform(preflight("https://www.seudominio.com"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Headers", containsStringIgnoringCase("X-Device-Token")));
    }

    @Test
    void unknownOriginsAreBlocked() throws Exception {
        for (String origin : new String[]{
                "https://evil.example.com",
                "https://seudominio.com.evil.com",   // sufixo malicioso
                "https://evil-seudominio.com",       // prefixo malicioso
                "http://seudominio.com",             // http em vez de https
                "https://outro.seudominio.com",      // subdomínio não listado
                "https://outro-projeto.vercel.app"}) {
            mockMvc.perform(preflight(origin))
                    .andExpect(status().isForbidden())
                    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        }
    }
}
