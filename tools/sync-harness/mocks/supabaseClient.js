import { server, fetchPage, savePageChecked } from './serverState.js';

// Minimal supabase-js browser-client mock covering exactly what
// syncEngine.ts uses: auth.getSession, from('pages').select().eq().single(), rpc().
export function createClient() {
  return {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'user-1' } } } };
      },
    },
    from(table) {
      if (table !== 'pages') throw new Error('mock only supports pages');
      return {
        select() {
          return {
            eq(_col, id) {
              // Mirrors PostgREST semantics: awaiting the filter builder
              // resolves to a LIST result ({ data: rows[], error }), while
              // .single() coerces exactly-one-row (kept for any remaining
              // callers). A missing row is data: [] with NO error.
              const list = () => {
                const { data, error } = fetchPage(id);
                if (!data) return { data: [], error: null };
                return { data: [data], error: null };
              };
              return {
                then(resolve, reject) {
                  return Promise.resolve(list()).then(resolve, reject);
                },
                async single() {
                  const { data } = fetchPage(id);
                  if (!data) {
                    return { data: null, error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' } };
                  }
                  return { data, error: null };
                },
              };
            },
          };
        },
      };
    },
    async rpc(fn, args) {
      if (fn !== 'save_page_checked') throw new Error('unexpected rpc ' + fn);
      const { error, data } = await savePageChecked(args);
      return { error, data };
    },
  };
}
