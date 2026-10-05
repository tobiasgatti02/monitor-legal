import { AsyncLocalStorage } from "node:async_hooks";

type Measurements = {
  queries: number;
  milliseconds: number;
  logicalResponseBytes: number;
};
const scope = new AsyncLocalStorage<{
  actorId?: string;
  metrics?: Measurements;
}>();
export function withDbScope<T>(callback: () => T): T {
  return scope.run({}, callback);
}
export function withActor<T>(actorId: string, callback: () => T): T {
  return scope.run({ actorId }, callback);
}
export function setDbActor(actorId: string) {
  const state = scope.getStore();
  if (!state) throw new Error("Database scope missing");
  state.actorId = actorId;
}
export function dbActor() {
  const actor = scope.getStore()?.actorId;
  if (!actor) throw new Error("Authenticated database scope required");
  return actor;
}

export function recordDb(count: number, ms: number, rows: unknown) {
  const state = scope.getStore();
  if (!state) return;
  state.metrics ??= { queries: 0, milliseconds: 0, logicalResponseBytes: 0 };
  state.metrics.queries += count;
  state.metrics.milliseconds += ms;
  for (const row of Array.isArray(rows) ? rows : [rows])
    state.metrics.logicalResponseBytes += Buffer.byteLength(
      JSON.stringify(row) ?? "",
    );
}
export function dbMeasurements() {
  return {
    ...(scope.getStore()?.metrics ?? {
      queries: 0,
      milliseconds: 0,
      logicalResponseBytes: 0,
    }),
  };
}
