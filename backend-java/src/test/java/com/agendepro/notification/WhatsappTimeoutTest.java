package com.agendepro.notification;

import org.junit.jupiter.api.Test;

import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Provedor de WhatsApp travado: um servidor local aceita a conexão e nunca responde. O envio precisa falhar sozinho
 * dentro do timeout em vez de prender a thread (HTTP do /book ou a única thread dos agendadores). Nada real é enviado.
 */
class WhatsappTimeoutTest {

    @Test
    void aHangingProviderFailsAfterTheReadTimeout_insteadOfBlockingTheCaller() throws Exception {
        ServerSocket server = new ServerSocket(0);
        Socket[] held = new Socket[1];
        Thread acceptor = new Thread(() -> {
            try {
                held[0] = server.accept(); // aceita e fica calado
            } catch (Exception ignored) {
                // servidor fechado ao fim do teste
            }
        });
        acceptor.setDaemon(true);
        acceptor.start();

        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            WhatsappService svc = new WhatsappService(500, 1_000);
            var cfg = new WhatsappService.TenantWhatsappConfig("http://127.0.0.1:" + server.getLocalPort(), "chave", "instancia");

            long start = System.nanoTime();
            Future<WhatsappService.SendResult> call = pool.submit(() -> svc.sendNow(cfg, "5519999990000", "teste"));

            assertThat(call.get(8, TimeUnit.SECONDS)).isEqualTo(WhatsappService.SendResult.FAILED);
            assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start)).isLessThan(5_000);
        } finally {
            pool.shutdownNow();
            if (held[0] != null) held[0].close();
            server.close();
        }
    }
}
