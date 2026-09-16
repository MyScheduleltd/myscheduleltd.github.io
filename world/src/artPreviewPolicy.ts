/** Owner approved both public festival channels on 2026-09-14. */
export function canOpenArtPreview(hostname: string, search: string, pathname = '/'): boolean {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const publicChannel = ['myscheduleltd.com', 'www.myscheduleltd.com'].includes(hostname)
    && ['/beta/', '/beta/index.html', '/beta/ps2/', '/beta/ps2/index.html'].includes(pathname);
  return publicChannel || (local && new URLSearchParams(search).get('era') === 'ps2');
}
