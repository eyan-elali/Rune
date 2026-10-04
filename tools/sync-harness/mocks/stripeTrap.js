// Mock of '@/lib/stripe/client': any use of Stripe is recorded and refused,
// so a test can prove a path never reaches it.
export const stripeUses = (globalThis.__stripeUses ??= []);

const trap = (path) =>
  new Proxy(function () {}, {
    get(_t, key) {
      if (key === 'then') return undefined;
      return trap(`${path}.${String(key)}`);
    },
    apply() {
      stripeUses.push(path);
      throw new Error(`stripe used: ${path}`);
    },
  });

export const stripe = trap('stripe');
