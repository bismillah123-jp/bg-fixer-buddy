import { lazy, type ComponentType } from "react";

/**
 * lazy() yang tahan terhadap chunk basi setelah deploy.
 *
 * Setiap deploy menghasilkan file JS baru (hash beda); kalau user masih
 * buka versi lama lalu pindah tab, import chunk lama gagal (404) dan
 * tanpa penanganan ini seluruh aplikasi blank putih.
 *
 * Strategi: kalau import gagal, reload halaman SEKALI (flag di
 * sessionStorage biar tidak loop). Setelah reload, index.html baru
 * dimuat dan chunk baru tersedia.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  chunkKey: string
) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (err) {
      const flagKey = `chunk-retry:${chunkKey}`;
      if (!sessionStorage.getItem(flagKey)) {
        sessionStorage.setItem(flagKey, "1");
        window.location.reload();
        // Kasih janji yang tidak pernah selesai sambil nunggu reload,
        // biar React tidak langsung melempar error.
        await new Promise(() => {});
      }
      throw err;
    }
  });
}
