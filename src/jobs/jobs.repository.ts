import { JobData } from "./jobs.types.js";
import pool from "../db/connection.js";

export const createJob = async (JobData: JobData) => {
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