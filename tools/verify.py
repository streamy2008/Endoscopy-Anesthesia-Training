#!/usr/bin/env python3
"""
交付前自查：用 Playwright 以 file:// 方式打开两种产物（多文件版 / 单文件版），
逐项断言各交互模块渲染数量与关键行为，输出 JSON 结果。

用法：
  PY=/Users/sean/.agents/skills/cad-viewer/scripts/viewer/.venv/bin/python
  $PY tools/verify.py
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [
    ("多文件版", ROOT / "index.html"),
    ("单文件版", ROOT / "京东方内镜培训-单文件版.html"),
]

CHECKS = """
(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const errs = window.__errs || [];
  return {
    errors: errs,
    caps: q('#caps .cap'),
    devices: q('#hw-list .hw__item'),
    pins: q('#hw-stage .pin'),
    flowGroups: q('#tlflow-steps .tlflow__group'),
    flowChips: q('#tlflow-steps .stepchip'),
    chips: q('.stepchip'),
    roletabs: q('.roletab'),
    steps: q('.step'),
    opsCollapsed: q('.ops.is-collapsed'),
    walks: q('.walk'),
    walkImgs: q('.walk__img'),
    walkDots: q('.walk__dot'),
    walkSpots: q('.walk.has-spot'),
    timelineRows: q('#sim-tl .tl__row'),
    simTools: q('#sim-tools .tool'),
    simBtns: q('#sim-screen .sbtn'),
    sortItems: q('#sortlist .sortitem'),
    quiz: q('.quiz__item'),
    cards: q('.cardprint'),
    navLinks: q('#side-nav .side__link'),
    brokenImgs: [...document.images].filter(i => i.getAttribute('src') && i.complete && i.naturalWidth === 0).length,
    imgs: [...document.images].length,
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth
  };
})()
"""


def run(page, path, label):
    page.goto(path.as_uri())
    page.wait_for_load_state("load")
    page.wait_for_timeout(1200)
    res = page.evaluate(CHECKS)
    res["label"] = label
    res["file"] = path.name

    # 交互行为：模拟器按序走完 11 步
    page.evaluate("document.documentElement.style.scrollBehavior='auto'")

    # 动效：首屏业务流程时间轴必须自己走完并停在「全部可见」的终态
    page.wait_for_timeout(3200)
    res["heroRows"] = page.evaluate(
        "[...document.querySelectorAll('.flowanim .tl__row')]"
        ".filter(r => getComputedStyle(r).opacity === '1').length")
    res["heroDone"] = page.evaluate(
        "document.getElementById('hero-mock').classList.contains('is-done')")

    seq = [
        ('tool', 'barcode'), ('tool', 'relay'), ('tool', 'pda'), ('tool', 'wear'),
        ('tool', 'screen-room'), ('screen', '记录单'), ('screen', '术前确认'),
        ('screen', '麻醉医生确认'), ('tool', 'screen-pacu'), ('screen', '出复苏室提交'),
        ('screen', 'Aldrete 评分'),
    ]
    for kind, key in seq:
        sel = f'[data-tool="{key}"]' if kind == 'tool' else f'[data-sbtn="{key}"]'
        page.eval_on_selector(sel, "e => e.click()")
        page.wait_for_timeout(40)
    res["newRowMarked"] = page.evaluate(
        "document.querySelectorAll('#sim-tl .tl__row.is-new').length === 1")
    res["simDone"] = page.evaluate(
        "document.querySelectorAll('#sim-tl .tl__row').length")
    res["simToast"] = page.evaluate(
        "document.getElementById('sim-toast').textContent.slice(0, 24)")

    # 排序挑战：一键排成正确顺序后提交，应得 10/10
    page.evaluate("""() => {
      const list = document.getElementById('sortlist');
      const items = [...list.querySelectorAll('.sortitem')]
        .sort((a,b) => (+a.dataset.orig) - (+b.dataset.orig));
      items.forEach(i => list.appendChild(i));
      document.getElementById('sort-check').click();
    }""")
    res["sortResult"] = page.evaluate(
        "document.querySelector('#sortlist .sortitem').classList.contains('ok') && "
        "document.querySelectorAll('#sortlist .sortitem.bad').length === 0")

    # 分步图片演示：点「下一步」必须推进计数、把聚光灯移到新坐标；点操作项必须反向联动
    res["walkAdvance"] = page.evaluate("""() => {
      const w = document.getElementById('walk-S01');
      const before = w.querySelector('.walk__spot').style.left;
      const c0 = w.querySelector('.walk__count').textContent;
      w.querySelector('[data-walk-next]').click();
      const c1 = w.querySelector('.walk__count').textContent;
      const after = w.querySelector('.walk__spot').style.left;
      const pin = w.querySelector('.walk__pin').textContent;
      return { ok: c0 !== c1 && before !== after && pin === '2', c0: c0, c1: c1 };
    }""")["ok"]
    res["walkSyncFromList"] = page.evaluate("""() => {
      document.querySelector('#ops-S01 li[data-op="3"]').click();
      const w = document.getElementById('walk-S01');
      return w.querySelector('.walk__count').textContent.indexOf('4 /') >= 0 &&
             document.querySelector('#ops-S01 li.is-active').dataset.op === '3';
    }""")
    res["walkNoSpot"] = page.evaluate("""() => {
      const w = document.getElementById('walk-S10');
      w.querySelector('[data-walk-go="3"]').click();
      return !w.classList.contains('has-spot') && w.classList.contains('is-plain');
    }""")
    res["opsFold"] = page.evaluate("""() => {
      const list = document.getElementById('ops-S01');
      const vis = n => [...n.querySelectorAll('li')].filter(li => li.offsetParent !== null).length;
      const collapsed = list.classList.contains('is-collapsed') && vis(list) === 1;
      list.closest('.step__ops').querySelector('[data-ops-toggle]').click();
      const expanded = !list.classList.contains('is-collapsed') && vis(list) === 5;
      list.closest('.step__ops').querySelector('[data-ops-toggle]').click();
      return collapsed && expanded;
    }""")
    res["walkKeys"] = page.evaluate("""() => {
      const w = document.getElementById('walk-S02');
      w.focus();
      w.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      return w.querySelector('.walk__count').textContent.indexOf('2 /') >= 0;
    }""")

    # 灯箱：打开 → 放大 → 关闭
    page.eval_on_selector('.walk__stage', 'e => e.click()')
    page.wait_for_timeout(300)
    opened = page.evaluate("document.getElementById('lb').classList.contains('is-open')")
    page.eval_on_selector('#lb-in', 'e => e.click()')
    scaled = page.evaluate("document.getElementById('lb-img').style.transform")
    page.eval_on_selector('#lb-close', 'e => e.click()')
    closed = page.evaluate("!document.getElementById('lb').classList.contains('is-open')")
    res["lightbox"] = bool(opened and 'scale' in scaled and closed)

    # 动效：巡演时泳道进度条必须真的填充
    page.evaluate("""() => {
      document.getElementById('sim-reset').click();
      document.getElementById('flow-play').click();
    }""")
    page.wait_for_timeout(2400)
    res["laneFill"] = page.evaluate("""() => {
      const bar = document.querySelector('#tlflow-bar > i');
      const done = document.querySelectorAll('#tlflow-steps .stepchip.is-done').length;
      return parseFloat(bar.style.width) > 0 && done > 0;
    }""")
    page.evaluate("document.getElementById('flow-play').click()")
    res["laneReset"] = page.evaluate(
        "parseFloat(document.querySelector('#tlflow-bar > i').style.width || '0') === 0 && "
        "document.querySelectorAll('#tlflow-steps .stepchip.is-done').length === 0")

    # 讲师模式开关
    page.eval_on_selector('#btn-present', 'e => e.click()')
    res["presenter"] = page.evaluate(
        "document.documentElement.getAttribute('data-present') === '1' && "
        "getComputedStyle(document.getElementById('side')).display === 'none'")

    # 考核：全选正确 → 100 分
    page.evaluate("""() => {
      QUIZ.forEach((q, i) => q.a.forEach(k => {
        const el = document.querySelector(`.quiz__item[data-q="${i}"] input[value="${k}"]`);
        if (el) el.checked = true;
      }));
      document.getElementById('quiz-submit').click();
    }""")
    res["quizScore"] = page.evaluate(
        "document.getElementById('score').textContent.trim().split('\\n')[0]")
    return res


def main():
    out = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.add_init_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));")
        for label, path in TARGETS:
            if not path.exists():
                out.append({"label": label, "file": path.name, "error": "文件不存在"})
                continue
            out.append(run(page, path, label))
        browser.close()

    ok = True
    for r in out:
        problems = []
        if r.get("error"):
            problems.append(r["error"])
        else:
            if r["errors"]:
                problems.append("JS 错误：" + "; ".join(r["errors"]))
            if r["brokenImgs"]:
                problems.append(f"图片加载失败 {r['brokenImgs']}/{r['imgs']}")
            if r["docW"] > r["vw"] + 1:
                problems.append(f"横向溢出 {r['docW']} > {r['vw']}")
            for k, want in [("devices", 6), ("pins", 6), ("flowGroups", 4), ("flowChips", 14),
                            ("chips", 14), ("steps", 14), ("walks", 14), ("walkImgs", 14),
                            ("walkDots", 61), ("simTools", 7), ("opsCollapsed", 14),
                            ("sortItems", 10), ("quiz", 14), ("cards", 5),
                            ("navLinks", 9)]:
                if r.get(k) != want:
                    problems.append(f"{k}={r.get(k)}（应为 {want}）")
            if r["simDone"] != 11:
                problems.append(f"模拟器走完节点数 {r['simDone']}（应为 11）")
            if not r["sortResult"]:
                problems.append("排序挑战排成正确顺序后仍报错")
            if not r["walkAdvance"]:
                problems.append("分步演示「下一步」未推进计数/未移动聚光灯")
            if not r["walkSyncFromList"]:
                problems.append("点右侧操作项未反向联动图片演示")
            if not r["walkNoSpot"]:
                problems.append("无热点步骤未走整图降级（is-plain）")
            if not r["opsFold"]:
                problems.append("操作项折叠/展开异常")
            if not r["walkKeys"]:
                problems.append("分步演示方向键未生效")
            if not r["lightbox"]:
                problems.append("灯箱打开/缩放/关闭异常")
            if not r["presenter"]:
                problems.append("讲师模式开关异常")
            if r["quizScore"] != "100":
                problems.append(f"全对考核得分 {r['quizScore']}（应为 100）")
            if r["heroRows"] != 5:
                problems.append(f"首屏时间轴终态可见行数 {r['heroRows']}（应为 5）")
            if not r["heroDone"]:
                problems.append("首屏时间轴未走完（缺 is-done 收口态）")
            if not r["newRowMarked"]:
                problems.append("模拟器仅最后一行应标 is-new（进场动画范围异常）")
            if not r["laneFill"]:
                problems.append("巡演时泳道进度未填充")
            if not r["laneReset"]:
                problems.append("停止巡演后泳道进度未归零")
        r["problems"] = problems
        if problems:
            ok = False
        print(f"[{'✅' if not problems else '❌'}] {r['label']} · {r['file']}")
        for p_ in problems:
            print("    - " + p_)
        else:
            print(f"    分步演示 {r.get('walks')} 个 / {r.get('walkDots')} 步 · 时间轴 {r.get('flowChips')} 步 · "
                  f"模拟器 {r.get('simDone')}/11 · 考核 {r.get('quizScore')} 分 · "
                  f"首屏动效 {r.get('heroRows')}/5 · 泳道进度 {r.get('laneFill')}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
