import { FastifyInstance } from "fastify";
import { createJob, retrieveJobs } from "./jobs.controller.js";

const jobRoutes = async (app: FastifyInstance) => {
    app.post('/jobs', createJob);
    app.get('/jobs', retrieveJobs);
}

export default jobRoutes;