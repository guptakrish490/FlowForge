import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import crypto from 'node:crypto';

import { prefetchJobs, processJob, wait } from "./worker.processor.js";
import { Job } from '../jobs/jobs.types.js';
import {
    handleProcessingError,
    recoverStaleJob,
    releaseBufferedJobs,
    renewWorkerLeases
} from '../jobs/jobs.repository.js';
import pool from '../db/connection.js';
import { startJobsListener } from './jobs.listener.js';

// Worker ID
const workerId = `worker-${process.argv[2] ?? "unknown"}-${process.pid}-${crypto.randomUUID()}`;
const workerLabel = `worker-${process.argv[2] ?? "unknown"}`;

// Shutdown state
let isShuttingDown = false;
let workerRunning = false;
let pendingWakeup = false;
let idleWakeupResolver: (() => void) | null = null;

// Listener connection returned by startJobsListener
let listenerClient: Awaited<ReturnType<typeof startJobsListener>> | undefined;

// Handle graceful shutdown
const handleShutDown = (signal: string) => {
    if (isShuttingDown) return;

    console.log(`[${workerLabel}] shutdown (${signal})`);

    isShuttingDown = true;
    pendingWakeup = false;
    idleWakeupResolver?.();
};

process.on("SIGINT", () => handleShutDown("SIGINT"));
process.on("SIGTERM", () => handleShutDown("SIGTERM"));

const waitForIdleWakeup = async (timeout: number): Promise<void> => {
    if (pendingWakeup) {
        pendingWakeup = false;
        return;
    }

    await new Promise<void>(resolve => {
        let settled = false;

        const finish = () => {
            if (settled) return;

            settled = true;
            clearTimeout(timer);

            if (idleWakeupResolver === finish) {
                idleWakeupResolver = null;
            }

            pendingWakeup = false;
            resolve();
        };

        const timer = setTimeout(finish, timeout);
        idleWakeupResolver = finish;
    });
};

