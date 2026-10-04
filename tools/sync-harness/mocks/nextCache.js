// Mock of `next/cache` for bundling Rune server code outside Next.js.
// revalidatePath/revalidateTag are no-ops that record their calls.
export const revalidateCalls = [];

export function revalidatePath(path, type) {
  revalidateCalls.push({ fn: 'revalidatePath', path, type });
}

export function revalidateTag(tag) {
  revalidateCalls.push({ fn: 'revalidateTag', tag });
}

export function unstable_cache(fn) {
  return fn;
}
