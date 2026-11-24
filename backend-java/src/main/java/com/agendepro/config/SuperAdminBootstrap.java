package com.agendepro.config;

import com.agendepro.user.User;
import com.agendepro.user.UserRepository;
import com.agendepro.user.UserRole;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Optional;

/**
 * Cria o primeiro super admin a partir de variáveis de ambiente, para quando não há acesso ao banco para inseri-lo.
 * Só age se as duas variáveis estiverem preenchidas, nunca altera um usuário que já existe e não grava a senha em log.
 * Depois do primeiro acesso, remova {@code BOOTSTRAP_SUPER_ADMIN_PASSWORD} do ambiente.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SuperAdminBootstrap implements CommandLineRunner {

    static final int MIN_PASSWORD_LENGTH = 10;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.bootstrap.super-admin.email:}")
    private String email;

    @Value("${app.bootstrap.super-admin.password:}")
    private String password;

    @Value("${app.bootstrap.super-admin.name:Super Admin}")
    private String name;

    @Override
    @Transactional
    public void run(String... args) {
        if (email.isBlank() && password.isBlank()) return;
        if (email.isBlank() || password.isBlank()) {
            log.warn("[bootstrap] Super admin não criado: preencha BOOTSTRAP_SUPER_ADMIN_EMAIL e BOOTSTRAP_SUPER_ADMIN_PASSWORD.");
            return;
        }

        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (!normalized.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            log.warn("[bootstrap] Super admin não criado: e-mail inválido.");
            return;
        }
        if (password.length() < MIN_PASSWORD_LENGTH) {
            log.warn("[bootstrap] Super admin não criado: a senha precisa ter pelo menos {} caracteres.", MIN_PASSWORD_LENGTH);
            return;
        }

        Optional<User> existing = userRepository.findByEmail(normalized);
        if (existing.isPresent()) {
            if (existing.get().getRole() == UserRole.SUPER_ADMIN) {
                log.info("[bootstrap] {} já é super admin; nada a fazer.", normalized);
            } else {
                log.warn("[bootstrap] Já existe um usuário com o e-mail {} que não é super admin; use outro e-mail.", normalized);
            }
            return;
        }

        userRepository.save(User.builder()
                .name(name.isBlank() ? "Super Admin" : name.trim())
                .email(normalized)
                .passwordHash(passwordEncoder.encode(password))
                .role(UserRole.SUPER_ADMIN)
                .build());
        log.info("[bootstrap] Super admin {} criado. Remova BOOTSTRAP_SUPER_ADMIN_PASSWORD do ambiente.", normalized);
    }
}
