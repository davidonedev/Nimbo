package com.agendepro.audit;

import com.agendepro.notification.WhatsappService;
import org.junit.jupiter.api.Test;

import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * AUDITORIA — timeout do provedor de WhatsApp. Sem Spring e sem rede externa: um servidor local aceita a conexão e nunca
 * responde (simula provedor travado). Nenhuma mensagem real é enviada.
 */
class WhatsappTimeoutAuditTest {

    @Test
    void gap_aHangingProviderBlocksTheCallerThread_thereIsNoTimeout() throws Exception {
        // documenta lacuna: RestClient.create() sem timeout — /book (sendNow) ficaria preso com a thread HTTP até o provedor responder
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
            WhatsappService svc = new WhatsappService();
            var cfg = new WhatsappService.TenantWhatsappConfig("http://127.0.0.1:" + server.getLocalPort(), "chave", "instancia");
            Future<WhatsappService.SendResult> call = pool.submit(() -> svc.sendNow(cfg, "5519999990000", "teste"));

            assertThatThrownBy(() -> call.get(5, TimeUnit.SECONDS)).isInstanceOf(TimeoutException.class); // ainda preso após 5 s

            if (held[0] != null) held[0].close(); // libera a thread
            assertThat(call.get(10, TimeUnit.SECONDS)).isEqualTo(WhatsappService.SendResult.FAILED);
        } finally {
            pool.shutdownNow();
            server.close();
        }
    }
}
