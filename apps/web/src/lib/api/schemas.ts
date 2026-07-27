import { z } from "zod";

const optionalText = z.string().trim().max(4000).optional().nullable();
const optionalUuid = z.uuid().optional().nullable();
const optionalDate = z.iso.datetime({ offset: true }).optional().nullable();
const money = z.coerce.number().finite().nonnegative();

export const idSchema = z.uuid();
export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const taskStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "CANCELLED",
]);

export const clientCreateSchema = z.object({
  kind: z.enum(["PERSON", "COMPANY"]).default("PERSON"),
  fullName: z.string().trim().min(2).max(200),
  documentId: optionalText,
  email: z.email().optional().nullable(),
  phone: optionalText,
  whatsapp: optionalText,
  address: optionalText,
  locality: optionalText,
  preferredChannel: z.enum(["EMAIL", "WHATSAPP", "PHONE", "INTERNAL"]).optional().nullable(),
  status: z
    .enum(["ACTIVE", "POTENTIAL", "PAUSED", "CLOSED", "DO_NOT_CONTACT"])
    .default("ACTIVE"),
  source: optionalText,
  responsibleUserId: z.string().optional().nullable(),
  communicationConsent: z.boolean().default(false),
  updateFrequencyDays: z.number().int().positive().max(365).optional().nullable(),
  nextContactAt: optionalDate,
  notes: optionalText,
});

export const caseCreateSchema = z.object({
  clientId: optionalUuid,
  docketNumber: optionalText,
  title: z.string().trim().min(2).max(300),
  jurisdiction: optionalText,
  court: optionalText,
  venue: optionalText,
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED", "ARCHIVED"]).default("ACTIVE"),
  priority: prioritySchema.default("MEDIUM"),
  responsibleUserId: z.string().optional().nullable(),
  nextAction: optionalText,
  nextActionAt: optionalDate,
});

const leadFieldsSchema = z.object({
    fullName: z.string().trim().min(2).max(200),
    email: z.email().optional().nullable(),
    whatsapp: optionalText,
    consultationReason: z.string().trim().min(2).max(2000),
    source: optionalText,
    urgency: prioritySchema.default("MEDIUM"),
    status: z
      .enum([
        "NEW",
        "TO_CONTACT",
        "CONTACTED",
        "MEETING_SCHEDULED",
        "EVALUATING",
        "PROPOSAL_SENT",
        "HIRED",
        "NOT_HIRED",
        "NO_RESPONSE",
        "CONFLICT",
        "OUT_OF_SCOPE",
      ])
      .default("NEW"),
    responsibleUserId: z.string().optional().nullable(),
    nextAction: optionalText,
    nextActionAt: optionalDate,
    counterparty: optionalText,
    lostReason: optionalText,
  });

export const leadCreateSchema = leadFieldsSchema.superRefine((value, context) => {
    if (!value.email && !value.whatsapp) {
      context.addIssue({
        code: "custom",
        message: "Ingresá al menos email o WhatsApp.",
        path: ["email"],
      });
    }
    if (
      ["NOT_HIRED", "NO_RESPONSE", "CONFLICT", "OUT_OF_SCOPE"].includes(value.status) &&
      !value.lostReason
    ) {
      context.addIssue({
        code: "custom",
        message: "El motivo de cierre es obligatorio.",
        path: ["lostReason"],
      });
    }
});

export const taskCreateSchema = z.object({
  caseId: optionalUuid,
  clientId: optionalUuid,
  leadId: optionalUuid,
  sourceEventId: optionalUuid,
  parentTaskId: optionalUuid,
  title: z.string().trim().min(2).max(300),
  description: optionalText,
  status: taskStatusSchema.default("OPEN"),
  priority: prioritySchema.default("MEDIUM"),
  dueAt: optionalDate,
  responsibleUserId: z.string().optional().nullable(),
  recurrenceRule: optionalText,
});

export const deadlineCreateSchema = z.object({
  caseId: optionalUuid,
  sourceEventId: optionalUuid,
  title: z.string().trim().min(2).max(300),
  dueAt: z.iso.datetime({ offset: true }),
  status: z
    .enum(["DETECTED", "POSSIBLE", "CONFIRMED", "COMPLETED", "DISMISSED"])
    .default("DETECTED"),
  notes: optionalText,
});

