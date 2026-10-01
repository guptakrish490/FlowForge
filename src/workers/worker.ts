import dotenv from 'dotenv';
dotenv.config();

import { prefetchJobs, processJob } from "./worker.processor.js";
import { Job } from '../jobs/jobs.types.js';


const worker: () => Promise<void> = async () => {

    let buffer = await prefetchJobs();
    while (true) {

        // prefetch jobs before the buffer gets empty to continue the smooth execution
        if (buffer.length <= Number(process.env.BUFFER_THRESHOLD)) {
            buffer.push(...await prefetchJobs());
        }

        // store a amount of jobs to be executed concurrently to this array
        const jobs: Job[] = [];
        const concurrency = Number(process.env.WORKER_CONCURRENCY);

        for (let i = 0; i < concurrency; i++) {
            const job = buffer.shift();

            if (job) jobs.push(job);
        }

        // if array doesn't have jobs, means the buffer didn't have jobs, therefore return
        if (jobs.length === 0) {
            console.log("No Jobs Found!!!");
            return;
        }

        // process all jobs in array concurrently
        const processedJobs = await Promise.all(
            jobs.map(job => processJob(job))
        );

        // log jobs after they complete their execution
        for (let job of processedJobs) {
            if (job.status === 'COMPLETED') {
                console.log(`Job - ${job.id} : started at ${job.started_at}, completed at ${job.completed_at}`);
            }
            if (job.status !== 'COMPLETED') {
                console.log(`Job - ${job.id} is failed, retrying...`);
            }
        }

    }
}

worker();