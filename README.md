# FlowForge

> A PostgreSQL-backed asynchronous job processing system built with TypeScript, Fastify, and Node.js.

FlowForge is a backend systems project focused on **concurrent job processing, multiple workers, database-level job claiming, buffering, retries, and performance experimentation**.

Instead of executing work directly inside an API request, FlowForge stores jobs in PostgreSQL and lets independent worker processes consume and process them asynchronously.

---

## ✨ Features

- REST API for creating and retrieving jobs
- PostgreSQL-backed job queue
- Multiple independent worker processes
- Concurrent job processing inside each worker
- Local in-memory job buffering
- Atomic job claiming using PostgreSQL
- `FOR UPDATE SKIP LOCKED` for worker coordination
- Configurable retry attempts
- Configurable failure probability
- Simulated workload durations
- Configurable worker count and concurrency
- Configurable PostgreSQL connection pool size
- PostgreSQL `LISTEN/NOTIFY` worker wake-up
- Listener reconnect with exponential backoff
- Polling fallback for queue recovery
- Lease renewal and stale-job recovery
- Graceful shutdown with buffered-job release
- Health check endpoint

---

## 🏗️ Architecture

```mermaid
flowchart LR
    Client["Client / Postman"]
    API["Fastify API"]
    Service["Job Service"]
    DB[("PostgreSQL")]
    Notify["LISTEN / NOTIFY"]
    
    Launcher["Worker Launcher"]
    W1["Worker 1"]
    W2["Worker 2"]
    WN["Worker N"]

    Client --> API
    API --> Service
    Service --> DB
    DB -. "jobs_available" .-> Notify

    Launcher --> W1
    Launcher --> W2
    Launcher --> WN

    W1 --> DB
    W2 --> DB
    WN --> DB
    Notify --> W1
    Notify --> W2
    Notify --> WN
```

The API is responsible for **creating and reading jobs**.

Workers are responsible for **claiming and processing jobs**.

PostgreSQL acts as the persistent source of truth and coordinates access to queued jobs.

Workers use PostgreSQL notifications as a fast wake-up signal. They still poll the
queue periodically, so processing does not depend on a notification being delivered.

---

## 🔄 Job Processing Flow

```mermaid
flowchart TD
    A["POST /jobs"] --> B["Create job"]
    B --> C["QUEUED"]

    C --> D["Worker claims job"]
    D --> E["PROCESSING"]

    E --> F{"Execution succeeds?"}

    F -->|Yes| G["COMPLETED"]
    F -->|No| H{"Retries remaining?"}

    H -->|Yes| C
    H -->|No| I["FAILED"]
```

Each job contains information such as:

- workload
- maximum retries
- failure probability
- simulated execution time
- current status
- retry attempt

---

## ⚙️ Concurrency Model

FlowForge supports concurrency at two levels:

1. **Multiple worker processes**
2. **Multiple jobs processed concurrently inside each worker**

```mermaid
flowchart TB
    DB[("PostgreSQL")]

    DB --> W1["Worker 1"]
    DB --> W2["Worker 2"]
    DB --> W3["Worker N"]

    W1 --> C1["Concurrent jobs"]
    W2 --> C2["Concurrent jobs"]
    W3 --> C3["Concurrent jobs"]
```

For example:

```
WORKER_COUNT=10
WORKER_CONCURRENCY=100
```

This allows multiple worker processes to independently claim jobs while each worker processes several jobs concurrently.

The actual useful concurrency depends on the workload and system/database limits.

---

## 🔒 Safe Job Claiming

Multiple workers must not process the same job.

FlowForge uses PostgreSQL row-level locking with:

```sql
FOR UPDATE SKIP LOCKED
```

The worker claims queued jobs atomically:

```sql
WITH jobs_to_claim AS (
    SELECT id
    FROM jobs
    WHERE status = 'QUEUED'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT $1
)
UPDATE jobs
SET
    status = 'PROCESSING',
    started_at = NOW(),
    updated_at = NOW()
WHERE id IN (
    SELECT id
    FROM jobs_to_claim
)
RETURNING *;
```

This allows multiple workers to safely compete for queued jobs without processing the same row simultaneously.

---

## 🧠 Buffering

Workers claim jobs in batches instead of querying PostgreSQL for every individual job.

```mermaid
flowchart LR
    DB[("PostgreSQL")]
    Claim["Claim batch"]
    Buffer["Worker Buffer"]
    Process["Concurrent Processing"]
    Update["Update job state"]

    DB --> Claim --> Buffer --> Process --> Update --> DB
```

The buffer is refilled when it reaches a configured threshold.

Configuration:

```
BUFFER_SIZE=60
BUFFER_THRESHOLD=30
```

