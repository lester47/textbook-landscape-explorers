// js/storage.js - 進度儲存與讀取模組
(function () {
  const STORAGE_KEY = 'textbook_landscape_explorers_progress';

  const defaultState = {
    playerName: '',
    unlockedEras: [],
    warmupDone: false,
    completedEras: [],
    readClues: {},
    finalBossCompleted: false,
    soundEnabled: true,
    lastActiveEra: 'N1',
    myLandscape: '',
    completedDate: ''
  };

  window.GameStorage = {
    get() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...defaultState };
        const parsed = JSON.parse(raw);
        return {
          ...defaultState,
          ...parsed,
          readClues: { ...defaultState.readClues, ...(parsed.readClues || {}) }
        };
      } catch (e) {
        console.warn('localStorage access failed, fallback to memory', e);
        return { ...defaultState };
      }
    },

    save(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.warn('localStorage save failed', e);
      }
    },

    setPlayerName(name) {
      const state = this.get();
      state.playerName = (name || '').trim().slice(0, 10);
      this.save(state);
      return state;
    },

    markClueRead(eraId, clueId) {
      const state = this.get();
      if (!state.readClues[eraId]) {
        state.readClues[eraId] = [];
      }
      if (!state.readClues[eraId].includes(clueId)) {
        state.readClues[eraId].push(clueId);
      }
      this.save(state);
      return state;
    },

    // 防亂猜：記錄本站第一次就答錯的題目（離開或重新整理也不會歸零）
    getQuizMissed(eraId) {
      const state = this.get();
      return (state.quizMissed && state.quizMissed[eraId]) || [];
    },

    addQuizMissed(eraId, qIndex) {
      const state = this.get();
      state.quizMissed = state.quizMissed || {};
      const list = state.quizMissed[eraId] || [];
      if (!list.includes(qIndex)) list.push(qIndex);
      state.quizMissed[eraId] = list;
      this.save(state);
      return list;
    },

    clearQuizMissed(eraId) {
      const state = this.get();
      if (state.quizMissed) delete state.quizMissed[eraId];
      this.save(state);
    },

    // 錯太多題：本站線索重設為未看（彩蛋保留），重來次數 +1
    resetEraForRetry(eraId) {
      const state = this.get();
      state.readClues[eraId] = (state.readClues[eraId] || []).filter(id => id.includes('egg'));
      if (state.quizMissed) delete state.quizMissed[eraId];
      state.quizRetries = state.quizRetries || {};
      state.quizRetries[eraId] = (state.quizRetries[eraId] || 0) + 1;
      this.save(state);
      return state;
    },

    isEraCompleted(eraId) {
      const state = this.get();
      return state.completedEras.includes(eraId);
    },

    // 路線制：每條路線的第一站預設開放，之後完成前一站才開放下一站
    routeStations(route) {
      const eras = (window.ERAS_DATA && window.ERAS_DATA.eras) || [];
      return eras.filter(e => (e.route || 'main') === route);
    },

    isEraUnlocked(eraId) {
      const state = this.get();
      if (window.isTeacherMode) return true;
      const eras = (window.ERAS_DATA && window.ERAS_DATA.eras) || [];
      const era = eras.find(e => e.id === eraId);
      if (!era) return false;
      const list = this.routeStations(era.route || 'main');
      const idx = list.findIndex(e => e.id === eraId);
      if (idx <= 0) return true;
      return state.completedEras.includes(list[idx - 1].id) || state.unlockedEras.includes(eraId);
    },

    isRouteCompleted(route) {
      const state = this.get();
      return this.routeStations(route).every(e => state.completedEras.includes(e.id));
    },

    setWarmupDone() {
      const state = this.get();
      state.warmupDone = true;
      this.save(state);
      return state;
    },

    completeEra(eraId) {
      const state = this.get();
      if (!state.completedEras.includes(eraId)) {
        state.completedEras.push(eraId);
      }

      // 動態解鎖同一條路線的下一站
      if (window.ERAS_DATA && window.ERAS_DATA.eras) {
        const era = window.ERAS_DATA.eras.find(e => e.id === eraId);
        const list = this.routeStations((era && era.route) || 'main');
        const curIdx = list.findIndex(e => e.id === eraId);
        if (curIdx >= 0 && curIdx + 1 < list.length) {
          const nextId = list[curIdx + 1].id;
          if (!state.unlockedEras.includes(nextId)) {
            state.unlockedEras.push(nextId);
          }
        }
      }

      const totalEras = window.ERAS_DATA && window.ERAS_DATA.eras ? window.ERAS_DATA.eras.length : 3;
      if (state.completedEras.length >= totalEras && !state.completedDate) {
        state.completedDate = new Date().toISOString();
      }

      this.save(state);
      return state;
    },

    setFinalBossCompleted() {
      const state = this.get();
      state.finalBossCompleted = true;
      if (!state.completedDate) {
        state.completedDate = new Date().toISOString();
      }
      this.save(state);
      return state;
    },

    setMyLandscape(text) {
      const state = this.get();
      state.myLandscape = (text || '').trim().slice(0, 16);
      this.save(state);
      return state;
    },

    toggleSound() {
      const state = this.get();
      state.soundEnabled = !state.soundEnabled;
      this.save(state);
      return state.soundEnabled;
    },

    resetAll() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn(e);
      }
      return { ...defaultState };
    }
  };
})();
