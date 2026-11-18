export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureReady } = await import("./server/init");
    const { startWorker } = await import("./server/worker");
    ensureReady();
    startWorker();
  }
}