export const calendarCreateSchema = z
  .object({
    caseId: optionalUuid,
    clientId: optionalUuid,
    deadlineId: optionalUuid,
    eventType: z.enum(["HEARING", "DEADLINE", "MEETING", "CALL", "TASK", "FOLLOW_UP"]),
    title: z.string().trim().min(2).max(300),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: optionalDate,
    allDay: z.boolean().default(false),
    responsibleUserId: z.string().optional().nullable(),
    location: optionalText,
  })
  .refine(
    (value) => !value.endsAt || new Date(value.endsAt) >= new Date(value.startsAt),
    { message: "La fecha de fin debe ser posterior al inicio.", path: ["endsAt"] },
  );

export const communicationCreateSchema = z.object({
  clientId: optionalUuid,
  caseId: optionalUuid,
  leadId: optionalUuid,
  sourceEventId: optionalUuid,
  channel: z.enum(["EMAIL", "WHATSAPP", "PHONE", "INTERNAL", "PORTAL"]),
  direction: z.enum(["INBOUND", "OUTBOUND", "INTERNAL"]).default("OUTBOUND"),
  status: z
    .enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "REPLIED", "FOLLOW_UP"])
    .default("DRAFT"),
  subject: optionalText,
  body: z.string().trim().min(1).max(20_000),
  sentAt: optionalDate,
});

export const contactSchema = communicationCreateSchema
  .pick({
    channel: true,
    direction: true,
    status: true,
    subject: true,
    body: true,
    sentAt: true,
  })
  .extend({ caseId: optionalUuid });

export const activityCreateSchema = z.object({
  activityType: z.enum([
    "NOTE",
    "CALL",
    "EMAIL",
    "WHATSAPP",
    "MEETING",
    "STATUS_CHANGE",
    "FOLLOW_UP",
  ]),
  note: optionalText,
  happenedAt: z.iso.datetime({ offset: true }).optional(),
});

export const feeCreateSchema = z.object({
  caseId: z.uuid(),
  agreementType: z.string().trim().min(2).max(200),
  currency: z.string().trim().length(3).default("ARS"),
  agreedAmount: money,
  notes: optionalText,
});

export const paymentCreateSchema = z.object({
  feeId: z.uuid(),
  amount: money.positive(),
  currency: z.string().trim().length(3).default("ARS"),
  paidAt: z.iso.datetime({ offset: true }),
  method: optionalText,
  concept: optionalText,
  receiptDocumentId: optionalUuid,
});

export const documentCreateSchema = z.object({
  clientId: optionalUuid,
  caseId: optionalUuid,
  taskId: optionalUuid,
  name: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(80).default("OTHER"),
  mimeType: z.string().trim().max(150).optional().nullable(),
  contentBase64: z.string().min(1).max(7_000_000),
  sharedWithClient: z.boolean().default(false),
});

export const integrationCreateSchema = z.object({
  source: z.enum(["PJN", "MEV_SCBA", "SCBA_NOTIFICACIONES"]),
  accountLabel: z.string().trim().min(2).max(120),
  schedule: optionalText,
});

export const eventReviewSchema = z.object({
  status: z.enum(["REVIEWED", "DISMISSED"]),
  severity: prioritySchema.optional(),
  possibleDeadline: z.boolean().optional(),
  note: optionalText,
});

export const alertUpdateSchema = z.object({
  id: z.uuid(),
  action: z.enum(["READ", "UNREAD", "SNOOZE"]),
  snoozedUntil: optionalDate,
});

export const clientUpdateSchema = clientCreateSchema.partial();
export const caseUpdateSchema = caseCreateSchema.partial();
export const leadUpdateSchema = leadFieldsSchema.partial();
export const taskUpdateSchema = taskCreateSchema.partial();
export const deadlineUpdateSchema = deadlineCreateSchema.partial();
export const calendarUpdateSchema = calendarCreateSchema.partial();
export const communicationUpdateSchema = communicationCreateSchema.partial();
export const feeUpdateSchema = feeCreateSchema.partial();
export const paymentUpdateSchema = paymentCreateSchema.partial();
export const integrationUpdateSchema = integrationCreateSchema.partial();
