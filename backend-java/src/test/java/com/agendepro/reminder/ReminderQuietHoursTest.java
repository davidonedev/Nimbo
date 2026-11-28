package com.agendepro.reminder;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ReminderQuietHoursTest {

    @Test
    void noRemindersFrom22hTo7h() {
        for (int h : new int[]{22, 23, 0, 3, 6}) assertThat(ReminderService.isQuietHour(h)).as("hora %d", h).isTrue();
        for (int h : new int[]{7, 8, 12, 18, 21}) assertThat(ReminderService.isQuietHour(h)).as("hora %d", h).isFalse();
    }
}
