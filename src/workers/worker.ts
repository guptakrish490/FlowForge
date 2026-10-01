import { getNextQueuedJob } from "../jobs/jobs.repository.js";
import { Job } from "../jobs/jobs.types.js";
import { processJob } from "./worker.processor.js";



const worker: () => Promise<void> = async () => {

    while (1) {
        const job: Job = await getNextQueuedJob();

        if (!job) {
            console.log("no job found!!!");
            return;
        }

        const processedJob = await processJob(job);
        if (processedJob.status === 'COMPLETED') {
            console.log(`Job - ${processedJob.id} is succesfully completed...`);
        }
        if (processedJob.status !== 'COMPLETED') {
            console.log(`Job - ${processedJob.id} is failed, retrying...`);
        }
    }
}

worker();