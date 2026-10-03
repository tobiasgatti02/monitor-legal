import { AsyncLocalStorage } from "node:async_hooks";

const scope = new AsyncLocalStorage<{ actorId?: string }>();
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
