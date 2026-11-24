package com.agendepro.appointment;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import com.agendepro.common.AppException;

public enum AppointmentStatus {
    PENDING("pending"),
    CONFIRMED("confirmed"),
    COMPLETED("completed"),
    CANCELLED("cancelled"),
    NO_SHOW("no_show");

    private final String value;

    AppointmentStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    /** Mesmas ações que o painel oferece (appointmentFilters.statusActionsFor); concluído e cancelado são finais. */
    public boolean canTransitionTo(AppointmentStatus next) {
        return switch (this) {
            case PENDING -> next == CONFIRMED || next == COMPLETED || next == NO_SHOW || next == CANCELLED;
            case CONFIRMED -> next == COMPLETED || next == NO_SHOW || next == CANCELLED;
            case NO_SHOW -> next == CANCELLED;
            case COMPLETED, CANCELLED -> false;
        };
    }

    public String label() {
        return switch (this) {
            case PENDING -> "pendente";
            case CONFIRMED -> "confirmado";
            case COMPLETED -> "concluído";
            case CANCELLED -> "cancelado";
            case NO_SHOW -> "marcado como falta";
        };
    }

    @JsonCreator
    public static AppointmentStatus fromValue(String value) {
        for (AppointmentStatus s : values()) {
            if (s.value.equals(value)) return s;
        }
        throw new AppException("Status de agendamento inválido: " + value, 400);
    }
}
