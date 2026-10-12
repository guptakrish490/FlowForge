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
             worker_id=$1,
             claimed_at=NOW(),
             updated_at=NOW()
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
         SET 
            status=$1, 
            retry_attempt=$2, 
            started_at=$3, 
            completed_at=$4, 
            worker_id=null,
            claimed_at=null,
            updated_at=NOW()
         WHERE 
            id=$5
            AND status='PROCESSING'
            AND worker_id=$6
         RETURNING *;`

    const result = await pool.query(updateQuery, [job.status, job.retry_attempt, job.started_at, job.completed_at, job.id, job.worker_id]);
    const updatedJob = result.rows[0];

    if (!updatedJob) {
        throw new Error(
            `UPDATE returned no row for job ${job.id}. ` +
            `Expected status=PROCESSING and worker_id=${job.worker_id}`
        );
    }

    return updatedJob;
}

export const recoverStaleJob: () => Promise<Job[]> = async () => {
    const timeout = Number(process.env.JOB_LEASE_TIMEOUT_MS);

    if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error("JOB_LEASE_TIMEOUT_MS must be a positive number");
    }

    const query =
        `UPDATE jobs
         SET
            retry_attempt=retry_attempt+1,

            status=CASE
                WHEN retry_attempt+1<=max_retries
                THEN 'QUEUED'
                ELSE 'FAILED'
            END,

            worker_id=null,
            claimed_at=null,
            started_at=null,
            completed_at=null,
            updated_at=now()

            WHERE
                status='PROCESSING'
                AND worker_id IS NOT NULL
                AND claimed_at<NOW()-($1 * INTERVAL '1 millisecond')
         RETURNING *;`

    const result = await pool.query(query, [timeout]);

    return result.rows;
}

export const releaseBufferedJobs = async (workerId: string, jobIds: string[]): Promise<Job[]> => {
    if (jobIds.length === 0) return [];

    const query =
        `UPDATE jobs
         SET
            status='QUEUED',
            worker_id=null,
            claimed_at=null,
            started_at=null,
            completed_at=null,
            updated_at=now()
        WHERE
            id=ANY($1::uuid[])
            AND status='PROCESSING'
            AND worker_id=$2
        RETURNING *;`

    const result = await pool.query(query, [jobIds, workerId]);

    return result.rows;
}

export const renewWorkerLeases = async (workerId: string): Promise<void> => {
    const query =
        `UPDATE jobs
         SET
            claimed_at=now(),
            updated_at=now()
         WHERE
            status='PROCESSING'
            AND worker_id= $1;`

    await pool.query(query, [workerId]);
}