import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { prefetchJobs, processJob, wait } from "./worker.processor.js";
import { Job } from '../jobs/jobs.types.js';
import { recoverStaleJob } from '../jobs/jobs.repository.js';

// worker id
const workerId = `worker-${process.argv[2] ?? "unknown"}`;

// worker process
const worker: () => Promise<void> = async () => {

    // prefetching jobs into buffer
    let buffer = await prefetchJobs(workerId);
    const concurrency = Number(process.env.WORKER_CONCURRENCY);

    let lastRecovery = 0;
    const recoveryInterval = Number(process.env.JOB_RECOVERY_INTERVAL_MS);

    while (true) {

        // recover stale jobs by calling in a fixed interval...
        const now = Date.now();

        if (now - lastRecovery >= recoveryInterval) {
            // recover jobs that becomes stale
            await recoverStaleJob();
            lastRecovery = now;
        }

        // prefetch jobs before the buffer gets empty to continue the smooth execution
        if (buffer.length <= Number(process.env.BUFFER_THRESHOLD)) {
            buffer.push(...await prefetchJobs(workerId));
        }

        // store a amount of jobs to be executed concurrently to this array
        const jobs: Job[] = [];

        for (let i = 0; i < concurrency; i++) {
            const job = buffer.shift();
            if (job) jobs.push(job);
        }

        // if array doesn't have jobs, instead of hammering db, we wait few seconds before calling db for jobs again 
        if (jobs.length === 0) {
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
            else {
                if (job.status === 'COMPLETED') {
                    console.log(`[${workerId}] Job ${job.id} completed`);
                }
                else {
                    console.log(`[${workerId}] Job ${job.id} failed, retrying...`);
                }
            }
        }

    }
}

worker();