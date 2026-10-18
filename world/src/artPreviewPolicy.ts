/** The public festival channel. /beta/ps2/ was retired on 2026-10-17 (owner). */
export function canOpenArtPreview(hostname: string, search: string, pathname = '/'): boolean {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const publicChannel = ['myscheduleltd.com', 'www.myscheduleltd.com'].includes(hostname)
    && ['/beta/', '/beta/index.html'].includes(pathname);
  return publicChannel || (local && new URLSearchParams(search).get('era') === 'ps2');
}
