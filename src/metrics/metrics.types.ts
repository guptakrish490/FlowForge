export type metrics = {
    // Complete response returned by GET /metrics.
    window: string,
    asOf: Date,
    workerCount: number,
    concurrency: number,
    avgProcessingTimeMs: number,
    avgCompletionTimeMs: number,
    queueSize: number,
    currentlyProcessing: number,
    completedJobs: number,
    terminalFailures: number,
    retryableFailures: number,
    avgQueueWaitMs: number,
    throughputJobsPerMinute: number,
    throughputJobsPerSecond: number,
    observedThroughputJobsPerMinute: number,
    observedThroughputJobsPerSecond: number
}

export type metricsData = Pick<metrics,
    // Service-calculated values before API metadata is added.
    | 'avgProcessingTimeMs'
    | 'avgCompletionTimeMs'
    | 'avgQueueWaitMs'
    | 'throughputJobsPerMinute'
    | 'throughputJobsPerSecond'
    | 'observedThroughputJobsPerMinute'
    | 'observedThroughputJobsPerSecond'
    | 'completedJobs'
    | 'terminalFailures'
    | 'queueSize'
    | 'retryableFailures'
    | 'currentlyProcessing'
>;

export type metricsBody = {
    // One persisted processing attempt.
    id: string,
    job_id: string,
    attempt_number: number,
    started_at: Date,
    finished_at: Date,
    outcome: 'SUCCEEDED' | 'RETRYABLE_FAILURE' | 'TERMINAL_FAILURE'
}

export type outcomeResult = {
    // Attempt counts grouped by outcome.
    outcome: 'SUCCEEDED' | 'RETRYABLE_FAILURE' | 'TERMINAL_FAILURE',
    count: number
}[];

export type finalizedJobStats = {
    // Completion bounds used by observed throughput.
    count: number,
    first_finished_at: Date | null,
    last_finished_at: Date | null
};

export type metricsRequest = {
    // Query parameters accepted by GET /metrics.
    Querystring: {
        window: string
    },
    Params: string,
}

export type statusResult = { status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED", count: number }[];
