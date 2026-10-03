import "server-only";

export function demoMode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.MONITOR_LEGAL_DEMO === "true";
}
