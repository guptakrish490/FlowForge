import { FastifyInstance } from "fastify";
import { createJob, retrieveJobById, retrieveJobs } from "./jobs.controller.js";

const jobRoutes = async (app: FastifyInstance) => {
    app.post('/jobs', createJob);
    app.get('/jobs', retrieveJobs);
    app.get('/jobs/:id', retrieveJobById);
}

export default jobRoutes;