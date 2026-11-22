#!/usr/bin/env python3
"""용돈 챌린지 — 자동 테스트 (Python + Playwright)

실행:
    python3 tests/test_app.py

로컬 정적 서버를 스스로 띄워 앱을 열고, 기존 기능(14개 할 일·용돈 정산·부모님 PIN·동기화
페이로드)과 새 기능(상단 날짜, "오늘 꼭 해야 할 일" 추가/체크/삭제/저장, 고양이 이미지)을
확인합니다. 실패가 있으면 0이 아닌 코드로 끝납니다.
"""
import json
import base64
import os
import re
import threading
import unittest
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DOW = ["월", "화", "수", "목", "금", "토", "일"]

SEED_TASKS = [
    ("t1", "아침 양치하기", "🪥", [0, 1, 2, 3, 4, 5, 6], False),
    ("t2", "벗은 옷·양말 빨래통에 넣기", "🧺", [0, 1, 2, 3, 4, 5, 6], True),
    ("t3", "단꿈e 수학 강의 보기", "🧮", [0, 1, 2, 3, 4, 5, 6], False),
    ("t4", "감사하는 일 적기", "📔", [0, 1, 2, 3, 4, 5, 6], False),
    ("t5", "식사 후 그릇 싱크대에 치우기", "🍽️", [0, 1, 2, 3, 4, 5, 6], False),
    ("t6", "간식·과자 먹은 후 쓰레기 버리기", "🗑️", [0, 1, 2, 3, 4, 5, 6], False),
    ("t7", "공부 후 책상 위 필기구·책 정리하기", "🗂️", [0, 1, 2, 3, 4, 5, 6], False),
    ("t8", "취침 전 휴대폰·태블릿 충전기에 꽂아두기", "🔌", [0, 1, 2, 3, 4, 5, 6], False),
    ("t9", "미래엔 수학 학원 숙제", "✏️", [0, 2, 3], False),
    ("t10", "플레이팩토 문제집 끝내기", "🧩", [1, 4, 5], False),
    ("t11", "어휘력 문제집 풀기", "📚", [4, 5, 6], False),
    ("t12", "디딤돌 문제집 풀기", "📘", [4, 5, 6], False),
    ("t13", "수영장 가방 수건 빨래통에 넣기", "🩳", [0, 1, 3, 4], False),
    ("t14", "일기 쓰기", "📝", [6], False),
]

# 마이그레이션으로 기존 폰(t1~t14)에 덧붙는 기본 할 일
BACKFILL_TASK = {"id": "t15", "title": "미래엔 수학 문제집 풀기", "emoji": "📐",
                 "days": [0, 1, 2, 3, 4, 5, 6], "amount": 100, "order": 15}


