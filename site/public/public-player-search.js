'use strict';

function setupPublicPlayerSearch(form) {
  const input = form.elements.username;
  const list = form.querySelector('[role="listbox"]');
  const status = form.querySelector('[role="status"]');
  let timer;
  let controller;
  let generation = 0;
  let players = [];
  let selected = -1;
  let dismissed = false;

  function close() {
    list.hidden = true;
    selected = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function choose(username) {
    if (/^[A-Za-z0-9_]{1,16}$/.test(username)) {
      window.location.assign(`/player/${encodeURIComponent(username)}`);
    }
  }

  function highlight(index) {
    selected = index;
    Array.from(list.children).forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    input.setAttribute('aria-activedescendant', list.children[index].id);
  }

  function render(message = '') {
    list.replaceChildren();
    selected = -1;
    input.removeAttribute('aria-activedescendant');
    for (const [index, player] of players.entries()) {
      const option = document.createElement('a');
      option.id = `publicPlayerSuggestion${index}`;
      option.href = `/player/${encodeURIComponent(player.username)}`;
      option.role = 'option';
      option.tabIndex = -1;
      option.setAttribute('aria-selected', 'false');
      option.textContent = player.username;
      // Keep focus on the combobox until the link receives its click.
      option.addEventListener('pointerdown', event => event.preventDefault());
      list.append(option);
    }
    if (message) {
      const empty = document.createElement('div');
      empty.className = 'public-player-search-empty';
      empty.textContent = message;
      list.append(empty);
    }
    const open = !dismissed && document.activeElement === input && (players.length > 0 || Boolean(message));
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    status.textContent = message || `${players.length} ${players.length === 1 ? 'player' : 'players'} found`;
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    controller?.abort();
    const request = ++generation;
    dismissed = false;
    players = [];
    status.textContent = '';
    close();
    const query = input.value.trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(query)) return;
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const response = await fetch(`/api/public/player-search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Search unavailable');
        const data = await response.json();
        if (request !== generation) return;
        players = (data.players || []).filter(player => /^[A-Za-z0-9_]{1,16}$/.test(player.username)).slice(0, 8);
        render(players.length ? '' : 'No players found');
      } catch (error) {
        if (error.name === 'AbortError' || request !== generation) return;
        render('Search unavailable. Press Enter to open this nickname.');
      }
    }, 200);
  });

  input.addEventListener('focus', () => { dismissed = false; if (players.length) render(); });
  input.addEventListener('blur', () => { dismissed = true; close(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismissed = true;
      close();
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && players.length) {
      event.preventDefault();
      dismissed = false;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      highlight(event.key === 'ArrowDown' ? (selected + 1) % players.length : (selected < 0 ? players.length - 1 : (selected + players.length - 1) % players.length));
    } else if (event.key === 'Enter' && selected >= 0) {
      event.preventDefault();
      choose(players[selected].username);
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    choose(input.value.trim());
  });
}
