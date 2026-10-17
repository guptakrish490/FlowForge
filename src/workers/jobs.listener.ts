import { Client } from "pg";

const JOBS_CHANNEL = "jobs_available";

export const startJobsListener = async (onJobsAvailable: () => void): Promise<Client> => {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    await client.connect();

    client.on("notification", (message) => {
        console.log("[LISTENER] notification recieved: ", {
            channel: message.channel,
            payload: message.payload,
        });

        if (message.channel === JOBS_CHANNEL) {
            onJobsAvailable();
        }
    });

    await client.query(`LISTEN ${JOBS_CHANNEL}`);

    console.log("Listening for new jobs...");

    return client;
};