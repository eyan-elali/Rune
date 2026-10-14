// The launch funnel: analytics, activation and attribution for paid acquisition.
//
//   * pure rules (lib/launchMetrics.ts): channel buckets never guess, the
//     referrer is a bare host, device class, CTA placement, environment tag,
//     the metadata allowlist, D1 / D7 / returned from writing days
//   * first touch (lib/attribution.ts): a tagged touch is final, a later visit
//     never overwrites it, a referral-only fallback is superseded by a campaign
//   * signup (actions/signupAnalytics.ts): the browser that signs up persists
//     its first touch for a brand-new profile only, first touch wins, a writer
//     without a campaign gets no invented attribution
//   * activation (actions/writingStats.ts): first_words_written once per
//     account — retries, offline replays, a second tab are no-ops; account-
//     level credits and zero-word (paste-only) saves do not activate
//   * the front door's anonymous events (api/front-event): placement kept,
//     the click id and full referrer never stored, bad input stored nothing
//   * the report (lib/launchReport.ts): cohort, activation across devices,
//     the campaign row a test campaign produces, D1/D7 windows, Direct/Unknown
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, HARNESS_DIR, REPO_DIR, LEGACY_BASELINE, RUNE2_SCHEMA, createAuthUser } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const HOLLOW = projectId('hollow');
const PG_JS = path.join(HARNESS_DIR, 'mocks/supabaseJsPg.js');
const COOKIES = path.join(HARNESS_DIR, 'mocks/nextHeadersCookies.js');
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');

let legacy, metrics, attribution, report, writingStats, signup, frontEvent;
before(async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'harness-service-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://harness.invalid';
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  metrics = await bundleForTest('src/lib/launchMetrics.ts', { name: 'la_metrics' });
  attribution = await bundleForTest('src/lib/attribution.ts', { name: 'la_attribution' });
  report = await bundleForTest('src/lib/launchReport.ts', { name: 'la_report' });
  writingStats = await bundleForTest('src/lib/actions/writingStats.ts', { name: 'la_writingStats', aliases: { '@supabase/supabase-js': PG_JS } });
  signup = await bundleForTest('src/lib/actions/signupAnalytics.ts', { name: 'la_signup', aliases: { '@supabase/supabase-js': PG_JS, 'next/headers': COOKIES } });
  frontEvent = await bundleForTest('src/app/api/front-event/route.ts', { name: 'la_frontEvent', aliases: { '@supabase/supabase-js': PG_JS } });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  globalThis.__pgServiceDb = db;
  return db;
}

// ── Pure rules ──────────────────────────────────────────────────────────────

test('channel buckets: campaign fields decide, then a Meta click id, then the referrer; nothing is Direct / Unknown', () => {
  const { channelFor } = metrics;
  assert.equal(channelFor({ source: 'instagram', medium: 'paid_social' }), 'Instagram');
  assert.equal(channelFor({ source: 'ig' }), 'Instagram');
  assert.equal(channelFor({ source: 'facebook' }), 'Meta');
  assert.equal(channelFor({ source: 'meta', campaign: 'x' }), 'Meta');
  assert.equal(channelFor({ source: 'TikTok' }), 'TikTok');
  assert.equal(channelFor({ source: 'newsletter' }), 'Other campaign');
  assert.equal(channelFor({ campaign: 'spring' }), 'Other campaign');
  assert.equal(channelFor({ fbclid: 'abc' }), 'Meta');
  assert.equal(channelFor({ referrer_host: 'google.com' }), 'Organic search');
  assert.equal(channelFor({ referrer_host: 'duckduckgo.com' }), 'Organic search');
  assert.equal(channelFor({ referrer_host: 'l.instagram.com' }), 'Instagram');
  assert.equal(channelFor({ referrer_host: 'm.facebook.com' }), 'Meta');
  assert.equal(channelFor({ referrer_host: 'reddit.com' }), 'Referral');
  assert.equal(channelFor({ source: 'instagram', referrer_host: 'google.com' }), 'Instagram', 'campaign outranks referrer');
  assert.equal(channelFor({}), 'Direct / Unknown');
  assert.equal(channelFor(null), 'Direct / Unknown');
  // "information" contains "ig"? never: names match whole tokens only.
  assert.equal(channelFor({ source: 'bigsite' }), 'Other campaign');
});

