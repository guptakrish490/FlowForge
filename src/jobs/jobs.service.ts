import { FastifyRequest } from "fastify";
import { CreateJobBody } from "./jobs.types.js";
import { randomizeByWorkload } from "../utils/random.js";
import { createJob, retrieveJobs } from "./jobs.repository.js";


export const createJobService = async (req: FastifyRequest<{ Body: CreateJobBody }>) => {
    const { type, workload } = req.body;
    const { max_retries, failure_probability, burst_time_ms, } = randomizeByWorkload(workload);

    const JobData = { type, workload, max_retries, failure_probability, burst_time_ms }
    const newJob = await createJob(JobData);
    return newJob;
};

export const retrieveJobService = async () => {
    const jobs = await retrieveJobs();
    return jobs;
}