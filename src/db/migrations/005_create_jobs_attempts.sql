CREATE TABLE
    jobs_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        job_id UUID NOT NULL REFERENCES jobs (id),
        attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ,
        outcome VARCHAR(30) CHECK (
            outcome IN (
                'SUCCEEDED',
                'RETRYABLE_FAILURE',
                'TERMINAL_FAILURE'
            )
        ),
        UNIQUE (job_id, attempt_number),
        CHECK (finished_at >= started_at)
    );

CREATE INDEX idx_job_attempt_finished_at ON jobs_attempts (finished_at);