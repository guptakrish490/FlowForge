import Fastify from "fastify";
import dotenv from 'dotenv';
import jobRoutes from "./jobs/jobs.routes.js";
import healthRoutes from "./health/health.routes.js";
import metricsRoutes from "./metrics/metrics.routes.js";

dotenv.config();
const app = Fastify({ logger: false });

app.register(jobRoutes);
app.register(metricsRoutes);
app.register(healthRoutes);

const PORT = Number(process.env.PORT) || 3000;
const startServer = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[server] listening on ${PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
};

void startServer();
