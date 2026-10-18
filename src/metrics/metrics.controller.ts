import { FastifyReply, FastifyRequest } from "fastify";
import { metrics, metricsRequest } from "./metrics.types.js";
import { getMetricData } from "./metrics.service.js";

type ApiResponse<T> = {
    success: boolean,
    status: number,
    error: unknown,
    data: T | null
};

const responseHandler = <T>(
    status: number,
    error: unknown = "Unexpected Error/Something went wrong",
    data: T | null = null
): ApiResponse<T> => {
    return {
        success: !error,
        status,
        error,
        data
    }
}

export const calculateMetrics: (req: FastifyRequest<metricsRequest>, res: FastifyReply) => Promise<FastifyReply> =
    async (req, res) => {
        const windowTime = req.query.window || "1m";
        const workerCount = Number(process.env.WORKER_COUNT);
        const concurrency = Number(process.env.WORKER_CONCURRENCY);

        const result = await getMetricData(windowTime);

        // Combine configured capacity, current state, and historical metrics.
        const {
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
        } = result;


        const metrics: metrics = {
            window: windowTime,
            asOf: new Date,
            workerCount,
            concurrency,
            queueSize,
            completedJobs,
            terminalFailures,
            retryableFailures,
            currentlyProcessing,
            avgProcessingTimeMs,
            avgCompletionTimeMs,
            avgQueueWaitMs,
            throughputJobsPerMinute,
            throughputJobsPerSecond,
            observedThroughputJobsPerMinute,
            observedThroughputJobsPerSecond
        }

        return res.code(200).send(responseHandler(200, null, metrics));
    }
