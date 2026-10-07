import { getNextQueuedJobs, updateJob } from "../jobs/jobs.repository.js";
import { Job } from "../jobs/jobs.types.js";

export const wait = async (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const processJob: (job: Job) => Promise<Job> = async (job: Job) => {
    // job starts
    job.started_at = new Date();

    // process job till its burst time
    await wait(job.burst_time_ms);

    // determine success or failure
    const success = (Math.random() >= job.failure_probability);

    // when job fails, retry or mark failed / reset attributes to null if failed
    if (!success) {
        if (job.retry_attempt < job.max_retries) {
            job.retry_attempt++;
            job.status = 'QUEUED';
        }
        else {
            job.status = 'FAILED';
            job.completed_at = null;
            job.started_at = null;
        }
    }

    // when job completes, mark completed with completion time
    else {
        job.status = 'COMPLETED';
        job.completed_at = new Date();
    }

    // after processing, mark claimed_at time to null, since it's either queued again or failed.
    job.claimed_at = null;

    // update all values to db
    const updatedJob = await updateJob(job);

    // return updated job
    return updatedJob;
}

export const prefetchJobs: (worker_id: string) => Promise<Job[]> = async (worker_id) => {
    const jobs = await getNextQueuedJobs(worker_id);
    return jobs;
}