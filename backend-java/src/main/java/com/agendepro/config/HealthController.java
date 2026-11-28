package com.agendepro.config;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * Verificações de saúde, públicas (ver SecurityConfig) e FORA do rate limit (o filtro só cobre /api/*).
 * {@code /health} não toca o banco de propósito: responde assim que o servidor aceita conexões, que é o que a plataforma
 * (Render) precisa para considerar o deploy no ar. {@code /health/deep} confere também o banco: use-o no monitor
 * externo (UptimeRobot), porque ele fica vermelho quando o banco pausa ou cai.
 */
@RestController
@RequiredArgsConstructor
public class HealthController {

    private final JdbcTemplate jdbc;

    /** Porta de `app.get('/health', ...)` (app.ts). */
    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "timestamp", Instant.now().toString());
    }

    /** 200 com o banco respondendo; 503 quando não responde (o monitor externo avisa). */
    @GetMapping("/health/deep")
    public ResponseEntity<Map<String, Object>> deep() {
        try {
            Integer one = jdbc.queryForObject("select 1", Integer.class);
            if (one != null && one == 1) {
                return ResponseEntity.ok(Map.of("status", "ok", "database", "ok", "timestamp", Instant.now().toString()));
            }
        } catch (Exception ignored) {
            // cai no 503 abaixo; o motivo fica no log da plataforma, não na resposta pública
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("status", "down", "database", "down", "timestamp", Instant.now().toString()));
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
