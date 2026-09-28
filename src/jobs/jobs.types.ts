export type CreateJobBody = {
    type: string,
    workload: 'LOW' | 'MEDIUM' | 'HIGH',
}

export type UpdateJobBody = {
    type?: string,
    workload?: 'LOW' | 'MEDIUM' | 'HIGH',
    max_retries?: number,
    status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    retry_attempt?: number,
    updated_at?: Date,
    started_at?: Date,
    completed_at?: Date,
}

export type JobParams = {
    id: string,
}

export type CreateJobRequest = {
    Body: CreateJobBody,
    Params: JobParams
}

export type UpdateJobRequest = {
    Body: UpdateJobBody,
    Params: JobParams
}


export type JobData = {
    type: string,
    workload: 'LOW' | 'MEDIUM' | 'HIGH',
    max_retries: number,
    failure_probability: number,
    burst_time_ms: number
}