export interface CollectorEnv {
  SNAPSHOTS: CollectionBucket;
}

// Structural subset of R2Bucket for the writes the collector will perform.
export interface CollectionBucket {
  put(key: string, value: string): Promise<unknown>;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

interface ScheduledContext {
  waitUntil(promise: Promise<unknown>): void;
}

const collector = {
  async scheduled(
    controller: ScheduledController,
    env: CollectorEnv,
    ctx: ScheduledContext,
  ): Promise<void> {
    // Skeleton until Task 7: proves the cron wiring and bindings start.
    ctx.waitUntil(
      Promise.resolve(
        console.log("collector triggered", {
          cron: controller.cron,
          bucketBound: typeof env.SNAPSHOTS.put === "function",
        }),
      ),
    );
  },
};

export default collector;
