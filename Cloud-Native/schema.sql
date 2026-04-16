-- ============================================================
-- AI-Driven Resource Scheduling System — Supabase SQL Schema
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

-- ENUM for roles
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'user');

-- ENUM for schedule status
CREATE TYPE schedule_status AS ENUM ('confirmed', 'cancelled', 'pending');

-- ENUM for recurrence frequency
CREATE TYPE recurrence_freq AS ENUM ('daily', 'weekly', 'monthly');

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(120)  NOT NULL,
    email       VARCHAR(255)  NOT NULL,
    password    VARCHAR(255)  NOT NULL,
    role        user_role     NOT NULL DEFAULT 'user',
    timezone    VARCHAR(80)   NOT NULL DEFAULT 'UTC',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users(email);

-- ============================================================
-- RESOURCES
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(120)  NOT NULL,
    description  TEXT,
    capacity     INT           NOT NULL DEFAULT 1,
    location     VARCHAR(255),
    is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by   UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_resources_name ON resources(name);
CREATE INDEX idx_resources_active ON resources(is_active);

-- ============================================================
-- RECURRING SCHEDULES  (templates)
-- ============================================================
CREATE TABLE IF NOT EXISTS recurring_schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id     UUID          NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(200)  NOT NULL,
    frequency       recurrence_freq NOT NULL,
    day_of_week     SMALLINT,          -- 0=Sun … 6=Sat  (for weekly)
    day_of_month    SMALLINT,          -- 1-31            (for monthly)
    start_time      TIME          NOT NULL,  -- local time of day
    end_time        TIME          NOT NULL,
    recur_start     DATE          NOT NULL,
    recur_end       DATE,
    timezone        VARCHAR(80)   NOT NULL DEFAULT 'UTC',
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recurring_resource ON recurring_schedules(resource_id);
CREATE INDEX idx_recurring_user ON recurring_schedules(user_id);

-- ============================================================
-- SCHEDULES  (individual bookings)
-- ============================================================
CREATE TABLE IF NOT EXISTS schedules (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id           UUID           NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
    user_id               UUID           NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
    recurring_schedule_id UUID           REFERENCES recurring_schedules(id) ON DELETE SET NULL,
    title                 VARCHAR(200)   NOT NULL,
    start_time            TIMESTAMPTZ    NOT NULL,
    end_time              TIMESTAMPTZ    NOT NULL,
    status                schedule_status NOT NULL DEFAULT 'confirmed',
    notes                 TEXT,
    created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_time_order CHECK (end_time > start_time)
);

CREATE INDEX idx_schedules_resource_time ON schedules(resource_id, start_time, end_time);
CREATE INDEX idx_schedules_user          ON schedules(user_id);
CREATE INDEX idx_schedules_status        ON schedules(status);
CREATE INDEX idx_schedules_start         ON schedules(start_time);

-- Prevent exact duplicate bookings
CREATE UNIQUE INDEX idx_schedules_no_exact_dup
    ON schedules(resource_id, start_time, end_time)
    WHERE status = 'confirmed';

-- ============================================================
-- BOOKING HISTORY  (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS booking_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id   UUID          NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    changed_by    UUID          NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
    action        VARCHAR(50)   NOT NULL,   -- 'created', 'cancelled', 'updated'
    old_status    schedule_status,
    new_status    schedule_status,
    notes         TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_hist_schedule ON booking_history(schedule_id);
CREATE INDEX idx_booking_hist_user     ON booking_history(changed_by);

-- ============================================================
-- Helper function: updated_at auto-update trigger
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_resources_updated_at
    BEFORE UPDATE ON resources
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recurring_updated_at
    BEFORE UPDATE ON recurring_schedules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();