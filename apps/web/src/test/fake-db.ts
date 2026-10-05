/**
 * A small in-memory stand-in for the Prisma client, for tests only.
 *
 * It implements just the calls the app makes (and throws loudly on anything it
 * does not know, so a test can never pass because the fake ignored something).
 * It copies three Prisma behaviours that matter for these tests:
 *
 *  - Operations are lazy: they run when awaited, or inside $transaction().
 *  - $transaction([...]) is all-or-nothing: if any step throws, every table is
 *    put back the way it was.
 *  - `where: { field: undefined }` means "no filter on that field" — the
 *    footgun that makes a missing user id on a deleteMany delete everything.
 *
 * The same test files also run against a real PostgreSQL database when
 * TEST_DATABASE_URL is set (see db.ts), which is what keeps this fake honest.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown> | undefined;

/** Runs when awaited, like a PrismaPromise */
class Lazy<T> implements PromiseLike<T> {
  constructor(readonly run: () => T) {}
  then<A = T, B = never>(
    onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return new Promise<T>((resolve, reject) => {
      try {
        resolve(this.run());
      } catch (e) {
        reject(e);
      }
    }).then(onFulfilled, onRejected);
  }
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function compare(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : (a as number | string);
  const y = b instanceof Date ? b.getTime() : (b as number | string);
  return x < y ? -1 : x > y ? 1 : 0;
}

function matches(row: Row, where: Where): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue; // Prisma: undefined = not filtered
    if (key === "AND" || key === "OR" || key === "NOT") {
      throw new Error(`fake-db: "${key}" is not supported`);
    }
    const value = row[key];
    if (
      condition === null ||
      typeof condition !== "object" ||
      condition instanceof Date
    ) {
      if (!same(value, condition)) return false;
      continue;
    }
    for (const [op, arg] of Object.entries(condition as Row)) {
      if (arg === undefined) continue;
      if (op === "equals") {
        if (!same(value, arg)) return false;
      } else if (op === "not") {
        if (same(value, arg)) return false;
      } else if (op === "in") {
        if (!(arg as unknown[]).some((x) => same(value, x))) return false;
      } else if (op === "lt") {
        if (value == null || !(compare(value, arg) < 0)) return false;
      } else if (op === "lte") {
        if (value == null || !(compare(value, arg) <= 0)) return false;
      } else if (op === "gt") {
        if (value == null || !(compare(value, arg) > 0)) return false;
      } else if (op === "gte") {
        if (value == null || !(compare(value, arg) >= 0)) return false;
      } else {
        throw new Error(`fake-db: operator "${op}" is not supported`);
      }
    }
  }
  return true;
}