This reduces unnecessary database fetches while keeping a local supply of work available to the worker.

---

## 🔁 Retry Handling

Jobs can fail based on their configured `failure_probability`.

If a job fails and still has retries available, it returns to the queue:

```
PROCESSING
    ↓
   FAIL
    ↓
retries remaining?
    ↓
   QUEUED
```

If no retries remain:

```
PROCESSING
    ↓
   FAIL
    ↓
 FAILED
```

The current implementation uses simulated failures and execution durations to make retry and workload behavior measurable.

Processor errors are also reconciled through the repository. The worker increments
`retry_attempt`, requeues the job when retries remain, or marks it `FAILED` when
the retry limit is reached. Ownership and lease timestamps are cleared in the same
database update.

---

## Leases, Recovery, and Shutdown

When a worker claims a job, it stores a unique `worker_id` and `claimed_at` timestamp.
Active workers renew their leases periodically. If a worker crashes or stops renewing,
another worker can recover stale `PROCESSING` jobs after `JOB_LEASE_TIMEOUT_MS`.

```mermaid
sequenceDiagram
    participant W as Worker
    participant DB as PostgreSQL
    participant R as Recovery loop

    W->>DB: Claim QUEUED job
    DB-->>W: PROCESSING + lease
    loop While processing
        W->>DB: Renew lease
    end
    R->>DB: Find expired claimed_at
    DB-->>R: Requeue or permanently fail job
    W-->>DB: Release buffered jobs on shutdown
```

On `SIGINT` or `SIGTERM`, the worker stops claiming new work, releases jobs that
are still in its local buffer, closes the notification listener, and then closes
its database pool. A currently running processor is allowed to finish or be
recovered later if its lease expires.

If the notification connection drops, the listener reconnects with exponential
backoff. The worker's recovery/queue loop remains active as a polling fallback.

---

## 🗄️ Database Schema

The main table is `jobs`.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Unique job ID |
| `type` | VARCHAR(50) | Job type |
| `workload` | VARCHAR(10) | `LOW`, `MEDIUM`, or `HIGH` |
| `max_retries` | INTEGER | Maximum retry attempts |
| `failure_probability` | REAL | Simulated failure probability |
| `burst_time_ms` | INTEGER | Simulated execution duration |
| `status` | VARCHAR(20) | Current job state |
| `retry_attempt` | INTEGER | Current retry count |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `started_at` | TIMESTAMPTZ | Processing start time |
| `completed_at` | TIMESTAMPTZ | Completion time |
| `worker_id` | VARCHAR(100) | Current worker owner |
| `claimed_at` | TIMESTAMPTZ | Lease timestamp |

Partial indexes are maintained on:

```sql
jobs (created_at) WHERE status = 'QUEUED'
jobs (claimed_at) WHERE status = 'PROCESSING'
```

to support queued-job retrieval.

---

## 📁 Project Structure

```
FlowForge/
│
├── src/
│   ├── server.ts
│   │
│   ├── db/
│   │    ├── connection.ts
│   │    └── migrations/
│   │       └── 001_create_jobs.sql
│   │
│   ├── utils/
│   │   └─── random.ts
│   │
│   ├── jobs/
│   │   ├── job.routes.ts
│   │   ├── job.controller.ts
│   │   ├── job.service.ts
│   │   ├── job.repository.ts
│   │   └── job.types.ts
│   │
│   └── worker/
│       ├── worker.ts
│       ├── worker.processor.ts
│       └── launcher.ts
│
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── LICENSE
├── package-lock.json
└── tsconfig.json
```

The repository also includes migrations `002_add_worker_id.sql`,
`003_add_claimed_at.sql`, and `004_add_job_indexes.sql`, plus the health route
and PostgreSQL notification listener shown in the source tree.

Additional source paths:

```text
src/health/health.routes.ts
src/workers/jobs.listener.ts
src/workers/worker.ts
src/workers/worker.processor.ts
src/workers/launcher.ts
```

### Responsibilities

| Layer | Responsibility |
|---|---|
| Routes | HTTP endpoint definitions |
| Controllers | Request/response handling |
| Services | Application/business logic |
| Repository | PostgreSQL queries |
| Worker | Worker process lifecycle |
| Processor | Job fetching, buffering and processing |
| DB | PostgreSQL connection pool |

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| TypeScript | Backend language |
| Node.js | Runtime |
| Fastify | HTTP framework |
| PostgreSQL | Job persistence and queue coordination |
| `pg` | PostgreSQL client |
| `dotenv` | Environment configuration |
| `tsx` | TypeScript execution |
| Git | Version control |

---

# 🚀 Getting Started

