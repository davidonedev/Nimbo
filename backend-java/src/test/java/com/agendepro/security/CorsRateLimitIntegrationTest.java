package com.agendepro.security;

import com.agendepro.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Preflight fora do rate limit. Contexto próprio, com limite de 5 requisições/min por IP (todos os testes
 * saem do mesmo IP), para o estouro acontecer logo.
 */
@TestPropertySource(properties = {
        "app.cors.origins=https://nimbo-dusky.vercel.app",
        "app.rate-limit.api-capacity=5"
})
class CorsRateLimitIntegrationTest extends AbstractIntegrationTest {

    private static final String VERCEL = "https://nimbo-dusky.vercel.app";

    @Autowired private MockMvc mockMvc;

    @Test
    void preflightsDoNotConsumeTheLimitAndA429StillCarriesCorsHeaders() throws Exception {
        // 40 preflights (8x o limite): nenhum pode ser barrado nem gastar a cota
        for (int i = 0; i < 40; i++) {
            mockMvc.perform(options("/api/public/register/business")
                            .header("Origin", VERCEL)
                            .header("Access-Control-Request-Method", "POST"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", VERCEL));
        }

        // As 5 chamadas reais ainda cabem na cota inteira...
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(get("/api/public/slug-inexistente").header("Origin", VERCEL)).andExpect(status().isNotFound());
        }

        // ...e a 6ª é barrada, com a mensagem de limite E os cabeçalhos CORS (sem eles o navegador só mostra "falha de rede")
        mockMvc.perform(get("/api/public/slug-inexistente").header("Origin", VERCEL))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Access-Control-Allow-Origin", VERCEL))
                .andExpect(jsonPath("$.error").value("Limite de requisições atingido."));

        // Origem não permitida não ganha cabeçalho CORS nem no 429
        mockMvc.perform(get("/api/public/slug-inexistente").header("Origin", "https://evil.example.com"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));

        // O preflight continua passando mesmo com a cota estourada
        mockMvc.perform(options("/api/public/register/business")
                        .header("Origin", VERCEL)
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk());
    }
}
