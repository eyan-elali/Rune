// Audio files import as their bundled URL (Remotion's webpack asset rule).
declare module "*.wav" {
  const src: string;
  export default src;
}
