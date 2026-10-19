import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import { fork } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerCount = Number(process.env.WORKER_COUNT);

if (!Number.isInteger(workerCount) || workerCount <= 0) {
    throw new Error("WORKER_COUNT must be a positive integer");
}

const startTime = Date.now();
let completedWorker = 0;
const launcherPath = fileURLToPath(import.meta.url);
const workerExtension = path.extname(launcherPath) === '.js' ? '.js' : '.ts';
const workerPath = path.join(path.dirname(launcherPath), `worker${workerExtension}`);

// Run multiple worker processes using the matching source or compiled entrypoint.
for (let i = 1; i <= workerCount; i++) {
    const worker = fork(workerPath, [String(i)]);

    console.log(`[launcher] started worker-${i} (pid ${worker.pid})`);

    // process exits if no job found
    worker.on("exit", (code) => {
        console.log(`[launcher] worker-${i} exited (${code})`);
        completedWorker++;

        if (completedWorker == workerCount) {
            const endTime = Date.now();

            const totalTime = (endTime - startTime) / 1000;
            console.log(`[launcher] total time ${totalTime.toFixed(2)}s`);
        }
    })



}
