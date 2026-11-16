import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ------------------------------------------------------------------ */
/* People and access                                                    */
/* ------------------------------------------------------------------ */

/** admin + staff are omniSEO team members. client users belong to clients. */
export const userRole = pgEnum("user_role", ["admin", "staff", "client"]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: userRole("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  lastLoginAt: ts("last_login_at"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const tokenType = pgEnum("token_type", ["invite", "reset"]);

/** Single-use links for accepting an invite or resetting a password. */
export const userTokens = pgTable("user_tokens", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: tokenType("type").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/** Failed sign-in attempts, used to throttle password guessing. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Clients (the tenants)                                                */
/* ------------------------------------------------------------------ */

export const clientStatus = pgEnum("client_status", ["active", "archived"]);
export const rankFrequency = pgEnum("rank_frequency", [
  "daily",
  "weekly",
  "monthly",
  "manual",
]);

export const clients = pgTable("clients", {
  id: id(),
  name: text("name").notNull(),
  /** Bare domain used to find the client in search results, e.g. "example.co.uk". */
  domain: text("domain").notNull(),
  websiteUrl: text("website_url").notNull(),
  /** Business name as shown on Google Maps, used to match local pack results. */
  businessName: text("business_name"),
  timezone: text("timezone").notNull().default("Europe/London"),
  countryCode: text("country_code").notNull().default("GB"),
  status: clientStatus("status").notNull().default("active"),
  /** Demo clients show generated sample data and never call paid APIs. */
  isDemo: boolean("is_demo").notNull().default(false),
  rankFrequency: rankFrequency("rank_frequency").notNull().default("daily"),
  /** How many results deep to look for the client (10 to 100). Drives cost. */
  rankDepth: integer("rank_depth").notNull().default(100),
  /** 1 = Monday ... 7 = Sunday. Used when rankFrequency is weekly. */
  rankWeekday: integer("rank_weekday").notNull().default(1),
  defaultLocationCode: integer("default_location_code").notNull().default(2826),
  defaultLocationName: text("default_location_name")
    .notNull()
    .default("United Kingdom"),
  defaultLanguageCode: text("default_language_code").notNull().default("en"),
  createdAt: createdAt(),
});

export const clientUsers = pgTable(
  "client_users",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.userId] }),
    index("client_users_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ */
/* Google connections                                                   */
/* ------------------------------------------------------------------ */

/** agency = an omniSEO Google account. client = connected by the client. */
export const connectionScope = pgEnum("connection_scope", ["agency", "client"]);

export const googleConnections = pgTable(
  "google_connections",
  {
    id: id(),
    scope: connectionScope("scope").notNull(),
    /** Set only for client-scoped connections. */
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    googleEmail: text("google_email").notNull(),
    googleSub: text("google_sub").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    accessTokenEnc: text("access_token_enc"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    grantedScopes: text("granted_scopes").notNull().default(""),
    status: text("status").notNull().default("active"),
    lastError: text("last_error"),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("google_connections_client_idx").on(t.clientId)],
);

export const integrationType = pgEnum("integration_type", ["gsc", "ga4", "gbp"]);

/** Which Google property feeds each section of a client's dashboard. */
export const clientIntegrations = pgTable(
  "client_integrations",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    type: integrationType("type").notNull(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => googleConnections.id, { onDelete: "cascade" }),
    /** GSC site URL, GA4 property id, or GBP location resource name. */
    externalId: text("external_id").notNull(),
    externalName: text("external_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("client_integrations_unique").on(t.clientId, t.type)],
);

/** Cached API responses so dashboards load fast and stay inside quotas. */
export const apiCache = pgTable(
  "api_cache",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    cacheKey: text("cache_key").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [uniqueIndex("api_cache_unique").on(t.clientId, t.cacheKey)],
);

/* ------------------------------------------------------------------ */
/* Rank tracker                                                         */
/* ------------------------------------------------------------------ */

export const device = pgEnum("device", ["desktop", "mobile"]);

export const keywords = pgTable(
  "keywords",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    locationName: text("location_name").notNull(),
    languageCode: text("language_code").notNull().default("en"),
    device: device("device").notNull().default("desktop"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Also run a Google Maps search for this keyword (extra API cost). */
    trackMaps: boolean("track_maps").notNull().default(false),
    searchVolume: integer("search_volume"),
    cpc: numeric("cpc", { precision: 10, scale: 2 }),
    volumeUpdatedAt: ts("volume_updated_at"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("keywords_unique").on(
      t.clientId,
      t.keyword,
      t.locationCode,
      t.languageCode,
      t.device,
    ),
    index("keywords_client_idx").on(t.clientId),
  ],
);

export const competitors = pgTable(
  "competitors",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    label: text("label").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("competitors_unique").on(t.clientId, t.domain)],
);

/** One row per keyword per day. A null position means "not found in depth". */
export const rankResults = pgTable(
  "rank_results",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    keywordId: uuid("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    checkedOn: date("checked_on").notNull(),
    checkedAt: ts("checked_at").notNull().defaultNow(),
    /** Organic position counting only organic results. */
    position: integer("position"),
    /** Position counting every element on the page (ads, packs, features). */
    absolutePosition: integer("absolute_position"),
    url: text("url"),
    /** Position inside the local pack on the organic results page (1 to 3). */
    localPackPosition: integer("local_pack_position"),
    /** Position in a Google Maps search, when Maps tracking is on. */
    mapsPosition: integer("maps_position"),
    serpFeatures: text("serp_features")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    resultsCount: bigint("results_count", { mode: "number" }),
    /** dataforseo | import | demo */
    source: text("source").notNull().default("dataforseo"),
  },
  (t) => [
    uniqueIndex("rank_results_unique").on(t.keywordId, t.checkedOn),
    index("rank_results_client_date_idx").on(t.clientId, t.checkedOn),
  ],
);

export const competitorRanks = pgTable(
  "competitor_ranks",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    keywordId: uuid("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    checkedOn: date("checked_on").notNull(),
    position: integer("position"),
    url: text("url"),
    localPackPosition: integer("local_pack_position"),
  },
  (t) => [
    uniqueIndex("competitor_ranks_unique").on(
      t.keywordId,
      t.competitorId,
      t.checkedOn,
    ),
    index("competitor_ranks_client_date_idx").on(t.clientId, t.checkedOn),
  ],
);

export const rankTaskKind = pgEnum("rank_task_kind", ["organic", "maps"]);
export const rankTaskStatus = pgEnum("rank_task_status", [
  "posted",
  "done",
  "failed",
]);

/** A request sent to DataForSEO, tracked until its result arrives. */
export const rankTasks = pgTable(
  "rank_tasks",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    keywordId: uuid("keyword_id")
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    kind: rankTaskKind("kind").notNull(),
    forDate: date("for_date").notNull(),
    providerTaskId: text("provider_task_id").unique(),
    status: rankTaskStatus("status").notNull().default("posted"),
    error: text("error"),
    cost: numeric("cost", { precision: 10, scale: 5 }),
    postedAt: ts("posted_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    index("rank_tasks_status_idx").on(t.status, t.postedAt),
    index("rank_tasks_keyword_date_idx").on(t.keywordId, t.forDate, t.kind),
  ],
);

/** Cached DataForSEO location list for the keyword location picker. */
export const locations = pgTable(
  "locations",
  {
    code: integer("code").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    countryIso: text("country_iso").notNull(),
    parentCode: integer("parent_code"),
  },
  (t) => [index("locations_country_idx").on(t.countryIso)],
);

/* ------------------------------------------------------------------ */
/* Links built                                                          */
/* ------------------------------------------------------------------ */

export const linkStatus = pgEnum("link_status", ["live", "pending", "lost"]);

export const links = pgTable(
  "links",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** The page that links to the client. */
    sourceUrl: text("source_url").notNull(),
    sourceDomain: text("source_domain").notNull(),
    /** The client page being linked to. */
    targetUrl: text("target_url").notNull(),
    anchorText: text("anchor_text").notNull().default(""),
    linkType: text("link_type").notNull().default("guest_post"),
    rel: text("rel").notNull().default("dofollow"),
    domainRating: integer("domain_rating"),
    status: linkStatus("status").notNull().default("live"),
    builtOn: date("built_on").notNull(),
    /** Shown to the client. */
    clientNote: text("client_note").notNull().default(""),
    /** Staff only. Never sent to client users. */
    cost: numeric("cost", { precision: 10, scale: 2 }),
    /** Staff only. Never sent to client users. */
    internalNote: text("internal_note").notNull().default(""),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("links_client_date_idx").on(t.clientId, t.builtOn)],
);

/* ------------------------------------------------------------------ */
/* Scheduled reports                                                    */
/* ------------------------------------------------------------------ */

export const reportFrequency = pgEnum("report_frequency", ["weekly", "monthly"]);

export const reportSchedules = pgTable(
  "report_schedules",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    frequency: reportFrequency("frequency").notNull().default("monthly"),
    /** 1 = Monday ... 7 = Sunday (weekly schedules). */
    dayOfWeek: integer("day_of_week").notNull().default(1),
    /** 1 to 28 (monthly schedules). */
    dayOfMonth: integer("day_of_month").notNull().default(1),
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    sections: text("sections").array().notNull().default(sql`'{}'::text[]`),
    isActive: boolean("is_active").notNull().default(true),
    nextRunOn: date("next_run_on").notNull(),
    lastRunAt: ts("last_run_at"),
    createdAt: createdAt(),
  },
  (t) => [index("report_schedules_due_idx").on(t.isActive, t.nextRunOn)],
);

export const reportRuns = pgTable(
  "report_runs",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => reportSchedules.id, {
      onDelete: "set null",
    }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** sent | failed */
    status: text("status").notNull(),
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("report_runs_client_idx").on(t.clientId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Misc                                                                 */
/* ------------------------------------------------------------------ */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type RankResult = typeof rankResults.$inferSelect;
export type Link = typeof links.$inferSelect;
export type GoogleConnection = typeof googleConnections.$inferSelect;
export type ClientIntegration = typeof clientIntegrations.$inferSelect;
export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type ReportRun = typeof reportRuns.$inferSelect;
