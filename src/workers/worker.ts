import dotenv from 'dotenv';
dotenv.config();

import { prefetchJobs, processJob } from "./worker.processor.js";


const worker: () => Promise<void> = async () => {

    let buffer = await prefetchJobs();
    while (true) {
        if (buffer.length <= Number(process.env.BUFFER_THRESHOLD)) {
            buffer = await prefetchJobs();
        }

        const job = buffer.shift();

        if (!job) {
            console.log("No Job Found!!!");
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