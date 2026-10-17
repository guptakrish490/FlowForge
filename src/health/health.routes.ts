import { FastifyInstance } from "fastify";
import pool from "../db/connection.js";

const healthRoutes = async (app: FastifyInstance) => {
    app.get('/health', async (_req, res) => {
        try {
            await pool.query('SELECT 1');

            return res.code(200).send({
                success: true,
                status: 200,
                data: {
                    service: 'up',
                    database: 'up'
                }
            });
        } catch (error) {
            app.log.error(error);

            return res.code(503).send({
                success: false,
                status: 503,
                error: 'Database unavailable',
                data: {
                    service: 'up',
                    database: 'down'
                }
            });
        }
    });
};

export default healthRoutes;
