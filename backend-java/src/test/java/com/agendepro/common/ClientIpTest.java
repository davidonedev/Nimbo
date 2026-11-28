package com.agendepro.common;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClientIpTest {

    @Test
    void withoutHopsTheFirstValueIsUsed() {
        assertThat(ClientIp.resolve("1.1.1.1, 2.2.2.2", "9.9.9.9", 0)).isEqualTo("1.1.1.1");
    }

    @Test
    void withOneHopTheValueTheProxyAppendedIsUsed_soAForgedHeaderDoesNotHelp() {
        // o cliente mandou "6.6.6.6" e o proxy da hospedagem acrescentou o IP real
        assertThat(ClientIp.resolve("6.6.6.6, 203.0.113.7", "10.0.0.1", 1)).isEqualTo("203.0.113.7");
        assertThat(ClientIp.resolve("203.0.113.7", "10.0.0.1", 1)).isEqualTo("203.0.113.7");
    }

    @Test
    void withTwoHopsItSkipsTheSecondProxy() {
        assertThat(ClientIp.resolve("6.6.6.6, 203.0.113.7, 172.70.0.1", "10.0.0.1", 2)).isEqualTo("203.0.113.7");
    }

    @Test
    void fallsBackToTheConnectionWhenThereIsNoHeader() {
        assertThat(ClientIp.resolve(null, "10.0.0.1", 1)).isEqualTo("10.0.0.1");
        assertThat(ClientIp.resolve("  ", "10.0.0.1", 0)).isEqualTo("10.0.0.1");
    }

    @Test
    void moreHopsThanValuesUsesTheFirstOne() {
        assertThat(ClientIp.resolve("203.0.113.7", "10.0.0.1", 3)).isEqualTo("203.0.113.7");
    }
}
