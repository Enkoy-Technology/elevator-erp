# Skill: Add New Cron Job

Add a BullMQ repeatable job with proper monitoring and alerting.

## Parameters
- `jobName`: snake_case job name
- `schedule`: Cron expression (UTC)
- `queueName`: Existing queue or 'new:{name}'
- `handlerPath`: Path to the processor function
- `slaDeadline`: Max execution time (e.g., '2 hours')

## Steps
1. If a new queue: add to `BullModule.registerQueue()` in `WorkersModule`
2. Add the processor class in `src/workers/{queueName}/`
3. Register the repeatable job in `src/workers/scheduler.service.ts`
4. Add SLA monitoring in `src/workers/sla-monitor.worker.ts`
5. Document it in the AGENTS.md Cron Job Schedule table
6. Add an alert rule (queue depth, execution time)
7. Add a test in `test/workers/{jobName}.spec.ts`

## Required in Every Processor
- `jobId` logging for traceability
- `tenantContext` extraction from job data
- Error handling with dead-letter-queue routing
- Progress reporting for long jobs

## Example Invocation
"Add a cron job 'contract-renewal-reminder' that runs daily at 06:00 UTC, queues to payment-reminders, sends email 30 days before contract expiry"
