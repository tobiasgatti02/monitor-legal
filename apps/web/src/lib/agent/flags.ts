import "server-only";
import { ApiError } from "@/lib/api/errors";
export const capabilities = () => ({
  durableIngestion: process.env.LEGAL_DURABLE_INGESTION === "true",
  liveFolder: process.env.LEGAL_LIVE_FOLDER === "true",
  extraction: process.env.LEGAL_FACT_EXTRACTION === "true",
  drafts: process.env.LEGAL_DRAFTS === "true",
  research: process.env.LEGAL_RESEARCH === "true",
  mev: false,
  scbaNotifications: false,
  voice: false,
  legalCalculations: false,
});
export function requireCapability(name: keyof ReturnType<typeof capabilities>) {
  if (!capabilities()[name])
    throw new ApiError(
      503,
      "CAPABILITY_DISABLED",
      "Esta ampliación está deshabilitada en el servidor.",
    );
}
