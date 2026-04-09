import './styles/theme.css';
import './styles/global.css';
import { App } from './app/App.js';
import { applyThemeTokens } from './ui/theme/tokens.js';

const root = document.querySelector('#app');
const app = new App(root);

applyThemeTokens();
document.title = 'Skana | SeaSphere - Admiral Senario Simulator';
app.mount();