// Worker execution
const worker: () => Promise<void> = async () => {
    let buffer: Job[] = [];

    let leaseTimer: ReturnType<typeof setInterval> | undefined;
    let leaseRenewalInProgress: Promise<void> | null = null;
    let leaseRenewalFailed = false;

    try {
        const leaseTimeout = Number(process.env.JOB_LEASE_TIMEOUT_MS);

        if (!Number.isFinite(leaseTimeout) || leaseTimeout <= 0) {
            throw new Error(
                "JOB_LEASE_TIMEOUT_MS must be a positive number"
            );
        }

        const leaseRenewInterval = Math.max(1, Math.floor(leaseTimeout / 3));

        // Renew leases while this worker execution is active.
        leaseTimer = setInterval(() => {
            if (leaseRenewalInProgress || leaseRenewalFailed || isShuttingDown) {
                return;
            }

            leaseRenewalInProgress = renewWorkerLeases(workerId)
                .catch(error => {
                    console.error(
                        `[${workerLabel}] lease renewal failed; stopping`,
                        error
                    );

                    leaseRenewalFailed = true;
                    isShuttingDown = true;
                })
                .finally(() => {
                    leaseRenewalInProgress = null;
                });
        }, leaseRenewInterval);

        // Prefetch jobs into the buffer.
        buffer = await prefetchJobs(workerId);

        const concurrency = Number(process.env.WORKER_CONCURRENCY);
        const bufferSize = Number(process.env.BUFFER_SIZE);
        const bufferThreshold = Number(process.env.BUFFER_THRESHOLD);
        const recoveryInterval = Number(
            process.env.JOB_RECOVERY_INTERVAL_MS
        );

        if (!Number.isInteger(concurrency) || concurrency <= 0) {
            throw new Error(
                "WORKER_CONCURRENCY must be a positive integer"
            );
        }

        if (!Number.isInteger(bufferSize) || bufferSize <= 0) {
            throw new Error(
                "BUFFER_SIZE must be a positive integer"
            );
        }

        if (!Number.isFinite(bufferThreshold) || bufferThreshold < 0) {
            throw new Error(
                "BUFFER_THRESHOLD must be a non-negative number"
            );
        }

        if (
            !Number.isFinite(recoveryInterval) ||
            recoveryInterval <= 0
        ) {
            throw new Error(
                "JOB_RECOVERY_INTERVAL_MS must be a positive number"
            );
        }

        let lastRecovery = 0;

        // Continue processing until shutdown or lease renewal failure.
        while (!isShuttingDown && !leaseRenewalFailed) {
            // Recover stale jobs periodically.
            const now = Date.now();

            if (now - lastRecovery >= recoveryInterval) {
                const recoveredJobs = await recoverStaleJob();

                if (recoveredJobs.length > 0) {
                    console.warn(`[${workerLabel}] recovered ${recoveredJobs.length} stale job(s)`);
                }

                lastRecovery = now;
            }

            if (isShuttingDown || leaseRenewalFailed) break;

            // Refill the buffer when it reaches the threshold.
            if (buffer.length <= bufferThreshold) {
                buffer.push(...await prefetchJobs(workerId));
            }

            if (isShuttingDown || leaseRenewalFailed) break;

            // Select jobs to process concurrently.
            const jobs: Job[] = [];

            for (let i = 0; i < concurrency; i++) {
                const job = buffer.shift();

                if (job) {
                    jobs.push(job);
                }
            }

            // If there are no jobs, wait and check once more.
            if (jobs.length === 0) {

                const idleTimeout = Number(process.env.IDLE_TIMEOUT_MS);
                if (!Number.isFinite(idleTimeout) || idleTimeout <= 0) {
                    throw new Error("IDLE_TIMEOUT_MS must be a positive number");
                }
                await waitForIdleWakeup(
                    Math.min(idleTimeout, recoveryInterval)
                );

                if (isShuttingDown || leaseRenewalFailed) break;

                buffer.push(...await prefetchJobs(workerId));

                // End this worker execution if the queue is still empty.
                // The listener remains active for future notifications.
                if (buffer.length === 0) {
                    continue;
                }

                continue;
            }

            // Process the selected jobs concurrently.
            const results = await Promise.allSettled(
                jobs.map(job => processJob(job))
            );

            // Log the results.
            for (let i = 0; i < results.length; i++) {
                const job = jobs[i];
                const result = results[i];

                if (result.status === 'rejected') {
                    console.error(
                        `[${workerLabel}] process ${job.id} failed:`,
                        result.reason
                    );

                    try {
                        const updatedJob = await handleProcessingError(
                            job.id,
                            workerId
                        );

                        if (updatedJob.status === 'QUEUED') {
                            console.log(
                                `[${workerLabel}] retry ${job.id}`
                            );
                        } else {
                            console.log(
                                `[${workerLabel}] failed ${job.id}`
                            );
                        }
                    } catch (error) {
                        console.error(
                            `[${workerLabel}] error update ${job.id} failed:`,
                            error
                        );
                    }
                } else if (!result.value) {
                    continue;
                } else if (result.value.status === 'COMPLETED') {
                    console.log(
                        `[${workerLabel}] done ${job.id}`
                    );
                } else if (result.value.status === 'QUEUED') {
                    console.log(
                        `[${workerLabel}] retry ${job.id}`
                    );
                } else {
                    console.log(
                        `[${workerLabel}] failed ${job.id}`
                    );
                }
            }
        }
    } finally {
        // Release jobs that were claimed but never taken from the buffer.
        try {
            if (buffer.length > 0) {
                const releasedJobs = await releaseBufferedJobs(
                    workerId,
                    buffer.map(job => job.id)
                );

                console.log(`[${workerLabel}] released ${releasedJobs.length} buffered job(s)`);

                buffer = [];
            }
        } finally {
            if (leaseTimer) {
                clearInterval(leaseTimer);
            }

            if (leaseRenewalInProgress) {
                await leaseRenewalInProgress;
            }

            // IMPORTANT:
            // Do not call pool.end() here.
            // This worker execution may return while the process and
            // PostgreSQL listener remain alive for future notifications.
        }
    }
};

// Start or request a worker execution.
const startWorker = () => {
    if (isShuttingDown) return;

    // If a notification arrives while the worker is active,
    // request another execution after the current one finishes.
    if (workerRunning) {
        pendingWakeup = true;
        idleWakeupResolver?.();
        return;
    }

    workerRunning = true;

    worker()
        .catch(error => {
            console.error(
                `[${workerLabel}] stopped:`,
                error
            );
        })
        .finally(() => {
            workerRunning = false;

            if (isShuttingDown) {
                void shutdown();
                return;
            }

            if (pendingWakeup) {
                pendingWakeup = false;
                startWorker();
            }
        });
};

// Shut down process-level resources.
let shutdownStarted = false;

const shutdown = async () => {
    if (shutdownStarted) return;

    shutdownStarted = true;

    try {
        // Close the persistent notification listener.
        if (listenerClient) {
            await listenerClient.end();
            listenerClient = undefined;
        }
    } catch (error) {
        console.error(
            `[${workerLabel}] listener close failed:`,
            error
        );
    }

    try {
        // The worker must finish before the pool is closed.
        if (workerRunning) {
            console.log(
                `[${workerLabel}] waiting for active jobs`
            );

            // The running execution observes isShuttingDown and exits.
            // Its finally block releases buffered jobs.
            while (workerRunning) {
                await wait(100);
            }
        }
    } finally {
        await pool.end();

        console.log(`[${workerLabel}] stopped`);
    }
};

// Start the listener before the initial worker execution.
const main = async () => {
    try {
        listenerClient = await startJobsListener(startWorker);

        if (isShuttingDown) {
            await shutdown();
            return;
        }

        // Initial check in case jobs already exist before startup.
        startWorker();
    } catch (error) {
        console.error(
            `[${workerLabel}] startup failed:`,
            error
        );

        isShuttingDown = true;
        await shutdown();
        process.exitCode = 1;
    }
};

void main();
