import { beforeAll, describe, expect, it } from "vitest";

/**
 * The guarantee that matters most: a client login can only ever reach its own
 * client's data. Runs against a real Postgres (TEST_DATABASE_URL).
 */
const hasDb = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!hasDb)("tenant isolation", () => {
  type Ids = {
    staff: string;
    userA: string;
    userB: string;
    userBoth: string;
    clientA: string;
    clientB: string;
    archived: string;
    keywordA: string;
    keywordB: string;
  };
  let ids: Ids;
  let access: typeof import("@/lib/auth/access");
  let queries: typeof import("@/lib/rank/queries");
  let linkQueries: typeof import("@/lib/links/queries");
  let schema: typeof import("@/db/schema");
  let db: (typeof import("@/db"))["db"];

  const range = { from: "2026-01-01", to: "2026-12-31", days: 365 };

  beforeAll(async () => {
    ({ db } = await import("@/db"));
    schema = await import("@/db/schema");
    access = await import("@/lib/auth/access");
    queries = await import("@/lib/rank/queries");
    linkQueries = await import("@/lib/links/queries");

    const mkUser = async (email: string, role: "admin" | "staff" | "client") =>
      (await db.insert(schema.users).values({ email, name: email, role }).returning())[0]!.id;
    const mkClient = async (name: string, status: "active" | "archived" = "active") =>
      (
        await db
          .insert(schema.clients)
          .values({ name, domain: `${name.toLowerCase()}.example`, websiteUrl: `https://${name.toLowerCase()}.example/`, status })
          .returning()
      )[0]!.id;
    const mkKeyword = async (clientId: string, keyword: string) => {
      const [k] = await db
        .insert(schema.keywords)
        .values({ clientId, keyword, locationCode: 2826, locationName: "United Kingdom" })
        .returning();
      await db.insert(schema.rankResults).values({ clientId, keywordId: k!.id, checkedOn: "2026-06-01", position: 5 });
      return k!.id;
    };

    const staff = await mkUser("staff@test.example", "staff");
    const userA = await mkUser("a@test.example", "client");
    const userB = await mkUser("b@test.example", "client");
    const userBoth = await mkUser("both@test.example", "client");
    const clientA = await mkClient("Alpha");
    const clientB = await mkClient("Bravo");
    const archived = await mkClient("Charlie", "archived");
    await db.insert(schema.clientUsers).values([
      { clientId: clientA, userId: userA },
      { clientId: clientB, userId: userB },
      { clientId: archived, userId: userA },
      { clientId: clientA, userId: userBoth },
      { clientId: clientB, userId: userBoth },
    ]);
    const keywordA = await mkKeyword(clientA, "alpha keyword");
    const keywordB = await mkKeyword(clientB, "bravo keyword");
    await db.insert(schema.links).values([
      { clientId: clientA, sourceUrl: "https://a-source.example/", sourceDomain: "a-source.example", targetUrl: "https://alpha.example/", builtOn: "2026-06-01", cost: "120", internalNote: "secret supplier" },
      { clientId: clientB, sourceUrl: "https://b-source.example/", sourceDomain: "b-source.example", targetUrl: "https://bravo.example/", builtOn: "2026-06-01" },
    ]);
    ids = { staff, userA, userB, userBoth, clientA, clientB, archived, keywordA, keywordB };
  });

  const user = (id: string, role: "admin" | "staff" | "client") => ({ id, role, email: "x", name: "x" });

  it("lets a client user open only their own client", async () => {
    const a = user(ids.userA, "client");
    expect((await access.resolveClientAccess(a, ids.clientA))?.id).toBe(ids.clientA);
    expect(await access.resolveClientAccess(a, ids.clientB)).toBeNull();
  });

  it("hides archived clients from client users but not from staff", async () => {
    expect(await access.resolveClientAccess(user(ids.userA, "client"), ids.archived)).toBeNull();
    expect((await access.resolveClientAccess(user(ids.staff, "staff"), ids.archived))?.id).toBe(ids.archived);
  });

  it("gives staff every client and rejects malformed ids", async () => {
    const staff = user(ids.staff, "staff");
    expect((await access.resolveClientAccess(staff, ids.clientA))?.id).toBe(ids.clientA);
    expect((await access.resolveClientAccess(staff, ids.clientB))?.id).toBe(ids.clientB);
    expect(await access.resolveClientAccess(staff, "not-a-uuid")).toBeNull();
    expect(await access.resolveClientAccess(staff, "' or 1=1 --")).toBeNull();
    expect(await access.resolveClientAccess(staff, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("lists only the clients a user belongs to", async () => {
    const mine = await access.listAccessibleClients(user(ids.userA, "client"));
    expect(mine.map((c) => c.id)).toEqual([ids.clientA]);
    const both = await access.listAccessibleClients(user(ids.userBoth, "client"));
    expect(both.map((c) => c.id).sort()).toEqual([ids.clientA, ids.clientB].sort());
    const none = await access.listAccessibleClients(user("00000000-0000-0000-0000-000000000001", "client"));
    expect(none).toEqual([]);
  });

  it("scopes ranking queries to the client in the context", async () => {
    const a = user(ids.userA, "client");
    const clientA = (await access.resolveClientAccess(a, ids.clientA))!;
    const ctx = { user: a, client: clientA, isStaff: false };

    const rows = await queries.getKeywordRows(ctx, range);
    expect(rows.map((r) => r.keyword)).toEqual(["alpha keyword"]);

    // Asking for another client's keyword by id returns nothing.
    expect(await queries.getKeywordHistory(ctx, ids.keywordB, range)).toBeNull();
    expect((await queries.getKeywordHistory(ctx, ids.keywordA, range))?.keyword.keyword).toBe("alpha keyword");

    const series = await queries.getDistributionSeries(ctx, range);
    expect(series.reduce((n, p) => n + p.top10, 0)).toBe(1);
  });

  it("never sends staff-only link fields to client users", async () => {
    const a = user(ids.userA, "client");
    const clientA = (await access.resolveClientAccess(a, ids.clientA))!;

    const forClient = await linkQueries.getLinks({ user: a, client: clientA, isStaff: false }, range);
    expect(forClient).toHaveLength(1);
    expect(forClient[0]!.sourceDomain).toBe("a-source.example");
    expect(forClient[0]).not.toHaveProperty("cost");
    expect(forClient[0]).not.toHaveProperty("internalNote");
    expect(JSON.stringify(forClient)).not.toContain("secret supplier");

    const staff = user(ids.staff, "staff");
    const forStaff = await linkQueries.getLinks({ user: staff, client: clientA, isStaff: true }, range);
    expect(forStaff[0]).toMatchObject({ cost: "120.00", internalNote: "secret supplier" });
  });
});