def legacy_state():
    tasks = [
        {"id": i, "title": t, "emoji": e, "days": d, "amount": 100,
         "active": True, "repeat": r, "order": n + 1}
        for n, (i, t, e, d, r) in enumerate(SEED_TASKS)
    ]
    return {
        "v": 1,
        "clock": 10,
        "tasks": tasks,
        "tasksTs": 0,
        "completions": {
            "2026-11-09": {
                "t1": {"c": 5, "at": "2026-11-09T09:00:00.000Z", "amount": 100,
                       "title": "아침 양치하기", "emoji": "🪥", "n": 1},
                "t2": {"c": 6, "at": "2026-11-09T09:05:00.000Z", "amount": 100,
                       "title": "벗은 옷·양말 빨래통에 넣기", "emoji": "🧺", "n": 2},
            }
        },
        "settlements": [],
        "settings": {"name": "우리 딸", "sound": True},
        "settingsTs": 0,
        "pin": "0000",
        "pinTs": 0,
        "sync": {"url": "", "code": "", "enabled": False, "lastSync": None},
        "updatedAt": 0,
        "deviceId": "test-device",
    }


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class AppTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = partial(QuietHandler, directory=str(ROOT))
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:%d/" % cls.port
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(args=["--no-sandbox"])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.httpd.shutdown()

    # ---------- helpers ----------
    def new_page(self, width=390, seed=None, route_handler=None):
        ctx = self.browser.new_context(viewport={"width": width, "height": 844},
                                       device_scale_factor=2)
        page = ctx.new_page()
        self.errors = []
        page.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: self.errors.append(m.type + ": " + m.text)
                if m.type == "error" else None)
        if seed is not None:
            page.add_init_script(
                "try{localStorage.setItem('allowance-challenge-v1', %s);}catch(e){}"
                % json.dumps(json.dumps(seed, ensure_ascii=False)))
        if route_handler:
            page.route("https://example-rtdb.firebaseio.com/**", route_handler)
        page.goto(self.base, wait_until="networkidle")
        page.wait_for_selector("#taskList .task-card", timeout=8000)
        return ctx, page

    def state(self, page):
        return page.evaluate(
            "() => JSON.parse(localStorage.getItem('allowance-challenge-v1') || 'null')")

    def seed_store(self, page, seed):
        """새로고침해도 다시 심지 않도록 localStorage에 직접 넣고 한 번만 다시 열어요."""
        page.evaluate("s => localStorage.setItem('allowance-challenge-v1', s)",
                      json.dumps(seed, ensure_ascii=False))
        page.reload(wait_until="networkidle")
        page.wait_for_selector("#taskList .task-card", timeout=8000)

    def add_mustdo(self, page, text):
        page.fill("#mustDoInput", text)
        page.click("#mustDoAdd")
        page.wait_for_timeout(120)

    # ---------- 기존 기능 회귀 ----------
    def test_legacy_state_preserved(self):
        ctx, page = self.new_page(seed=legacy_state())
        try:
            st = self.state(page)
            self.assertEqual(len(st["tasks"]), 15, "기존 14개 + 새로 추가된 t15")
            titles = [t["title"] for t in st["tasks"]]
            self.assertIn("벗은 옷·양말 빨래통에 넣기", titles)
            self.assertIn("일기 쓰기", titles)
            self.assertEqual([t["id"] for t in st["tasks"]][:14],
                             [i for i, *_ in SEED_TASKS], "기존 t1~t14 순서 그대로")
            self.assertEqual(st["pin"], "0000", "부모님 PIN 기본값 유지")
            self.assertEqual(st["completions"]["2026-11-09"]["t2"]["n"], 2,
                             "기존 체크 기록 보존")
            self.assertEqual(st.get("mustdos") or {}, {}, "새 키는 빈 상태로 시작")
            self.assertEqual(page.locator("#taskList .task-card[data-task]").count(), 12,
                             "일요일 할 일 11개 + t15")
            self.assertEqual(page.locator('#taskList [data-task="t15"]').count(), 1,
                             "기존 폰에도 t15가 자동으로 보여야 함")
        finally:
            ctx.close()

    def test_money_check_flow(self):
        ctx, page = self.new_page(seed=legacy_state())
        try:
            before = page.inner_text("#weekAmount")
            self.assertEqual(before.replace(",", ""), "0")
            page.locator("#taskList .task-card").first.click()
            page.wait_for_timeout(900)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "100")
            # 수시로 하는 일: 누를 때마다 1회씩
            repeat = page.locator('#taskList .task-card[data-task="t2"]')
            repeat.click()
            page.wait_for_timeout(400)
            repeat.click()
            page.wait_for_timeout(900)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "300")
            st = self.state(page)
            from datetime import date
            today = date.today().isoformat()
            self.assertEqual(st["completions"][today]["t2"]["n"], 2)
        finally:
            ctx.close()

    def test_parent_mode_pin(self):
        ctx, page = self.new_page(seed=legacy_state())
        try:
            page.click("#parentBtn")
            page.wait_for_selector("#pinGate:not(.hidden)")
            for k in "0000":
                page.click('#keypad [data-key="%s"]' % k)
            page.wait_for_selector("#parentView:not(.hidden)", timeout=4000)
            self.assertEqual(page.locator("#tabTasks .prow").count(), 15)
            self.assertIn("우리 딸", page.inner_text("#parentSub"))
        finally:
            ctx.close()

    def test_service_worker_lists_new_assets(self):
        sw = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn("allowance-v1.2.1", sw)
        app_js = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("const APP_VERSION = '1.2.1'", app_js)
        for name in ("cat-hero.webp", "cat-peek.webp", "cat-sleep.webp"):
            self.assertIn("./assets/" + name, sw)
            self.assertTrue((ROOT / "assets" / name).is_file(), name + " 파일 존재")

    # ---------- 새 기능 ----------
    def test_today_date_header(self):
        ctx, page = self.new_page()
        try:
            now = datetime.now()
            self.assertEqual(page.inner_text("#todayDate"),
                             "%d년 %d월 %d일" % (now.year, now.month, now.day))
            self.assertEqual(page.inner_text("#todayDow"), "(%s)" % DOW[now.weekday()])
            self.assertIn(DOW[now.weekday()], page.inner_text("#dateSub"))
            self.assertIn("오늘 꼭 해야 할 일", page.inner_text("#mustDoCard"))
            self.assertTrue(page.is_visible("#mustDoInput"))
        finally:
            ctx.close()

    def test_cat_images_loaded(self):
        ctx, page = self.new_page()
        try:
            imgs = page.evaluate("""() => [...document.querySelectorAll('img')]
                .map(i => ({src: i.getAttribute('src'), nw: i.naturalWidth,
                            w: Math.round(i.getBoundingClientRect().width)}))""")
            by = {i["src"]: i for i in imgs}
            for name in ("assets/cat-hero.webp", "assets/cat-peek.webp", "assets/cat-sleep.webp"):
                self.assertIn(name, by)
                self.assertGreater(by[name]["nw"], 0, name + " 로드 실패")
                self.assertGreater(by[name]["w"], 0)
        finally:
            ctx.close()

    def test_mustdo_add_check_persist_delete(self):
        ctx, page = self.new_page()
        try:
            self.assertIn("아직 적은 일이 없어요", page.inner_text("#mustDoList"))
            self.add_mustdo(page, "수학 숙제 내일 것까지")
            self.add_mustdo(page, "체육복 챙기기")
            rows = page.locator("#mustDoList .mustdo-item")
            self.assertEqual(rows.count(), 2)
            self.assertIn("2개 중 0개", page.inner_text("#mustDoSub"))

            from datetime import date
            today = date.today().isoformat()
            st = self.state(page)
            self.assertEqual([m["text"] for m in st["mustdos"][today]],
                             ["수학 숙제 내일 것까지", "체육복 챙기기"])

            # 체크
            page.locator('#mustDoList [data-must-toggle]').first.click()
            page.wait_for_timeout(150)
            self.assertTrue(page.locator("#mustDoList .mustdo-item").first
                            .evaluate("el => el.classList.contains('done')"))
            self.assertIn("2개 중 1개", page.inner_text("#mustDoSub"))
            page.wait_for_timeout(900)  # 금액 카운트업 애니메이션 종료 대기
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "100",
                             "오늘 꼭 할 일을 체크하면 용돈 100원이 쌓여야 함")

            # 새로고침 후 유지
            page.reload(wait_until="networkidle")
            page.wait_for_selector("#mustDoList .mustdo-item")
            self.assertEqual(page.locator("#mustDoList .mustdo-item").count(), 2)
            self.assertTrue(page.locator("#mustDoList .mustdo-item").first
                            .evaluate("el => el.classList.contains('done')"))

            # 삭제
            page.locator('#mustDoList [data-must-del]').first.click()
            page.wait_for_timeout(150)
            self.assertEqual(page.locator("#mustDoList .mustdo-item").count(), 1)
            self.assertIn("체육복 챙기기", page.inner_text("#mustDoList"))
            st = self.state(page)
            self.assertTrue(any(m.get("del") for m in st["mustdos"][today]),
                            "삭제는 tombstone으로 남아 동기화에서도 지워져야 함")

            # 빈 목록에서 다시 고양이 안내
            page.locator('#mustDoList [data-must-del]').first.click()
            page.wait_for_timeout(150)
            self.assertIn("아직 적은 일이 없어요", page.inner_text("#mustDoList"))

            # 빈 입력은 추가되지 않음
            page.fill("#mustDoInput", "   ")
            page.click("#mustDoAdd")
            page.wait_for_timeout(150)
            self.assertEqual(page.locator("#mustDoList .mustdo-item").count(), 0)
        finally:
            ctx.close()

    def test_sync_payload_includes_mustdos(self):
        sent = {}

        def handler(route):
            if route.request.method == "PUT":
                sent["body"] = json.loads(route.request.post_data or "{}")
                route.fulfill(status=200, content_type="application/json", body='{"ok":true}')
            else:
                route.fulfill(status=404, content_type="application/json", body="null")

        seed = legacy_state()
        seed["sync"] = {"url": "https://example-rtdb.firebaseio.com",
                        "code": "gajok-test1234", "enabled": True, "lastSync": None}
        ctx, page = self.new_page(seed=seed, route_handler=handler)
        try:
            self.add_mustdo(page, "동기화 확인용")
            page.wait_for_timeout(2600)
            self.assertIn("body", sent, "동기화 PUT 요청이 있어야 함")
            body = sent["body"]
            self.assertIn("mustdos", body)
            self.assertEqual(len(body["tasks"]), 15)
            self.assertTrue(any(m["text"] == "동기화 확인용"
                                for day in body["mustdos"].values() for m in day))
        finally:
            ctx.close()

    def test_mustdo_adds_and_removes_allowance(self):
        """오늘 꼭 할 일 체크 → 100원 적립, 취소 → 100원 차감 (주간 합계·정산 금액)"""
        ctx, page = self.new_page(seed=legacy_state())
        try:
            def summary():
                return page.evaluate("""() => { const s = weekSummary(currentWeekStart());
                    return {total: s.total, remaining: s.remaining, count: s.count,
                            mustTotal: s.mustTotal, mustCount: s.mustCount}; }""")

            self.assertEqual(summary()["total"], 0)
            self.add_mustdo(page, "수학 숙제 내일 것까지")
            self.add_mustdo(page, "체육복 챙기기")
            self.assertEqual(summary()["total"], 0, "체크 전에는 금액이 붙지 않음")

            items = page.locator("#mustDoList [data-must-toggle]")
            items.nth(0).click()
            page.wait_for_timeout(950)
            s1 = summary()
            self.assertEqual(s1["total"], 100)
            self.assertEqual(s1["remaining"], 100, "정산 금액에도 반영")
            self.assertEqual(s1["mustTotal"], 100)
            self.assertEqual(s1["mustCount"], 1)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "100")
            self.assertIn("+100", page.inner_text("#mustDoList .mustdo-item.done"))

            page.locator("#mustDoList [data-must-toggle]").nth(1).click()
            page.wait_for_timeout(950)
            s2 = summary()
            self.assertEqual(s2["total"], 200, "두 개 체크하면 200원")
            self.assertEqual(s2["remaining"], 200)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "200")

            # 하나 취소 → 100원 빠짐
            page.locator("#mustDoList [data-must-toggle]").nth(0).click()
            page.wait_for_timeout(950)
            s3 = summary()
            self.assertEqual(s3["total"], 100)
            self.assertEqual(s3["remaining"], 100)
            self.assertEqual(s3["mustCount"], 1)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "100")

            # 일반 할 일 체크와 합산되고, 삭제하면 금액도 사라짐
            page.locator("#taskList .task-card").first.click()
            page.wait_for_timeout(950)
            self.assertEqual(summary()["total"], 200, "할 일 100 + 꼭 할 일 100")
            page.locator("#mustDoList [data-must-del]").nth(1).click()
            page.wait_for_timeout(950)
            s4 = summary()
            self.assertEqual(s4["total"], 100, "체크한 꼭 할 일을 지우면 금액도 빠짐")
            self.assertEqual(s4["mustCount"], 0)
        finally:
            ctx.close()

    def test_sync_hash_connects_and_cleans_url(self):
        calls = []

        def handler(route):
            calls.append((route.request.method, route.request.url))
            if route.request.method == "PUT":
                route.fulfill(status=200, content_type="application/json", body='{"ok":true}')
            else:
                route.fulfill(status=404, content_type="application/json", body="null")

        payload = base64.urlsafe_b64encode(json.dumps({
            "url": "https://example-rtdb.firebaseio.com",
            "code": "gajok-7f3a9ck2"}).encode()).decode().rstrip("=")
        ctx, page = self.new_page(seed=legacy_state(), route_handler=handler)
        try:
            # 실제 1탭 링크를 누른 경우: 새로 열린 화면
            page.goto("about:blank")
            page.goto(self.base + "#sync=" + payload, wait_until="networkidle")
            page.wait_for_selector("#taskList .task-card", timeout=8000)
            page.wait_for_timeout(2500)
            st = self.state(page)
            self.assertTrue(st["sync"]["enabled"], "해시 링크로 동기화가 켜져야 함")
            self.assertEqual(st["sync"]["url"], "https://example-rtdb.firebaseio.com")
            self.assertEqual(st["sync"]["code"], "gajok-7f3a9ck2")
            self.assertEqual(page.evaluate("() => location.hash"), "",
                             "가족 코드가 주소창에 남으면 안 됨")
            urls = [u for _, u in calls]
            self.assertTrue(any("/families/gajok-7f3a9ck2.json" in u for u in urls),
                            "연결 즉시 Firebase와 동기화해야 함")
            self.assertTrue(any(m == "PUT" for m, _ in calls), "기록을 올려야 함")
        finally:
            ctx.close()

        # 앱이 이미 열려 있는 상태에서 링크를 누른 경우
        ctx2, page2 = self.new_page(seed=legacy_state(), route_handler=handler)
        try:
            self.assertFalse(self.state(page2)["sync"]["enabled"])
            page2.goto(self.base + "#sync=" + payload, wait_until="networkidle")
            page2.wait_for_timeout(2500)
            self.assertTrue(self.state(page2)["sync"]["enabled"],
                            "이미 열린 앱에서도 해시 링크가 먹혀야 함")
            self.assertEqual(page2.evaluate("() => location.hash"), "")
        finally:
            ctx2.close()

    def test_sync_hash_ignores_bad_payload(self):
        for bad in ("not-json", base64.urlsafe_b64encode(
                json.dumps({"url": "http://insecure.example.com",
                            "code": "gajok-7f3a9ck2"}).encode()).decode().rstrip("="),
                base64.urlsafe_b64encode(
                json.dumps({"url": "https://example-rtdb.firebaseio.com",
                            "code": ""}).encode()).decode().rstrip("=")):
            ctx, page = self.new_page(seed=legacy_state())
            try:
                page.goto(self.base + "#sync=" + bad, wait_until="networkidle")
                page.wait_for_timeout(300)
                self.assertFalse(self.state(page)["sync"]["enabled"],
                                 "잘못된 링크로는 연결되면 안 됨: %s" % bad[:24])
            finally:
                ctx.close()

    # ---------- 새 기능 (v1.2.1) ----------
    def test_t15_preset_present_and_pays(self):
        """미래엔 수학 문제집 풀기: 새 폰·기존 폰 모두에 보이고 100원이 붙어요"""
        ctx, page = self.new_page()
        try:
            st = self.state(page)
            ids = [t["id"] for t in st["tasks"]]
            self.assertIn("t15", ids, "새 폰 기본 목록에 t15가 있어야 함")
            t15 = next(t for t in st["tasks"] if t["id"] == "t15")
            self.assertEqual(t15["title"], "미래엔 수학 문제집 풀기")
            self.assertEqual(t15["emoji"], "📐")
            self.assertEqual(t15["days"], [0, 1, 2, 3, 4, 5, 6], "매일")
            self.assertEqual(t15["amount"], 100)
            self.assertEqual(t15["order"], 15)
            card = page.locator('#taskList [data-task="t15"]')
            self.assertEqual(card.count(), 1)
            self.assertIn("미래엔 수학 문제집 풀기", card.inner_text())
            self.assertIn("+100", card.inner_text())
            card.click()
            page.wait_for_timeout(950)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "100")
        finally:
            ctx.close()

        # 이미 t1~t14만 저장된 폰
        ctx, page = self.new_page()
        try:
            self.seed_store(page, legacy_state())
            st = self.state(page)
            self.assertEqual([t["id"] for t in st["tasks"]], [i for i, *_ in SEED_TASKS] + ["t15"])
            self.assertEqual(st["completions"]["2026-11-09"]["t2"]["n"], 2, "기존 기록 보존")
            card = page.locator('#taskList [data-task="t15"]')
            self.assertEqual(card.count(), 1, "기존 폰에도 t15가 보여야 함")
            card.click()
            page.wait_for_timeout(950)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "100")

            # 부모님이 지운 기본 할 일은 removedSeeds에 남고 다시 살아나지 않아요
            page.click("#parentBtn")
            page.wait_for_selector("#pinGate:not(.hidden)")
            for k in "0000":
                page.click('#keypad [data-key="%s"]' % k)
            page.wait_for_selector("#parentView:not(.hidden)", timeout=4000)
            row = page.locator('#tabTasks .prow[data-id="t15"]')
            self.assertEqual(row.count(), 1)
            row.locator('[data-act="del"]').click()
            page.wait_for_selector("#delTask")
            page.click("#delTask")
            page.wait_for_timeout(300)
            st = self.state(page)
            self.assertNotIn("t15", [t["id"] for t in st["tasks"]])
            self.assertIn("t15", st.get("removedSeeds") or [])
            page.reload(wait_until="networkidle")
            page.wait_for_selector("#taskList .task-card", timeout=8000)
            self.assertEqual(page.locator('#taskList [data-task="t15"]').count(), 0,
                             "지운 기본 할 일이 마이그레이션으로 되살아나면 안 됨")
        finally:
            ctx.close()

    def test_mustdo_also_in_today_list(self):
        """오늘 꼭 해야 할 일이 아래 ‘오늘의 할 일’에도 같은 체크로 보이고, 100원은 한 번만"""
        ctx, page = self.new_page(seed=legacy_state())
        try:
            self.add_mustdo(page, "수학 숙제 내일 것까지")
            cards = page.locator("#taskList [data-must-card]")
            self.assertEqual(cards.count(), 1, "아래 목록에도 꼭 할 일이 보여야 함")
            txt = cards.first.inner_text()
            self.assertIn("수학 숙제 내일 것까지", txt)
            self.assertIn("오늘 꼭", txt, "오늘 꼭 배지")
            self.assertIn("+100", txt, "+100원 표시")
            self.assertEqual(page.locator("#taskList .task-divider").count(), 1)
            self.assertIn("오늘 꼭 해야 할 일", page.inner_text("#taskList .task-divider"))

            def summary():
                return page.evaluate("""() => { const s = weekSummary(currentWeekStart());
                    return {total: s.total, mustTotal: s.mustTotal, taskTotal: s.taskTotal,
                            count: s.count, mustCount: s.mustCount}; }""")

            # 아래 목록에서 체크 → 두 목록 모두 체크, 100원 한 번
            page.locator("#taskList [data-must-card]").first.click()
            page.wait_for_timeout(950)
            self.assertTrue(page.locator("#taskList [data-must-card]").first
                            .evaluate("el => el.classList.contains('done')"))
            self.assertTrue(page.locator("#mustDoList .mustdo-item").first
                            .evaluate("el => el.classList.contains('done')"),
                            "위 카드도 함께 체크되어야 함")
            s1 = summary()
            self.assertEqual(s1["total"], 100)
            self.assertEqual(s1["mustTotal"], 100)
            self.assertEqual(s1["taskTotal"], 0, "mustdo가 할 일 체크로 중복 집계되면 안 됨")
            self.assertEqual(s1["count"], 1)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "100")

            from datetime import date
            today = date.today().isoformat()
            st = self.state(page)
            self.assertTrue(st["mustdos"][today][0]["done"])
            self.assertEqual((st.get("completions") or {}).get(today) or {}, {},
                             "mustdo 체크는 completions에 중복 저장하지 않아요")

            # 위 카드에서 취소 → 두 목록 모두 풀리고 100원이 빠짐
            page.locator("#mustDoList [data-must-toggle]").first.click()
            page.wait_for_timeout(950)
            self.assertFalse(page.locator("#taskList [data-must-card]").first
                             .evaluate("el => el.classList.contains('done')"))
            self.assertFalse(page.locator("#mustDoList .mustdo-item").first
                             .evaluate("el => el.classList.contains('done')"))
            self.assertEqual(summary()["total"], 0)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "0")

            # 아래 목록에서 다시 체크 → 위 카드도 체크
            page.locator("#taskList [data-must-card]").first.click()
            page.wait_for_timeout(950)
            self.assertTrue(page.locator("#mustDoList .mustdo-item").first
                            .evaluate("el => el.classList.contains('done')"))
            self.assertEqual(summary()["total"], 100)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "100")
        finally:
            ctx.close()

    def test_check_and_mustdo_persist_after_reload(self):
        """체크한 뒤 나갔다 들어와도 체크 상태와 모은 금액이 그대로 남아요"""
        ctx, page = self.new_page()
        try:
            self.seed_store(page, legacy_state())
            page.locator('#taskList .task-card[data-task="t1"]').click()
            page.wait_for_timeout(950)
            self.add_mustdo(page, "체육복 챙기기")
            page.locator("#taskList [data-must-card]").first.click()
            page.wait_for_timeout(950)
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "200")

            page.reload(wait_until="networkidle")
            page.wait_for_selector("#taskList .task-card", timeout=8000)
            page.wait_for_timeout(950)
            self.assertTrue(page.locator('#taskList .task-card[data-task="t1"]')
                            .evaluate("el => el.classList.contains('done')"),
                            "할 일 체크가 새로고침 후에도 남아야 함")
            self.assertTrue(page.locator("#taskList [data-must-card]").first
                            .evaluate("el => el.classList.contains('done')"),
                            "아래 목록의 꼭 할 일 체크도 남아야 함")
            self.assertTrue(page.locator("#mustDoList .mustdo-item").first
                            .evaluate("el => el.classList.contains('done')"))
            self.assertEqual(page.inner_text("#weekAmount").replace(",", ""), "200")
            self.assertEqual(page.evaluate("() => weekSummary(currentWeekStart()).total"), 200)
        finally:
            ctx.close()

    def test_push_sent_quickly_after_check(self):
        """체크 직후 300ms 안에 서버로 올려요 (앱을 바로 나가도 저장)"""
        bodies = []

        def handler(route):
            if route.request.method == "PUT":
                bodies.append(json.loads(route.request.post_data or "{}"))
                route.fulfill(status=200, content_type="application/json", body='{"ok":true}')
            else:
                route.fulfill(status=404, content_type="application/json", body="null")

        seed = legacy_state()
        seed["sync"] = {"url": "https://example-rtdb.firebaseio.com",
                        "code": "gajok-test1234", "enabled": True, "lastSync": None}
        ctx, page = self.new_page(seed=seed, route_handler=handler)
        try:
            page.wait_for_timeout(700)
            bodies.clear()
            from datetime import date
            today = date.today().isoformat()
            page.locator('#taskList .task-card[data-task="t1"]').click()
            page.wait_for_timeout(1400)
            self.assertTrue(bodies, "체크 후 1.4초 안에 서버로 올라가야 함")
            comp = (bodies[-1].get("completions") or {}).get(today) or {}
            self.assertIn("t1", comp)
            self.assertEqual(comp["t1"]["n"], 1)
            self.assertGreater(bodies[-1].get("clock", 0), 1e12,
                               "clock은 Date.now 기반 단조 증가여야 함")
        finally:
            ctx.close()

    def test_no_horizontal_overflow(self):
        for w in (390, 320):
            ctx, page = self.new_page(width=w)
            try:
                m = page.evaluate("""() => ({
                    sw: document.documentElement.scrollWidth,
                    cw: document.documentElement.clientWidth,
                    dateClipped: (() => { const e = document.getElementById('todayDate');
                        return e.scrollWidth > e.clientWidth + 1; })(),
                    cardRight: Math.round(document.querySelector('#mustDoCard')
                        .getBoundingClientRect().right),
                })""")
                self.assertLessEqual(m["sw"], m["cw"], "가로 스크롤 발생 (%dpx)" % w)
                self.assertFalse(m["dateClipped"], "날짜 글자 잘림 (%dpx)" % w)
                self.assertLessEqual(m["cardRight"], m["cw"], "카드가 화면 밖으로 나감")
            finally:
                ctx.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
