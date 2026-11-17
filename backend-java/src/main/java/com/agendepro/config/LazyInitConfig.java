package com.agendepro.config;

import com.agendepro.reminder.ReminderService;
import org.springframework.boot.LazyInitializationExcludeFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Em produção a subida usa `spring.main.lazy-initialization=true` (application-prod.yml) para o Spring não criar,
 * na partida, beans que só serão usados quando chegar uma requisição.
 *
 * Beans com tarefas agendadas NÃO podem ser preguiçosos: o `@Scheduled` só é registrado quando o bean é criado,
 * e ninguém injeta o ReminderService em outro bean. Sem esta exclusão os lembretes automáticos nunca disparariam.
 * Se criar outro bean com `@Scheduled`, inclua-o aqui.
 */
@Configuration(proxyBeanMethods = false)
public class LazyInitConfig {

    @Bean
    static LazyInitializationExcludeFilter eagerBeans() {
        return LazyInitializationExcludeFilter.forBeanTypes(ReminderService.class);
    }
}
