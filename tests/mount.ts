import { mount, type VueWrapper } from '@vue/test-utils';
import { vi } from 'vitest';
import { type Component, type Ref, ref, shallowRef } from 'vue';

/**
 * The seam later component tests mount through.
 *
 * A component reads its locale and its site base off vitepress's `useData()`,
 * and reads its archive data off `useArchiveFile()`. Neither is reachable
 * outside a running vitepress app, so both are replaced here: `useData` with a
 * small stub carrying only what `useI18n` reads from it, and `useArchiveFile`
 * with a mock of `useArchive` that keeps every other export real and replaces
 * only the one that fetches. Both mocks are registered once, at import time,
 * so a test file only has to import this module before the component it
 * mounts.
 */

interface UseDataStub {
  lang: Ref<string>;
  site: Ref<{ base: string }>;
}

const dataStub: UseDataStub = {
  lang: ref('en'),
  site: ref({ base: '/' }),
};

vi.mock('vitepress', () => ({
  useData: () => dataStub,
}));

interface ArchiveFileStub {
  data: Ref<unknown>;
  error: Ref<Error | null>;
  loading: Ref<boolean>;
}

const archiveFileStub: ArchiveFileStub = {
  data: shallowRef(null),
  error: ref(null),
  loading: ref(false),
};

vi.mock('../src/composables/useArchive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composables/useArchive')>();
  return {
    ...actual,
    useArchiveFile: () => archiveFileStub,
  };
});

/** Point the mocked `useData()` at a locale before mounting. */
export function setLocale(locale: 'en' | 'ja'): void {
  dataStub.lang.value = locale;
}

/** Hand the mocked `useArchiveFile()` a shard directly, instead of fetching it. */
export function setArchiveFile<T>(shard: T | null): void {
  archiveFileStub.data.value = shard;
  archiveFileStub.error.value = null;
  archiveFileStub.loading.value = false;
}

/** Mount a component with the locale and archive seams applied first. */
export function mountWith(
  component: Component,
  props: Record<string, unknown> = {},
  options: { locale?: 'en' | 'ja'; archive?: unknown } = {},
): VueWrapper {
  setLocale(options.locale ?? 'en');
  if ('archive' in options) setArchiveFile(options.archive);
  return mount(component, { props });
}
