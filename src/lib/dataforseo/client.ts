import "server-only";
import { PRICE_PER_PAGE_STANDARD } from "./pricing";

/**
 * Minimal DataForSEO v3 client: just the endpoints the rank tracker needs.
 * Docs: https://docs.dataforseo.com/v3/
 *
 * Every response is an envelope with its own status_code plus one status_code
 * per task, and HTTP is 200 for most errors, so both levels are checked.
 */

export class DataForSeoError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "DataForSeoError";
  }
}

export type DfsTask<TResult = unknown> = {
  id: string;
  status_code: number;
  status_message: string;
  cost: number;
  result_count?: number;
  data?: Record<string, unknown> & { tag?: string };
  result: TResult[] | null;
};

export type DfsEnvelope<TResult = unknown> = {
  status_code: number;
  status_message: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: DfsTask<TResult>[] | null;
};

export const DFS_OK = 20000;
export const DFS_TASK_CREATED = 20100;
/** Task accepted but not finished yet. */
export const DFS_IN_PROGRESS = new Set([40601, 40602]);
/** The search ran fine and Google returned nothing. A valid "not ranking". */
export const DFS_NO_RESULTS = 40102;

function baseUrl(): string {
  return (process.env.DATAFORSEO_BASE_URL || "https://api.dataforseo.com").replace(/\/+$/, "");
}

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new DataForSeoError(
      "DataForSEO is not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.",
      0,
    );
  }
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

async function request<TResult>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  timeoutMs = 60_000,
): Promise<DfsEnvelope<TResult>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DataForSeoError) throw err;
    throw new DataForSeoError(`Could not reach DataForSEO: ${String(err)}`, 0);
  }

  let json: DfsEnvelope<TResult> | null = null;
  try {
    json = (await res.json()) as DfsEnvelope<TResult>;
  } catch {
    /* fall through to the generic error below */
  }
  if (!json || typeof json.status_code !== "number") {
    throw new DataForSeoError(`DataForSEO returned HTTP ${res.status}`, 0, res.status);
  }
  if (json.status_code !== DFS_OK) {
    throw new DataForSeoError(json.status_message, json.status_code, res.status);
  }
  return json;
}

/* ------------------------------ SERP tasks ------------------------------ */

export type SerpTaskInput = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: "desktop" | "mobile";
  /** How many results deep to fetch. Rounded up to a multiple of ten by DataForSEO. */
  depth: number;
  /** 1 = standard queue, 2 = priority queue (about a minute, double the price). */
  priority?: 1 | 2;
  /** Echoed back with the result so it can be matched to our own record. */
  tag: string;
  postbackUrl?: string;
};

export type PostedTask = {
  tag: string;
  ok: boolean;
  id: string | null;
  cost: number;
  statusCode: number;
  statusMessage: string;
};

/** DataForSEO accepts at most 100 tasks per POST. */
export const MAX_TASKS_PER_POST = 100;

async function postTasks(path: string, tasks: Record<string, unknown>[], tags: string[]) {
  const env = await request<unknown>("POST", path, tasks);
  const returned = env.tasks ?? [];
  return tags.map((tag, i): PostedTask => {
    // Tasks come back in order, but match on the echoed tag where present.
    const t = returned.find((r) => r.data?.tag === tag) ?? returned[i];
    return {
      tag,
      ok: t?.status_code === DFS_TASK_CREATED,
      id: t?.id ?? null,
      cost: t?.cost ?? 0,
      statusCode: t?.status_code ?? 0,
      statusMessage: t?.status_message ?? "No response for this task",
    };
  });
}

export async function postOrganicTasks(inputs: SerpTaskInput[]): Promise<PostedTask[]> {
  return postTasks(
    "/v3/serp/google/organic/task_post",
    inputs.map((t) => ({
      keyword: t.keyword,
      location_code: t.locationCode,
      language_code: t.languageCode,
      device: t.device,
      os: t.device === "mobile" ? "android" : "windows",
      depth: Math.min(Math.max(Math.ceil(t.depth / 10) * 10, 10), 200),
      priority: t.priority ?? 1,
      tag: t.tag,
      ...(t.postbackUrl ? { postback_url: t.postbackUrl, postback_data: "advanced" } : {}),
    })),
    inputs.map((t) => t.tag),
  );
}