function pick(row: Row, select: Record<string, boolean> | undefined): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, on] of Object.entries(select)) if (on) out[key] = row[key];
  return out;
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `c${Date.now().toString(36)}${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

type FindArgs = {
  where?: Where;
  orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];
  take?: number;
  select?: Record<string, boolean>;
  include?: unknown;
};

class Table {
  rows: Row[] = [];

  constructor(
    private readonly name: string,
    private readonly defaults: () => Row,
    private readonly unique: string[],
    private readonly db: FakeDb
  ) {}

  private lazy<T>(op: string, run: () => T): Lazy<T> {
    return new Lazy(() => {
      this.db.beforeOp(`${this.name}.${op}`);
      return run();
    });
  }

  private insert(data: Row): Row {
    // A field passed as undefined falls back to its default, as in Prisma
    const full: Row = this.defaults();
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) full[key] = value;
    }
    for (const field of this.unique) {
      if (this.rows.some((r) => same(r[field], full[field]))) {
        throw Object.assign(
          new Error(`fake-db: unique constraint failed on ${this.name}.${field}`),
          { code: "P2002" }
        );
      }
    }
    this.rows.push(full);
    return full;
  }

  private one(where: Where, op: string): Row {
    const found = this.rows.filter((r) => matches(r, where));
    if (found.length !== 1) {
      throw Object.assign(
        new Error(`fake-db: ${this.name}.${op} matched ${found.length} rows`),
        { code: "P2025" }
      );
    }
    return found[0];
  }

  private apply(row: Row, data: Row) {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) row[key] = value;
    }
    if ("updatedAt" in row) row.updatedAt = new Date();
  }

  findMany(args: FindArgs = {}) {
    return this.lazy("findMany", () => {
      if (args.include) throw new Error("fake-db: include is not supported");
      let out = this.rows.filter((r) => matches(r, args.where));
      const orders = args.orderBy
        ? Array.isArray(args.orderBy)
          ? args.orderBy
          : [args.orderBy]
        : [];
      if (orders.length) {
        out = [...out].sort((a, b) => {
          for (const order of orders) {
            const [[field, direction]] = Object.entries(order);
            const c = compare(a[field], b[field]);
            if (c !== 0) return direction === "desc" ? -c : c;
          }
          return 0;
        });
      }
      if (args.take !== undefined) out = out.slice(0, args.take);
      return out.map((r) => pick(r, args.select));
    });
  }

  findFirst(args: FindArgs = {}) {
    return this.lazy("findFirst", () => {
      const row = this.rows.find((r) => matches(r, args.where));
      return row ? pick(row, args.select) : null;
    });
  }

  findUnique(args: FindArgs) {
    return this.lazy("findUnique", () => {
      const keys = Object.keys(args.where ?? {});
      if (!keys.some((k) => k === "id" || this.unique.includes(k))) {
        throw new Error(`fake-db: ${this.name}.findUnique needs a unique field`);
      }
      const row = this.rows.find((r) => matches(r, args.where));
      return row ? pick(row, args.select) : null;
    });
  }

  count(args: { where?: Where } = {}) {
    return this.lazy(
      "count",
      () => this.rows.filter((r) => matches(r, args.where)).length
    );
  }

  create(args: { data: Row }) {
    return this.lazy("create", () => ({ ...this.insert(args.data) }));
  }

  createMany(args: { data: Row[] }) {
    return this.lazy("createMany", () => {
      for (const data of args.data) this.insert(data);
      return { count: args.data.length };
    });
  }

  update(args: { where: Where; data: Row }) {
    return this.lazy("update", () => {
      const row = this.one(args.where, "update");
      this.apply(row, args.data);
      return { ...row };
    });
  }

  updateMany(args: { where?: Where; data: Row }) {
    return this.lazy("updateMany", () => {
      const found = this.rows.filter((r) => matches(r, args.where));
      for (const row of found) this.apply(row, args.data);
      return { count: found.length };
    });
  }

  upsert(args: { where: Where; create: Row; update: Row }) {
    return this.lazy("upsert", () => {
      const row = this.rows.find((r) => matches(r, args.where));
      if (!row) return { ...this.insert(args.create) };
      this.apply(row, args.update);
      return { ...row };
    });
  }

  delete(args: { where: Where }) {
    return this.lazy("delete", () => {
      const row = this.one(args.where, "delete");
      this.rows = this.rows.filter((r) => r !== row);
      this.db.cascade(this.name, [row]);
      return { ...row };
    });
  }

  deleteMany(args: { where?: Where } = {}) {
    return this.lazy("deleteMany", () => {
      const gone = this.rows.filter((r) => matches(r, args.where));
      this.rows = this.rows.filter((r) => !gone.includes(r));
      this.db.cascade(this.name, gone);
      return { count: gone.length };
    });
  }

  groupBy(args: { by: string[]; where?: Where; _count?: { _all?: boolean } }) {
    return this.lazy("groupBy", () => {
      if (args.by.length !== 1) throw new Error("fake-db: groupBy one field only");
      const field = args.by[0];
      const groups = new Map<unknown, number>();
      for (const row of this.rows.filter((r) => matches(r, args.where))) {
        groups.set(row[field], (groups.get(row[field]) || 0) + 1);
      }
      return [...groups].map(([value, n]) => ({
        [field]: value,
        _count: { _all: n },
      }));
    });
  }
}

const DEFAULT_FX = '{"NGN":1,"USD":1580,"GBP":1990,"EUR":1710}';

export class FakeDb {
  /** Name of an operation ("user.update") that should fail the next time it runs */
  private failOn: string | null = null;

  user = new Table(
    "user",
    () => ({
      id: newId(),
      name: null,
      passwordHash: null,
      baseCurrency: "NGN",
      onboarding: "pending",
      theme: "system",
      createdAt: new Date(),
      updatedAt: new Date(),
      fxRates: DEFAULT_FX,
      dashboardLayoutJson: "",
    }),
    ["email"],
    this
  );
  session = new Table(
    "session",
    () => ({ id: newId(), createdAt: new Date() }),
    ["token"],
    this
  );
  emailOtp = new Table(
    "emailOtp",
    () => ({
      id: newId(),
      userId: null,
      consumed: false,
      attempts: 0,
      createdAt: new Date(),
    }),
    [],
    this
  );
  budgetPlan = new Table(
    "budgetPlan",
    () => ({
      id: newId(),
      householdId: null,
      templateId: null,
      emergencyCarryOverDefault: true,
      openingBalancesJson: "{}",
      lastMonthClosed: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    ["userId"],
    this
  );
  incomeSource = new Table(
    "incomeSource",
    () => ({
      id: newId(),
      type: "other",
      emoji: "💵",
      currency: "NGN",
      amount: 0,
      createdAt: new Date(),
    }),
    [],
    this
  );
  transaction = new Table(
    "transaction",
    () => ({
      id: newId(),
      householdId: null,
      currency: "NGN",
      bucketId: null,
      category: null,
      sourceId: null,
      note: null,
      override: false,
      reason: null,
      overspend: false,
      recurringRuleId: null,
      date: new Date(),
      createdAt: new Date(),
    }),
    [],
    this
  );
  recurringRule = new Table(
    "recurringRule",
    () => ({
      id: newId(),
      type: "e",
      currency: "NGN",
      bucketId: null,
      sourceId: null,
      note: null,
      dayOfMonth: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    [],
    this
  );
  inboxMessage = new Table(
    "inboxMessage",
    () => ({
      id: newId(),
      kind: "system",
      read: false,
      relatedTxId: null,
      createdAt: new Date(),
    }),
    [],
    this
  );
  aiMessage = new Table(
    "aiMessage",
    () => ({ id: newId(), createdAt: new Date() }),
    [],
    this
  );

  private get tables(): Table[] {
    return [
      this.user,
      this.session,
      this.emailOtp,
      this.budgetPlan,
      this.incomeSource,
      this.transaction,
      this.recurringRule,
      this.inboxMessage,
      this.aiMessage,
    ];
  }

  /** onDelete: Cascade from User, as in schema.prisma */
  cascade(table: string, gone: Row[]) {
    if (table !== "user" || gone.length === 0) return;
    const ids = gone.map((u) => u.id);
    for (const t of this.tables) {
      if (t === this.user) continue;
      t.rows = t.rows.filter((r) => !ids.includes(r.userId));
    }
  }

  beforeOp(op: string) {
    if (this.failOn === op) {
      this.failOn = null;
      throw new Error(`fake-db: injected failure in ${op}`);
    }
  }

  /** Test hook: make the named operation throw the next time it runs */
  __failNext(op: string) {
    this.failOn = op;
  }

  __reset() {
    for (const t of this.tables) t.rows = [];
    this.failOn = null;
  }

  async $transaction(work: unknown): Promise<unknown> {
    const snapshot = this.tables.map((t) => structuredClone(t.rows));
    const restore = () => this.tables.forEach((t, i) => (t.rows = snapshot[i]));
    try {
      if (Array.isArray(work)) {
        const results: unknown[] = [];
        for (const step of work) {
          if (!(step instanceof Lazy)) {
            throw new Error("fake-db: $transaction needs client operations");
          }
          results.push(step.run());
        }
        return results;
      }
      if (typeof work === "function") {
        return await (work as (tx: FakeDb) => unknown)(this);
      }
      throw new Error("fake-db: unsupported $transaction argument");
    } catch (e) {
      restore();
      throw e;
    }
  }
}
