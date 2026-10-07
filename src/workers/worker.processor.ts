import { getNextQueuedJobs, updateJob } from "../jobs/jobs.repository.js";
import { Job } from "../jobs/jobs.types.js";

export const wait = async (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const processJob: (job: Job) => Promise<Job> = async (job: Job) => {
    job.started_at = new Date();
    await wait(job.burst_time_ms);

    const success = (Math.random() >= job.failure_probability);
    if (!success) {
        if (job.retry_attempt < job.max_retries) {
            job.retry_attempt++;
            job.status = 'QUEUED';
        }
        else {
            job.status = 'FAILED';
        }
    }

    else {
        job.status = 'COMPLETED';
        job.completed_at = new Date();
    }

    job.worker_id = null;

    await updateJob(job);

    return job;
}

export const prefetchJobs: (worker_id: string) => Promise<Job[]> = async (worker_id) => {
    const jobs = await getNextQueuedJobs(worker_id);
    return jobs;
}