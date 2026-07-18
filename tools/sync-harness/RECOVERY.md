# Recovering the stranded page (July 2026 incident)

> **Update (root cause confirmed from the live production catalog):** typing
> produces `relation "projects" does not exist` from the server save path.
> The migration-011 word-limit functions are canonical and fully qualified in
> production — they were NOT the fault. The fault is a hand-applied trigger
> the repo never contained: `trg_page_updated` on `public.pages`, whose
> function `public.bump_project_updated_at()` uses unqualified
> `projects`/`chapters` with no pinned search_path. Fired from inside
> `save_page_checked` (`set search_path = ''`), it raises that error and
> rolls back the entire save — the RPC reaches Postgres but the page stays at
> 0 words. **Apply
> `src/lib/supabase/migrations/012_fix_bump_project_updated_at.sql` in the
> Supabase SQL editor FIRST**, then run the read-only verification queries at
> the bottom of that file, then deploy the client. The steps below remain
> valid for backing up and confirming recovery.

Steps for the affected browser — the one that shows the prose locally while
the server page holds 0 words. Order matters: back up first.

## Step 0 — back up the local queue (read-only, do this first)

In the affected browser, open any Rune tab, DevTools → Console, paste:

```js
const req = indexedDB.open('rune-offline');
req.onsuccess = () => {
  const db = req.result;
  const tx = db.transaction(['pending_writes', 'page_cache'], 'readonly');
  const a = tx.objectStore('pending_writes').getAll();
  const b = tx.objectStore('page_cache').getAll();
  tx.oncomplete = () => {
    const out = {
      exportedAt: new Date().toISOString(),
      pending_writes: a.result,
      page_cache: b.result,
    };
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const el = document.createElement('a');
    el.href = URL.createObjectURL(blob);
    el.download = 'rune-offline-backup.json';
    el.click();
    console.log('Backed up', out.pending_writes.length, 'pending writes,',
      out.page_cache.length, 'cache entries');
  };
};
```

This downloads a JSON file containing every unsynced draft (including the
stranded prose). It reads nothing from the server and writes nothing anywhere
except the downloaded file. Keep it until the incident is fully closed.

## Step 1 — capture the exact server failure (before deploying, optional but valuable)

In the affected browser, open the conflicted page, open DevTools → Network,
filter on `save_page_checked`, then click **Keep Local** in the conflict modal.
Record for the POST to `/rest/v1/rpc/save_page_checked`:

- HTTP status
- full JSON response body (contains the Postgres error code/message, or a
  `status` field: `ok` / `word_limit_blocked` / `error`)

Interpretation:

| Observation | Meaning |
| --- | --- |
| `{"status":"ok",...}` and the row persists | client-side false-conflict latch was the only fault (fixed in this patch) |
| `{"code":"42P01","message":"relation \"projects\" does not exist"}` | the confirmed trigger fault (`bump_project_updated_at` unqualified under `search_path = ''`) → apply migration 012 |
| `{"code":"42883","message":"function public.account_word_total(uuid, integer) does not exist"}` | production DB still has the stale 3-arg draft of `account_word_total` → re-run current migration 011 in the SQL editor |
| `{"code":"42P01","message":"relation \"public.user_pricing_entitlements\" does not exist"}` | migration 009 was never applied → apply it, then re-run 011 |
| `{"status":"word_limit_blocked","limit":N}` | genuine account-wide allowance rejection — check the account's cohort/tier before anything else |
| HTTP 404 `PGRST202` | PostgREST schema cache is stale → Settings → API → reload schema, or `notify pgrst, 'reload schema';` |
| other `P0001`/`42501` | send the exact message |

## Step 2 — verify the deployed SQL matches the repo (Supabase SQL editor, read-only)

```sql
-- 1. Signatures: expect exactly ONE account_word_total with args
--    (p_candidate_page_id uuid, p_candidate_word_count integer).
--    A (uuid, uuid, int) overload = stale draft → run migration 011 as committed.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('save_page_checked','insert_page_checked','account_word_total',
                    'free_word_limit_for_caller','lock_account_word_budget');

-- 2. Body of the deployed save function — diff against
--    src/lib/supabase/migrations/011_account_word_limit.sql
select pg_get_functiondef('public.save_page_checked(uuid, jsonb, int, int)'::regprocedure);

-- 3. Dependencies exist
select to_regclass('public.user_pricing_entitlements') as entitlements_table,
       to_regclass('public.pages') as pages_table;

-- 4. The version column + trigger from migration 006
select column_name from information_schema.columns
 where table_schema='public' and table_name='pages' and column_name='version';
select tgname from pg_trigger where tgrelid = 'public.pages'::regclass and not tgisinternal;

-- 5. The trigger fix from migration 012 landed: body must reference
--    public.projects / public.chapters and pin `SET search_path TO ''`
select pg_get_functiondef('public.bump_project_updated_at()'::regprocedure);
```

## Step 3 — deploy this patch, then let it self-heal

After deployment, in the affected browser simply open Rune and leave any app
page open for ~30 seconds (or open the affected chapter). The background flush
now re-evaluates `conflict` rows: a local draft facing a 0-word server page is
treated as the first real upload, not a conflict, and is uploaded and
confirmed automatically. The console will log a specific
`[sync] page save did not persist (...): <reason>` line if the server still
rejects it — that reason is the next diagnostic step, not a dead end: the
draft remains queued and retried.

Verify recovery:

1. The editor shows "Saved" (no Conflict indicator).
2. Refresh the page — prose still present.
3. Incognito/second browser — prose present.
4. `pending_writes` for that page is empty (re-run the Step 0 snippet and
   check the downloaded file, or DevTools → Application → IndexedDB).

## Never do

- Do not clear IndexedDB/localStorage for the origin until the backup exists
  AND the prose is confirmed in a second browser.
- Do not click "Keep Server" on a conflict showing `Server: 0 words` — that
  discards the local draft in favor of an empty page (the patch prevents this
  state from arising, but older tabs may still show a stale modal until
  reloaded).
