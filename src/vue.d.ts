/**
 * Single-file components as `tsc` sees them.
 *
 * Vite compiles them and the browser gets the result; `tsc` only has to know
 * that importing one yields a component, which is all `.vitepress/theme` does
 * with them. Typing a template against its own script needs a tool with an
 * entry point TypeScript 7 no longer publishes, so nothing here reaches the
 * markup — a component is checked by its tests and by the build, not by this.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