test('referrer: only the host, never a path or query; Sutura\'s own hosts and previews are not referrers', () => {
  const { normalizeReferrerHost } = metrics;
  assert.equal(normalizeReferrerHost('https://www.google.com/search?q=my+novel+title'), 'google.com');
  assert.equal(normalizeReferrerHost('https://l.instagram.com/?u=https%3A%2F%2Fwritesutura.com&e=secret'), 'l.instagram.com');
  assert.equal(normalizeReferrerHost('https://writesutura.com/features/canvas'), null);
  assert.equal(normalizeReferrerHost('https://www.writesutura.com/'), null);
  assert.equal(normalizeReferrerHost('https://sutura-git-x.vercel.app/'), null);
  assert.equal(normalizeReferrerHost('http://localhost:3000/'), null);
  assert.equal(normalizeReferrerHost('https://example.org/a', 'example.org'), null, 'the serving host');
  assert.equal(normalizeReferrerHost('javascript:alert(1)'), null);
  assert.equal(normalizeReferrerHost(''), null);
  assert.equal(normalizeReferrerHost(42), null);
});

test('safe enums: device class, CTA placement, handoff variant, environment', () => {
  const m = metrics;
  assert.equal(m.deviceCategory({ phone: true, coarsePointer: true }), 'phone');
  assert.equal(m.deviceCategory({ phone: false, coarsePointer: true }), 'tablet');
  assert.equal(m.deviceCategory({ phone: false, coarsePointer: false }), 'desktop');
  assert.equal(m.parseDeviceCategory('phone'), 'phone');
  assert.equal(m.parseDeviceCategory('iPhone 15 Pro'), null);
  assert.deepEqual(['header', 'hero', 'final', 'feature'].map(m.parseCtaPlacement), ['header', 'hero', 'final', 'feature']);
  assert.equal(m.parseCtaPlacement('footer'), null);
  assert.equal(m.parseHandoffVariant('ready-import'), 'ready-import');
  assert.equal(m.parseHandoffVariant('<script>'), null);
  assert.equal(m.analyticsEnvironment('production'), 'production');
  assert.equal(m.analyticsEnvironment('preview'), 'preview');
  assert.equal(m.analyticsEnvironment(undefined), 'local');
});

test('metadata allowlist: titles, prose, names and emails never reach analytics', () => {
  const out = metrics.sanitizeAnalyticsMetadata({
    path: 'new',
    device: 'phone',
    placement: 'hero',
    source: 'instagram',
    kind: 'page',
    title: 'The Hollow Crown',
    project_title: 'x',
    text: 'It was a dark and stormy night.',
    first_sentence: 'Call me Ishmael.',
    pen_name: 'A. Writer',
    email: 'writer@example.com',
    filename: 'novel.docx',
    nested: { title: 'x' },
    content: 'writing_demo_a',
  });
  assert.deepEqual(out, { path: 'new', device: 'phone', placement: 'hero', source: 'instagram', kind: 'page', content: 'writing_demo_a' });
  assert.equal(metrics.sanitizeAnalyticsMetadata({ source: 'x'.repeat(500) }).source.length, 200);
});

test('retention: activation day, returned, D1 the next local day, D7 within a week — each only once its window has passed', () => {
  const r = metrics.deriveWriterRetention;
  // Wrote on the 1st and the 2nd: returned, D1 and D7 (both windows closed by the 20th).
  assert.deepEqual(r(['2026-10-01'], ['2026-10-01', '2026-10-02'], '2026-10-20'), { activationDate: '2026-10-01', returned: true, writingDays: 2, d1: true, d7: true });
  // Came back on day 5: returned and D7, not D1.
  assert.deepEqual(r(['2026-10-01'], ['2026-10-01', '2026-10-06'], '2026-10-20'), { activationDate: '2026-10-01', returned: true, writingDays: 2, d1: false, d7: true });
  // Came back on day 9: returned, neither D1 nor D7.
  assert.deepEqual(r(['2026-10-01'], ['2026-10-01', '2026-10-10'], '2026-10-20'), { activationDate: '2026-10-01', returned: true, writingDays: 2, d1: false, d7: false });
  // Activated yesterday: D1 not yet measurable; today it is not either (the next day is today).
  assert.equal(r(['2026-10-19'], ['2026-10-19'], '2026-10-20').d1, null);
  assert.equal(r(['2026-10-18'], ['2026-10-18'], '2026-10-20').d1, false);
  assert.equal(r(['2026-10-18'], ['2026-10-18'], '2026-10-20').d7, null);
  // The earliest candidate is the activation; month ends roll over.
  assert.equal(r(['2026-10-31', '2026-10-30'], ['2026-10-31', '2026-10-30'], '2026-12-01').activationDate, '2026-10-30');
  assert.equal(r(['2026-10-31'], ['2026-11-01'], '2026-12-01').d1, true);
  // Never activated.
  assert.deepEqual(r([], ['2026-10-01'], '2026-10-20'), { activationDate: null, returned: false, writingDays: 0, d1: null, d7: null });
  assert.equal(metrics.median([5, 1, 3]), 3);
  assert.equal(metrics.median([1, 2, 3, 4]), 2.5);
  assert.equal(metrics.median([]), null);
});

