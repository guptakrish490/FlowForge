import { FastifyInstance } from "fastify";
import { createJob } from "./jobs.controller.js";

const jobRoutes = async (app: FastifyInstance) => {
    app.post('/jobs', createJob);
}

export default jobRoutes;