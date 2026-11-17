package com.agendepro.config;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * Verificações de saúde, públicas (ver SecurityConfig) e FORA do rate limit (o filtro só cobre /api/*).
 * Não tocam o banco de propósito: respondem assim que o servidor aceita conexões, que é o que a plataforma
 * (Render) precisa para considerar o deploy no ar.
 */
@RestController
public class HealthController {

    /** Porta de `app.get('/health', ...)` (app.ts). */
    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "timestamp", Instant.now().toString());
    }

    /**
     * Mesmo caminho e formato do Spring Boot Actuator, sem a dependência (menos classes e beans na subida).
     * Expõe só o status: nada de componentes, detalhes ou versão.
     */
    @GetMapping("/actuator/health")
    public Map<String, String> actuatorHealth() {
        return Map.of("status", "UP");
    }
}