// ── First touch ─────────────────────────────────────────────────────────────

test('first touch: UTM capture keeps only the known fields; a tagged touch is never overwritten', () => {
  const a = attribution;
  const fields = a.parseAttributionFromSearchParams(new URLSearchParams('utm_source=instagram&utm_medium=paid_social&utm_campaign=open_beta_test&utm_content=writing_demo_a&email=x@y.z'));
  assert.deepEqual(fields, { source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a', term: null, fbclid: null });
  const first = { ...fields, referrer_host: null, landing_path: '/', captured_at: '2026-10-13T10:00:00.000Z' };
  const tiktok = { source: 'tiktok', medium: null, campaign: 'b', content: null, term: null, fbclid: null, referrer_host: null };
  const referral = { source: null, medium: null, campaign: null, content: null, term: null, fbclid: null, referrer_host: 'reddit.com' };
  const direct = { source: null, medium: null, campaign: null, content: null, term: null, fbclid: null, referrer_host: null };
  assert.equal(a.shouldReplaceTouch(first, tiktok), false, 'a returning tagged visit never replaces the first touch');
  assert.equal(a.shouldReplaceTouch(first, referral), false);
  assert.equal(a.shouldReplaceTouch(first, direct), false);
  assert.equal(a.shouldReplaceTouch(null, tiktok), true);
  assert.equal(a.shouldReplaceTouch(null, referral), true, 'a referral is kept when nothing is stored');
  assert.equal(a.shouldReplaceTouch(null, direct), false, 'a direct visit stores nothing');
  const referralTouch = { ...referral, landing_path: '/', captured_at: '2026-10-13T10:00:00.000Z' };
  assert.equal(a.shouldReplaceTouch(referralTouch, tiktok), true, 'a campaign supersedes a referral-only fallback');
  assert.equal(a.shouldReplaceTouch(referralTouch, { ...referral, referrer_host: 'google.com' }), false, 'a second referral does not');
  // The cookie round-trips, referrer-only included; junk is refused.
  assert.deepEqual(a.deserializeAttributionCookie(a.serializeAttributionCookie(first)), first);
  assert.deepEqual(a.deserializeAttributionCookie(a.serializeAttributionCookie(referralTouch)), referralTouch);
  assert.equal(a.deserializeAttributionCookie(JSON.stringify({ ...direct, captured_at: '2026-10-13T10:00:00.000Z' })), null);
  assert.equal(a.deserializeAttributionCookie(JSON.stringify({ ...referralTouch, referrer_host: 'evil.com/<script>' })), null);
  assert.equal(a.deserializeAttributionCookie('{nope'), null);
});

test('proxy: referrer capture is limited to marketing pages and never replaces a tagged touch', () => {
  const proxy = read('src/proxy.ts');
  assert.match(proxy, /REFERRER_CAPTURE_PATHS = \["\/", "\/features\/", "\/principles\/"\]/);
  assert.match(proxy, /if \(existing && hasMeaningfulAttribution\(existing\)\) return;/);
  assert.match(proxy, /if \(!shouldReplaceTouch\(existing, incoming\)\) return;/);
  assert.match(proxy, /"\/api\/front-event"/);
});

// ── Signup persists the first touch ─────────────────────────────────────────

test('signup: the signing-up browser persists its first touch for a brand-new profile; first touch wins; no campaign → no row', async () => {
  const db = await seededDb();
  const fresh = uuid(7001);
  await createAuthUser(db, fresh, { display_name: 'Harness Writer' });
  const touch = { source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a', term: null, fbclid: 'fb.1.abc', referrer_host: 'l.instagram.com', landing_path: '/', captured_at: '2026-10-13T10:00:00.000Z' };
  globalThis.__testCookies = new Map([['rune_attribution', attribution.serializeAttributionCookie(touch)]]);
  assert.deepEqual(await signup.recordSignupCompletedEvent(fresh), { error: null });
  const row = await one(db, `select source, medium, campaign, content, fbclid, referrer_host, landing_path from public.acquisition_attribution where user_id = $1`, [fresh]);
  assert.deepEqual(row, { source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a', fbclid: 'fb.1.abc', referrer_host: 'l.instagram.com', landing_path: '/' });
  const signupEvent = await one(db, `select metadata from public.analytics_events where user_id = $1 and event_name = 'signup_completed'`, [fresh]);
  assert.deepEqual(signupEvent.metadata, { env: 'local' });

  // A later call (the auth callback, another browser with another campaign) never overwrites it.
  globalThis.__testCookies = new Map([['rune_attribution', attribution.serializeAttributionCookie({ ...touch, source: 'tiktok', campaign: 'later' })]]);
  await signup.recordSignupCompletedEvent(fresh);
  assert.equal((await one(db, `select count(*)::int n from public.acquisition_attribution where user_id = $1`, [fresh])).n, 1);
  assert.equal((await one(db, `select campaign from public.acquisition_attribution where user_id = $1`, [fresh])).campaign, 'open_beta_test');
  assert.equal((await one(db, `select count(*)::int n from public.analytics_events where user_id = $1 and event_name = 'signup_completed'`, [fresh])).n, 1);

  // An older account: this browser's campaign is never attached to it.
  const old = uuid(7002);
  await createAuthUser(db, old, { display_name: 'Old Writer' });
  await db.query(`update public.profiles set created_at = now() - interval '2 hours' where id = $1`, [old]);
  await signup.recordSignupCompletedEvent(old);
  assert.equal((await one(db, `select count(*)::int n from public.acquisition_attribution where user_id = $1`, [old])).n, 0);

  // A direct sign-up: no cookie, no invented attribution.
  const direct = uuid(7003);
  await createAuthUser(db, direct, { display_name: 'Direct Writer' });
  globalThis.__testCookies = new Map();
  await signup.recordSignupCompletedEvent(direct);
  assert.equal((await one(db, `select count(*)::int n from public.acquisition_attribution where user_id = $1`, [direct])).n, 0);
  assert.equal((await one(db, `select count(*)::int n from public.analytics_events where user_id = $1 and event_name = 'signup_completed'`, [direct])).n, 1);

  // Not a real account: nothing at all.
  await signup.recordSignupCompletedEvent(uuid(7999));
  assert.equal((await one(db, `select count(*)::int n from public.analytics_events where user_id = $1`, [uuid(7999)])).n, 0);
});

// ── Activation ──────────────────────────────────────────────────────────────

test('activation: first_words_written once per account, on the writer\'s local day — retries, replays and a second tab are no-ops', async () => {
  const db = await seededDb();
  await db.query(`delete from public.writing_sessions where user_id = $1`, [ALICE]);
  writingStats.setServerClient(createSupabaseAdapter(db, { userId: ALICE }));
  const activations = () => all(db, `select local_date::text as day, project_id, metadata from public.analytics_events where user_id = $1 and event_name = 'first_words_written'`, [ALICE]);

  // Nothing typed (a paste-only save credits 0 words): never activation.
  await writingStats.recordWordsWritten(HOLLOW, 0, pageId('h6c'), '2026-10-12', uuid(1));
  // Account-level credit (no Project): not manuscript writing in a Project.
  await writingStats.recordWordsWritten(null, 30, null, '2026-10-12', uuid(2));
  assert.deepEqual(await activations(), []);

  await writingStats.recordWordsWritten(HOLLOW, 12, pageId('h6c'), '2026-10-12', uuid(3));
  assert.deepEqual(await activations(), [{ day: '2026-10-12', project_id: null, metadata: { env: 'local' } }]);

  // The same credit replayed (offline queue), two tabs at once, a later day: still one.
  await writingStats.recordWordsWritten(HOLLOW, 12, pageId('h6c'), '2026-10-12', uuid(3));
  await Promise.all([
    writingStats.recordWordsWritten(HOLLOW, 4, pageId('h6c'), '2026-10-12', uuid(4)),
    writingStats.recordWordsWritten(HOLLOW, 5, pageId('h6c'), '2026-10-12', uuid(5)),
  ]);
  await writingStats.recordWordsWritten(HOLLOW, 9, pageId('h6c'), '2026-10-13', uuid(6));
  assert.deepEqual(await activations(), [{ day: '2026-10-12', project_id: null, metadata: { env: 'local' } }]);
  // The second writing day carries its own day.
  assert.deepEqual(
    await all(db, `select local_date::text as day from public.analytics_events where user_id = $1 and event_name = 'second_writing_day'`, [ALICE]),
    [{ day: '2026-10-13' }]
  );
  assert.equal((await one(db, `select sum(words_added)::int n from public.writing_sessions where user_id = $1 and project_id = $2`, [ALICE, HOLLOW])).n, 30, 'the writing itself is credited exactly as before');
});

test('activation: only the writing credit records it — import, restore, Project creation and opening never do', () => {
  const callers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(tsx?)$/.test(e.name) && /eventName: "first_words_written"/.test(fs.readFileSync(full, 'utf8'))) callers.push(path.relative(REPO_DIR, full));
    }
  };
  walk(path.join(REPO_DIR, 'src'));
  assert.deepEqual(callers, ['src/lib/actions/writingStats.ts']);
  // The editor credits typed words only: paste is deducted before the credit.
  assert.match(read('src/components/editor/useSceneEditor.ts'), /recordWordsWritten\(projectId, words, sceneId, date, id\)/);
});

// ── The front door's anonymous events ───────────────────────────────────────

test('front door: a view and a CTA click are stored anonymously with safe fields only; bad input stores nothing', async () => {
  const db = await seededDb();
  const post = (body, ua = 'Mozilla/5.0') =>
    frontEvent.POST({
      headers: new Headers({ 'user-agent': ua, 'x-forwarded-for': '203.0.113.9' }),
      nextUrl: new URL('https://writesutura.com/api/front-event'),
      text: async () => JSON.stringify(body),
    });
  const search = '?utm_source=instagram&utm_medium=paid_social&utm_campaign=open_beta_test&utm_content=writing_demo_a&fbclid=fb.1.secret';
  assert.equal((await post({ event: 'view', search, referrer: 'https://l.instagram.com/?u=x&e=private', device: 'phone' })).status, 204);
  assert.equal((await post({ event: 'cta', placement: 'hero', search, referrer: '', device: 'phone' })).status, 204);
  await post({ event: 'cta', placement: 'sidebar', search }); // unknown placement
  await post({ event: 'purchase' }); // unknown event
  await post({ event: 'view', search }, 'Googlebot/2.1'); // a crawler
  const rows = await all(db, `select user_id, event_name, metadata from public.analytics_events where event_name like 'landing_%' order by event_name desc`);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    user_id: null,
    event_name: 'landing_viewed',
    metadata: { placement: null, source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a', term: null, click_id: true, referrer_host: 'l.instagram.com', device: 'phone', env: 'local' },
  });
  assert.equal(rows[1].event_name, 'landing_cta_clicked');
  assert.equal(rows[1].metadata.placement, 'hero');
  assert.doesNotMatch(JSON.stringify(rows), /fb\.1\.secret|private/);
});

test('front door: every "Start writing free" carries its placement; the tracker mounts for signed-out visitors only', () => {
  assert.match(read('src/components/front/FrontHeader.tsx'), /data-cta="header"/);
  assert.match(read('src/components/front/FrontHero.tsx'), /data-cta="hero"/);
  assert.match(read('src/components/front/FrontClose.tsx'), /data-cta="final"/);
  assert.match(read('src/components/front/feature/FeatureShell.tsx'), /data-cta="feature"/);
  assert.match(read('src/app/(front)/page.tsx'), /user === null && <FrontAnalytics view \/>/);
  assert.match(read('src/components/front/feature/FeatureShell.tsx'), /!member && mode !== "peek" && <FrontAnalytics \/>/);
  // First-party only: the tracker sends to Sutura and loads no third-party script.
  const tracker = read('src/components/front/FrontAnalytics.tsx');
  assert.match(tracker, /const ENDPOINT = "\/api\/front-event"/);
  assert.doesNotMatch(tracker, /facebook|promotekit|fbq|https?:\/\//);
});

test('mobile handoff and onboarding: device class on completion, copy-link and variant recorded with safe enums only', () => {
  const onboarding = read('src/lib/actions/onboarding.ts');
  assert.match(onboarding, /metadata: \{ path: row\?\.path \?\? null, device: parseDeviceCategory\(device\) \}/);
  const ui = read('src/components/rune2/Onboarding.tsx');
  assert.match(ui, /completeOnboarding\(currentDeviceCategory\(\)\)/);
  assert.match(ui, /completeOnboarding\("phone"\)/);
  const room = read('src/lib/actions/waitingRoom.ts');
  assert.match(room, /eventName: "desktop_link_copied"/);
  assert.match(room, /metadata: \{ variant: parseHandoffVariant\(variant\) \}/);
  assert.match(read('src/components/layout/PhoneWaitingRoom.tsx'), /recordDesktopLinkCopied\(\)/);
});

// ── The report ──────────────────────────────────────────────────────────────

test('report: a test campaign is connected to the writer who signed up on a phone and activated on a desktop', () => {
  const W = (n) => `w${n}`;
  const ev = (user, name, created_at, local_date = null, metadata = null) => ({ user_id: user, event_name: name, created_at, local_date, metadata });
  const input = {
    today: '2026-10-25',
    signups: [
      { user_id: W(1), created_at: '2026-10-10T09:00:00Z' }, // Instagram ad, phone onboarding, writes on desktop, returns
      { user_id: W(2), created_at: '2026-10-10T10:00:00Z' }, // Direct, desktop, activates, never returns
      { user_id: W(3), created_at: '2026-10-11T10:00:00Z' }, // Organic referral, import path, never writes
      { user_id: W(4), created_at: '2026-10-24T10:00:00Z' }, // Instagram, activated yesterday — D1 not yet measurable
    ],
    events: [
      ev(W(1), 'email_verified', '2026-10-10T09:05:00Z'),
      ev(W(1), 'onboarding_path_new', '2026-10-10T09:06:00Z'),
      ev(W(1), 'project_created', '2026-10-10T09:07:00Z'),
      ev(W(1), 'onboarding_completed', '2026-10-10T09:08:00Z', null, { path: 'new', device: 'phone' }),
      ev(W(1), 'phone_waiting_room_viewed', '2026-10-10T09:08:01Z', null, { variant: 'ready' }),
      ev(W(1), 'desktop_link_requested', '2026-10-10T09:09:00Z'),
      ev(W(1), 'first_words_written', '2026-10-11T09:00:00Z', '2026-10-11'),
      ev(W(1), 'second_writing_day', '2026-10-12T20:00:00Z', '2026-10-12'),
      ev(W(2), 'onboarding_completed', '2026-10-10T10:10:00Z', null, { path: 'new', device: 'desktop' }),
      ev(W(2), 'first_words_written', '2026-10-10T12:00:00Z', '2026-10-10'),
      ev(W(3), 'onboarding_path_import', '2026-10-11T10:01:00Z'),
      ev(W(4), 'onboarding_completed', '2026-10-24T10:10:00Z', null, { path: 'new', device: 'desktop' }),
      ev(W(4), 'first_words_written', '2026-10-24T11:00:00Z', '2026-10-24'),
      ev('outsider', 'first_words_written', '2026-10-11T09:00:00Z', '2026-10-11'), // not in the cohort
    ],
    writingDays: [
      { user_id: W(1), session_date: '2026-10-11' },
      { user_id: W(1), session_date: '2026-10-12' },
      { user_id: W(2), session_date: '2026-10-10' },
      { user_id: 'legacy', session_date: '2026-09-01' },
    ],
    projectOwners: [W(1), W(2), W(3), W(4)],
    attributions: [
      { user_id: W(1), source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a', fbclid: null, referrer_host: null },
      { user_id: W(3), source: null, medium: null, campaign: null, content: null, fbclid: null, referrer_host: 'google.com' },
      { user_id: W(4), source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a', fbclid: null, referrer_host: null },
    ],
    landing: [
      { event_name: 'landing_viewed', metadata: { source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a' } },
      { event_name: 'landing_viewed', metadata: { source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a' } },
      { event_name: 'landing_viewed', metadata: {} },
      { event_name: 'landing_viewed', metadata: { referrer_host: 'google.com' } },
      { event_name: 'landing_cta_clicked', metadata: { placement: 'hero' } },
      { event_name: 'landing_cta_clicked', metadata: { placement: 'header' } },
    ],
  };
  const r = report.buildLaunchReport(input);
  assert.deepEqual(r.acquisition, { landingViews: 4, ctaClicks: 2, ctaByPlacement: { header: 1, hero: 1, final: 0, feature: 0 }, ctaRate: 50, signups: 4, viewToSignup: 100 });
  assert.deepEqual(r.funnel.map((s) => [s.key, s.count]), [
    ['signup', 4], ['email_verified', 1], ['onboarding_completed', 3], ['project_ready', 4], ['activated', 3], ['returned', 1],
  ]);
  assert.equal(r.activation.rate, 75);
  assert.deepEqual(r.activation.byPath, [{ path: 'new', onboarded: 3, activated: 3 }, { path: 'import', onboarded: 0, activated: 0 }, { path: 'none', onboarded: 0, activated: 0 }]);
  assert.equal(r.activation.medianHoursToActivation, 2, 'median of 24h, 2h, 1h');
  // D1: W1 (wrote the next day) and W2 (did not) are measurable; W4 activated yesterday is not.
  assert.deepEqual(r.retention, { activated: 3, returned: 1, d1: { eligible: 2, returned: 1 }, d7: { eligible: 2, returned: 1 } });
  assert.deepEqual(r.device, { onboarded: { phone: 1, tablet: 0, desktop: 2, unknown: 0 }, handoffShown: 1, desktopLinkEmailed: 1, desktopLinkCopied: 0, phoneOnboardedActivated: 1 });
  const ig = r.campaigns.find((c) => c.campaign === 'open_beta_test');
  assert.deepEqual(ig, { channel: 'Instagram', source: 'instagram', medium: 'paid_social', campaign: 'open_beta_test', content: 'writing_demo_a', landingViews: 2, signups: 2, onboarded: 2, activated: 2, returned: 1 });
  const direct = r.campaigns.find((c) => c.channel === 'Direct / Unknown');
  assert.deepEqual([direct.landingViews, direct.signups, direct.activated], [1, 1, 1], 'a writer with no attribution stays Direct / Unknown — never guessed');
  const organic = r.campaigns.find((c) => c.channel === 'Organic search');
  assert.deepEqual([organic.landingViews, organic.signups, organic.activated], [1, 1, 0]);
});

test('report: activation is derived from writing history for writers who wrote before the event existed; an empty cohort is all zeros', () => {
  const r = report.buildLaunchReport({
    today: '2026-10-25',
    signups: [{ user_id: 'early', created_at: '2026-09-01T00:00:00Z' }],
    events: [],
    writingDays: [{ user_id: 'early', session_date: '2026-09-02' }, { user_id: 'early', session_date: '2026-09-03' }],
    projectOwners: [],
    attributions: [],
    landing: [],
  });
  assert.deepEqual(r.retention, { activated: 1, returned: 1, d1: { eligible: 1, returned: 1 }, d7: { eligible: 1, returned: 1 } });
  assert.equal(r.activation.medianHoursToActivation, null);
  assert.equal(r.acquisition.viewToSignup, null);
  const empty = report.buildLaunchReport({ today: '2026-10-25', signups: [], events: [], writingDays: [], projectOwners: [], attributions: [], landing: [] });
  assert.equal(empty.funnel[0].count, 0);
  assert.deepEqual(empty.campaigns, []);
});

test('Pulse launch report: admin-only, production events only, no writing read', () => {
  const src = read('src/lib/actions/pulseLaunch.ts');
  assert.match(src, /^"use server";/);
  assert.match(src, /if \(!\(await getCurrentAdmin\(\)\)\) throw new Error\("Not authorized"\)/);
  assert.match(src, /metadata->>env\.is\.null,metadata->>env\.eq\.production/);
  assert.doesNotMatch(src, /from\("scenes"\)|content_json|\.select\("[^"]*title/);
  // Every write tags its environment; the anonymous path takes no user id.
  const analytics = read('src/lib/actions/analytics.ts');
  assert.match(analytics, /env: analyticsEnvironment\(\)/);
  assert.match(analytics, /user_id: null,/);
});
