package com.agendepro.config;

import com.agendepro.common.ClientIp;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Aplica app.client-ip.proxy-hops (CLIENT_IP_PROXY_HOPS) ao ClientIp. */
@Component
public class ClientIpConfig {

    @Value("${app.client-ip.proxy-hops:0}")
    private int proxyHops;

    @PostConstruct
    void apply() {
        ClientIp.configure(proxyHops);
    }
}
