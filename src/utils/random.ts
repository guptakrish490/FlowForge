const data = {
    LOW: {
        max_retries: 3,
        min_failure_probability: 0,
        max_failure_probability: 0.05,
        max_burst_time_ms: 1000,
        min_burst_time_ms: 500
    },
    MEDIUM: {
        max_retries: 4,
        min_failure_probability: 0.05,
        max_failure_probability: 0.1,
        max_burst_time_ms: 2000,
        min_burst_time_ms: 1000
    },
    HIGH: {
        max_retries: 5,
        min_failure_probability: 0.1,
        max_failure_probability: 0.15,
        max_burst_time_ms: 3000,
        min_burst_time_ms: 2000
    }
}

const getRandom = (a: number, b: number) => {
    return Math.random() * (b - a) + a;
}

export const randomizeByWorkload = (workload: 'LOW' | 'MEDIUM' | 'HIGH') => {

    const load = data[workload];

    const burst_time_ms =
        Math.floor(getRandom(load.min_burst_time_ms, load.max_burst_time_ms));

    const max_retries =
        Math.floor(load.max_retries);

    const failure_probability =
        getRandom(load.min_failure_probability, load.max_failure_probability)

    return {
        max_retries,
        failure_probability,
        burst_time_ms,
    }
}