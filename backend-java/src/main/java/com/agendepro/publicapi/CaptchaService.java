package com.agendepro.publicapi;

import com.agendepro.common.AppException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Cloudflare Turnstile (captcha gratuito, sem "clique nos semáforos"). Sem TURNSTILE_SECRET_KEY configurada a checagem
 * é pulada (desenvolvimento); em produção defina a chave, senão qualquer robô consegue pedir agendamentos.
 */
@Slf4j
@Service
public class CaptchaService {

    private static final String VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    @Value("${app.captcha.turnstile-secret:}")
    private String secret;

    private final RestClient restClient = RestClient.create();

    public boolean enabled() {
        return secret != null && !secret.isBlank();
    }

    /** Lança 400 se o captcha é obrigatório e o token falta ou é inválido. */
    public void verify(String token, String remoteIp) {
        if (!enabled()) return;
        if (token == null || token.isBlank()) {
            throw new AppException("Confirme que você não é um robô e tente de novo.", 400, "CAPTCHA_REQUIRED");
        }
        boolean ok;
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("secret", secret);
            form.add("response", token);
            if (remoteIp != null && !remoteIp.isBlank()) form.add("remoteip", remoteIp);
            @SuppressWarnings("unchecked")
            Map<String, Object> body = restClient.post().uri(VERIFY_URL)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(Map.class);
            ok = body != null && Boolean.TRUE.equals(body.get("success"));
        } catch (Exception ex) {
            log.error("[captcha] Falha ao validar com a Cloudflare: {}", ex.getMessage());
            throw new AppException("Não foi possível validar a verificação de segurança. Tente de novo em instantes.", 503, "CAPTCHA_UNAVAILABLE");
        }
        if (!ok) throw new AppException("A verificação de segurança falhou. Tente de novo.", 400, "CAPTCHA_FAILED");
    }
}
