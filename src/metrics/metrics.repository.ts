import pool from "../db/connection.js";
import {
    finalizedJobStats,
    metricsBody,
    outcomeResult,
    statusResult
} from "./metrics.types.js";

export const storeJobAttempt: (jobId: string, attempt_number: number, start: Date, finish: Date, outcome: 'SUCCEEDED' | 'RETRYABLE_FAILURE' | 'TERMINAL_FAILURE') => Promise<metricsBody> = async (jobId, attempt_number, start, finish, outcome) => {
    // Store one completed processing attempt for historical metrics.
    const query =
        `INSERT INTO jobs_attempts
                (job_id, attempt_number, started_at, finished_at, outcome)
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING *;`

    const result = await pool.query(query, [jobId, attempt_number, start, finish, outcome]);

    return result.rows[0];
}

export const getCurrentJobStateCount: () => Promise<statusResult> = async () => {
    // Return the current queue snapshot; this query is not window-based.
    const query =
        `SELECT status, count(*) FROM jobs
         GROUP BY status;`

    const result = await pool.query(query);

    return result.rows;
}

export const getJobOutcome: (windowMins: number) => Promise<outcomeResult> = async (windowMins) => {
    // Count attempt outcomes completed inside the requested window.
    const query =
        `SELECT outcome, count(id) FROM jobs_attempts
         WHERE
            finished_at>=NOW()-($1 * INTERVAL '1 minute')
            AND finished_at IS NOT NULL
            AND started_at IS NOT NULL
         GROUP BY outcome;`

    const result = await pool.query(query, [windowMins]);

    return result.rows;
}

export const getAverageProcessingTime: (windowMins: number) => Promise<number> = async (windowMins) => {
    // Average attempt duration: finished_at - started_at.
    const query =
        `SELECT AVG(EXTRACT(EPOCH FROM 
        (
            finished_at-started_at))*1000
        ) AS avg_processing_time_ms
         FROM jobs_attempts
         WHERE finished_at>=NOW()-($1 * INTERVAL '1 minute')
         AND finished_at IS NOT NULL
         AND started_at IS NOT NULL;`

    const result = await pool.query(query, [windowMins]);

    return result.rows[0].avg_processing_time_ms;
}

export const getAverageCompletionTime: (windowMins: number) => Promise<number> = async (windowMins) => {
    // Average end-to-end duration: completed_at - created_at.
    const query =
        `SELECT AVG(EXTRACT(EPOCH FROM
        (
            completed_at-created_at))*1000
        ) AS avg_completion_time_ms
         FROM jobs
         WHERE status='COMPLETED'
         AND completed_at>=NOW()-($1 * INTERVAL '1 minute')
         AND completed_at IS NOT NULL
         AND created_at IS NOT NULL;`

    const result = await pool.query(query, [windowMins]);

    return result.rows[0].avg_completion_time_ms;
}

export const getAverageQueueWaitTime: (windowMins: number) => Promise<number> = async (windowMins) => {
    // Average time from job creation until an attempt starts.
    const query =
        `SELECT AVG(EXTRACT(EPOCH FROM
            (
                attempts.started_at-jobs.created_at))*1000
            ) AS avg_queue_wait_time_ms
         FROM jobs_attempts attempts
         JOIN jobs ON jobs.id=attempts.job_id
         WHERE
            attempts.finished_at>=NOW()-($1 * INTERVAL '1 minute')
            AND attempts.finished_at IS NOT NULL
            AND attempts.started_at IS NOT NULL
            AND jobs.created_at IS NOT NULL;`

    const result = await pool.query(query, [windowMins]);

    return result.rows[0].avg_queue_wait_time_ms;
}

export const getFinalizedJobStats: (windowMins: number) => Promise<finalizedJobStats> = async (windowMins) => {
    // Return finalized job count and completion bounds for throughput metrics.
    const query =
        `SELECT
            COUNT(DISTINCT job_id) AS count,
            MIN(finished_at) AS first_finished_at,
            MAX(finished_at) AS last_finished_at
         FROM jobs_attempts
         WHERE finished_at>=NOW()-($1 * INTERVAL '1 minute')
         AND finished_at IS NOT NULL
         AND outcome IN ('SUCCEEDED', 'TERMINAL_FAILURE');`

    const result = await pool.query(query, [windowMins]);

    return result.rows[0];
}
