import { Client } from "pg";

const JOBS_CHANNEL = "jobs_available";

export const startJobsListener = async (onJobsAvailable: () => void): Promise<Client> => {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    await client.connect();

    client.on("notification", (message) => {
        if (message.channel === JOBS_CHANNEL) {
            onJobsAvailable();
        }
    });

    await client.query(`LISTEN ${JOBS_CHANNEL}`);

    console.log("[listener] ready");

    return client;
};
