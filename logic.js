

    const GENRES = ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'R&B', 'Other'];
    const GENRE_GRADIENTS = {
      'Pop': 'linear-gradient(135deg, #ff6b9d, #c44569)',
      'Rock': 'linear-gradient(135deg, #ee5a52, #b33939)',
      'Hip-Hop': 'linear-gradient(135deg, #ffa502, #ff6348)',
      'Electronic': 'linear-gradient(135deg, #00d4ff, #5f27cd)',
      'Jazz': 'linear-gradient(135deg, #a55eea, #8854d0)',
      'Classical': 'linear-gradient(135deg, #45aaf2, #2d6b9f)',
      'R&B': 'linear-gradient(135deg, #fa8231, #eb3b5a)',
      'Other': 'linear-gradient(135deg, #4b6584, #2c3e50)',
    };
    const STORAGE_KEY = 'sonix_v2_state';

    const state = {
      tracks: [],          // {id, title, artist, url, file, genre, addedAt}
      fileMap: new Map(),  // id -> File object (not persisted)
      currentIndex: -1,
      currentQueue: [],    // array of track ids being played
      isPlaying: false,
      liked: new Set(),
      playlists: [],       // {id, name, trackIds:[]}
      activePlaylistId: null,
      view: 'home',
      query: '',
      genreFilter: '',
      sort: 'recent',
      volume: 0.8,
      lastVolume: 0.8,
      shuffle: false,
      repeat: 'off',       // off | all | one
      activeGenre: null,
    };

    const audio = document.getElementById('audio');
    audio.volume = state.volume;

    const persist = () => {
      const data = {
        tracks: state.tracks.map(t => ({ id: t.id, title: t.title, artist: t.artist, genre: t.genre, addedAt: t.addedAt })),
        liked: [...state.liked],
        playlists: state.playlists,
        volume: state.volume,
        shuffle: state.shuffle,
        repeat: state.repeat,
        theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { }
    };
    const restore = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
    
        state.liked = new Set(data.liked || []);
        state.playlists = data.playlists || [];
        if (typeof data.volume === 'number') state.volume = data.volume;
        state.shuffle = !!data.shuffle;
        state.repeat = data.repeat || 'off';
        if (data.theme === 'light') document.documentElement.classList.add('light');
      } catch (e) { }
    };


    const fmt = (s) => {
      if (!isFinite(s) || s < 0) return '0:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    const parseName = (filename) => {
      const name = filename.replace(/\.[^.]+$/, '');
      const parts = name.split(' - ');
      if (parts.length > 1) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
      return { artist: 'Unknown Artist', title: name };
    };
    const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const uid = () => Math.random().toString(36).slice(2, 10);
    const findTrack = (id) => state.tracks.find(t => t.id === id);
    const indexOfTrack = (id) => state.tracks.findIndex(t => t.id === id);
    let toastTimer;
    const toast = (msg) => {
      document.querySelectorAll('.toast').forEach(t => t.remove());
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      document.body.appendChild(el);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.remove(), 2200);
    };

    const fileInput = document.getElementById('file-input');
    const triggerUpload = () => fileInput.click();
    document.getElementById('hero-upload').addEventListener('click', triggerUpload);
    document.getElementById('library-upload').addEventListener('click', triggerUpload);

    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      let added = 0;
      files.forEach((file) => {
        if (!file.type.startsWith('audio/')) return;
        const meta = parseName(file.name);
        const id = `${file.name}-${file.size}-${uid()}`;
        const track = {
          id, title: meta.title, artist: meta.artist,
          url: URL.createObjectURL(file),
          genre: 'Other',
          addedAt: Date.now(),
        };
        state.fileMap.set(id, file);
        state.tracks.push(track);
        added++;
      });
      e.target.value = '';
      persist();
      renderAll();
      if (added) toast(`Added ${added} song${added === 1 ? '' : 's'}`);
    });

    const setView = (view, opts = {}) => {
      state.view = view;
      if (view === 'playlist' && opts.playlistId) state.activePlaylistId = opts.playlistId;
      if (view === 'genre' && opts.genre) state.activeGenre = opts.genre;
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.dataset.view !== view));
      document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
      document.querySelectorAll('.mobile-nav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
      document.querySelectorAll('.pl-item').forEach(b => b.classList.toggle('active', view === 'playlist' && b.dataset.id === state.activePlaylistId));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderAll();
    };
    document.querySelectorAll('[data-view]').forEach(b => {
      if (b.tagName === 'BUTTON') b.addEventListener('click', () => setView(b.dataset.view));
    });
    document.getElementById('see-all').addEventListener('click', () => setView('library'));
    document.getElementById('hero-browse').addEventListener('click', () => setView('browse'));
    document.getElementById('back-to-browse').addEventListener('click', () => setView('browse'));

    const themeIcon = document.getElementById('theme-icon');
    const themeLabel = document.getElementById('theme-label');
    const moonSvg = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    const sunSvg = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>';
    const refreshThemeIcon = () => {
      const isLight = document.documentElement.classList.contains('light');
      themeIcon.innerHTML = isLight ? moonSvg : sunSvg;
      themeLabel.textContent = isLight ? 'Dark mode' : 'Light mode';
    };
    const toggleTheme = () => {
      document.documentElement.classList.toggle('light');
      refreshThemeIcon();
      persist();
    };
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('theme-toggle-mobile').addEventListener('click', toggleTheme);

    const closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };
    const showModal = (html) => {
      document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop">${html}</div>`;
      document.querySelector('.modal-backdrop').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) closeModal();
      });
    };

    const promptText = (title, subtitle, defaultValue, onConfirm) => {
      showModal(`
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(subtitle)}</p>
        <input class="input" id="modal-input" value="${escapeHtml(defaultValue || '')}" placeholder="My playlist" />
        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="modal-ok">Save</button>
        </div>
      </div>`);
      const input = document.getElementById('modal-input');
      input.focus();
      input.select();
      const submit = () => {
        const v = input.value.trim();
        if (!v) return;
        closeModal();
        onConfirm(v);
      };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      document.getElementById('modal-ok').addEventListener('click', submit);
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
    };

    const confirmAction = (title, subtitle, onConfirm) => {
      showModal(`
      <div class="modal">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(subtitle)}</p>
        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="modal-ok" style="background:var(--danger);color:white;">Delete</button>
        </div>
      </div>`);
      document.getElementById('modal-ok').addEventListener('click', () => { closeModal(); onConfirm(); });
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
    };

    const showAddToPlaylistModal = (trackId) => {
      const items = state.playlists.map(pl => {
        const has = pl.trackIds.includes(trackId);
        return `<button data-pl-id="${pl.id}" data-has="${has}">
        <span>${escapeHtml(pl.name)}</span>
        ${has ? '<svg class="check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </button>`;
      }).join('') || '<p style="color:var(--muted);font-size:13px;text-align:center;padding:20px;">No playlists yet. Create one below.</p>';
      showModal(`
      <div class="modal">
        <h3>Add to playlist</h3>
        <p>Tap a playlist to toggle this song</p>
        <div class="pl-pick-list">${items}</div>
        <div class="modal-actions">
          <button class="btn btn-outline btn-sm" id="modal-cancel">Close</button>
          <button class="btn btn-primary btn-sm" id="modal-new">+ New playlist</button>
        </div>
      </div>`);
      document.getElementById('modal-cancel').addEventListener('click', closeModal);
      document.getElementById('modal-new').addEventListener('click', () => {
        closeModal();
        promptText('New playlist', 'Give your playlist a name', '', (name) => {
          const pl = createPlaylist(name);
          addToPlaylist(pl.id, trackId);
          toast(`Added to "${name}"`);
        });
      });
      document.querySelectorAll('[data-pl-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const plId = btn.dataset.plId;
          const has = btn.dataset.has === 'true';
          if (has) removeFromPlaylist(plId, trackId);
          else addToPlaylist(plId, trackId);
          const pl = state.playlists.find(p => p.id === plId);
          toast(has ? `Removed from "${pl.name}"` : `Added to "${pl.name}"`);
          showAddToPlaylistModal(trackId);
        });
      });
    };

    const createPlaylist = (name) => {
      const pl = { id: uid(), name, trackIds: [] };
      state.playlists.push(pl);
      persist();
      renderSidebarPlaylists();
      return pl;
    };
    const renamePlaylist = (id, name) => {
      const pl = state.playlists.find(p => p.id === id);
      if (!pl) return;
      pl.name = name;
      persist();
      renderAll();
    };
    const deletePlaylist = (id) => {
      state.playlists = state.playlists.filter(p => p.id !== id);
      if (state.activePlaylistId === id) state.activePlaylistId = null;
      persist();
      setView('library');
    };
    const addToPlaylist = (plId, trackId) => {
      const pl = state.playlists.find(p => p.id === plId);
      if (!pl || pl.trackIds.includes(trackId)) return;
      pl.trackIds.push(trackId);
      persist();
      renderAll();
    };
    const removeFromPlaylist = (plId, trackId) => {
      const pl = state.playlists.find(p => p.id === plId);
      if (!pl) return;
      pl.trackIds = pl.trackIds.filter(id => id !== trackId);
      persist();
      renderAll();
    };

    document.getElementById('new-pl-btn').addEventListener('click', () => {
      promptText('New playlist', 'Give your playlist a name', '', (name) => {
        const pl = createPlaylist(name);
        setView('playlist', { playlistId: pl.id });
      });
    });


    const trackRowHtml = (track, displayIndex, opts = {}) => {
      const realIdx = indexOfTrack(track.id);
      const isCurrent = realIdx === state.currentIndex;
      const isLiked = state.liked.has(track.id);
      const heart = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>`;
      const plus = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      const minus = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      const trash = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
      const playing = isCurrent && state.isPlaying;
      const numCol = playing
        ? `<div class="eq-anim"><span></span><span></span><span></span></div>`
        : `<span>${displayIndex + 1}</span>`;
      const noFile = !track.url ? '<span style="color:var(--danger);font-size:11px;margin-left:6px;" title="File not loaded — re-upload">⚠</span>' : '';


      const genreOptions = GENRES.map(g => `<option value="${g}" ${g === track.genre ? 'selected' : ''}>${g}</option>`).join('');
      const genreCell = `<select class="select" data-action="set-genre" data-id="${track.id}" style="padding:4px 24px 4px 10px;font-size:11px;background-position:right 8px center;">${genreOptions}</select>`;

      const removeBtn = opts.playlistId
        ? `<button data-action="pl-remove" data-pl-id="${opts.playlistId}" data-id="${track.id}" aria-label="Remove from playlist" title="Remove from playlist">${minus}</button>`
        : `<button data-action="remove" data-id="${track.id}" aria-label="Delete from library" title="Delete from library">${trash}</button>`;

      return `
      <div class="track-row ${isCurrent ? 'active' : ''}" data-id="${track.id}" data-queue-index="${displayIndex}">
        <div class="t-num">${numCol}</div>
        <div>
          <div class="t-title">${escapeHtml(track.title)}${noFile}</div>
          <div class="t-artist" style="display:none;" class="mobile-artist">${escapeHtml(track.artist)}</div>
        </div>
        <div class="t-artist">${escapeHtml(track.artist)}</div>
        <div class="t-genre">${genreCell}</div>
        <div class="t-action">
          <button data-action="like" data-id="${track.id}" class="${isLiked ? 'liked' : ''}" aria-label="Like" title="Like">${heart}</button>
          <button data-action="add-to-pl" data-id="${track.id}" aria-label="Add to playlist" title="Add to playlist">${plus}</button>
          ${removeBtn}
        </div>
      </div>`;
    };

    const renderTracks = (containerId, tracks, opts = {}) => {
      const el = document.getElementById(containerId);
      if (!tracks.length) {
        el.innerHTML = `
        <div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <h3>${opts.emptyTitle || 'No songs here yet'}</h3>
          <p>${opts.emptyText || 'Upload some songs to get started'}</p>
        </div>`;
        return;
      }
      const head = `<div class="track-head"><span style="text-align:center;">#</span><span>Title</span><span>Artist</span><span>Genre</span><span></span></div>`;
      el.innerHTML = head + tracks.map((t, i) => trackRowHtml(t, i, opts)).join('');

      // wire: row click → play within this queue
      const queueIds = tracks.map(t => t.id);
      el.querySelectorAll('.track-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-action]') || e.target.closest('select')) return;
          const id = row.dataset.id;
          const realIdx = indexOfTrack(id);
          if (realIdx === state.currentIndex) togglePlay();
          else playTrackById(id, queueIds);
        });
      });
      el.querySelectorAll('[data-action="like"]').forEach(b => {
        b.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(b.dataset.id); });
      });
      el.querySelectorAll('[data-action="add-to-pl"]').forEach(b => {
        b.addEventListener('click', (e) => { e.stopPropagation(); showAddToPlaylistModal(b.dataset.id); });
      });
      el.querySelectorAll('[data-action="remove"]').forEach(b => {
        b.addEventListener('click', (e) => { e.stopPropagation(); removeTrack(b.dataset.id); });
      });
      el.querySelectorAll('[data-action="pl-remove"]').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          removeFromPlaylist(b.dataset.plId, b.dataset.id);
          toast('Removed from playlist');
        });
      });
      el.querySelectorAll('[data-action="set-genre"]').forEach(sel => {
        sel.addEventListener('click', e => e.stopPropagation());
        sel.addEventListener('change', (e) => {
          const t = findTrack(sel.dataset.id);
          if (t) { t.genre = sel.value; persist(); renderAll(); }
        });
      });
    };

    const renderSidebarPlaylists = () => {
      const el = document.getElementById('sidebar-playlists');
      if (!state.playlists.length) {
        el.innerHTML = '<div class="pl-empty">No playlists yet</div>';
        return;
      }
      el.innerHTML = state.playlists.map(pl => `
      <button class="pl-item ${state.view === 'playlist' && state.activePlaylistId === pl.id ? 'active' : ''}" data-id="${pl.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span class="pl-name">${escapeHtml(pl.name)}</span>
        <span class="pl-count">${pl.trackIds.length}</span>
      </button>
    `).join('');
      el.querySelectorAll('.pl-item').forEach(b => {
        b.addEventListener('click', () => setView('playlist', { playlistId: b.dataset.id }));
      });
    };

    const renderGenreFilter = () => {
      const sel = document.getElementById('genre-filter');
      const used = [...new Set(state.tracks.map(t => t.genre))].sort();
      sel.innerHTML = '<option value="">All genres</option>' + used.map(g => `<option value="${g}" ${g === state.genreFilter ? 'selected' : ''}>${g}</option>`).join('');
    };

    const renderBrowse = () => {
      const el = document.getElementById('cat-grid');
      const counts = {};
      GENRES.forEach(g => { counts[g] = state.tracks.filter(t => t.genre === g).length; });
      el.innerHTML = GENRES.map(g => `
      <div class="cat-card" data-genre="${g}" style="background:${GENRE_GRADIENTS[g]};">
        <div>
          <div class="cat-name">${g}</div>
          <div class="cat-count">${counts[g]} song${counts[g] === 1 ? '' : 's'}</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
    `).join('');
      el.querySelectorAll('.cat-card').forEach(c => {
        c.addEventListener('click', () => setView('genre', { genre: c.dataset.genre }));
      });
    };

    const renderPlaylistView = () => {
      const pl = state.playlists.find(p => p.id === state.activePlaylistId);
      if (!pl) { setView('library'); return; }
      document.getElementById('pl-title').textContent = pl.name;
      document.getElementById('pl-count').textContent = `${pl.trackIds.length} ${pl.trackIds.length === 1 ? 'track' : 'tracks'}`;
      const tracks = pl.trackIds.map(id => findTrack(id)).filter(Boolean);
      renderTracks('pl-tracks', tracks, { playlistId: pl.id, emptyTitle: 'This playlist is empty', emptyText: 'Add songs from your library using the + button' });
    };

    const renderAll = () => {
      document.getElementById('badge-library').textContent = state.tracks.length;
      document.getElementById('badge-liked').textContent = state.liked.size;
      document.getElementById('badge-library').style.display = state.tracks.length ? '' : 'none';
      document.getElementById('badge-liked').style.display = state.liked.size ? '' : 'none';
      document.getElementById('liked-count').textContent = `${state.liked.size} ${state.liked.size === 1 ? 'track' : 'tracks'}`;

      renderSidebarPlaylists();

      if (state.view === 'home') {
        const recent = [...state.tracks].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 8);
        renderTracks('home-tracks', recent);
      } else if (state.view === 'library') {
        renderGenreFilter();
        const q = state.query.toLowerCase();
        let filtered = state.tracks;
        if (state.genreFilter) filtered = filtered.filter(t => t.genre === state.genreFilter);
        if (q) filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
        if (state.sort === 'title') filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
        else if (state.sort === 'artist') filtered = [...filtered].sort((a, b) => a.artist.localeCompare(b.artist));
        else filtered = [...filtered].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        renderTracks('library-tracks', filtered, {
          emptyTitle: q || state.genreFilter ? 'No matches' : 'Your library is empty',
          emptyText: q || state.genreFilter ? 'Try a different filter or search.' : 'Upload some songs to get started.',
        });
      } else if (state.view === 'browse') {
        renderBrowse();
      } else if (state.view === 'genre') {
        document.getElementById('genre-title').textContent = state.activeGenre || 'Genre';
        const tracks = state.tracks.filter(t => t.genre === state.activeGenre);
        document.getElementById('genre-count').textContent = `${tracks.length} song${tracks.length === 1 ? '' : 's'}`;
        renderTracks('genre-tracks', tracks, { emptyTitle: `No ${state.activeGenre} songs yet`, emptyText: 'Tag songs with this genre to see them here.' });
      } else if (state.view === 'liked') {
        const liked = state.tracks.filter(t => state.liked.has(t.id));
        renderTracks('liked-tracks', liked, { emptyTitle: 'No liked songs yet', emptyText: 'Tap the heart on any track.' });
      } else if (state.view === 'playlist') {
        renderPlaylistView();
      }

      const t = state.currentIndex >= 0 ? state.tracks[state.currentIndex] : null;
      document.getElementById('now-title').textContent = t ? t.title : 'No song playing';
      document.getElementById('now-artist').textContent = t ? t.artist : '—';
      const likeBtn = document.getElementById('like-btn');
      const isLiked = t && state.liked.has(t.id);
      likeBtn.classList.toggle('active', !!isLiked);
      likeBtn.querySelector('svg').setAttribute('fill', isLiked ? 'currentColor' : 'none');
      likeBtn.disabled = !t;

      document.getElementById('shuffle-btn').classList.toggle('active', state.shuffle);
      document.getElementById('repeat-btn').classList.toggle('active', state.repeat !== 'off');
      refreshRepeatIcon();
    };


    document.getElementById('search-input').addEventListener('input', (e) => { state.query = e.target.value; renderAll(); });
    document.getElementById('genre-filter').addEventListener('change', (e) => { state.genreFilter = e.target.value; renderAll(); });
    document.getElementById('sort-select').addEventListener('change', (e) => { state.sort = e.target.value; renderAll(); });

    const playTrackById = (id, queueIds) => {
      const t = findTrack(id);
      if (!t || !t.url) { toast('File not loaded — please re-upload it'); return; }
      state.currentQueue = queueIds && queueIds.length ? queueIds : state.tracks.map(x => x.id);
      state.currentIndex = indexOfTrack(id);
      audio.src = t.url;
      audio.play().catch(() => { });
      persist();
    };
    const togglePlay = () => {
      if (state.currentIndex < 0 && state.tracks.length) return playTrackById(state.tracks[0].id);
      if (audio.paused) audio.play(); else audio.pause();
    };
    const next = (auto = false) => {
      if (state.repeat === 'one' && auto) { audio.currentTime = 0; audio.play(); return; }
      if (!state.currentQueue.length) return;
      const curId = state.currentIndex >= 0 ? state.tracks[state.currentIndex].id : null;
      const qIdx = state.currentQueue.indexOf(curId);
      let nextId;
      if (state.shuffle) {
        const others = state.currentQueue.filter(id => id !== curId);
        nextId = others.length ? others[Math.floor(Math.random() * others.length)] : curId;
      } else {
        let nq = qIdx + 1;
        if (nq >= state.currentQueue.length) {
          if (state.repeat === 'all') nq = 0;
          else { audio.pause(); return; }
        }
        nextId = state.currentQueue[nq];
      }
      if (nextId) playTrackById(nextId, state.currentQueue);
    };
    const prev = () => {
      if (audio.currentTime > 3) { audio.currentTime = 0; return; }
      if (!state.currentQueue.length) return;
      const curId = state.currentIndex >= 0 ? state.tracks[state.currentIndex].id : null;
      const qIdx = state.currentQueue.indexOf(curId);
      const pq = qIdx - 1 < 0 ? state.currentQueue.length - 1 : qIdx - 1;
      playTrackById(state.currentQueue[pq], state.currentQueue);
    };
    const toggleLike = (id) => {
      if (state.liked.has(id)) state.liked.delete(id);
      else state.liked.add(id);
      persist();
      renderAll();
    };
    const removeTrack = (id) => {
      confirmAction('Delete from library?', 'This will also remove it from any playlists.', () => {
        const idx = indexOfTrack(id);
        if (idx === -1) return;
        state.tracks.splice(idx, 1);
        state.liked.delete(id);
        state.fileMap.delete(id);
        state.playlists.forEach(pl => { pl.trackIds = pl.trackIds.filter(t => t !== id); });
        if (idx === state.currentIndex) { audio.pause(); state.currentIndex = -1; }
        else if (idx < state.currentIndex) state.currentIndex--;
        persist();
        renderAll();
      });
    };

    document.getElementById('play-btn').addEventListener('click', togglePlay);
    document.getElementById('next-btn').addEventListener('click', () => next(false));
    document.getElementById('prev-btn').addEventListener('click', prev);
    document.getElementById('like-btn').addEventListener('click', () => {
      const t = state.tracks[state.currentIndex];
      if (t) toggleLike(t.id);
    });
    document.getElementById('shuffle-btn').addEventListener('click', () => {
      state.shuffle = !state.shuffle;
      persist();
      renderAll();
      toast(state.shuffle ? 'Shuffle on' : 'Shuffle off');
    });
    const refreshRepeatIcon = () => {
      const icon = document.getElementById('repeat-icon');
      if (state.repeat === 'one') {
        icon.innerHTML = '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="14" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none">1</text>';
      } else {
        icon.innerHTML = '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>';
      }
    };
    document.getElementById('repeat-btn').addEventListener('click', () => {
      state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      persist();
      renderAll();
      toast(`Repeat: ${state.repeat}`);
    });

    
    document.getElementById('pl-play').addEventListener('click', () => {
      const pl = state.playlists.find(p => p.id === state.activePlaylistId);
      if (!pl || !pl.trackIds.length) return;
      playTrackById(pl.trackIds[0], pl.trackIds);
    });
    document.getElementById('pl-rename').addEventListener('click', () => {
      const pl = state.playlists.find(p => p.id === state.activePlaylistId);
      if (!pl) return;
      promptText('Rename playlist', 'Choose a new name', pl.name, (name) => renamePlaylist(pl.id, name));
    });
    document.getElementById('pl-delete').addEventListener('click', () => {
      const pl = state.playlists.find(p => p.id === state.activePlaylistId);
      if (!pl) return;
      confirmAction(`Delete "${pl.name}"?`, 'The songs in your library will not be deleted.', () => deletePlaylist(pl.id));
    });

  
    const playIcon = document.getElementById('play-icon');
    const pauseSvg = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
    const playSvg = '<path d="M8 5v14l11-7z"/>';
    audio.addEventListener('play', () => { state.isPlaying = true; playIcon.innerHTML = pauseSvg; renderAll(); });
    audio.addEventListener('pause', () => { state.isPlaying = false; playIcon.innerHTML = playSvg; renderAll(); });
    audio.addEventListener('ended', () => next(true));

    const progressEl = document.getElementById('progress');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    audio.addEventListener('loadedmetadata', () => { progressEl.max = audio.duration || 0; timeTotal.textContent = fmt(audio.duration); });
    audio.addEventListener('timeupdate', () => {
      progressEl.value = audio.currentTime;
      timeCurrent.textContent = fmt(audio.currentTime);
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      progressEl.style.setProperty('--val', pct + '%');
    });
    progressEl.addEventListener('input', () => { audio.currentTime = parseFloat(progressEl.value); });

    const volumeEl = document.getElementById('volume');
    const volIcon = document.getElementById('vol-icon');
    const muteSvg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    const fullVolSvg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
    const setVolume = (v) => {
      state.volume = v;
      audio.volume = v;
      volumeEl.value = v * 100;
      volumeEl.style.setProperty('--val', v * 100 + '%');
      volIcon.innerHTML = v === 0 ? muteSvg : fullVolSvg;
      persist();
    };
    volumeEl.addEventListener('input', () => {
      const v = parseFloat(volumeEl.value) / 100;
      if (v > 0) state.lastVolume = v;
      setVolume(v);
    });
    document.getElementById('mute-btn').addEventListener('click', () => {
      if (state.volume > 0) { state.lastVolume = state.volume; setVolume(0); }
      else setVolume(state.lastVolume || 0.8);
    });


    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight' && e.shiftKey) next(false);
      else if (e.code === 'ArrowLeft' && e.shiftKey) prev();
      else if (e.key === 'm' || e.key === 'M') document.getElementById('mute-btn').click();
    });

    restore();
    refreshThemeIcon();
    setVolume(state.volume);
    renderAll();
