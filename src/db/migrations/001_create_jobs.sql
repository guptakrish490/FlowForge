CREATE TABLE
    jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        type VARCHAR(50) NOT NULL,
        workload VARCHAR(10) NOT NULL CHECK (workload in ('LOW', 'MEDIUM', 'HIGH')),
        max_retries INTEGER NOT NULL CHECK (max_retries >= 0),
        failure_probability REAL NOT NULL CHECK (
            failure_probability >= 0
            AND failure_probability <= 1
        ),
        burst_time_ms INTEGER NOT NULL CHECK (burst_time_ms > 0),
        status VARCHAR DEFAULT 'QUEUED' CHECK (
            status in ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')
        ),
        retry_attempt INTEGER DEFAULT 0 CHECK (retry_attempt >= 0),
        created_at TIMESTAMPTZ DEFAULT now (),
        updated_at TIMESTAMPTZ DEFAULT now (),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
    )