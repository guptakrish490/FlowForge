import { FastifyReply, FastifyRequest } from "fastify";
import { CreateJobRequest, JobParams } from "./jobs.types.js";
import { createJobService, retrieveJobByIdService, retrieveJobService } from "./jobs.service.js";

const responseHandler = (status: number, error: null | any = "Something went wrong!", data: any = null) => {
    return {
        success: !error,
        status,
        error,
        data
    }
}

export const createJob = async (req: FastifyRequest<CreateJobRequest>, res: FastifyReply) => {
    try {
        const newJob = await createJobService(req);
        return res.code(201).send(responseHandler(201, null, newJob));
    } catch (error) {
        res.code(500).send(responseHandler(500, error));
    }
}

export const retrieveJobs = async (req: FastifyRequest, res: FastifyReply) => {
    try {
        const jobs = await retrieveJobService();
        return res.code(200).send(responseHandler(200, null, jobs));
    } catch (error) {
        res.code(500).send(responseHandler(500, error));
    }
}

export const retrieveJobById = async (req: FastifyRequest<{ Params: JobParams }>, res: FastifyReply) => {
    const { id } = req.params;
    try {
        const job = await retrieveJobByIdService(id);
        if (!job) return res.code(404).send(responseHandler(404, "Job not found"));

        return res.code(200).send(responseHandler(200, null, job));
    } catch (error) {
        res.code(500).send(responseHandler(500, error));
    }
}