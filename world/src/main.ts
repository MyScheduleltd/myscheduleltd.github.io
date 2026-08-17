import './style.css';
import { App } from './ui/App';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');

new App(root).mount();
