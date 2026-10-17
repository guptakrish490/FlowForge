CREATE INDEX jobs_queue_created_at_idx
ON jobs (created_at)
WHERE status = 'QUEUED';

CREATE INDEX jobs_processing_claimed_at_idx
ON jobs (claimed_at)
WHERE status = 'PROCESSING';
