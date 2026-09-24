import Fastify from "fastify";
import { pool } from "./db/connection.js";

const app = Fastify();

app.get("/health", async () => {
  return { status: "ok" };
});

app.get("/db-test", async () => {
  const result = await pool.query("SELECT NOW()");

  return {
    database: "connected...",
    time: result.rows[0].now,
  };
});

app.listen({
  port: 3000,
  host: "0.0.0.0",
});
