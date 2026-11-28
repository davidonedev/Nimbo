package com.agendepro.appointment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AppointmentRepository extends JpaRepository<Appointment, UUID>, JpaSpecificationExecutor<Appointment> {

    Optional<Appointment> findByIdAndTenantId(UUID id, UUID tenantId);

    Optional<Appointment> findByIdAndTenantIdAndClientId(UUID id, UUID tenantId, UUID clientId);

    List<Appointment> findByTenantIdAndDateOrderByStartTimeAsc(UUID tenantId, String date);

    List<Appointment> findByTenantIdAndClientIdOrderByDateAscStartTimeAsc(UUID tenantId, UUID clientId);

    long countByTenantIdAndStatus(UUID tenantId, AppointmentStatus status);

    /** Horários que o cliente (por celular) deixou aguardando confirmação — trava de abuso. */
    long countByTenantIdAndClientIdAndStatusAndConfirmByIsNotNull(UUID tenantId, UUID clientId, AppointmentStatus status);

    /** Pendentes que o cliente já confirmou pelo WhatsApp e aguardam o dono (sem prazo) — também contam no limite por celular. */
    long countByTenantIdAndClientIdAndStatusAndClientConfirmedAtIsNotNull(UUID tenantId, UUID clientId, AppointmentStatus status);

    /** Pendentes que o cliente já confirmou, nas datas informadas — base dos avisos ao dono (OwnerPendingReminderService). */
    List<Appointment> findByStatusAndClientConfirmedAtIsNotNullAndDateIn(AppointmentStatus status, java.util.Collection<String> dates);

    List<Appointment> findByTenantIdAndIdIn(UUID tenantId, java.util.Collection<UUID> ids);

    /**
     * Libera os horários que ninguém confirmou até o prazo (pendente + confirm_by vencido → cancelado).
     * Devolve quantos foram liberados.
     */
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @Query("""
            UPDATE Appointment a SET a.status = com.agendepro.appointment.AppointmentStatus.CANCELLED, a.updatedAt = :now
            WHERE a.status = com.agendepro.appointment.AppointmentStatus.PENDING
              AND a.confirmBy IS NOT NULL AND a.confirmBy < :now
            """)
    int expireUnconfirmed(@Param("now") java.time.Instant now);

    /**
     * Cancela os pendentes cujo horário de início já passou além da folga. date/start_time são texto no horário de
     * Brasília ('yyyy-MM-dd' e 'HH:mm'), então o corte (agora - folga, em Brasília) é calculado no Java e comparado
     * como texto: início &lt; corte  ⇔  data &lt; dataCorte  OU  (data = dataCorte E hora &lt; horaCorte).
     */
    @Query("""
            SELECT a FROM Appointment a
            WHERE a.status = com.agendepro.appointment.AppointmentStatus.PENDING
              AND (a.date < :cutoffDate OR (a.date = :cutoffDate AND a.startTime < :cutoffTime))
            """)
    List<Appointment> findPendingPastStart(@Param("cutoffDate") String cutoffDate, @Param("cutoffTime") String cutoffTime);

    /**
     * Pendentes que o cliente já deixou em mãos do estabelecimento (sem prazo do cliente: confirm_by nulo) e ainda não
     * receberam o aviso de cancelamento automático, nas datas informadas.
     */
    List<Appointment> findByStatusAndConfirmByIsNullAndExpiryWarnedAtIsNullAndDateIn(AppointmentStatus status, java.util.Collection<String> dates);

    long countByTenantId(UUID tenantId);

    /** Agendamentos que mudaram para o status informado na janela [from, to) (usa updatedAt). */
    long countByTenantIdAndStatusAndUpdatedAtGreaterThanEqualAndUpdatedAtLessThan(
            UUID tenantId, AppointmentStatus status, java.time.Instant from, java.time.Instant to);

    /** Agendamentos não cancelados entre duas datas (yyyy-MM-dd, inclusive). */
    List<Appointment> findByTenantIdAndDateBetweenAndStatusNot(UUID tenantId, String from, String to, AppointmentStatus status);

    /** Próximos agendamentos ativos a partir de (today, nowTime), em ordem cronológica. */
    @Query("""
            SELECT a FROM Appointment a
            WHERE a.tenantId = :tenantId AND a.status IN :statuses
              AND (a.date > :today OR (a.date = :today AND a.startTime >= :nowTime))
            ORDER BY a.date ASC, a.startTime ASC
            """)
    List<Appointment> findUpcoming(@Param("tenantId") UUID tenantId, @Param("statuses") List<AppointmentStatus> statuses,
                                   @Param("today") String today, @Param("nowTime") String nowTime,
                                   org.springframework.data.domain.Pageable pageable);

    boolean existsByTenantIdAndProfessionalIdAndClientId(UUID tenantId, UUID professionalId, UUID clientId);

    long countByProfessionalId(UUID professionalId);

    long countByClientId(UUID clientId);

    long countByServiceId(UUID serviceId);

    List<Appointment> findByTenantIdAndProfessionalIdOrderByDateDesc(UUID tenantId, UUID professionalId, org.springframework.data.domain.Pageable pageable);

    @Query("SELECT COALESCE(SUM(a.price), 0) FROM Appointment a WHERE a.tenantId = :tenantId AND a.status = :status")
    double sumPriceByTenantIdAndStatus(@Param("tenantId") UUID tenantId, @Param("status") AppointmentStatus status);

    @Query("SELECT COALESCE(SUM(a.price), 0) FROM Appointment a WHERE a.status = :status")
    double sumPriceByStatus(@Param("status") AppointmentStatus status);

    long countByStatus(AppointmentStatus status);

    /** Agendamentos futuros (pendentes ou confirmados) que seriam apagados junto com o profissional, o serviço ou o cliente. */
    @Query("""
            SELECT COUNT(a) FROM Appointment a
            WHERE a.tenantId = :tenantId AND a.professionalId = :id AND a.date >= :today
              AND a.status IN (com.agendepro.appointment.AppointmentStatus.PENDING, com.agendepro.appointment.AppointmentStatus.CONFIRMED)
            """)
    long countUpcomingByProfessional(@Param("tenantId") UUID tenantId, @Param("id") UUID id, @Param("today") String today);

    @Query("""
            SELECT COUNT(a) FROM Appointment a
            WHERE a.tenantId = :tenantId AND a.serviceId = :id AND a.date >= :today
              AND a.status IN (com.agendepro.appointment.AppointmentStatus.PENDING, com.agendepro.appointment.AppointmentStatus.CONFIRMED)
            """)
    long countUpcomingByService(@Param("tenantId") UUID tenantId, @Param("id") UUID id, @Param("today") String today);

    @Query("""
            SELECT COUNT(a) FROM Appointment a
            WHERE a.tenantId = :tenantId AND a.clientId = :id AND a.date >= :today
              AND a.status IN (com.agendepro.appointment.AppointmentStatus.PENDING, com.agendepro.appointment.AppointmentStatus.CONFIRMED)
            """)
    long countUpcomingByClient(@Param("tenantId") UUID tenantId, @Param("id") UUID id, @Param("today") String today);

    /** Horário ocupado por um agendamento (só leitura, direto do banco). */
    interface OccupiedSlot {
        UUID getId();

        String getStartTime();

        String getEndTime();
    }

    /**
     * Horários ocupados (agendamentos não cancelados) de um profissional num dia — usado na disponibilidade.
     * Projeção de propósito: devolve o que está no banco AGORA, sem reaproveitar uma entidade carregada antes do lock
     * (uma remarcação concorrente deixava o horário antigo na sessão e permitia reservar o mesmo horário duas vezes).
     */
    @Query("""
            SELECT a.id AS id, a.startTime AS startTime, a.endTime AS endTime FROM Appointment a
            WHERE a.tenantId = :tenantId AND a.professionalId = :professionalId AND a.date = :date
              AND a.status <> com.agendepro.appointment.AppointmentStatus.CANCELLED
            """)
    List<OccupiedSlot> findOccupiedByProfessionalAndDate(
            @Param("tenantId") UUID tenantId, @Param("professionalId") UUID professionalId, @Param("date") String date);

    /** Porta de checkConflict() (schedule.service.ts): sobreposição de horário. */
    @Query("""
            SELECT COUNT(a) > 0 FROM Appointment a
            WHERE a.tenantId = :tenantId AND a.professionalId = :professionalId AND a.date = :date
              AND a.status <> com.agendepro.appointment.AppointmentStatus.CANCELLED
              AND a.startTime < :endTime AND a.endTime > :startTime
            """)
    boolean hasConflict(
            @Param("tenantId") UUID tenantId,
            @Param("professionalId") UUID professionalId,
            @Param("date") String date,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime);

    /** Igual a hasConflict, ignorando um agendamento (reagendamento). Sem ":p IS NULL" para não depender da tipagem do parâmetro nulo. */
    @Query("""
            SELECT COUNT(a) > 0 FROM Appointment a
            WHERE a.tenantId = :tenantId AND a.professionalId = :professionalId AND a.date = :date
              AND a.status <> com.agendepro.appointment.AppointmentStatus.CANCELLED
              AND a.startTime < :endTime AND a.endTime > :startTime
              AND a.id <> :excludeId
            """)
    boolean hasConflictExcluding(
            @Param("tenantId") UUID tenantId,
            @Param("professionalId") UUID professionalId,
            @Param("date") String date,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("excludeId") UUID excludeId);

    /**
     * Agendamentos CONFIRMADOS que precisam de lembrete de 24h: início (Brasília) entre 20h e 25h a partir de agora,
     * sem lembrete enfileirado. O piso de 20h recupera o atraso de até 3h de um serviço que dormiu (Render free).
     */
    @Query(value = """
            SELECT * FROM appointments
            WHERE status = 'confirmed'
              AND reminder_24h_sent_at IS NULL
              AND (date || 'T' || start_time || ':00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
                  BETWEEN (now() + interval '20 hours') AND (now() + interval '25 hours')
            """, nativeQuery = true)
    List<Appointment> findNeedingReminder24h();

    /**
     * Agendamentos CONFIRMADOS que precisam de lembrete de 2h: início (Brasília) entre 30 min e 2h30 a partir de agora,
     * sem lembrete enfileirado. Faltando menos de 30 min o lembrete já não ajuda.
     */
    @Query(value = """
            SELECT * FROM appointments
            WHERE status = 'confirmed'
              AND reminder_2h_sent_at IS NULL
              AND (date || 'T' || start_time || ':00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
                  BETWEEN (now() + interval '30 minutes') AND (now() + interval '150 minutes')
            """, nativeQuery = true)
    List<Appointment> findNeedingReminder2h();

    Optional<Appointment> findByPaymentId(String paymentId);

    /** Porta de listAbsentClients (reminder.controller.ts) — último agendamento não cancelado por cliente. */
    @Query("""
            SELECT a FROM Appointment a
            WHERE a.clientId IN :clientIds AND a.status <> com.agendepro.appointment.AppointmentStatus.CANCELLED
            ORDER BY a.date DESC
            """)
    List<Appointment> findActiveByClientIds(@Param("clientIds") List<UUID> clientIds);
}
