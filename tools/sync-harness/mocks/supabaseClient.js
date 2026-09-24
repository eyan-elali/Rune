import { server, fetchScene, saveSceneChecked } from './serverState.js';

// Minimal supabase-js browser-client mock covering exactly what
// syncEngine.ts uses: auth.getSession, from('scenes').select().eq().single(), rpc().
export function createClient() {
  return {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: 'user-1' } } } };
      },
    },
    from(table) {
      if (table !== 'scenes') throw new Error('mock only supports scenes');
      return {
        select() {
          return {
            eq(_col, id) {
              // Mirrors PostgREST semantics: awaiting the filter builder
              // resolves to a LIST result ({ data: rows[], error }), while
              // .single() coerces exactly-one-row (kept for any remaining
              // callers). A missing row is data: [] with NO error.
              const list = async () => {
                const { data } = await fetchScene(id);
                if (!data) return { data: [], error: null };
                return { data: [data], error: null };
              };
              return {
                then(resolve, reject) {
                  return list().then(resolve, reject);
                },
                async single() {
                  const { data } = await fetchScene(id);
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
      if (fn !== 'save_scene_checked') throw new Error('unexpected rpc ' + fn);
      const { error, data } = await saveSceneChecked(args);
      return { error, data };
    },
  };
}
