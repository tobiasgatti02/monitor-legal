import { z } from "zod";

export const sourceSchema = z.enum(["PJN", "MEV", "SCBA", "ESTUDIO"]);
export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const attentionItemSchema = z.object({
  id: z.string(),
  type: z.enum(["EVENT", "DEADLINE", "TASK", "COMMUNICATION", "LEAD", "SYNC"]),
  title: z.string(),
  context: z.string(),
  source: sourceSchema,
  relativeTime: z.string(),
  reason: z.string(),
  owner: z.string(),
  priority: prioritySchema,
  primaryAction: z.string(),
});

export const agendaItemSchema = z.object({
  id: z.string(),
  time: z.string(),
  title: z.string(),
  context: z.string(),
  kind: z.enum(["HEARING", "DEADLINE", "TASK", "MEETING", "FOLLOW_UP"]),
  completed: z.boolean(),
});

export const communicationItemSchema = z.object({
  id: z.string(),
  client: z.string(),
  matter: z.string(),
  reason: z.string(),
  daysWaiting: z.number().int().nonnegative(),
  whatsapp: z.string().nullable(),
  email: z.string().email().nullable(),
});

export const leadItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  matter: z.string(),
  stage: z.string(),
  nextAction: z.string(),
  overdue: z.boolean(),
});

export const integrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["HEALTHY", "DEGRADED", "OFFLINE", "NOT_CONFIGURED"]),
  lastSync: z.string(),
  detail: z.string(),
});

export const todayDashboardSchema = z.object({
  actorName: z.string(),
  dateLabel: z.string(),
  summary: z.object({
    urgent: z.number().int().nonnegative(),
    possibleDeadlines: z.number().int().nonnegative(),
    overdueTasks: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    notifications: z.number().int().nonnegative(),
    waitingClients: z.number().int().nonnegative(),
    untouchedLeads: z.number().int().nonnegative(),
    syncFailures: z.number().int().nonnegative(),
  }),
  attention: z.array(attentionItemSchema),
  agenda: z.array(agendaItemSchema),
  communications: z.array(communicationItemSchema),
  leads: z.array(leadItemSchema),
  integrations: z.array(integrationSchema),
});

export type Priority = z.infer<typeof prioritySchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type TodayDashboard = z.infer<typeof todayDashboardSchema>;

const priorityWeight: Record<Priority, number> = {
  CRITICAL: 400,
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100,
};

const typeWeight: Record<AttentionItem["type"], number> = {
  DEADLINE: 60,
  EVENT: 50,
  SYNC: 40,
  TASK: 30,
  COMMUNICATION: 20,
  LEAD: 10,
};

export function attentionScore(item: AttentionItem): number {
  return priorityWeight[item.priority] + typeWeight[item.type];
}

export function orderAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((left, right) => attentionScore(right) - attentionScore(left));
}
