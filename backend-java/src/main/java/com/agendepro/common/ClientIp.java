package com.agendepro.common;

import jakarta.servlet.http.HttpServletRequest;

/**
 * IP de origem da requisição, usado nos limites de tentativas.
 *
 * <p>O cabeçalho X-Forwarded-For é escrito pelo cliente e cada proxy acrescenta o IP de quem o chamou ao FINAL da lista:
 * só os valores que os NOSSOS proxies acrescentaram são confiáveis. Por isso o valor vem de trás para frente:
 * {@code proxyHops = 1} usa o último valor (o IP que o proxy da hospedagem viu), {@code 2} o penúltimo, e assim por
 * diante. Com {@code 0} (padrão, até a hospedagem ser verificada) vale o primeiro valor, que o cliente consegue forjar.
 * Configure com CLIENT_IP_PROXY_HOPS depois de olhar /api/super/diagnostics/client-ip em produção.
 */
public final class ClientIp {

    private static volatile int proxyHops = 0;

    private ClientIp() {
    }

    public static void configure(int hops) {
        proxyHops = Math.max(0, hops);
    }

    public static String of(HttpServletRequest request) {
        return resolve(request.getHeader("X-Forwarded-For"), request.getRemoteAddr(), proxyHops);
    }

    public static int hops() {
        return proxyHops;
    }

    /** Lógica pura (testável): escolhe o IP na lista do X-Forwarded-For. */
    public static String resolve(String forwardedFor, String remoteAddr, int hops) {
        if (forwardedFor == null || forwardedFor.isBlank()) return remoteAddr;
        String[] parts = forwardedFor.split(",");
        if (hops <= 0) return parts[0].trim();
        int index = parts.length - hops;
        String chosen = parts[index >= 0 ? index : 0].trim();
        return chosen.isEmpty() ? remoteAddr : chosen;
    }
}
