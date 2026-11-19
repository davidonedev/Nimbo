package com.agendepro.publicapi;

import com.agendepro.common.AppException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limite de pedidos de agendamento por IP (janela deslizante, em memória). Protege o agendamento sem confirmação
 * por código: sem isso um script poderia lotar a agenda de pendentes.
 */
@Component
public class BookingAttemptLimiter {

    private final int capacity;
    private final Duration window;
    private final Map<String, Deque<Instant>> hits = new ConcurrentHashMap<>();

    public BookingAttemptLimiter(@Value("${app.booking.max-attempts-per-ip:10}") int capacity,
                                 @Value("${app.booking.window-minutes:15}") int windowMinutes) {
        this.capacity = capacity;
        this.window = Duration.ofMinutes(windowMinutes);
    }

    /** Registra uma tentativa; lança 429 se o IP passou do limite na janela. */
    public void check(String ip) {
        String key = ip == null || ip.isBlank() ? "unknown" : ip;
        Instant now = Instant.now();
        Deque<Instant> deque = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (deque) {
            while (!deque.isEmpty() && deque.peekFirst().isBefore(now.minus(window))) deque.pollFirst();
            if (deque.size() >= capacity) {
                throw new AppException("Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.", 429, "TOO_MANY_REQUESTS");
            }
            deque.addLast(now);
        }
        if (hits.size() > 10_000) hits.entrySet().removeIf(e -> e.getValue().isEmpty()); // não deixa crescer sem fim
    }
}
