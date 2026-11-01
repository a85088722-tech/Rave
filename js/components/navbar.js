import { icon } from './icons.js';
import { on } from '../core/events.js';
import { unreadCount } from '../core/state.js';
import { currentRoute } from '../core/router.js';

const ITEMS = [
  { route: 'accueil', label: 'Accueil', icon: 'home' },
  { route: 'chat', label: 'Chat', icon: 'chat' },
  { route: 'ensemble', label: 'Ensemble', icon: 'together' },
  { route: 'dates', label: 'Dates', icon: 'calendar' },
  { route: 'souvenirs', label: 'Souvenirs', icon: 'image' }
];

export function mountNavbar(el) {
  const render = () => {
    const active = currentRoute();
    const unread = unreadCount();
    el.innerHTML = ITEMS.map(it => `
      <a href="#${it.route}" class="nav-item${it.route === active ? ' on' : ''}" ${it.route === active ? 'aria-current="page"' : ''}>
        <span class="nav-ic">${icon(it.icon, 22, { stroke: it.route === active ? 2.2 : 2 })}${it.route === 'chat' && unread ? `<span class="count-badge">${unread}</span>` : ''}</span>
        ${it.label}
      </a>`).join('');
  };
  on('route', render);
  on('change:messages', render);
  on('change:all', render);
  render();
}
