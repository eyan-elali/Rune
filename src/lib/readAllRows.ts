// Every row a query matches, a page at a time — never one request that the
// API's row cap (PostgREST max-rows, 1000 on Supabase by default) silently cuts
// short. A Collection of 300 Entries with six properties holds 1,800 values: one
// unpaged read would show the writer some of them as empty.
//
// Keyset paging in key order: a page starts after the last row of the one
// before, so no row is skipped or repeated even if rows are added meanwhile.
// One key (an `id`): `key > last`. Two keys (`entry_id, property_id`): after
// each full page, the rest of its last leading value is read by the second key
// alone (`first = last.first and second > last.second`), then the main read
// goes on past it (`first > last.first`) — the filter builder has no tuple
// comparison, and this needs none.
//
// The page size must not exceed the API's cap (a short page means "the end").
// Throws on a failed read: a caller never works from part of a table.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryLike = any;

/** Rows per request: well below the API's row cap. */
export const READ_PAGE = 500;

export async function readAllRows<T>(
  query: () => QueryLike,
  keys: readonly [string] | readonly [string, string] | readonly string[] = ["id"],
  pageSize = READ_PAGE
): Promise<T[]> {
  if (keys.length !== 1 && keys.length !== 2) throw new Error("readAllRows: one key or two");
  const [first, second] = keys;
  const rows: T[] = [];
  let last: Record<string, unknown> | null = null;
  for (;;) {
    let q = query();
    if (last !== null) q = q.gt(first, last[first]);
    for (const k of keys) q = q.order(k, { ascending: true });
    const { data, error } = await q.limit(pageSize);
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...(page as T[]));
    if (page.length < pageSize) return rows;
    last = page[page.length - 1];
    if (second !== undefined) {
      const boundary = last;
      rows.push(...(await readAllRows<T>(() => query().eq(first, boundary[first]).gt(second, boundary[second]), [second], pageSize)));
    }
  }
}

/** The same rows as a { data, error } read, for a loader that reports rather than throws. */
export async function readAll<T>(
  query: () => QueryLike,
  keys: readonly string[] = ["id"]
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  try {
    return { data: await readAllRows<T>(query, keys), error: null };
  } catch (e) {
    // The database's own error (its code says, e.g., that a column doesn't exist yet).
    if (e && typeof e === "object" && "message" in e) return { data: [], error: e as { message: string; code?: string } };
    return { data: [], error: { message: String(e) } };
  }
}
