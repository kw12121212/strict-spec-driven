/**
 * CSS Module type surface: Bun resolves `.module.css` imports at build and
 * runtime into the file's local class-name map, and this declaration gives
 * the TypeScript face the same shape, so component imports typecheck.
 */
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
