import { Client } from "pg";

const JOBS_CHANNEL = "jobs_available";
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

export const startJobsListener = async (onJobsAvailable: () => void) => {
    let client: Client | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let closing = false;
    let reconnectScheduled = false;

    const scheduleReconnect = () => {
        if (closing || reconnectScheduled) return;

        reconnectScheduled = true;
        reconnectTimer = setTimeout(() => {
            reconnectScheduled = false;

            void connect().catch(error => {
                console.error("[listener] reconnect failed:", error);
                scheduleReconnect();
            });
        }, reconnectDelay);

        reconnectDelay = Math.min(
            reconnectDelay * 2,
            MAX_RECONNECT_DELAY_MS
        );
    };

    const connect = async () => {
        if (closing) return;

        const nextClient = new Client({
            connectionString: process.env.DATABASE_URL,
        });

        client = nextClient;

        nextClient.on("notification", message => {
            if (message.channel === JOBS_CHANNEL) {
                onJobsAvailable();
            }
        });

        nextClient.on("error", error => {
            console.error("[listener] connection error:", error);
            scheduleReconnect();
        });

        nextClient.on("end", () => {
            if (!closing) {
                console.warn("[listener] disconnected; reconnecting");
                scheduleReconnect();
            }
        });

        try {
            await nextClient.connect();
            await nextClient.query(`LISTEN ${JOBS_CHANNEL}`);
            reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
            console.log("[listener] ready");
        } catch (error) {
            if (client === nextClient) {
                client = undefined;
            }

            try {
                await nextClient.end();
            } catch {
                // The connection may already be closed.
            }

            throw error;
        }
    };

    await connect();

    return {
        end: async () => {
            closing = true;

            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = undefined;
            }

            const activeClient = client;
            client = undefined;

            if (activeClient) {
                await activeClient.end();
            }
        },
    };
};
