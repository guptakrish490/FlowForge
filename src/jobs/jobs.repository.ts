import { Job, JobData } from "./jobs.types.js";
import pool from "../db/connection.js";

export const createJob: (JobData: JobData) => Promise<Job> = async (JobData: JobData) => {
    const { type, workload, max_retries, failure_probability, burst_time_ms } = JobData;

    const createJobQuery =
        `INSERT INTO jobs
             (type, workload, max_retries, failure_probability, burst_time_ms, started_at, completed_at)
             VALUES
             ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`;

    const results = await pool.query(createJobQuery, [type, workload, max_retries, failure_probability, burst_time_ms, null, null]);
    return results.rows[0];
}

export const retrieveJobs: () => Promise<Job[]> = async () => {
    const retrieveJobQuery =
        `SELECT * FROM jobs;`

    const results = await pool.query(retrieveJobQuery);
    return results.rows;
}

export const retrieveJobById: (id: string) => Promise<Job> = async (id: string) => {
    const retrieveJobQuery =
        `SELECT * FROM jobs
         WHERE
         id=$1;`

    const results = await pool.query(retrieveJobQuery, [id]);
    return results.rows[0];
}

export const getNextQueuedJobs: (worker_id: string) => Promise<Job[]> = async (worker_id) => {
    const query =
        `UPDATE jobs
         SET
             status='PROCESSING',
             updated_at=NOW(),
             worker_id=$1
         WHERE id IN(
             SELECT id
             FROM jobs
             WHERE status='QUEUED'
             ORDER BY created_at
             FOR UPDATE SKIP LOCKED
             LIMIT $2
         )
         RETURNING *;`

    const bufferSize = Number(process.env.BUFFER_SIZE);
    const result = await pool.query(query, [worker_id, bufferSize]);

    return result.rows;
}

export const updateJob: (job: Job) => Promise<Job> = async (job: Job) => {
    const updateQuery =
        `UPDATE jobs
         SET status=$1, retry_attempt=$2, started_at=$3, completed_at=$4, worker_id=$5, updated_at=NOW()
         WHERE id=$6
         RETURNING *;`

    const result = await pool.query(updateQuery, [job.status, job.retry_attempt, job.started_at, job.completed_at, job.worker_id, job.id]);
    return result.rows[0];
}