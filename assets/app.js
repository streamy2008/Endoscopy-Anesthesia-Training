/* ============================================================
   交互逻辑 —— 渲染 + 灯箱 + 扫码模拟器 + 排序 + 判断 + 考核 + 讲师模式
   纯原生 JS，无依赖、无 CDN，可离线双击运行
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* 迷你 markdown：仅支持 **加粗** */
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const roleName = (id) => (ROLES.find((r) => r.id === id) || {}).n || '';
  const roleLoc = (id) => (ROLES.find((r) => r.id === id) || {}).loc || '';
  const stepById = (id) => STEPS.find((s) => s.id === id);

  /* ---------- 进度持久化 ---------- */
  const LSKEY = 'boe-endoscopy-training-v1';
  const state = {
    done: {},                 // stepId -> true
    quizScore: null,
    scale: 'md',
    presenter: false
  };
  try {
    const raw = localStorage.getItem(LSKEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (e) { /* 隐私模式下忽略 */ }
  function save() {
    try { localStorage.setItem(LSKEY, JSON.stringify({ done: state.done, quizScore: state.quizScore, scale: state.scale })); } catch (e) {}
  }

  /* ============================================================
     A. 静态渲染
     ============================================================ */
  /* 安全写文本/HTML：节点缺失也不打断整体渲染 */
  const txt = (sel, v) => { const n = $(sel); if (n) n.textContent = v; };
  const html = (sel, v) => { const n = $(sel); if (n) n.innerHTML = v; };

  function renderHero() {
    txt('#hero-eyebrow', META.date + ' · ' + META.ver + ' · ' + META.audience);
    txt('#hero-title', META.title);
    txt('#hero-sub', META.sub);
    txt('#hero-lead', META.lead);
    html('#hero-stats', META.stats
      .map((s) => `<div class="stat"><b>${esc(s.n)}</b><span>${esc(s.l)}</span></div>`)
      .join(''));
    html('#foot-meta',
      `${esc(META.title)} · ${esc(META.sub)} &nbsp;|&nbsp; 版本 ${esc(META.ver)} &nbsp;|&nbsp; ${esc(META.date)}`);
  }

  function renderHardware() {
    $('#hw-stage').innerHTML =
      `<img src="assets/img/09-devices-pda.png" alt="无线监护设备一套：心电、血氧、血压、信号中继器、手持 PDA、患者条码">` +
      DEVICES.map(
        (d, i) =>
          `<button class="pin" data-dev="${d.id}" style="left:${d.x}%;top:${d.y}%" title="${esc(d.n)}" aria-label="${esc(d.n)}">${i + 1}</button>`
      ).join('');
    $('#hw-list').innerHTML = DEVICES.map(
      (d, i) =>
        `<button class="hw__item" data-dev="${d.id}"><span class="hw__idx">${i + 1}</span>
          <span><span class="hw__name">${esc(d.n)}</span><br><span class="hw__meta">${esc(d.m)}</span></span></button>`
    ).join('');
    $('#hw-stage').addEventListener('click', (e) => {
      const b = e.target.closest('.pin'); if (b) selectDevice(b.dataset.dev);
    });
    $('#hw-list').addEventListener('click', (e) => {
      const b = e.target.closest('.hw__item'); if (b) selectDevice(b.dataset.dev);
    });
    selectDevice(DEVICES[0].id);
  }
  function selectDevice(id) {
    const d = DEVICES.find((x) => x.id === id); if (!d) return;
    $$('.pin[data-dev]').forEach((p) => p.classList.toggle('is-active', p.dataset.dev === id));
    $$('.hw__item[data-dev]').forEach((p) => p.classList.toggle('is-active', p.dataset.dev === id));
    $('#hw-detail').innerHTML =
      `<h4>${esc(d.n)} <span class="badge badge--mono">${esc(d.m)}</span></h4>
       <p>${esc(d.d)}</p>
       <div class="callout callout--tip"><b>操作提示：</b>${esc(d.p[0])}</div>
       ${d.p[1] ? `<div class="callout callout--warn" style="margin-top:8px"><b>易错：</b>${esc(d.p[1])}</div>` : ''}`;
  }

  /* ---------- 全流程地图（D5：4 泳道 → 一条横向时间轴，14 步等宽） ---------- */
  function renderFlow() {
    let html = '';
    ROLES.forEach((r) => {
      const list = STEPS.filter((s) => s.role === r.id);
      html += `<div class="tlflow__group" data-lane="${r.id}">
        <div class="tlflow__role"><b>${roleSym(r.id)} ${esc(r.n)}</b><span>${esc(r.loc)} · ${list.length} 步</span></div>
        <div class="tlflow__row">${list.map(
          (s) => `<button class="stepchip" data-goto="${s.id}" data-role="${s.role}" data-no="${s.no}">
              <span class="stepchip__n">${s.no}</span><span class="stepchip__t">${esc(s.t)}</span></button>`
        ).join('')}</div></div>`;
    });
    $('#tlflow-steps').className = 'tlflow__list';
    $('#tlflow-steps').innerHTML = html;
    $('#tlflow').addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]'); if (!b) return;
      gotoStep(b.dataset.goto);
    });
    $('#flow-play').addEventListener('click', playFlow);
  }
  /* 顶部进度条 + 已完成 chip 着色，让「流程在推进」看得见 */
  function flowProgress(upto) {
    $$('#tlflow-steps .stepchip').forEach((c) => {
      const n = +c.dataset.no;
      c.classList.toggle('is-done', upto > 0 && n < upto);
      c.classList.toggle('is-now', n === upto);
    });
    const bar = $('#tlflow-bar > i');
    if (bar) bar.style.width = (upto <= 0 ? 0 : upto / STEPS.length * 100) + '%';
  }
  const roleSym = (id) => ({ '1': 'Ⅰ', '2': 'Ⅱ', '3': 'Ⅲ', '4': 'Ⅳ' }[id] || '');
  const NODE_ORDER = STEPS.map((s) => s.no);

  let flowTimer = null;
  function playFlow() {
    const btn = $('#flow-play');
    if (flowTimer) { stopFlow(); return; }
    btn.textContent = '■ 停止巡演';
    setRoleTab(STEPS[0].role);
    let i = 0;
    flowProgress(0);
    const tick = () => {
      const st = STEPS[i];
      $$('.stepchip').forEach((c) => {
        const n = +c.querySelector('.stepchip__n').textContent;
        c.classList.toggle('is-now', n === st.no);
        c.classList.toggle('is-done', n < st.no);
      });
      flowProgress(st.no);
      const chip = $(`.stepchip[data-goto="${st.id}"]`);
      if (chip) chip.scrollIntoView({ block: 'center', behavior: 'smooth' });
      i++;
      if (i >= STEPS.length) { flowTimer = setTimeout(stopFlow, 1400); }
      else { flowTimer = setTimeout(tick, 1500); }
    };
    tick();
  }
  function stopFlow() {
    clearTimeout(flowTimer); flowTimer = null;
    const btn = $('#flow-play'); if (btn) btn.textContent = '▶ 播放全流程巡演';
    $$('.stepchip').forEach((c) => c.classList.remove('is-now', 'is-done'));
    flowProgress(0);
  }
  function gotoStep(stepId) {
    const st = stepById(stepId); if (!st) return;
    stopFlow();
    setRoleTab(st.role);
    const card = $('#step-' + stepId);
    if (!card) return;
    card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    card.classList.add('is-flash');
    setTimeout(() => card.classList.remove('is-flash'), 1800);
  }

  /* ---------- 角色 Tab + 步骤卡 ---------- */
  function renderRoles() {
    $('#roletabs').innerHTML =
      `<button class="roletab is-active" data-role="all"><span class="roletab__d" style="background:var(--mint-deep)"></span>全部 ${STEPS.length} 步</button>` +
      ROLES.map(
        (r) =>
          `<button class="roletab" data-role="${r.id}"><span class="roletab__d"></span>${roleSym(r.id)} ${esc(r.n)}
             <span class="badge badge--mono">${STEPS.filter((s) => s.role === r.id).length}</span></button>`
      ).join('');
    $('#roletabs').addEventListener('click', (e) => {
      const b = e.target.closest('.roletab'); if (!b) return;
      setRoleTab(b.dataset.role);
    });
  }
  function setRoleTab(role) {
    $$('#roletabs .roletab').forEach((t) => t.classList.toggle('is-active', t.dataset.role === role));
    $$('#steps .step').forEach((s) => {
      s.style.display = role === 'all' || s.dataset.role === role ? '' : 'none';
    });
  }

  function renderSteps() {
    $('#steps').innerHTML = STEPS.map((s) => {
      const hot = HOT[s.id] || [];
      const dots = s.ops.map((_, k) =>
        `<button class="walk__dot" data-walk-go="${k}" title="第 ${k + 1} 步" aria-label="第 ${k + 1} 步"></button>`).join('');
      return `<article class="step" id="step-${s.id}" data-role="${s.role}" data-step="${s.id}">
        <header class="step__head">
          <div class="step__no">${s.no}</div>
          <div class="step__titlebox">
            <h3>${esc(s.t)}</h3>
            <div class="step__tags">
              <span class="badge badge--r${s.role}">${roleSym(s.role)} ${esc(roleName(s.role))}</span>
              <span class="badge badge--mono">${esc(roleLoc(s.role))}</span>
              ${s.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}
            </div>
          </div>
        </header>
        <div class="step__body">
          <div class="step__shot">
            <div class="walk" id="walk-${s.id}" data-walk="${s.id}" tabindex="0"
                 role="group" aria-label="${esc(s.t)} 分步演示">
              <div class="walk__stage">
                <img class="walk__img" src="${esc(s.imgs[0].src)}" alt="${esc(s.imgs[0].cap || s.t)}" loading="lazy">
                <span class="walk__dim" aria-hidden="true"></span>
                <span class="walk__spot" aria-hidden="true"></span>
                <span class="walk__pin" aria-hidden="true">1</span>
                <span class="walk__count">第 1 / ${s.ops.length} 步</span>
                <span class="walk__zoom">点击图片放大 · 滚轮缩放</span>
              </div>
              <div class="walk__ctrl">
                <button class="btn btn--sm" data-walk-prev>← 上一步</button>
                <span class="walk__dots">${dots}</span>
                <button class="btn btn--sm btn--accent" data-walk-next>下一步 →</button>
                <button class="btn btn--sm btn--ghost" data-walk-auto>▶ 自动演示</button>
              </div>
              <div class="walk__cap">
                <span class="walk__n">第 1 步</span>
                <span class="walk__text">${md(s.ops[0])}</span>
              </div>
            </div>
          </div>
          <div class="step__ops">
            <!-- D1：默认只显示「当前这一步」，与图上聚光灯同步；展开才看到全部 -->
            <div class="ops__head">
              <span class="ops__title">操作步骤</span>
              <button class="btn btn--sm btn--ghost" data-ops-toggle aria-expanded="false">
                展开全部 ${s.ops.length} 条</button>
            </div>
            <ol class="ops is-collapsed" id="ops-${s.id}">
              ${s.ops.map((o, k) => `<li data-op="${k}" tabindex="0" title="点击在图上定位">${md(o)}</li>`).join('')}
            </ol>
            <div class="callout callout--warn"><b>易错点 · </b>${esc(s.warn)}</div>
          </div>
        </div>
        <footer class="step__foot">
          <button class="btn btn--sm" data-done="${s.id}" aria-pressed="${state.done[s.id] ? 'true' : 'false'}">
            <span class="ck">${state.done[s.id] ? '✓ 已掌握' : '标记已掌握'}</span></button>
          <span class="donelbl">✓ 已掌握</span>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--ghost" data-goto="${s.id}">在流程中定位</button>
        </footer>
      </article>`;
    }).join('');

    $('#steps').addEventListener('click', (e) => {
      const tog = e.target.closest('[data-ops-toggle]');
      if (tog) {
        const list = $('.ops', tog.closest('.step__ops'));
        const collapsed = list.classList.toggle('is-collapsed');
        tog.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        tog.textContent = collapsed ? `展开全部 ${$$('li', list).length} 条` : '收起，只看当前步';
        if (collapsed) {
          const walk = $('#walk-' + tog.closest('.step').dataset.step);
          const k = walk ? (walkState[walk.dataset.walk] || 0) : 0;
          $$('li', list).forEach((li, i) => li.classList.toggle('is-active', i === k));
        }
        return;
      }
      const d = e.target.closest('[data-done]');
      if (d) {
        const id = d.dataset.done;
        state.done[id] = !state.done[id];
        d.setAttribute('aria-pressed', state.done[id] ? 'true' : 'false');
        d.querySelector('.ck').textContent = state.done[id] ? '✓ 已掌握' : '标记已掌握';
        $('#step-' + id).classList.toggle('is-done', !!state.done[id]);
        if (state.done[id]) { d.style.background = 'var(--mint)'; d.style.borderColor = 'var(--mint)'; }
        else { d.style.background = ''; d.style.borderColor = ''; }
        save(); updateProgress();
        return;
      }
      if (e.target.closest('[data-walk]')) { onWalkClick(e); return; }
      const li = e.target.closest('.ops li[data-op]');
      if (li) {
        const walk = $('#walk-' + li.closest('.step').dataset.step);
        if (walk) walkGo(walk, +li.dataset.op);
        return;
      }
    });
    $('#steps').addEventListener('keydown', (e) => {
      const li = e.target.closest && e.target.closest('.ops li[data-op]');
      if (li && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const walk = $('#walk-' + li.closest('.step').dataset.step);
        if (walk) walkGo(walk, +li.dataset.op);
      }
    });
    $$('[data-done]').forEach((d) => {
      if (state.done[d.dataset.done]) { d.style.background = 'var(--mint)'; d.style.borderColor = 'var(--mint)'; }
      if (state.done[d.dataset.done]) $('#step-' + d.dataset.done).classList.add('is-done');
    });
    /* 每张分步演示先落到第 1 步 */
    $$('.walk').forEach((w) => walkGo(w, 0, true));
  }

  /* ============================================================
     A1. 分步图片演示：把「文字操作项」变成可以在图上一步步走的演示
     —— 有热点：聚光灯打在该按钮/字段上；无热点：整图轻压暗，靠文字说明
     ============================================================ */
  const walkState = {};   /* stepId -> 当前步序号 */
  const walkTimer = {};

  function walkGo(walk, k, silent) {
    const id = walk.dataset.walk;
    const step = stepById(id);
    if (!step) return;
    const n = step.ops.length;
    k = Math.max(0, Math.min(n - 1, k));
    walkState[id] = k;

    const h = (HOT[id] || [])[k] || null;
    const img = $('.walk__img', walk);
    const wantSrc = step.imgs[h && h.i != null ? h.i : 0].src;
    if (img.getAttribute('src') !== wantSrc) {
      img.style.opacity = '0';                       /* 跨图切换时先淡出再换源 */
      setTimeout(() => { img.src = wantSrc; img.style.opacity = '1'; }, 160);
    }

    const spot = $('.walk__spot', walk);
    const pin = $('.walk__pin', walk);
    const dim = $('.walk__dim', walk);
    if (h) {
      const pad = 0.008;                             /* 外扩一点，别把目标本身切掉 */
      const x = Math.max(0, h.x - pad), y = Math.max(0, h.y - pad);
      const w = Math.min(1 - x, h.w + pad * 2), hh = Math.min(1 - y, h.h + pad * 2);
      spot.style.left = (x * 100) + '%';
      spot.style.top = (y * 100) + '%';
      spot.style.width = (w * 100) + '%';
      spot.style.height = (hh * 100) + '%';
      pin.style.left = (x * 100) + '%';
      pin.style.top = (y * 100) + '%';
      walk.classList.add('has-spot');
      walk.classList.remove('is-plain');
    } else {
      walk.classList.remove('has-spot');
      walk.classList.add('is-plain');
    }
    dim.style.opacity = h ? '0' : '1';

    $('.walk__count', walk).textContent = `第 ${k + 1} / ${n} 步`;
    $('.walk__n', walk).textContent = `第 ${k + 1} 步`;
    $('.walk__text', walk).innerHTML = md(step.ops[k]);
    pin.textContent = k + 1;

    $$('.walk__dot', walk).forEach((d, i) => d.classList.toggle('is-on', i === k));
    const list = $('#ops-' + id);
    if (list) {
      $$('li', list).forEach((li, i) => li.classList.toggle('is-active', i === k));
      const cur = $$('li', list)[k];
      if (cur && !silent && list.offsetParent) {
        const r = cur.getBoundingClientRect();
        if (r.top < 90 || r.bottom > innerHeight - 40) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    $('[data-walk-prev]', walk).disabled = k === 0;
    $('[data-walk-next]', walk).disabled = k === n - 1;
    walk.setAttribute('aria-label', `${step.t} 分步演示：第 ${k + 1} 步，共 ${n} 步`);
  }

  function walkAuto(walk, on) {
    const id = walk.dataset.walk;
    clearInterval(walkTimer[id]);
    if (!on) { $('[data-walk-auto]', walk).textContent = '▶ 自动演示'; return; }
    $('[data-walk-auto]', walk).textContent = '■ 停止演示';
    walkGo(walk, 0);
    walkTimer[id] = setInterval(() => {
      const k = walkState[id], n = stepById(id).ops.length;
      if (k >= n - 1) {
        clearInterval(walkTimer[id]);
        $('[data-walk-auto]', walk).textContent = '▶ 自动演示';
        return;
      }
      walkGo(walk, k + 1);
    }, 1800);
  }

  function onWalkClick(e) {
    const walk = e.target.closest('[data-walk]');
    if (!walk) return;
    if (e.target.closest('[data-walk-prev]')) { walkAuto(walk, false); walkGo(walk, (walkState[walk.dataset.walk] || 0) - 1); return; }
    if (e.target.closest('[data-walk-next]')) { walkAuto(walk, false); walkGo(walk, (walkState[walk.dataset.walk] || 0) + 1); return; }
    if (e.target.closest('[data-walk-auto]')) {
      const on = $('[data-walk-auto]', walk).textContent.indexOf('自动') >= 0;
      walkAuto(walk, on); return;
    }
    const dot = e.target.closest('[data-walk-go]');
    if (dot) { walkAuto(walk, false); walkGo(walk, +dot.dataset.walkGo); return; }
    const stage = e.target.closest('.walk__stage');
    if (stage) {
      const step = stepById(walk.dataset.walk);
      const k = walkState[walk.dataset.walk] || 0;
      openLightbox($('.walk__img', walk).src, `${step.no}. ${step.t} · 第 ${k + 1} 步`);
    }
  }

  function initWalk() {
    $$('.walk').forEach((walk) => {
      walk.addEventListener('keydown', (e) => {
        const id = walk.dataset.walk;
        const k = walkState[id] || 0;
        const n = stepById(id).ops.length;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); walkAuto(walk, false); walkGo(walk, k + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); walkAuto(walk, false); walkGo(walk, k - 1); }
        else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); walkGo(walk, 0); }
        else if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); walkGo(walk, n - 1); }
      });
    });
  }

  function updateProgress() {
    const n = Object.keys(state.done).length;
    $('#pv-n').textContent = n + '/' + STEPS.length;
    $('#pv-bar').style.width = (n / STEPS.length * 100) + '%';
  }

  /* ---------- 侧栏 + 滚动高亮 ---------- */
  function renderNav() {
    $('#side-nav').innerHTML =
      `<div class="side__group"><div class="side__title">开始</div>
        <a class="side__link" href="#sec-overview"><span class="side__dot"></span>先认设备</a>
        <a class="side__link" href="#sec-flow"><span class="side__dot"></span>全流程地图</a>
      </div>
      <div class="side__group"><div class="side__title">角色实训 · ${STEPS.length} 步</div>
        ${ROLES.map(
          (r) => `<a class="side__link" data-role="${r.id}" href="#step-${STEPS.find((s) => s.role === r.id).id}">
            <span class="side__dot"></span>${roleSym(r.id)} ${esc(r.n)} · ${esc(r.loc)}</a>`
        ).join('')}
      </div>
      <div class="side__group"><div class="side__title">动手练</div>
        <a class="side__link" href="#sec-sim"><span class="side__dot"></span>扫码绑定模拟器</a>
        <a class="side__link" href="#sec-sort"><span class="side__dot"></span>流程排序挑战</a>
      </div>
      <div class="side__group"><div class="side__title">检验</div>
        <a class="side__link" href="#sec-quiz"><span class="side__dot"></span>结业考核（${QUIZ.length} 题）</a>
      </div>
      <div class="side__progress">
        <b id="pv-n">0/${STEPS.length}</b> <span>步骤已掌握</span>
        <div class="bar"><i id="pv-bar"></i></div>
        <div style="margin-top:10px;font-size:12.5px;color:var(--steel)">考核成绩：<b id="pv-q" style="font-size:13px">—</b></div>
      </div>`;
  }

  function initSpy() {
    const links = $$('#side-nav .side__link');
    const targets = [
      ['#sec-overview', 'sec-overview'], ['#sec-flow', 'sec-flow'], ['#sec-sim', 'sec-sim'],
      ['#sec-sort', 'sec-sort'], ['#sec-quiz', 'sec-quiz'], ['#sec-card', 'sec-card']
    ].map(([sel, id]) => [sel, document.getElementById(id)]).filter((x) => x[1]);
    const stepEls = STEPS.map((s) => document.getElementById('step-' + s.id));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          let href = '#' + el.id;
          if (el.classList.contains('step')) href = '#' + el.id;
          links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === href));
        });
      },
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 }
    );
    targets.forEach(([, el]) => io.observe(el));
    stepEls.forEach((el) => el && io.observe(el));

    const rb = $('#readbar');
    addEventListener('scroll', () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      rb.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
    }, { passive: true });
  }

  /* ============================================================
     A2. 动效：滚动揭示 + 首屏时间轴自动「走」一遍
     —— 只表达「流程在推进」，不做装饰性动画
     ============================================================ */
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initMotion() {
    /* 1) 滚动揭示：由 JS 打标记，JS 未执行时元素本就可见（安全兜底） */
    const groups = [
      ['.sec-head', 0], ['.cap', 70], ['.hw', 0], ['.lane', 90],
      ['.step', 0], ['.judge__item', 60], ['.quiz__item', 50],
      ['#cardwrap > .cardprint', 70], ['.sim__stage', 0], ['.tl', 90]
    ];
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); revealIO.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    groups.forEach(([sel, step]) => {
      $$(sel).forEach((el, i) => {
        if (el.closest('#lb')) return;
        el.classList.add('reveal');
        el.style.setProperty('--d', Math.min(i, 6) * step + 'ms');
        revealIO.observe(el);
      });
    });
    /* 兜底：任何情况 2.5s 后全部显形，绝不让人看到空白 */
    setTimeout(() => $$('.reveal').forEach((el) => el.classList.add('is-in')), 2500);

    /* 2) 首屏业务流程时间轴：进视口自动走一遍，可点「重播」 */
    const mock = $('#hero-mock'), anim = $('#flowanim');
    if (!mock || !anim) return;
    if (REDUCED) { mock.classList.add('is-done'); return; }

    let lastPlay = 0;
    const play = (force) => {
      if (!force && Date.now() - lastPlay < 4000) return;   /* 避免来回滚动反复重播 */
      lastPlay = Date.now();
      anim.classList.remove('is-playing');
      mock.classList.remove('is-done');
      void anim.offsetWidth;                                 /* 强制回流以重启动画 */
      anim.classList.add('is-playing');
      setTimeout(() => {                                     /* 五个节点落位后收口 */
        if (anim.classList.contains('is-playing')) mock.classList.add('is-done');
      }, 2900);
    };
    const replay = $('#mock-replay');
    if (replay) replay.addEventListener('click', () => play(true));

    const mockIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) play(false); });
    }, { threshold: 0.35 });
    mockIO.observe(mock);
    play(false);
  }

  /* ============================================================
     B. 灯箱（放大 + 滚轮缩放 + 拖动）
     ============================================================ */
  const lb = { scale: 1, x: 0, y: 0, drag: false, sx: 0, sy: 0 };
  function openLightbox(src, title) {
    const box = $('#lb');
    const img = $('#lb-img');
    img.src = src;
    $('#lb-title').textContent = title || '';
    img.onload = () => {
      const fit = Math.min((innerWidth - 80) / img.naturalWidth, (innerHeight - 150) / img.naturalHeight, 1);
      lb.scale = fit; lb.x = 0; lb.y = 0; applyLb();
      $('#lb-meta').textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px · ' + Math.round(fit * 100) + '%';
    };
    box.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
  }
  function applyLb() {
    $('#lb-img').style.transform = `translate(${lb.x}px,${lb.y}px) scale(${lb.scale})`;
  }
  function closeLightbox() {
    $('#lb').classList.remove('is-open');
    document.documentElement.style.overflow = '';
  }
  function zoomLb(f) {
    lb.scale = Math.max(0.15, Math.min(6, lb.scale * f)); applyLb();
    $('#lb-meta').textContent = $('#lb-meta').textContent.replace(/·\s*\d+%$/, '· ' + Math.round(lb.scale * 100) + '%');
  }
  function initLightbox() {
    $('#lb-close').addEventListener('click', closeLightbox);
    $('#lb-in').addEventListener('click', () => zoomLb(1.25));
    $('#lb-out').addEventListener('click', () => zoomLb(0.8));
    $('#lb-fit').addEventListener('click', () => { lb.x = 0; lb.y = 0; $('#lb-img').onload && 0; lb.scale = 1; applyLb(); });
    const stage = $('#lb-stage');
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2, cy = e.clientY - r.top - r.height / 2;
      const f = e.deltaY < 0 ? 1.12 : 0.89;
      const ns = Math.max(0.15, Math.min(6, lb.scale * f));
      lb.x = cx - (cx - lb.x) * (ns / lb.scale);
      lb.y = cy - (cy - lb.y) * (ns / lb.scale);
      lb.scale = ns; applyLb();
    }, { passive: false });
    stage.addEventListener('mousedown', (e) => { lb.drag = true; lb.sx = e.clientX - lb.x; lb.sy = e.clientY - lb.y; stage.classList.add('is-drag'); });
    addEventListener('mousemove', (e) => { if (!lb.drag) return; lb.x = e.clientX - lb.sx; lb.y = e.clientY - lb.sy; applyLb(); });
    addEventListener('mouseup', () => { lb.drag = false; stage.classList.remove('is-drag'); });
    $('#lb').addEventListener('click', (e) => { if (e.target.id === 'lb-stage') closeLightbox(); });
    addEventListener('keydown', (e) => {
      if (!$('#lb').classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === '+' || e.key === '=') zoomLb(1.25);
      if (e.key === '-') zoomLb(0.8);
    });
  }

  /* ============================================================
     C. 扫码绑定模拟器
     ============================================================ */
  const sim = { i: 0, scanned: {}, events: [], phase: 'idle', timer: null, playing: false, t0: 0 };

  function renderSim() {
    $('#sim-tools').innerHTML = SIM_TOOLS.map(
      (t) => `<button class="tool" data-tool="${t.id}" title="${esc(t.tip)}">
        <span class="tool__num">✓</span>
        <div class="tool__ico">${t.ico}</div>
        <div class="tool__t">${esc(t.t)}</div>
        <div class="tool__s">${esc(t.s)}</div></button>`
    ).join('');
    $('#sim-tools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]'); if (!b) return;
      simAct('tool', b.dataset.tool);
    });
    $('#sim-screen').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sbtn]'); if (!b || b.disabled) return;
      simAct('screen', b.dataset.sbtn);
    });
    $('#sim-reset').addEventListener('click', simReset);
    $('#sim-auto').addEventListener('click', simAuto);
    simReset();
  }

  function simReset() {
    clearInterval(sim.timer); sim.playing = false;
    sim.i = 0; sim.scanned = {}; sim.events = []; sim.phase = 'idle';
    $('#sim-auto').textContent = '▶ 自动演示';
    simPaint(); simTimeline(); simHint(); simToast('');
  }

  function simHint() {
    const cur = SIM_STEPS[sim.i];
    const el = $('#sim-hint');
    if (!cur) { el.innerHTML = `<span class="dot" style="background:var(--mint-deep)"></span><span><b>全流程完成。</b>11 个节点已全部写入文书时间轴 —— 这就是「扫码自动绑定 + 转床自动追踪」的闭环。</span>`; return; }
    el.innerHTML = `<span class="dot"></span><span>${esc(cur.hint)}</span>`;
  }

  function simAct(kind, key) {
    const cur = SIM_STEPS[sim.i];
    if (!cur) return;
    const ok = cur.kind === kind && (kind === 'tool' ? cur.tool === key : cur.btn === key);
    if (!ok) {
      const want = cur.kind === 'tool'
        ? '「' + (SIM_TOOLS.find((t) => t.id === cur.tool) || {}).t + '」'
        : '床旁屏上的「' + cur.btn + '」按钮';
      simToast(`顺序不对：现在应该操作 ${want}。${esc(cur.hint.replace(/^第\s*\d+\s*步[：:]\s*/, ''))}`, 'no');
      return;
    }
    if (kind === 'tool') sim.scanned[key] = true;
    /* 屏幕状态推进 */
    const id = cur.id;
    if (id === 'st5') sim.phase = 'linked';
    if (id === 'st6') sim.phase = 'recording';
    if (id === 'st7') sim.phase = 'active';
    if (id === 'st8') sim.phase = 'ended';
    if (id === 'st9') sim.phase = 'pacu';
    if (id === 'st10') sim.phase = 'out';
    if (id === 'st11') sim.phase = 'scored';
    sim.events.push({ k: cur.ev.k, v: cur.ev.v });
    sim.i++;
    simPaint(); simTimeline(); simHint();
    screenSweep(); badgeBump();
    if (sim.i >= SIM_STEPS.length) {
      simToast('✅ 全流程闭环：从建档签署到设备回收，11 个业务节点全部自动留痕。', 'ok');
      clearInterval(sim.timer); sim.playing = false; $('#sim-auto').textContent = '▶ 自动演示';
    } else {
      simToast('✓ ' + cur.label + '　—— ' + cur.ev.k + ' 已记录', 'ok');
    }
  }

  function simToast(msg, kind) {
    const t = $('#sim-toast');
    if (!msg) { t.className = 'toast'; t.innerHTML = ''; return; }
    t.className = 'toast is-on ' + (kind === 'ok' ? 'toast--ok' : 'toast--no');
    t.innerHTML = msg;
  }

  /* 相位切换时床旁屏扫过一道光：数据在流进文书 */
  function screenSweep() {
    const s = $('#sim-screen'); if (!s) return;
    s.classList.remove('is-sweep');
    void s.offsetWidth;
    s.classList.add('is-sweep');
    setTimeout(() => s.classList.remove('is-sweep'), 820);
  }
  function badgeBump() {
    const b = $('#sim-tl .tl__head .badge'); if (!b) return;
    b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump');
  }

  function simPaint() {
    /* 工具可用性 */
    const cur = SIM_STEPS[sim.i];
    $$('#sim-tools .tool').forEach((b) => {
      const id = b.dataset.tool;
      const isNext = cur && cur.kind === 'tool' && cur.tool === id;
      b.classList.toggle('is-ready', !!isNext);
      b.classList.toggle('is-scanned', !!sim.scanned[id]);
      b.disabled = false;
    });
    /* 床旁屏 */
    const p = sim.phase;
    const linked = p !== 'idle';
    const rec = ['recording', 'active', 'ended', 'pacu', 'out', 'scored'].indexOf(p) >= 0;
    const vitals = () => `
      <div class="vitals">
        <div class="vital vital--hr"><div class="vital__k">HR bpm</div><div class="vital__v">${p === 'ended' ? '78' : '72'}</div>
          <svg class="wave" viewBox="0 0 120 22" preserveAspectRatio="none"><path d="M0,11 L14,11 L18,3 L22,19 L26,11 L46,11 L50,3 L54,19 L58,11 L78,11 L82,3 L86,19 L90,11 L120,11" stroke="#7ee787"/></svg></div>
        <div class="vital vital--spo2"><div class="vital__k">SpO₂ %</div><div class="vital__v">99</div>
          <svg class="wave" viewBox="0 0 120 22" preserveAspectRatio="none"><path d="M0,16 C10,16 14,4 20,4 C26,4 30,16 40,16 C50,16 54,6 60,6 C66,6 70,16 80,16 C90,16 94,5 100,5 C106,5 110,16 120,16" stroke="#79c0ff"/></svg></div>
        <div class="vital vital--rr"><div class="vital__k">RR bpm</div><div class="vital__v">16</div></div>
        <div class="vital vital--nibp"><div class="vital__k">NIBP mmHg</div><div class="vital__v">118 / 72</div></div>
      </div>`;
    const sbtns = [
      { k: '记录单', on: p === 'linked' },
      { k: '术前确认', on: p === 'recording' },
      { k: '麻醉医生确认', on: p === 'active' },
      { k: '出复苏室提交', on: p === 'pacu' },
      { k: 'Aldrete 评分', on: p === 'out' }
    ];
    const statusPill =
      p === 'idle' ? '<span class="pillw">待绑定</span>' :
      p === 'linked' ? '<span class="pillw pillw--on">已绑定 · 检查间</span>' :
      p === 'recording' ? '<span class="pillw pillw--on">文书已打开</span>' :
      p === 'active' ? '<span class="pillw pillw--on">麻醉进行中</span>' :
      p === 'ended' ? '<span class="pillw">麻醉结束</span>' :
      p === 'pacu' ? '<span class="pillw pillw--on">复苏室</span>' :
      p === 'out' ? '<span class="pillw pillw--on">已出复苏室</span>' :
      '<span class="pillw pillw--on">评分 10 分 · 闭环</span>';
    const roomLabel = p === 'idle' ? 'ROOM-1' : (p === 'pacu' || p === 'out' || p === 'scored') ? 'PACU-1' : 'ROOM-1';

    $('#sim-screen').innerHTML = `
      <div class="screen__top">
        <span class="pillw">${roomLabel}</span>${statusPill}
        <span class="pillw">中继器 RELAY-3</span>
        <span class="pillw" style="margin-left:auto" id="sim-clock">${simClock()}</span>
      </div>
      ${linked ? `<div class="screen__id">${p === 'recording' ? '✓ 知情同意书已签署 · 医患双方签名齐备' :
        p === 'active' ? '● 麻醉用药已启动 · 术中监测中' :
        p === 'ended' ? '✓ 麻醉医生已确认 · 用药与波形核对完成' :
        p === 'pacu' ? '● 入复苏室 · 持续监护中' :
        p === 'out' ? '✓ 出复苏室时间已记录' :
        p === 'scored' ? '✓ 改良 Aldrete 评分 10 分 · 达标' :
        '患者 50068225760 · 吴佳丽 · 女 · 32 岁 · 胃镜'}</div>` : ''}
      ${linked ? vitals() : `
        <div class="screen__empty">
          <div>
            <div class="qrbox">${qrCells()}</div>
            <div class="screen__label">扫 码 转 入</div>
            <div style="font-size:11.5px;color:#7d8590;margin-top:8px">用信号中继器扫描本屏二维码</div>
          </div>
        </div>`}
      <div class="screen__bottom">
        ${sbtns.map((b) => `<button class="sbtn${b.on ? ' sbtn--hot' : ''}" data-sbtn="${esc(b.k)}" ${b.on ? '' : 'disabled'}>${esc(b.k)}</button>`).join('')}
      </div>`;
  }
  function simClock() {
    /* 以 17:36 为入室基准，每个已完成节点推进 1 分钟（演示用压缩时间轴，
       与首屏示意卡的时间口径一致） */
    const base = new Date(2026, 8, 3, 17, 36, 0);
    const t = new Date(base.getTime() + sim.events.length * 60000);
    const z = (n) => String(n).padStart(2, '0');
    return `2026-09-03 ${z(t.getHours())}:${z(t.getMinutes())}:${z(t.getSeconds())}`;
  }
  function qrCells() {
    /* 固定的伪二维码图案（确定性，避免每次重绘跳动） */
    const pat = [
      1,1,1,1,1,0,1,0,1,1,1, 1,0,0,0,1,0,0,1,1,0,1, 1,0,1,0,1,1,1,0,1,0,1,
      1,0,0,0,1,0,1,1,1,0,1, 1,1,1,1,1,0,1,0,1,1,1, 0,1,0,1,0,1,0,1,0,1,0,
      1,1,0,0,1,1,1,0,1,1,0, 1,0,1,1,0,0,1,1,0,0,1, 1,1,1,0,1,1,0,1,1,0,1,
      1,0,1,1,0,1,1,0,1,1,1, 1,1,0,1,1,0,1,1,0,1,1
    ];
    return pat.map((v) => `<i class="${v ? 'on' : ''}"></i>`).join('');
  }

  function simTimeline() {
    const n = sim.events.length;
    $('#sim-tl').innerHTML =
      `<div class="tl__head"><span>麻醉门诊业务流程 · 时间轴</span>
         <span class="badge badge--mono">${n}/${SIM_STEPS.length}</span></div>
       <div class="tl__body">${
         n === 0
           ? '<div class="tl__empty">尚未产生业务节点<br>按提示依次操作左侧设备与床旁屏</div>'
           : sim.events.map((e, i) => `<div class="tl__row${i === n - 1 ? ' is-new' : ''}">
               <span class="tl__tick">${i + 1}</span>
               <span><span class="tl__k">${esc(e.k)}</span><br><span class="tl__v">${esc(e.v)}</span></span>
             </div>`).join('')
       }</div>
       <div class="tl__foot"><span class="step__tags"><span class="badge badge--ok">✓ 自动留痕</span>
         <span class="badge">无需手工登记</span>
         <span class="badge badge--mono">${sim.i}/${SIM_STEPS.length} 步</span></span></div>`;
  }

  function simAuto() {
    if (sim.playing) { clearInterval(sim.timer); sim.playing = false; $('#sim-auto').textContent = '▶ 自动演示'; return; }
    if (sim.i >= SIM_STEPS.length) simReset();
    sim.playing = true; $('#sim-auto').textContent = '■ 暂停演示';
    sim.timer = setInterval(() => {
      const cur = SIM_STEPS[sim.i];
      if (!cur) { clearInterval(sim.timer); sim.playing = false; $('#sim-auto').textContent = '▶ 自动演示'; return; }
      simAct(cur.kind, cur.kind === 'tool' ? cur.tool : cur.btn);
    }, 1100);
  }

  /* ============================================================
     D. 流程排序挑战
     ============================================================ */
  let sortOrder = [];
  let sortBound = false;
  function renderSort() {
    /* Fisher–Yates 洗牌，并保证不是「基本有序」（至少 7 个不在原位） */
    let a;
    do {
      a = SORT_ITEMS.map((_, i) => i);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
    } while (a.filter((v, i) => v === i).length > 3);
    sortOrder = a;
    paintSort();
    $('#sort-result').innerHTML = '';
    if (sortBound) return;
    sortBound = true;
    $('#sort-check').addEventListener('click', checkSort);
    $('#sort-reset').addEventListener('click', renderSort);
    $('#sort-hint').addEventListener('click', () =>
      $('#sort-result').innerHTML = '<div class="callout callout--info">口诀：<b>建档签署 → 两码绑定 → 穿戴转床 → 术前确认 → 麻醉用药 → 医生确认 → 转运复苏 → 出室评分 → 设备回收</b>。共 10 步，注意「术前确认」必须在「知情同意书已签署」之后，设备回收是闭环终点。</div>'
    );
  }
  function paintSort() {
    $('#sortlist').innerHTML = sortOrder.map((orig, i) =>
      `<li class="sortitem" draggable="true" data-orig="${orig}">
        <span class="grip">⠿</span><span class="idx">${i + 1}</span>
        <span>${esc(SORT_ITEMS[orig])}</span></li>`
    ).join('');
    bindSort();
  }
  function bindSort() {
    let dragEl = null;
    $$('#sortlist .sortitem').forEach((li) => {
      li.addEventListener('dragstart', () => { dragEl = li; li.classList.add('is-dragging'); });
      li.addEventListener('dragend', () => { li.classList.remove('is-dragging'); $$('#sortlist .sortitem').forEach(x => x.classList.remove('is-over')); syncSort(); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('is-over'); });
      li.addEventListener('dragleave', () => li.classList.remove('is-over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault(); li.classList.remove('is-over');
        if (!dragEl || dragEl === li) return;
        const list = $('#sortlist');
        const items = $$('#sortlist .sortitem');
        const from = items.indexOf(dragEl), to = items.indexOf(li);
        if (from < to) list.insertBefore(dragEl, li.nextSibling); else list.insertBefore(dragEl, li);
        $$('#sortlist .sortitem').forEach((x, i) => { x.querySelector('.idx').textContent = i + 1; });
      });
    });
    /* 触屏与无鼠标场景：上下移动按钮 */
    $$('#sortlist .sortitem').forEach((li) => {
      const wrap = document.createElement('span');
      wrap.style.cssText = 'margin-left:auto;display:flex;gap:4px;flex:none';
      const mk = (t, d) => {
        const b = document.createElement('button');
        b.className = 'btn btn--sm btn--ghost'; b.textContent = t; b.style.padding = '3px 8px';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const list = $('#sortlist');
          if (d < 0 && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
          if (d > 0 && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
          $$('#sortlist .sortitem').forEach((x, i) => { x.querySelector('.idx').textContent = i + 1; });
          syncSort();
        });
        return b;
      };
      wrap.appendChild(mk('↑', -1)); wrap.appendChild(mk('↓', 1));
      li.appendChild(wrap);
    });
  }
  function syncSort() {
    sortOrder = $$('#sortlist .sortitem').map((li) => +li.dataset.orig);
  }
  function checkSort() {
    syncSort();
    let right = 0;
    $$('#sortlist .sortitem').forEach((li, i) => {
      const orig = +li.dataset.orig;
      const ok = orig === i;
      li.classList.toggle('ok', ok); li.classList.toggle('bad', !ok);
      if (ok) right++;
      const old = li.querySelector('.fix'); if (old) old.remove();
      if (!ok) {
        const s = document.createElement('span');
        s.className = 'fix'; s.textContent = '应为第 ' + (orig + 1) + ' 步';
        li.appendChild(s);
      }
    });
    const pct = Math.round(right / SORT_ITEMS.length * 100);
    $('#sort-result').innerHTML =
      `<div class="callout ${pct === 100 ? 'callout--tip' : 'callout--warn'}">
        <b>排序结果：${right} / ${SORT_ITEMS.length} 步正确（${pct}%）。</b>
        ${pct === 100 ? '全对 —— 流程顺序已经掌握。' : '绿色为正确位置，红色条目右侧标注了它应有的步号，调整后再次提交。'}
      </div>`;
  }

  /* ============================================================
     F. 考核
     （原 E. 判断题模块已删：考点并入 QUIZ 第 11–14 题）
     ============================================================ */
  function renderQuiz() {
    $('#quiz').innerHTML = QUIZ.map(
      (q, i) => `<div class="quiz__item" data-q="${i}">
        <div class="quiz__q"><span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span>${esc(q.q)}${q.a.length > 1 ? ' <span class="badge badge--warn">多选</span>' : ''}</span></div>
        <div class="quiz__opts">${q.o.map(
          (o, k) => `<label class="opt"><input type="${q.a.length > 1 ? 'checkbox' : 'radio'}" name="q${i}" value="${k}">
            <span>${esc(o)}</span></label>`
        ).join('')}</div>
        <div class="quiz__exp"><b>解析：</b>${esc(q.e)}</div>
      </div>`
    ).join('');
    $('#quiz-submit').addEventListener('click', submitQuiz);
    $('#quiz-print').addEventListener('click', () => {
      document.body.setAttribute('data-printmode', 'quiz');
      print();
      setTimeout(() => document.body.removeAttribute('data-printmode'), 600);
    });
  }
  function submitQuiz() {
    let score = 0, wrong = [];
    QUIZ.forEach((q, i) => {
      const item = $(`.quiz__item[data-q="${i}"]`);
      const picked = $$('input', item).filter((x) => x.checked).map((x) => +x.value).sort();
      const ans = q.a.slice().sort();
      const ok = picked.length === ans.length && picked.every((v, k) => v === ans[k]);
      $$('.opt', item).forEach((o) => {
        const v = +$('input', o).value;
        o.classList.toggle('is-right', ans.indexOf(v) >= 0);
        o.classList.toggle('is-wrong', picked.indexOf(v) >= 0 && ans.indexOf(v) < 0);
      });
      $('.quiz__exp', item).classList.add('is-on');
      if (ok) score++; else wrong.push({ n: i + 1, t: q.q });
      $$('input', item).forEach((x) => { x.disabled = true; });
    });
    const pct = Math.round(score / QUIZ.length * 100);
    const level = pct >= 90 ? '优秀 · 可独立上岗' : pct >= 80 ? '合格 · 建议复训易错步骤' : pct >= 60 ? '基本合格 · 必须复训' : '不合格 · 需重新培训并复考';
    state.quizScore = pct; save(); updateProgress();
    $('#pv-q').textContent = pct + ' 分';
    $('#score').innerHTML = `<div class="score">
      <b>${pct}</b>
      <span class="sub">分 &nbsp;·&nbsp; 答对 ${score}/${QUIZ.length} 题<br><b style="font-size:15px">${esc(level)}</b></span>
      <span class="spacer" style="flex:1"></span>
      <span class="badge badge--mono">${new Date().toLocaleString('zh-CN')}</span></div>
      ${wrong.length ? `<div class="callout callout--warn"><b>需重看的内容：</b>${
        wrong.map((w) => `第 ${w.n} 题（${esc(w.t.slice(0, 26))}…）`).join('、')}</div>` : ''}`;
    $('#score').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ============================================================
     G. 速查卡
     ============================================================ */
  function renderCard() {
    $('#cardwrap').innerHTML = ROLES.map((r) => {
      const list = STEPS.filter((s) => s.role === r.id);
      return `<div class="cardprint">
        <h4><span class="cardprint__role r${r.id}">${esc(r.n)}</span>${esc(r.loc)} — ${esc(r.d)}</h4>
        <ol>${list.map((s) => `<li><b>${esc(s.t)}</b>：${esc(s.ops[0].replace(/\*\*/g, ''))}</li>`).join('')}</ol>
        <div class="callout callout--warn" style="margin-top:10px"><b>本环节最易错：</b>${esc(r.keyWarn || list[0].warn)}</div>
      </div>`;
    }).join('') +
      `<div class="cardprint">
        <h4><span class="cardprint__role r2">口诀</span>全流程一句话</h4>
        <p style="margin:0;font-size:15px">建档签署 → 两码绑定 → 穿戴转床 → 术前确认 → 麻醉用药 → 医生确认 → 转运复苏 → 出室评分 → <b>设备消毒回收（闭环终点）</b></p>
      </div>`;
    $('#card-print').addEventListener('click', () => print());
  }

  /* ============================================================
     H. 讲师模式
     ============================================================ */
  function setScale(s) {
    state.scale = s;
    document.documentElement.setAttribute('data-scale', s === 'md' ? '' : s);
    if (s === 'md') document.documentElement.removeAttribute('data-scale');
    $$('[data-scale-btn]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.scaleBtn === s ? 'true' : 'false'));
    save();
  }
  function initPresenter() {
    const p = $('#presenter');
    const start = () => {
      state.presenter = true; document.documentElement.setAttribute('data-present', '1');
      p.classList.add('is-on'); $('#btn-present').setAttribute('aria-pressed', 'true');
      sim.t0 = sim.t0 || Date.now();
      updatePresenterLabel();
    };
    const stop = () => {
      state.presenter = false; document.documentElement.removeAttribute('data-present');
      p.classList.remove('is-on'); $('#btn-present').setAttribute('aria-pressed', 'false');
      clearInterval(p._t);
    };
    $('#btn-present').addEventListener('click', () => (state.presenter ? stop() : start()));
    $('#p-exit').addEventListener('click', stop);
    $('#p-prev').addEventListener('click', () => jumpSec(-1));
    $('#p-next').addEventListener('click', () => jumpSec(1));
    $('#p-menu').addEventListener('click', () => $('#side').classList.toggle('is-open'));

    addEventListener('scroll', updatePresenterLabel, { passive: true });
    function updatePresenterLabel() {
      if (!state.presenter) return;
      const secs = $$('section[data-sec]');
      let cur = secs[0];
      secs.forEach((s) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) cur = s; });
      $('#p-sec').textContent = (cur.dataset.label || cur.id) + ' · ' +
        (secs.indexOf(cur) + 1) + '/' + secs.length;
    }
    setInterval(() => {
      if (!state.presenter || !sim.t0) return;
      const s = Math.floor((Date.now() - sim.t0) / 1000);
      $('#p-time').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 1000);
  }
  function jumpSec(dir) {
    const secs = $$('section[data-sec]');
    const y = scrollY + 10;
    let i = 0;
    secs.forEach((s, k) => { if (s.offsetTop <= y + 40) i = k; });
    const next = Math.max(0, Math.min(secs.length - 1, i + dir));
    secs[next].scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (state.presenter) setTimeout(updateLabelOnce, 400);
  }
  function updateLabelOnce() {
    const secs = $$('section[data-sec]');
    let cur = secs[0];
    secs.forEach((s) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) cur = s; });
    $('#p-sec').textContent = (cur.dataset.label || cur.id) + ' · ' + (secs.indexOf(cur) + 1) + '/' + secs.length;
  }

  function initKeys() {
    addEventListener('keydown', (e) => {
      if ($('#lb').classList.contains('is-open')) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      /* 焦点在分步演示里时，方向键归它自己用（一步步走图片），不翻章节 */
      if (e.target.closest && e.target.closest('.walk')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { jumpSec(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { jumpSec(-1); }
      else if (e.key === ' ') { e.preventDefault(); jumpSec(1); }
      else if (e.key === 'f' || e.key === 'F') { toggleFull(); }
      else if (e.key === 'p' || e.key === 'P') { $('#btn-present').click(); }
      else if (e.key === 'Escape') { $('#side').classList.remove('is-open'); }
    });
  }
  function toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    else document.exitFullscreen && document.exitFullscreen();
  }

  function initChrome() {
    $('#btn-menu').addEventListener('click', () => $('#side').classList.toggle('is-open'));
    $('#btn-full').addEventListener('click', toggleFull);
    $('#btn-print').addEventListener('click', () => print());
    $$('[data-scale-btn]').forEach((b) =>
      b.addEventListener('click', () => setScale(b.dataset.scaleBtn))
    );
    setScale(state.scale || 'md');
  }

  /* ============================================================
     启动
     ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    /* 逐块渲染：任何一块出错都不影响其余模块（现场培训不能整页白屏） */
    const boot = [
      ['hero', renderHero], ['hardware', renderHardware], ['flow', renderFlow],
      ['nav', renderNav], ['roles', renderRoles], ['steps', renderSteps], ['walk', initWalk],
      ['sim', renderSim],
      ['sort', renderSort], ['quiz', renderQuiz], ['card', renderCard],
      ['lightbox', initLightbox], ['spy', initSpy], ['presenter', initPresenter],
      ['keys', initKeys], ['chrome', initChrome],
      ['motion', initMotion]   /* 必须最后跑：前面的模块都渲染完了再挂动效 */
    ];
    const failed = [];
    boot.forEach(function (pair) {
      try { pair[1](); } catch (err) { failed.push(pair[0]); console.error('[培训页面] 模块渲染失败：' + pair[0], err); }
    });
    try { updateProgress(); } catch (e) {}
    const q = $('#pv-q'); if (q && state.quizScore != null) q.textContent = state.quizScore + ' 分';
    if (failed.length) console.warn('[培训页面] 失败模块：' + failed.join(', '));
  });
})();
