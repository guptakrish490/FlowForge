import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX)
});

export default pool;