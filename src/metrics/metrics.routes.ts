import { FastifyInstance } from "fastify";
import { calculateMetrics } from "./metrics.controller.js";

const metricsRoutes: (app: FastifyInstance) => Promise<void> = async (app) => {
    // Validate the optional window before it reaches the metrics service.
    app.get('/metrics', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    window: {
                        type: 'string',
                        pattern: '^[1-9][0-9]*m$'
                    }
                },
                additionalProperties: false
            }
        }
    }, calculateMetrics);
}

export default metricsRoutes;
