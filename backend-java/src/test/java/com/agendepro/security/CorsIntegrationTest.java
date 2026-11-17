package com.agendepro.security;

import com.agendepro.AbstractIntegrationTest;
import com.agendepro.tenant.TenantRepository;
import com.agendepro.testsupport.AuthTestHelper;
import com.agendepro.user.User;
import com.agendepro.user.UserRepository;
import com.agendepro.user.UserRole;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CORS e cadastro de negócio vistos do navegador, com a origem do front na Vercel. A lista abaixo imita a
 * variável CORS_ALLOWED_ORIGINS do Render: origem exata (com barra final de propósito, erro comum ao colar),
 * padrão de preview da Vercel e um "*" solto, que precisa ser ignorado.
 */
@TestPropertySource(properties =
        "app.cors.origins=https://nimbo-dusky.vercel.app/,https://nimbo-*.vercel.app,*")
class CorsIntegrationTest extends AbstractIntegrationTest {

    private static final String VERCEL = "https://nimbo-dusky.vercel.app";
    private static final String REGISTER = "/api/public/register/business";

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private AuthTestHelper authTestHelper;

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder preflight(String origin) {
        return options(REGISTER)
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "content-type");
    }

    @Test
    void preflightFromVercelOriginIsAllowed() throws Exception {
        mockMvc.perform(preflight(VERCEL))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", VERCEL))
                .andExpect(header().string("Access-Control-Allow-Methods", containsString("POST")))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("content-type")))
                .andExpect(header().string("Access-Control-Max-Age", "3600"))
                // JWT vai no header, não em cookie: sem credenciais, e nunca "*"
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    }

    @Test
    void preflightWithAuthorizationHeaderIsAllowed() throws Exception {
        mockMvc.perform(options("/api/admin/clients")
                        .header("Origin", VERCEL)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", VERCEL));
    }

    @Test
    void vercelPreviewOriginMatchingThePatternIsAllowed() throws Exception {
        String preview = "https://nimbo-git-fix-cadastro-meu-time.vercel.app";
        mockMvc.perform(preflight(preview))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", preview));
    }

    @Test
    void otherOriginsAreBlocked() throws Exception {
        for (String origin : new String[]{
                "https://evil.example.com",
                "https://outro-projeto.vercel.app",   // fora do padrão nimbo-*
                "http://nimbo-dusky.vercel.app",      // http em vez de https
                "https://nimbo-dusky.vercel.app.evil.com"}) {
            mockMvc.perform(preflight(origin))
                    .andExpect(status().isForbidden())
                    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        }
    }

    @Test
    void realPostFromVercelIsCorsAllowedAndNeedsNoAuthentication() throws Exception {
        String email = "dono-" + UUID.randomUUID() + "@example.com";
        mockMvc.perform(post(REGISTER).header("Origin", VERCEL).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerName":"Dono Vercel","email":"%s","password":"senha123","businessName":"Barbearia Vercel"}
                                """.formatted(email)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Access-Control-Allow-Origin", VERCEL))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.slug").exists());
    }

    @Test
    void registrationCreatesTenantAndTenantAdminOwner() throws Exception {
        String email = "dono-" + UUID.randomUUID() + "@example.com";
        mockMvc.perform(post(REGISTER).header("Origin", VERCEL).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerName":"Dono Teste","email":"%s","password":"senha123","businessName":"Studio Nimbo Teste"}
                                """.formatted(email)))
                .andExpect(status().isCreated());

        User owner = userRepository.findByEmail(email).orElseThrow();
        assertThat(owner.getRole()).isEqualTo(UserRole.TENANT_ADMIN);
        assertThat(owner.getTenantId()).isNotNull();
        assertThat(tenantRepository.findById(owner.getTenantId())).isPresent();
        assertThat(authTestHelper.login(mockMvc, email, "senha123")).isNotBlank();
    }

    @Test
    void duplicateEmailReturnsUsefulConflict() throws Exception {
        String email = "dup-" + UUID.randomUUID() + "@example.com";
        String body = """
                {"ownerName":"Dono Dup","email":"%s","password":"senha123","businessName":"Negócio Dup"}
                """.formatted(email);
        mockMvc.perform(post(REGISTER).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated());
        mockMvc.perform(post(REGISTER).header("Origin", VERCEL).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict())
                .andExpect(header().string("Access-Control-Allow-Origin", VERCEL))
                .andExpect(jsonPath("$.code").value("EMAIL_IN_USE"));
    }

    @Test
    void invalidPayloadReturnsFieldDetailsWithCorsHeaders() throws Exception {
        mockMvc.perform(post(REGISTER).header("Origin", VERCEL).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerName":"A","email":"nao-e-email","password":"123","businessName":""}
                                """))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(header().string("Access-Control-Allow-Origin", VERCEL))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.details").isNotEmpty());
    }

    @Test
    void registrationFromBlockedOriginIsRejected() throws Exception {
        mockMvc.perform(post(REGISTER).header("Origin", "https://evil.example.com").contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerName":"Dono X","email":"x-%s@example.com","password":"senha123","businessName":"Negócio X"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }
}
