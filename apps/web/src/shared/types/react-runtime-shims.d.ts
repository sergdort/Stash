// Temporary fallback for environments where @types/react packages are not installed yet.
declare module "react/jsx-runtime" {
  export const Fragment: unknown
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown
}

declare module "react/jsx-dev-runtime" {
  export const Fragment: unknown
  export function jsxDEV(
    type: unknown,
    props: unknown,
    key: unknown,
    isStaticChildren: boolean,
    source: unknown,
    self: unknown,
  ): unknown
}
