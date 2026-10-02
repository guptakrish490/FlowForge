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
- Load testing and performance benchmarking

---

## 🏗️ Architecture

```mermaid
flowchart LR
    Client["Client / Postman"]
    API["Fastify API"]
    Service["Job Service"]
    DB[("PostgreSQL")]
    
    Launcher["Worker Launcher"]
    W1["Worker 1"]
    W2["Worker 2"]
    WN["Worker N"]

    Client --> API
    API --> Service
    Service --> DB

    Launcher --> W1
    Launcher --> W2
    Launcher --> WN

    W1 --> DB
    W2 --> DB
    WN --> DB
```

The API is responsible for **creating and reading jobs**.

Workers are responsible for **claiming and processing jobs**.

PostgreSQL acts as the persistent source of truth and coordinates access to queued jobs.

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

The actual useful concurrency depends on the workload and system/database limits, so FlowForge includes benchmarking to study these effects.

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

An index is maintained on:

```sql
(status, created_at)
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
│   ├── connection.ts
│   └── migrations/
│   │    └── 001_create_jobs.sql
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
├── .env
├── .gitignore
├── package.json
├── package-lock.json
└── tsconfig.json
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

---

## Database Setup

Create the database:

```sql
CREATE DATABASE flowforge;
```

Then run the migration:

```
migrations/001_create_jobs.sql
```

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
npm run worker
```

The launcher reads `WORKER_COUNT` and starts the configured number of worker processes.

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

---

## 📈 What the Benchmarks Show

The experiments demonstrate three important behaviors:

- Increasing worker count can significantly reduce processing time.
- Increasing concurrency provides large gains initially, followed by diminishing returns.
- Buffer size affects performance, but increasing it indefinitely does not necessarily improve throughput.

The project therefore treats worker count, concurrency, and buffer size as **tunable system parameters** rather than fixed magic numbers.

---

# 🧪 Engineering Issue Discovered During Testing

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

---

# 🗺️ Roadmap

### Reliability

- [ ] Add `worker_id` to jobs
- [ ] Detect stale `PROCESSING` jobs
- [ ] Implement crash recovery
- [ ] Add job ownership / leases
- [ ] Define retry behavior for crashed workers

### Worker lifecycle

- [ ] Graceful shutdown
- [ ] Signal handling
- [ ] Safe worker termination

### Queue efficiency

- [ ] PostgreSQL `LISTEN/NOTIFY`
- [ ] Reduce unnecessary polling
- [ ] Event-driven worker wake-up

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
- [ ] Heartbeats
- [ ] Better failure recovery

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
- [x] Load testing and benchmarking

### Next

- [ ] Worker ownership
- [ ] Crash recovery
- [ ] Graceful shutdown
- [ ] `LISTEN/NOTIFY`
- [ ] Observability

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