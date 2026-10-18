import { getNextQueuedJobs, updateJob } from "../jobs/jobs.repository.js";
import { Job } from "../jobs/jobs.types.js";
import { storeJobAttempt } from "../metrics/metrics.repository.js";

export const wait = async (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const processJob: (job: Job) => Promise<Job> = async (job: Job) => {

    // Track the attempt number and metrics timestamps for this execution.
    let attempt_number: number, outcome: 'SUCCEEDED' | 'RETRYABLE_FAILURE' | 'TERMINAL_FAILURE', start: Date, finish: Date;

    attempt_number = job.retry_attempt + 1;

    // Record when this attempt starts.
    job.started_at = new Date();

    start = job.started_at;

    // Simulate the configured workload duration.
    await wait(job.burst_time_ms);

    // Simulate the configured failure probability.
    const success = (Math.random() >= job.failure_probability);

    // Requeue retryable failures or mark exhausted retries as terminal failures.
    if (!success) {
        if (job.retry_attempt < job.max_retries) {
            job.retry_attempt++;
            job.status = 'QUEUED';
            outcome = 'RETRYABLE_FAILURE';
        }
        else {
            job.status = 'FAILED';
            outcome = 'TERMINAL_FAILURE';
        }
        finish = new Date();

        job.started_at = null;
        job.completed_at = null;
    }

    // Mark successful attempts as completed.
    else {
        job.status = 'COMPLETED';
        job.completed_at = new Date();
        outcome = 'SUCCEEDED';
        finish = job.completed_at;
    }

    // Clear the lease before persisting the new job state.
    job.claimed_at = null;

    // Persist the job state before storing the attempt record.
    const updatedJob = await updateJob(job);

    // Store this attempt for historical metrics.
    await storeJobAttempt(job.id, attempt_number, start, finish, outcome);

    // return updated job
    return updatedJob;
}

export const prefetchJobs: (worker_id: string) => Promise<Job[]> = async (worker_id) => {
    // Claim a batch for the worker's local buffer.
    const jobs = await getNextQueuedJobs(worker_id);
    return jobs;
}
