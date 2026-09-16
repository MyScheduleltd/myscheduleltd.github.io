import './style.css';
import { canOpenArtPreview } from './artPreviewPolicy';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');

if (canOpenArtPreview(window.location.hostname, window.location.search, window.location.pathname)) {
  // Do not import the world, open a connection, or create renderers off this route.
  void import('./ui/App').then(({ App }) => new App(root).mount());
} else {
  const panel = document.createElement('section');
  panel.style.cssText = 'max-width:38rem;margin:12vh auto;padding:2rem;font:18px/1.6 system-ui;color:#e8e5df';
  const title = document.createElement('h1');
  title.textContent = 'PS2 art preview';
  const text = document.createElement('p');
  text.textContent = 'This redesign opens on the dedicated PS2 preview with ?era=ps2.';
  const link = document.createElement('a');
  link.href = 'https://myscheduleltd.com/beta/?era=ps2';
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    const preview = new URL(window.location.href);
    preview.searchParams.set('era', 'ps2');
    link.href = preview.href;
  }
  link.textContent = 'Open the PS2 preview';
  panel.append(title, text, link);
  root.appendChild(panel);
  document.documentElement.dataset.artPreview = 'not-opened';
}
