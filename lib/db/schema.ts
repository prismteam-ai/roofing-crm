import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * CRM persistence (our own tables). Property / permit facts are snapshotted here at
 * lead-creation time; the live dataset stays behind the MCP boundary.
 *
 * @module db/schema
 */

/** Lead pipeline stages. */
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "quoted",
  "won",
  "lost",
]);
export const LEAD_STATUSES = leadStatusEnum.enumValues;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Lead priorities derived from the lead signal at creation. */
export const leadPriorityEnum = pgEnum("lead_priority", ["high", "medium", "low"]);
export type LeadPriority = (typeof leadPriorityEnum.enumValues)[number];

/** Activity kinds shown on the lead timeline. */
export const activityTypeEnum = pgEnum("activity_type", ["created", "note", "status_change"]);
export type ActivityType = (typeof activityTypeEnum.enumValues)[number];

export const leads = pgTable(
  "leads",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    parcelId: text("parcel_id").notNull(),
    address: text("address").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    status: leadStatusEnum("status").notNull().default("new"),
    priority: leadPriorityEnum("priority").notNull().default("medium"),
    signal: text("signal").notNull().default("none"),
    propertyType: text("property_type"),
    builtYear: integer("built_year"),
    roofAgeYears: integer("roof_age_years"),
    roofAgeBasis: text("roof_age_basis"),
    openRoofPermitCount: integer("open_roof_permit_count").notNull().default(0),
    oldestOpenRoofPermitDays: integer("oldest_open_roof_permit_days"),
    ownerName: text("owner_name"),
    ownerMailState: text("owner_mail_state"),
    ownerOutOfState: boolean("owner_out_of_state"),
    marketValue: doublePrecision("market_value"),
    lastSaleDate: text("last_sale_date"),
    notes: text("notes"),
    sourceUrls: text("source_urls")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_parcel_id_uq").on(t.parcelId),
    index("leads_status_idx").on(t.status),
    index("leads_roof_age_idx").on(t.roofAgeYears),
  ],
);

export const leadPermits = pgTable(
  "lead_permits",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    permitNumber: text("permit_number").notNull(),
    status: text("status"),
    isOpen: boolean("is_open").notNull().default(false),
    daysOpen: integer("days_open"),
    issueDate: text("issue_date"),
    closeDate: text("close_date"),
    improvementType: text("improvement_type"),
    contractorName: text("contractor_name"),
    contractorQualifier: text("contractor_qualifier"),
    contractorPhone: text("contractor_phone"),
    contractorLicense: text("contractor_license"),
    bbbRating: text("bbb_rating"),
    bbbAccredited: boolean("bbb_accredited"),
    bbbProfileUrl: text("bbb_profile_url"),
    bbbMatchMethod: text("bbb_match_method"),
    sourceUrl: text("source_url"),
  },
  (t) => [index("lead_permits_lead_idx").on(t.leadId)],
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    type: activityTypeEnum("type").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId)],
);

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/** Lexical knowledge index of the dataset documentation used to ground the assistant. */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    section: text("section").notNull(),
    body: text("body").notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`setweight(to_tsvector('english', coalesce(${knowledgeChunks.title}, '') || ' ' || coalesce(${knowledgeChunks.section}, '')), 'A') || setweight(to_tsvector('english', coalesce(${knowledgeChunks.body}, '')), 'B')`,
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_chunks_tsv_idx").using("gin", t.tsv)],
);

export const leadsRelations = relations(leads, ({ many }) => ({
  permits: many(leadPermits),
  activities: many(leadActivities),
}));
export const leadPermitsRelations = relations(leadPermits, ({ one }) => ({
  lead: one(leads, { fields: [leadPermits.leadId], references: [leads.id] }),
}));
export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, { fields: [leadActivities.leadId], references: [leads.id] }),
}));

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadPermit = typeof leadPermits.$inferSelect;
export type NewLeadPermit = typeof leadPermits.$inferInsert;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
