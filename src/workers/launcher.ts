import dotenv from 'dotenv';
dotenv.config();

import { fork } from 'child_process';

const workerCount = Number(process.env.WORKER_COUNT);
const startTime = Date.now();
let completedWorker = 0;

// run multiple processes
for (let i = 1; i <= workerCount; i++) {
    const worker = fork('src/workers/worker.ts', [String(i)]);

    console.log(`Started worker-${i} (PID: ${worker.pid})`);

    // process exits if no job found
    worker.on("exit", (code) => {
        console.log(`Worker-${i} exited with code ${code}`);
        completedWorker++;

        if (completedWorker == workerCount) {
            const endTime = Date.now();

            const totalTime = (endTime - startTime) / 1000;
            console.log(`\nTotal completion time: ${totalTime.toFixed(2)} sec`);
        }
    })



}