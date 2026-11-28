package com.agendepro.notification;

import com.agendepro.common.AppException;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

/**
 * A URL da API de WhatsApp é digitada pelo dono do estabelecimento e o servidor faz a chamada. Sem esta checagem ele
 * poderia apontá-la para a rede interna do servidor (SSRF). Aceita só http(s) para um endereço público.
 */
public final class UrlSafety {

    private UrlSafety() {
    }

    /** Lança 400 se a URL não é http(s) com um endereço público. {@code allowPrivate=true} só em teste/desenvolvimento. */
    public static void requirePublicHttpUrl(String url, boolean allowPrivate) {
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (IllegalArgumentException e) {
            throw invalid("Endereço inválido.");
        }
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw invalid("O endereço precisa começar com http:// ou https://.");
        }
        if (uri.getUserInfo() != null) throw invalid("O endereço não pode ter usuário e senha.");
        String host = uri.getHost();
        if (host == null || host.isBlank()) throw invalid("Endereço sem servidor.");
        if (allowPrivate) return;

        String lower = host.toLowerCase();
        if (lower.equals("localhost") || lower.endsWith(".localhost") || lower.endsWith(".internal") || lower.endsWith(".local")) {
            throw invalid("Informe o endereço público da API (não localhost nem rede interna).");
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            return; // nome que não resolve não alcança nada interno; a falha de envio aparece depois, na fila
        }
        for (InetAddress a : addresses) {
            if (isInternal(a)) throw invalid("Informe o endereço público da API (não localhost nem rede interna).");
        }
    }

    static boolean isInternal(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress() || a.isMulticastAddress()) {
            return true;
        }
        byte[] b = a.getAddress();
        if (b.length == 4) {
            int first = b[0] & 0xff;
            int second = b[1] & 0xff;
            if (first == 100 && second >= 64 && second <= 127) return true; // 100.64.0.0/10 (CGNAT)
            if (first == 0) return true;
        } else if (b.length == 16) {
            return (b[0] & 0xfe) == 0xfc; // fc00::/7 (endereços locais únicos)
        }
        return false;
    }

    private static AppException invalid(String message) {
        return new AppException("URL da API do WhatsApp: " + message, 400, "INVALID_WHATSAPP_URL");
    }
}
