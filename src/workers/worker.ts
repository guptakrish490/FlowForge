import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { prefetchJobs, processJob, wait } from "./worker.processor.js";
import { Job } from '../jobs/jobs.types.js';
import { recoverStaleJob, releaseBufferedJobs } from '../jobs/jobs.repository.js';
import pool from '../db/connection.js';

// worker id
const workerId = `worker-${process.argv[2] ?? "unknown"}`;

// handle graceful shutdown
let isShuttingDown = false;
const handleShutDown = (signal: string) => {
    if (isShuttingDown) {
        return;
    }

    console.log(`[${workerId}] Recieved ${signal}. Starting graceful shutdown...`);
    isShuttingDown = true;
}
process.on("SIGINT", () => {
    handleShutDown("SIGINT");
})
process.on("SIGTERM", () => {
    handleShutDown("SIGTERM");
})

// worker process
const worker: () => Promise<void> = async () => {

    let buffer: Job[] = [];

    try {
        // prefetching jobs into buffer
        buffer = await prefetchJobs(workerId);

        const concurrency = Number(process.env.WORKER_CONCURRENCY);

        let lastRecovery = 0;
        const recoveryInterval = Number(process.env.JOB_RECOVERY_INTERVAL_MS);

        while (!isShuttingDown) {

            // recover stale jobs by calling in a fixed interval...
            const now = Date.now();

            if (now - lastRecovery >= recoveryInterval) {
                // recover jobs that becomes stale
                await recoverStaleJob();
                lastRecovery = now;
            }

            if (isShuttingDown) break;

            // prefetch jobs before the buffer gets empty to continue the smooth execution
            if (buffer.length <= Number(process.env.BUFFER_THRESHOLD)) {
                buffer.push(...await prefetchJobs(workerId));
            }

            if (isShuttingDown) break;

            // store a amount of jobs to be executed concurrently to this array
            const jobs: Job[] = [];
            for (let i = 0; i < concurrency; i++) {
                const job = buffer.shift();
                if (job) jobs.push(job);
            }

            // if array doesn't have jobs, instead of hammering db, we wait few seconds before calling db for jobs again 
            if (jobs.length === 0) {
                if (isShuttingDown) break;

                console.log(`[${workerId}] Job queue is empty, waiting for jobs...`);

                const interval = Number(process.env.IDLE_POLL_INTERVAL_MS);
                await wait(interval);

                continue;
            }

            // process all jobs in array concurrently
            const results = await Promise.allSettled(
                jobs.map(job => processJob(job))
            );

            // log jobs after they complete their execution
            for (let i = 0; i < results.length; i++) {

                const job = jobs[i];
                const result = results[i];

                if (result.status === 'rejected') {
                    console.error(`[${workerId}] Error processing job ${job.id} : `, result.reason)
                }
                else if (!result.value) {
                    continue;
                }
                else {
                    if (result.value.status === 'COMPLETED') {
                        console.log(`[${workerId}] Job ${job.id} completed.`);
                    }
                    else if (result.value.status === 'QUEUED') {
                        console.log(`[${workerId}] Job ${job.id} failed, retrying...`);
                    }
                    else {
                        console.log(`[${workerId}] Job ${job.id} permanently failed.`);
                    }
                }
            }

        }
    }
    finally {
        try {
            if (buffer.length > 0) {
                console.log(`[${workerId}] Releasing ${buffer.length} jobs...`);

                const releasedJobs = await releaseBufferedJobs(workerId, buffer.map(job => job.id));
                console.log(`[${workerId}] Released ${releasedJobs.length} buffered jobs.`);
                buffer = [];
            }
        } finally {
            console.log(`[${workerId}] Closing database pool...`);
            await pool.end();
            console.log(`[${workerId}] Shutdown complete.`);
        }
    }

}

worker().catch(error => {
    console.error(`[${workerId}] Worker stopped with an error:`, error);
    process.exitCode = 1;
});