const IMAGE_BACKGROUND = '#f1f5f9';

function tuneImage(image: HTMLImageElement) {
  if (!image.hasAttribute('loading')) image.loading = 'lazy';
  if (!image.hasAttribute('decoding')) image.decoding = 'async';
  if (!image.style.backgroundColor) image.style.backgroundColor = IMAGE_BACKGROUND;
}

/**
 * React mounts image nodes dynamically throughout the SPA. This observer is a
 * safety net that applies the cheap native image hints to every current/future
 * <img>, including feature components that are loaded later through route
 * chunks. It keeps image behavior consistent without putting JS work on the
 * critical rendering path.
 */
export function installImagePerformanceDefaults(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined;

  document.querySelectorAll<HTMLImageElement>('img').forEach(tuneImage);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLImageElement) tuneImage(node);
        node.querySelectorAll<HTMLImageElement>('img').forEach(tuneImage);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
