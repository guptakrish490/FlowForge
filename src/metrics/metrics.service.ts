import {
    getAverageCompletionTime,
    getAverageProcessingTime,
    getAverageQueueWaitTime,
    getFinalizedJobStats,
    getJobOutcome,
    getCurrentJobStateCount
} from "./metrics.repository.js";
import { metricsData } from "./metrics.types.js";

const parseWindowMinutes = (window: string): number => {
    // Accept only positive minute windows such as 1m or 10m.
    const match = /^([1-9][0-9]*)m$/.exec(window);

    if (!match) {
        throw new Error("window must be a positive number followed by 'm'");
    }

    return Number(match[1]);
};

export const getMetricData: (window: string) => Promise<metricsData> = async (window) => {
    const windowTimeMin = parseWindowMinutes(window);

    // Queue size and processing count are current snapshots.
    const currentJobStateResult = await getCurrentJobStateCount();
    // Outcome and duration metrics use the requested historical window.
    const jobOutcomeResult = await getJobOutcome(windowTimeMin);


    const queueSize = Number(currentJobStateResult.find(j => j.status === 'QUEUED')?.count) || 0;
    const currentlyProcessing = Number(currentJobStateResult.find(j => j.status === 'PROCESSING')?.count) || 0;

    const completedJobs = Number(jobOutcomeResult.find(j => j.outcome === 'SUCCEEDED')?.count) || 0;
    const terminalFailures = Number(jobOutcomeResult.find(j => j.outcome === 'TERMINAL_FAILURE')?.count) || 0;
    const retryableFailures = Number(jobOutcomeResult.find(j => j.outcome === 'RETRYABLE_FAILURE')?.count) || 0;

    const avgProcessingTimeMs = Math.round(((await getAverageProcessingTime(windowTimeMin)) || 0) * 100) / 100;
    const avgCompletionTimeMs = Math.round(((await getAverageCompletionTime(windowTimeMin)) || 0) * 100) / 100;
    const avgQueueWaitMs = Math.round(((await getAverageQueueWaitTime(windowTimeMin)) || 0) * 100) / 100;
    const finalizedJobStats = await getFinalizedJobStats(windowTimeMin);
    const finalizedJobCount = Number(finalizedJobStats.count) || 0;

    const firstFinishedAt = finalizedJobStats.first_finished_at ? new Date(finalizedJobStats.first_finished_at).getTime() : 0;
    const lastFinishedAt = finalizedJobStats.last_finished_at ? new Date(finalizedJobStats.last_finished_at).getTime() : 0;
    const elapsedSeconds = (lastFinishedAt - firstFinishedAt) / 1000;

    // Window throughput averages finalized jobs across the full window.
    const throughputJobsPerMinute = windowTimeMin > 0 ? Math.round((finalizedJobCount / windowTimeMin) * 100) / 100 : 0;
    const throughputJobsPerSecond = Math.round((throughputJobsPerMinute / 60) * 100) / 100;
    // Observed throughput uses the actual first-to-last completion span.
    const observedThroughputJobsPerSecond = elapsedSeconds > 0 ? Math.round((finalizedJobCount / elapsedSeconds) * 100) / 100 : 0;
    const observedThroughputJobsPerMinute = Math.round((observedThroughputJobsPerSecond * 60) * 100) / 100;

    const result = {
        avgProcessingTimeMs,
        avgCompletionTimeMs,
        avgQueueWaitMs,
        throughputJobsPerMinute,
        throughputJobsPerSecond,
        observedThroughputJobsPerMinute,
        observedThroughputJobsPerSecond,
        completedJobs,
        terminalFailures,
        queueSize,
        retryableFailures,
        currentlyProcessing
    }

    return result;
}
