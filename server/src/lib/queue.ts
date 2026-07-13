import { prisma } from "./prisma";
import { logger } from "./logger";

// Lightweight, DB-backed job queue. Deliberately dependency-free (no Redis)
// so the app stays fully self-contained; swap for BullMQ/SQS later if the
// backlog with a single Postgres instance ever becomes a bottleneck.

type JobHandler = (payload: any) => Promise<void>;

const handlers = new Map<string, JobHandler>();
let pollTimer: NodeJS.Timeout | null = null;

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueueJob(type: string, payload: unknown, opts?: { delayMs?: number; maxAttempts?: number }) {
  return prisma.job.create({
    data: {
      type,
      payload: payload as any,
      runAfter: new Date(Date.now() + (opts?.delayMs ?? 0)),
      maxAttempts: opts?.maxAttempts ?? 5,
    },
  });
}

function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, 30 * 60_000); // exponential, capped at 30min
}

async function runOnce() {
  const job = await prisma.job.findFirst({
    where: { status: "QUEUED", runAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return;

  const claimed = await prisma.job.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return; // lost the race to another worker

  const handler = handlers.get(job.type);
  if (!handler) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", lastError: `No handler registered for job type "${job.type}"` },
    });
    return;
  }

  try {
    await handler(job.payload);
    await prisma.job.update({ where: { id: job.id }, data: { status: "DONE" } });
  } catch (err: any) {
    const attempts = job.attempts + 1;
    logger.error({ jobId: job.id, type: job.type, attempts, err: err?.message }, "job failed");
    if (attempts >= job.maxAttempts) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED", lastError: String(err?.message ?? err) },
      });
    } else {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          runAfter: new Date(Date.now() + backoffMs(attempts)),
          lastError: String(err?.message ?? err),
        },
      });
    }
  }
}

export function startQueueWorker(intervalMs = 1000) {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    runOnce().catch((err) => logger.error({ err: err?.message }, "queue poll error"));
  }, intervalMs);
}

export function stopQueueWorker() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
