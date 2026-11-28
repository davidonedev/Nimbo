package com.agendepro.notification;

import com.agendepro.common.AppException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class UrlSafetyTest {

    @Test
    void aPublicHttpsAddressIsAccepted() {
        UrlSafety.requirePublicHttpUrl("https://8.8.8.8/evolution", false);
        UrlSafety.requirePublicHttpUrl("https://api.exemplo-que-nao-existe-nimbo.invalid", false); // não resolve: aceita
    }

    @Test
    void internalAddressesAreRefused() {
        for (String url : new String[]{
                "http://localhost:8080", "http://127.0.0.1", "http://10.0.0.5/x", "http://192.168.1.10", "http://172.16.0.1",
                "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://0.0.0.0", "http://100.64.1.1", "http://servico.internal"}) {
            assertThatThrownBy(() -> UrlSafety.requirePublicHttpUrl(url, false)).as(url)
                    .isInstanceOf(AppException.class).hasMessageContaining("URL da API do WhatsApp");
        }
    }

    @Test
    void otherSchemesAndCredentialsAreRefused() {
        for (String url : new String[]{"file:///etc/passwd", "ftp://servidor", "https://usuario:senha@exemplo.com", "exemplo.com", "http://"}) {
            assertThatThrownBy(() -> UrlSafety.requirePublicHttpUrl(url, false)).as(url).isInstanceOf(AppException.class);
        }
    }

    @Test
    void developmentCanAllowPrivateAddressesButStillOnlyHttp() {
        UrlSafety.requirePublicHttpUrl("http://127.0.0.1:4599", true);
        assertThatThrownBy(() -> UrlSafety.requirePublicHttpUrl("file:///etc/passwd", true)).isInstanceOf(AppException.class);
    }
}
