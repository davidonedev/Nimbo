package com.agendepro.ratelimit;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** Unitário — os testes de integração rodam com limites altos (application-test.yml). */
class RateLimitFilterTest {

    private final RateLimitFilter filter = new RateLimitFilter(1000, 15, 1000, 1)
            .withRouteLimit("/api/auth/forgot-password", 5, 15)
            .withRouteLimit("/api/auth/reset-password", 10, 15);

    @Test
    void sixthForgotPasswordRequestFromSameIpIsRejected() throws Exception {
        for (int i = 0; i < 5; i++) {
            assertThat(call("POST", "/api/auth/forgot-password", "10.0.0.1")).isEqualTo(200);
        }
        assertThat(call("POST", "/api/auth/forgot-password", "10.0.0.1")).isEqualTo(429);
        // Outro IP não é afetado, nem outra rota do mesmo IP
        assertThat(call("POST", "/api/auth/forgot-password", "10.0.0.2")).isEqualTo(200);
        assertThat(call("POST", "/api/auth/reset-password", "10.0.0.1")).isEqualTo(200);
    }

    @Test
    void resetPasswordHasItsOwnLimit() throws Exception {
        for (int i = 0; i < 10; i++) {
            assertThat(call("POST", "/api/auth/reset-password", "10.0.1.1")).isEqualTo(200);
        }
        assertThat(call("POST", "/api/auth/reset-password", "10.0.1.1")).isEqualTo(429);
    }

    @Test
    void optionsPreflightIsNeverCountedNorRejected() throws Exception {
        RateLimitFilter strict = new RateLimitFilter(1, 15, 1, 1).withRouteLimit("/api/auth/login", 1, 15);
        for (int i = 0; i < 50; i++) {
            assertThat(callOn(strict, "OPTIONS", "/api/auth/login", "10.0.2.1")).isEqualTo(200);
            assertThat(callOn(strict, "OPTIONS", "/api/public/register/business", "10.0.2.1")).isEqualTo(200);
        }
        // a cota de 1 requisição real continua intacta
        assertThat(callOn(strict, "GET", "/api/public/login-data", "10.0.2.1")).isEqualTo(200);
        assertThat(callOn(strict, "GET", "/api/public/login-data", "10.0.2.1")).isEqualTo(429);
    }

    private int call(String method, String path, String ip) throws Exception {
        return callOn(filter, method, path, ip);
    }

    private int callOn(RateLimitFilter target, String method, String path, String ip) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        target.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }
}
