import { FastifyInstance } from "fastify";
import { createJob, retrieveJobById, retrieveJobs } from "./jobs.controller.js";

const jobRoutes: (app: FastifyInstance) => Promise<void> = async (app: FastifyInstance) => {
    app.post('/jobs', {
        schema: {
            body: {
                type: 'object',
                required: ['type', 'workload'],
                properties: {
                    type: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 50
                    },
                    workload: {
                        type: 'string',
                        enum: ['LOW', 'MEDIUM', 'HIGH']
                    }
                },
                additionalProperties: false
            }
        }
    }, createJob);

    app.get('/jobs', retrieveJobs);
    app.get('/jobs/:id', retrieveJobById);
}

export default jobRoutes;