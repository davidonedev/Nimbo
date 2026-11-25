package com.agendepro.ratelimit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/** Os limites de produção (application.yml) ficam folgados para equipes atrás do mesmo IP, sem afrouxar o limite por e-mail. */
class RateLimitDefaultsTest {

    private static Properties mainYaml() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application.yml"));
        return yaml.getObject();
    }

    @Test
    void productionDefaultsAreThirtyLoginsAndSixtyAuthCallsPerIp() {
        Properties p = mainYaml();
        assertThat(p.getProperty("app.rate-limit.login-capacity")).isEqualTo("30");
        assertThat(p.getProperty("app.rate-limit.auth-capacity")).isEqualTo("60");
        assertThat(p.getProperty("app.rate-limit.login-failures-per-email")).isEqualTo("5");
    }

    @Test
    void thirtyLoginsPerIpPass_thirtyFirstIsRejected() throws Exception {
        Properties p = mainYaml();
        int login = Integer.parseInt(p.getProperty("app.rate-limit.login-capacity"));
        int auth = Integer.parseInt(p.getProperty("app.rate-limit.auth-capacity"));
        RateLimitFilter filter = new RateLimitFilter(auth, 15, 1000, 1).withRouteLimit("/api/auth/login", login, 15);

        for (int i = 0; i < 30; i++) assertThat(call(filter, "10.9.0.1")).isEqualTo(200);
        assertThat(call(filter, "10.9.0.1")).isEqualTo(429);
        assertThat(call(filter, "10.9.0.2")).isEqualTo(200);
    }

    private int call(RateLimitFilter filter, String ip) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }
}
