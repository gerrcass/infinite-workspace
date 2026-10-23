import './styles/tokens.css';
import './styles/base.css';
import './styles/cards.css';
import './styles/chrome.css';
import { App } from './app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('Missing #app mount point');
}

new App(root);