## Prerequisites

- Node.js
- npm
- PostgreSQL
- Git

---

## Installation

```bash
git clone <YOUR_REPOSITORY_URL>
cd FlowForge
npm install
```

---

## Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/flowforge

WORKER_COUNT=5
WORKER_CONCURRENCY=10

BUFFER_SIZE=60
BUFFER_THRESHOLD=30

DB_POOL_MAX=2

JOB_LEASE_TIMEOUT_MS=10000
JOB_RECOVERY_INTERVAL_MS=3000
IDLE_TIMEOUT_MS=10000
```

### Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `WORKER_COUNT` | Number of worker processes |
| `WORKER_CONCURRENCY` | Concurrent jobs per worker |
| `BUFFER_SIZE` | Jobs claimed into a worker buffer |
| `BUFFER_THRESHOLD` | Buffer refill threshold |
| `DB_POOL_MAX` | Maximum PostgreSQL connections per worker process |
| `JOB_LEASE_TIMEOUT_MS` | Time before a processing job is considered stale |
| `JOB_RECOVERY_INTERVAL_MS` | Interval for recovering stale jobs |
| `IDLE_TIMEOUT_MS` | Wait before checking an idle queue again |

---

## Database Setup

Create the database:

```sql
CREATE DATABASE flowforge;
```

Run the migrations in order:

```bash
psql "$DATABASE_URL" -f src/db/migrations/001_create_jobs.sql
psql "$DATABASE_URL" -f src/db/migrations/002_add_worker_id.sql
psql "$DATABASE_URL" -f src/db/migrations/003_add_claimed_at.sql
psql "$DATABASE_URL" -f src/db/migrations/004_add_job_indexes.sql
```

Migration 004 adds partial indexes used by the queue-claim and stale-job
recovery queries.

---

# ▶️ Running the Project

## Start the API

```bash
npm run dev
```

The API runs on:

```
http://localhost:3000
```



---

## Start Workers

```bash
npm run dev:worker
```

`npm run dev:worker` starts one worker process directly.
`npm run dev:launcher` starts the launcher, which reads `WORKER_COUNT` and starts
the configured number of worker processes.

For a compiled deployment, run `npm run build`, then use `npm run start` and
either `npm run start:worker` or `npm run start:launcher` in separate processes.

Example:

```
WORKER_COUNT=5
```

results in:

```
Worker-1
Worker-2
Worker-3
Worker-4
Worker-5
```

---

# 📡 API

## Health Check

```http
GET /health
```

The endpoint checks PostgreSQL with `SELECT 1`. It returns `200` when the API
and database are available, and `503` when the database is unavailable.

## Create Job

```http
POST /jobs
```

Example:

```json
{
  "type": "email",
  "workload": "MEDIUM"
}
```

The server generates execution parameters based on the workload and stores the job as `QUEUED`.

---

## Get Jobs

```http
GET /jobs
```

Returns stored jobs.

---

## Get Job

```http
GET /jobs/:id
```

Returns a specific job.

---

# 📊 Performance

<!-- Benchmark results are intentionally omitted until they are reproducible. -->
<!--
FlowForge has been tested with a **5,000-job workload** to study the effect of worker count, concurrency, and buffer size.

> These are local experimental measurements using simulated workloads. They are not production benchmarks.

### Worker Scaling

Configuration:

```
Concurrency = 10
Buffer = 60
Jobs = 5,000
```

| Workers | Run 1 | Run 2 | Run 3 |
|---:|---:|---:|---:|
| 1 | 1514.83s | 1520.86s | 1511.11s |
| 5 | 249.02s | 250.86s | 247.18s |
| 10 | 150.02s | 153.44s | 150.02s |
| 15 | 104.94s | 104.51s | 101.54s |
| 20 | 83.08s | 92.19s | 83.01s |
| 40 | 63.35s | 63.29s | 59.03s |

### Concurrency Scaling

Configuration:

```
Workers = 10
Buffer = 60
Jobs = 5,000
```

| Concurrency | Run 1 | Run 2 | Run 3 |
|---:|---:|---:|---:|
| 10 | 152.72s | 152.64s | 152.11s |
| 20 | 81.26s | 81.24s | 81.03s |
| 40 | 59.67s | 59.44s | 39.85s |
| 50 | 46.49s | 46.38s | 46.38s |
| 60 | 39.89s | 35.69s | 35.48s |
| 75 | 34.42s | 33.06s | 34.18s |
| 100 | 32.12s | 33.06s | 32.19s |
| 125 | 35.70s | 32.54s | 32.68s |
| 150 | 34.88s | 34.33s | 32.96s |
| 200 | 34.13s | 34.18s | 34.19s |

### Buffer Size

Configuration:

```
Workers = 10
Concurrency = 100
Jobs = 5,000
```

| Buffer | Run 1 | Run 2 | Run 3 | Average |
|---:|---:|---:|---:|---:|
| 60 | 32.12s | 33.06s | 32.19s | ~32.46s |
| 110 | 30.65s | 30.14s | 30.33s | ~30.37s |
| 210 | 31.38s | 31.69s | 30.98s | ~31.35s |

The lowest average among these tested configurations was approximately:

```
30.37 seconds
```

for:

```
Workers      = 10
Concurrency  = 100
Buffer       = 110
Jobs         = 5,000
```

Approximate measured throughput:

```
5000 / 30.37 ≈ 164.6 jobs/sec
```

These measurements describe the tested workload and environment; they are not intended as a universal performance limit.
-->

---

## 📈 What the Benchmarks Show

The experiments demonstrate three important behaviors:

- Increasing worker count can significantly reduce processing time.
- Increasing concurrency provides large gains initially, followed by diminishing returns.
- Buffer size affects performance, but increasing it indefinitely does not necessarily improve throughput.

The project therefore treats worker count, concurrency, and buffer size as **tunable system parameters** rather than fixed magic numbers.

---

# 🧪 Engineering Issue Discovered During Testing

<!-- Engineering benchmark notes are intentionally omitted until they are reproducible.
High worker counts initially caused PostgreSQL connection exhaustion.

Each Node.js worker process creates its own `pg.Pool`.

With a default pool size of 10:

```
60 workers × 10 connections
= up to 600 possible connections
```

This resulted in errors similar to:

```
too many clients already
```

The project now exposes pool size through:

```
DB_POOL_MAX=2
```

This allows worker scaling experiments without unnecessarily creating large numbers of database connections.

This issue was particularly useful because it exposed a real systems constraint that wasn't obvious from the application-level code.
-->

---

# 🗺️ Roadmap

### Reliability

- [x] Add `worker_id` to jobs
- [x] Detect stale `PROCESSING` jobs
- [x] Implement crash recovery
- [x] Add job ownership / leases
- [x] Define retry behavior for crashed workers

### Worker lifecycle

- [x] Graceful shutdown
- [x] Signal handling
- [x] Safe worker termination

### Queue efficiency

- [x] PostgreSQL `LISTEN/NOTIFY`
- [x] Reduce unnecessary polling with notification wake-up
- [x] Event-driven worker wake-up
- [x] Listener reconnect with backoff

### Observability

- [ ] Structured logging
- [ ] Queue depth metrics
- [ ] Processing latency
- [ ] Throughput metrics
- [ ] Retry/failure metrics
- [ ] Worker health monitoring

### Reliability features

- [ ] Dead-letter queue
- [ ] Retry backoff
- [ ] Idempotency
- [x] Lease heartbeats
- [x] Processor-error recovery

### Benchmarking

- [ ] CPU-bound workloads
- [ ] I/O-bound workloads
- [ ] Mixed workloads
- [ ] Larger job volumes
- [ ] Repeatable benchmark scripts
- [ ] Automated benchmark reports

---

# 📌 Current Status

**FlowForge is currently in active development.**

### Implemented

- [x] Fastify API
- [x] `/health` database health check
- [x] PostgreSQL persistence
- [x] Job creation and retrieval
- [x] Job lifecycle
- [x] Single worker processing
- [x] Concurrent processing
- [x] Multiple worker processes
- [x] Local buffering
- [x] Retry handling
- [x] Failure simulation
- [x] Atomic job claiming
- [x] `FOR UPDATE SKIP LOCKED`
- [x] Configurable database pool size
- [x] Worker ownership and leases
- [x] Stale job recovery
- [x] PostgreSQL `LISTEN/NOTIFY` wake-up
- [x] Queue and processing indexes
- [x] Listener reconnect with polling fallback

### Next

- [ ] Cancellation/fencing after lease loss
- [ ] Structured observability and metrics
- [ ] Automated integration tests

---

## 🎯 Project Goal

FlowForge is being built to understand the engineering problems behind systems that process large amounts of asynchronous work:

```mermaid
flowchart LR
    Jobs["Jobs"] --> Queue["Persistent Queue"]
    Queue --> Workers["Multiple Workers"]
    Workers --> Concurrency["Concurrent Processing"]
    Concurrency --> Reliability["Retries & Recovery"]
    Reliability --> Scale["Scalability & Observability"]
```

The goal is not simply to build a job queue.

The goal is to understand **how a backend system behaves when concurrency, failures, database contention, and scale enter the picture.**

---

## 📄 License

MIT
--- 

### **Thank you✨**