export async function postMapsTasks(inputs: SerpTaskInput[]): Promise<PostedTask[]> {
  return postTasks(
    "/v3/serp/google/maps/task_post",
    inputs.map((t) => ({
      keyword: t.keyword,
      location_code: t.locationCode,
      language_code: t.languageCode,
      device: t.device,
      os: t.device === "mobile" ? "android" : "windows",
      // Maps is billed per 100 results; the first 100 cover a local market.
      depth: 100,
      priority: t.priority ?? 1,
      tag: t.tag,
      ...(t.postbackUrl ? { postback_url: t.postbackUrl, postback_data: "advanced" } : {}),
    })),
    inputs.map((t) => t.tag),
  );
}

export type SerpItem = {
  type: string;
  rank_group?: number;
  rank_absolute?: number;
  domain?: string | null;
  url?: string | null;
  title?: string | null;
  cid?: string | null;
  [key: string]: unknown;
};

export type SerpResult = {
  keyword: string;
  se_domain?: string;
  location_code?: number;
  language_code?: string;
  check_url?: string;
  datetime?: string;
  item_types?: string[] | null;
  se_results_count?: number | null;
  items_count?: number;
  items: SerpItem[] | null;
};

export type SerpKind = "organic" | "maps";

/** Fetches a finished task. Returns the raw task so the caller can ingest it. */
export async function getSerpTask(kind: SerpKind, id: string): Promise<DfsTask<SerpResult> | null> {
  const env = await request<SerpResult>(
    "GET",
    `/v3/serp/google/${kind}/task_get/advanced/${encodeURIComponent(id)}`,
  );
  return env.tasks?.[0] ?? null;
}

export type ReadyTask = { id: string; tag: string | null; kind: SerpKind };

/** Finished tasks whose results have not been collected (up to 1,000 per kind). */
export async function listReadyTasks(): Promise<ReadyTask[]> {
  const out: ReadyTask[] = [];
  for (const kind of ["organic", "maps"] as const) {
    const env = await request<{ id: string; tag?: string | null }>(
      "GET",
      `/v3/serp/google/${kind}/tasks_ready`,
    );
    for (const task of env.tasks ?? []) {
      for (const r of task.result ?? []) out.push({ id: r.id, tag: r.tag ?? null, kind });
    }
  }
  return out;
}

/* ------------------------------- Locations ------------------------------ */

export type DfsLocation = {
  location_code: number;
  location_name: string;
  location_code_parent: number | null;
  country_iso_code: string;
  location_type: string;
};

/** Every Google search location in a country. Free to call. */
export async function fetchLocations(countryIso: string): Promise<DfsLocation[]> {
  const env = await request<DfsLocation>(
    "GET",
    `/v3/serp/google/locations/${countryIso.toLowerCase()}`,
    undefined,
    120_000,
  );
  return env.tasks?.[0]?.result ?? [];
}

/* ----------------------------- Search volume ---------------------------- */

export type VolumeRow = {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: string | null;
};

/** Google Ads search volume for up to 1,000 keywords. Billed per request. */
export async function fetchSearchVolume(
  keywordList: string[],
  locationCode: number,
  languageCode: string,
): Promise<{ rows: VolumeRow[]; cost: number }> {
  const env = await request<VolumeRow>(
    "POST",
    "/v3/keywords_data/google_ads/search_volume/live",
    [
      {
        keywords: keywordList.slice(0, 1000),
        location_code: locationCode,
        language_code: languageCode,
      },
    ],
    120_000,
  );
  const task = env.tasks?.[0];
  if (task && task.status_code !== DFS_OK) {
    throw new DataForSeoError(task.status_message, task.status_code);
  }
  return { rows: task?.result ?? [], cost: env.cost ?? 0 };
}

/* -------------------------------- Account ------------------------------- */

export type AccountStatus =
  | { ok: true; balance: number | null; login: string | null }
  | { ok: false; code: number; message: string };

/** Balance and whether the credentials work. Never throws. */
export async function getAccountStatus(): Promise<AccountStatus> {
  try {
    const env = await request<{ login?: string; money?: { balance?: number } }>(
      "GET",
      "/v3/appendix/user_data",
      undefined,
      20_000,
    );
    const r = env.tasks?.[0]?.result?.[0];
    return { ok: true, balance: r?.money?.balance ?? null, login: r?.login ?? null };
  } catch (err) {
    const e = err instanceof DataForSeoError ? err : new DataForSeoError(String(err), 0);
    return { ok: false, code: e.code, message: e.message };
  }
}

/** Estimated standard-queue cost of one organic check at the given depth. */
export function estimateCheckCost(depth: number, priority: 1 | 2 = 1): number {
  return Math.ceil(depth / 10) * PRICE_PER_PAGE_STANDARD * priority;
}
