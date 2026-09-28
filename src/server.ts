import Fastify from "fastify";
import dotenv from 'dotenv';
import jobRoutes from "./jobs/jobs.routes.js";

dotenv.config();
const app = Fastify({ logger: false });

app.register(jobRoutes);

const PORT = Number(process.env.PORT) || 3000;
app.listen({ port: PORT, host: '0.0.0.0' }, () => {
  console.log(`Server running at http://localhost:${PORT}`);
})
