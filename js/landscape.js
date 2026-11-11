// js/landscape.js - 課本景觀版功能：素材路徑、路線分組、臺灣地圖選站、暖身任務、
// AI 示意圖標籤與真實照片連結、時光機、三關終極任務、我的家鄉景觀、教師準心
(function () {
  // 圖片路徑：單檔獨立版會把圖片內嵌在 window.ASSET_DATA，其餘情況直接用相對路徑
  window.LAsset = function (path) {
    if (!path) return '';
    if (window.ASSET_DATA && window.ASSET_DATA[path]) return window.ASSET_DATA[path];
    return path;
  };

  // 臺灣地圖底圖的經緯度範圍（與 Codex 任務清單一致）
  const MAP_BOUNDS = { west: 119.9, east: 122.1, north: 25.35, south: 21.85 };

  let data = null;
  let sceneEra = null;
  let tmEra = null;
  let tmIndex = 0;
  let finalStep = 0;
  let finalChoices = {};
  let warmPicked = [];
  let crosshairTimer = null;

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  window.Landscape = {
    init(erasData) {
      data = erasData;
      const assets = (data && data.assets) || {};

      document.querySelectorAll('img[data-asset]').forEach((img) => {
        const src = assets[img.getAttribute('data-asset')];
        if (src) img.src = window.LAsset(src);
        else img.classList.add('hidden');
      });

      ['home-legend', 'timeline-legend'].forEach((id) => {
        const el = $(id);
        if (el) el.innerHTML = this.legendHtml();
      });

      this.bindTimemachine();
      this.bindFinalTask();
      this.bindMyLandscape();
      this.bindWarmup();
    },

    legendHtml() {
      const routes = (data && data.routes) || {};
      return Object.keys(routes).map((k) => {
        const r = routes[k];
        const n = data.eras.filter((e) => e.route === k).length;
        return `<span class="legend-chip" style="--chip:${r.color}">${r.emoji} ${r.label}（${n} 站）</span>`;
      }).join('');
    },

    // ---------- 臺灣地圖與路線分組 ----------
    routeSectionsHtml() {
      const routes = (data && data.routes) || {};
      return Object.keys(routes).map((k) => {
        const r = routes[k];
        const list = data.eras.filter((e) => e.route === k);
        const done = list.filter((e) => window.GameStorage.isEraCompleted(e.id)).length;
        return `<section class="route-section" style="--route:${r.color}">
          <div class="route-head">
            <h3>${r.emoji} ${r.label}</h3>
            <span class="route-progress">${done} / ${list.length} 站</span>
          </div>
          <p class="route-desc">${r.desc}</p>
          <div class="era-cards-grid" id="route-grid-${k}"></div>
        </section>`;
      }).join('');
    },

    renderMapDots() {
      const map = $('tw-map');
      if (!map || !data) return;
      map.querySelectorAll('.tw-dot').forEach((d) => d.remove());
      const routes = data.routes || {};
      data.eras.forEach((era) => {
        if (!era.mapPos) return;
        let x = (era.mapPos.lng - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west) * 100;
        let y = (MAP_BOUNDS.north - era.mapPos.lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south) * 100;
        const fixed = !data.taiwanMapPlaceholder && data.taiwanMapPositions && data.taiwanMapPositions[era.id];
        if (fixed) [x, y] = fixed;
        const unlocked = window.GameStorage.isEraUnlocked(era.id);
        const done = window.GameStorage.isEraCompleted(era.id);
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `tw-dot ${done ? 'done' : unlocked ? 'open' : 'locked'}`;
        dot.style.left = `${x}%`;
        dot.style.top = `${y}%`;
        dot.style.setProperty('--route', (routes[era.route] || {}).color || '#666');
        dot.title = era.name;
        dot.innerHTML = `<span class="tw-dot-id">${done ? '✓' : era.id}</span><span class="tw-dot-label">${esc(era.name.split('・')[1] || era.name)}</span>`;
        dot.onclick = () => {
          if (unlocked) {
            window.AudioManager.playClick();
            window.App.openEraScene(era.id);
          } else {
            window.AudioManager.playWrong();
            alert('這一站還沒開放喔！請先完成同一條路線的前一站。');
          }
        };
        map.appendChild(dot);
      });
    },

    // ---------- 360 場景 ----------
    onSceneOpen(era) {
      sceneEra = era;
      const tmBtn = $('timemachine-btn');
      if (tmBtn) tmBtn.classList.toggle('hidden', !era.timemachine);
      const ribbon = $('placeholder-ribbon');
      if (ribbon) ribbon.textContent = era.placeholder ? '示意圖・正式全景圖製作中' : 'AI 生成示意圖，非真實照片';
      const real = $('real-photo-btn');
      if (real) {
        real.classList.toggle('hidden', !era.realPhotoUrl);
        real.href = era.realPhotoUrl || '#';
      }
      this.startCrosshair();
    },

    onQuizRender(era) {
      const btn = $('quiz-timemachine-btn');
      if (!btn) return;
      btn.classList.toggle('hidden', !(era && era.timemachine));
      btn.onclick = () => {
        window.AudioManager.playClick();
        this.openTimemachine(era);
      };
    },

    // ---------- 暖身任務（課本 p.44 臺南旅遊地圖） ----------
    bindWarmup() {
      const done = $('warmup-done-btn');
      if (done) {
        done.onclick = () => {
          window.AudioManager.playClick();
          window.GameStorage.setWarmupDone();
          window.App.showScreen('timeline-screen');
          window.App.refreshTimeline();
        };
      }
    },

    startWarmup() {
      const w = data && data.warmup;
      if (!w) return;
      warmPicked = [];
      $('warmup-title').textContent = w.title;
      $('warmup-intro').textContent = w.intro;
      $('warmup-question').classList.add('hidden');
      $('warmup-feedback').classList.add('hidden');
      $('warmup-done-btn').classList.add('hidden');
      const tag = document.querySelector('#warmup-map .ai-tag');
      if (tag) tag.textContent = w.placeholder ? '示意地圖・正式圖製作中' : 'AI 生成示意圖';

      const map = $('warmup-map');
      map.querySelectorAll('.warm-pin').forEach((p) => p.remove());
      const list = $('warmup-list');
      list.innerHTML = '';
      w.items.forEach((it, i) => {
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'warm-pin';
        pin.dataset.id = it.id;
        pin.style.left = `${it.x}%`;
        pin.style.top = `${it.y}%`;
        pin.innerHTML = `<span>${i + 1}</span>`;
        pin.title = it.name;
        pin.onclick = () => this.toggleWarm(it.id);
        map.appendChild(pin);

        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'warm-item';
        row.dataset.id = it.id;
        row.innerHTML = `<span class="warm-no">${i + 1}</span><span class="warm-text"><strong>${esc(it.name)}</strong><small>${esc(it.desc)}</small></span>`;
        row.onclick = () => this.toggleWarm(it.id);
        list.appendChild(row);
      });
      this.updateWarm();
      window.App.showScreen('warmup-screen');
    },

    toggleWarm(id) {
      const w = data.warmup;
      if (!$('warmup-question').classList.contains('hidden')) return;
      window.AudioManager.playClick();
      if (warmPicked.includes(id)) warmPicked = warmPicked.filter((x) => x !== id);
      else if (warmPicked.length < w.pick) warmPicked.push(id);
      this.updateWarm();
      if (warmPicked.length === w.pick) this.showWarmQuestion();
    },

    updateWarm() {
      const w = data.warmup;
      document.querySelectorAll('.warm-pin, .warm-item').forEach((el) => el.classList.toggle('picked', warmPicked.includes(el.dataset.id)));
      $('warmup-count').textContent = `已選 ${warmPicked.length} / ${w.pick}`;
    },

    showWarmQuestion() {
      const q = data.warmup.question;
      const names = warmPicked.map((id) => data.warmup.items.find((i) => i.id === id).name).join('、');
      $('warmup-q').textContent = `你的臺南小旅行：${names}。${q.q}`;
      const box = $('warmup-options');
      box.innerHTML = '';
      q.options.forEach((opt, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'final-choice';
        b.textContent = opt;
        b.onclick = () => {
          const fb = $('warmup-feedback');
          if (idx === q.answer) {
            window.AudioManager.playCorrect();
            b.classList.add('selected');
            box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
            fb.className = 'quiz-feedback-box success-box';
            $('warmup-feedback-text').innerHTML = `<div class="feedback-badge-tag">🎉 暖身完成！</div><p>${esc(q.explain)}</p>`;
            $('warmup-done-btn').classList.remove('hidden');
          } else {
            window.AudioManager.playWrong();
            fb.className = 'quiz-feedback-box hint-box';
            $('warmup-feedback-text').innerHTML = `<div class="feedback-badge-tag hint">💡 提示一下</div><p>${esc(q.hint)}</p>`;
          }
        };
        box.appendChild(b);
      });
      $('warmup-question').classList.remove('hidden');
    },

    // ---------- 時光機 ----------
    bindTimemachine() {
      const open = $('timemachine-btn');
      if (open) {
        open.onclick = () => {
          window.AudioManager.playClick();
          if (sceneEra) this.openTimemachine(sceneEra);
        };
      }
      const close = $('tm-close');
      if (close) {
        close.onclick = () => {
          window.AudioManager.playClick();
          window.AudioManager.stopSpeaking();
          $('timemachine-modal').classList.add('hidden');
        };
      }
      $('tm-prev').onclick = () => this.showFrame(tmIndex - 1);
      $('tm-next').onclick = () => this.showFrame(tmIndex + 1);
      $('tm-speak').onclick = () => {
        const fr = tmEra && tmEra.timemachine.frames[tmIndex];
        if (fr) window.AudioManager.speak(`${fr.label}。${fr.caption}`);
      };
    },

    openTimemachine(era) {
      if (!era || !era.timemachine) return;
      tmEra = era;
      $('tm-title').textContent = era.timemachine.title || '⏳ 時光機';
      const steps = $('tm-steps');
      steps.innerHTML = '';
      era.timemachine.frames.forEach((fr, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tm-step';
        b.innerHTML = `<span class="tm-step-no">${i + 1}</span>${esc(fr.label)}`;
        b.onclick = () => this.showFrame(i);
        steps.appendChild(b);
        if (i < era.timemachine.frames.length - 1) {
          const arrow = document.createElement('span');
          arrow.className = 'tm-arrow';
          arrow.textContent = '➜';
          steps.appendChild(arrow);
        }
      });
      $('timemachine-modal').classList.remove('hidden');
      this.showFrame(0);
    },

    showFrame(i) {
      if (!tmEra) return;
      const frames = tmEra.timemachine.frames;
      tmIndex = Math.max(0, Math.min(frames.length - 1, i));
      const fr = frames[tmIndex];
      $('tm-img').src = window.LAsset(fr.img);
      $('tm-img').alt = fr.label;
      $('tm-caption').textContent = fr.caption;
      $('tm-ph').textContent = fr.placeholder ? '示意圖・正式圖製作中' : 'AI 生成示意圖';
      document.querySelectorAll('#tm-steps .tm-step').forEach((b, k) => b.classList.toggle('active', k === tmIndex));
      $('tm-prev').disabled = tmIndex === 0;
      $('tm-next').disabled = tmIndex === frames.length - 1;
      window.AudioManager.playTone(440 + tmIndex * 120, 'sine', 0.12);
    },

    // ---------- 終極任務（多關） ----------
    bindFinalTask() {
      $('final-back-btn').onclick = () => {
        window.AudioManager.playClick();
        window.App.showScreen('timeline-screen');
        window.App.refreshTimeline();
      };
      $('final-check-btn').onclick = () => this.checkFinal();
    },

    startFinalTask() {
      if (!data || !data.finalTask) return;
      finalStep = 0;
      $('final-title').textContent = data.finalTask.title;
      window.App.showScreen('final-task-screen');
      this.renderFinalStep();
    },

    renderFinalStep() {
      const steps = data.finalTask.steps;
      const step = steps[finalStep];
      finalChoices = {};
      $('final-step-pill').textContent = `第 ${finalStep + 1} / ${steps.length} 關`;
      $('final-prompt').textContent = step.prompt;
      $('final-feedback').classList.add('hidden');
      $('final-next-btn').classList.add('hidden');
      $('final-check-btn').classList.remove('hidden');

      const wrap = $('final-cards');
      wrap.innerHTML = '';
      wrap.className = `final-cards ${step.type === 'match' ? 'final-cards-match' : ''}`;
      const entries = step.type === 'match'
        ? step.items.map((it) => ({ key: it.id, html: `<div class="final-card-body"><div class="final-quote">「${esc(it.text)}」</div><div class="final-choice-row"></div></div>` }))
        : Object.keys(step.answers).map((sid) => {
          const era = data.eras.find((e) => e.id === sid);
          return { key: sid, html: `<img src="${window.LAsset(era.thumb)}" alt="${esc(era.name)}"><div class="final-card-body"><div class="final-card-name">${era.badgeEmoji} ${esc(era.name)}</div><div class="final-card-sub">${esc(era.subtitle)}</div><div class="final-choice-row"></div></div>` };
        });

      entries.forEach(({ key, html }) => {
        const card = document.createElement('div');
        card.className = 'final-card';
        card.dataset.key = key;
        card.innerHTML = html;
        const row = card.querySelector('.final-choice-row');
        step.options.forEach(([val, label]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'final-choice';
          b.dataset.val = val;
          b.textContent = label;
          b.onclick = () => {
            window.AudioManager.playClick();
            finalChoices[key] = val;
            card.classList.remove('wrong', 'right');
            row.querySelectorAll('.final-choice').forEach((x) => x.classList.toggle('selected', x === b));
          };
          row.appendChild(b);
        });
        wrap.appendChild(card);
      });
    },

    answerOf(step, key) {
      return step.type === 'match' ? step.items.find((i) => i.id === key).answer : step.answers[key];
    },

    checkFinal() {
      const ft = data.finalTask;
      const step = ft.steps[finalStep];
      const keys = [...document.querySelectorAll('#final-cards .final-card')].map((c) => c.dataset.key);
      const fb = $('final-feedback');
      const fbText = $('final-feedback-text');
      const missing = keys.filter((k) => !finalChoices[k]);
      if (missing.length) {
        window.AudioManager.playWrong();
        fb.className = 'quiz-feedback-box hint-box';
        fbText.innerHTML = `<div class="feedback-badge-tag hint">✋ 還沒選完</div><p>還有 ${missing.length} 張卡片沒有選答案喔！</p>`;
        return;
      }
      let wrong = 0;
      document.querySelectorAll('#final-cards .final-card').forEach((card) => {
        const ok = finalChoices[card.dataset.key] === this.answerOf(step, card.dataset.key);
        card.classList.toggle('right', ok);
        card.classList.toggle('wrong', !ok);
        if (!ok) wrong++;
      });
      if (wrong) {
        window.AudioManager.playWrong();
        fb.className = 'quiz-feedback-box hint-box';
        fbText.innerHTML = `<div class="feedback-badge-tag hint">💡 提示一下</div><p>有 ${wrong} 張卡片（紅色框）答錯了。${esc(step.hint)}</p>`;
        return;
      }
      window.AudioManager.playCorrect();
      $('final-check-btn').classList.add('hidden');
      const next = $('final-next-btn');
      next.classList.remove('hidden');
      fb.className = 'quiz-feedback-box success-box';
      const last = finalStep === ft.steps.length - 1;
      if (!last) {
        fbText.innerHTML = `<div class="feedback-badge-tag">🎉 第 ${finalStep + 1} 關過關！</div><p>${esc(step.success || '')}</p>`;
        next.textContent = `前往第 ${finalStep + 2} 關 ➔`;
        next.onclick = () => {
          window.AudioManager.playClick();
          finalStep += 1;
          this.renderFinalStep();
          window.scrollTo(0, 0);
        };
      } else {
        fbText.innerHTML = `<div class="feedback-badge-tag">🏆 終極任務完成！</div><p>${esc(ft.explain)}</p>`;
        next.textContent = '🏆 領取家鄉景觀小導覽員證書';
        next.onclick = () => {
          window.GameStorage.setFinalBossCompleted();
          window.AudioManager.playWin();
          window.App.showScreen('certificate-screen');
          this.prepareCertificate();
          window.CertificateManager.render();
        };
      }
    },

    // ---------- 我的家鄉景觀 ----------
    bindMyLandscape() {
      const input = $('my-landscape-input');
      const apply = $('my-landscape-apply');
      if (!input || !apply) return;
      const save = () => {
        window.GameStorage.setMyLandscape(input.value);
        window.AudioManager.playClick();
        window.CertificateManager.render();
      };
      apply.onclick = save;
      input.onkeydown = (e) => { if (e.key === 'Enter') save(); };
      ['view-final-cert-btn', 'victory-next-btn'].forEach((id) => {
        const b = $(id);
        if (b) b.addEventListener('click', () => this.prepareCertificate());
      });
    },

    prepareCertificate() {
      const input = $('my-landscape-input');
      if (input) input.value = window.GameStorage.get().myLandscape || '';
    },

    // ---------- 教師校準準心（網址加 ?teacher） ----------
    startCrosshair() {
      const box = $('teacher-crosshair');
      if (!box || !window.isTeacherMode) return;
      box.classList.remove('hidden');
      const label = box.querySelector('span');
      if (crosshairTimer) clearInterval(crosshairTimer);
      crosshairTimer = setInterval(() => {
        const v = window.ViewerManager.getViewer && window.ViewerManager.getViewer();
        if (!v || $('viewer-screen').classList.contains('hidden')) return;
        try {
          let yaw = v.getYaw();
          while (yaw < -180) yaw += 360;
          while (yaw > 180) yaw -= 360;
          label.textContent = `x ${((yaw + 180) / 3.6).toFixed(1)}%　y ${((90 - v.getPitch()) / 1.8).toFixed(1)}%`;
        } catch (e) { /* viewer 尚未就緒 */ }
      }, 200);
    }
  };
})();
