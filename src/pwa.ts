// Registers the offline cache. Skipped in dev, in iframes, and with ?sw=off (which also removes it).
export function registerPwa(): void {
  if (!('serviceWorker' in navigator)) return
  const off = new URLSearchParams(location.search).has('sw') && new URLSearchParams(location.search).get('sw') === 'off'
  const framed = (() => {
    try { return window.self !== window.top } catch { return true }
  })()
  if (!import.meta.env.PROD || framed || off) {
    navigator.serviceWorker.getRegistrations().then((rs) =>
      rs.filter((r) => r.active?.scriptURL.endsWith('/sw.js')).forEach((r) => r.unregister()))
    return
  }
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}
