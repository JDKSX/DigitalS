# 🛡️ DIGITAL SURVIVAL

**8 Missions to Survive the Digital World** — Interactive learning game for a Digital Literacy workshop (~120 high-school students, iPad-first, played live and hosted by a facilitator).

- **Event:** วันศุกร์ที่ 28 สิงหาคม พ.ศ. 2569 · 09:30–11:30
- **Stack:** Vanilla JS (ES Modules) + Tailwind (CDN) + Firebase (Spark plan) · hosted on GitHub Pages
- **No build step** — open the HTML files directly or serve statically.

## Concept
> เราไม่ได้มาเรียนว่าอะไรถูกหรือผิด แต่เราจะลองดูว่า ถ้าเรื่องนี้เกิดขึ้นกับเรา เราจะเลือกทำอย่างไร?

## Pages / Roles
| File | Role | Purpose |
|------|------|---------|
| `index.html` | Student | Landing + join (session code → nickname → Player ID) |
| `student.html` | Student | The game (missions, XP, badges, passport) |
| `host.html` | Host | Live control + real-time dashboard |
| `presenter.html` | Projector | Big-screen view (no back-office data) |
| `admin.html` | Admin | Content, analytics, CSV/XLSX export |

## Firestore data model
```
sessions/{sessionId}          state machine: phase, currentMission, currentQuestion, questionStartAt …
users/{playerId}              nickname, room, xp (display), missionScores, badges, authUid
answers/{sid_pid_qid}         immutable, deterministic id (dedupes) — source of truth for scoring
leaderboards/{sessionId}      top-N: { nickname, playerId, xp } only — no private data
settings/config
```
Content (missions/questions) is loaded from **static JSON** (`data/`) → 0 Firestore reads for content.

## Security posture
- Students: **Anonymous Auth**. No name/ID/phone/email/location stored.
- Host/Admin: **Email + Password Auth**. The web `apiKey` is a **public** identifier, not a secret. **Never** commit the Admin SDK key.
- **Scoring is written by the HOST at reveal, not by students** (§27/§38). Students can write only their own immutable `answers` + their own `lastSeen`. XP/badges/scores are locked by the rules.

### Phase 10 — attack tests (run as an anonymous student against live Firestore)
| Attack | Result |
|---|---|
| change my own XP / badges | **DENIED** ✓ |
| read another player's doc | **DENIED** ✓ |
| overwrite / delete my answer | **DENIED** ✓ |
| write the leaderboard | **DENIED** ✓ |
| create a session | **DENIED** ✓ |
| read others' answers | **DENIED** ✓ |
| add a junk field to my doc | DENIED after Phase 10 hardening (`update` limited to `lastSeen`) |

**Accepted residual risk:** a determined student using DevTools can create *extra* player docs (spam) — anonymous auth can't cap docs-per-user cheaply on Spark. This only inflates the player count (never XP), is visible to the host, and is impractical in a proctored classroom. Mitigation if needed: switch the player doc id to `sessionId_uid` (one doc per anon user).

> Re-deploy `firestore.rules` after Phase 10 (Firestore → Rules → paste → Publish). Delete any test docs (`P998`/`P999`, junk fields) from the console if present.

## Development phases
1. Architecture & Foundation ✅ *(this phase)*
2. Project Setup (HTML shells) · 3. Firebase · 4. Student UI · 5. Host Dashboard ·
6. Game Engine · 7. Missions · 8. XP/Badge/Leaderboard · 9. Analytics/Export ·
10. Security · 11. Demo Mode · 12. Testing · 13. Deployment

## Local test
```bash
cd digital-survival
python3 -m http.server 5173
# open http://localhost:5173
```
(A static server is needed because ES Modules don't load over `file://`.)

## Firebase setup (Phase 3) — one-time, ~10 min
Do this once before the event. The web config is **public** (safe to commit); only the Admin SDK key is secret (never add it here).

1. **Create project** — https://console.firebase.google.com → *Add project* (no billing needed → Spark plan).
2. **Add a Web app** (`</>`), copy the `firebaseConfig`, and paste the values into `js/firebase.js` (replace every `REPLACE_ME`).
3. **Authentication → Sign-in method:** enable **Anonymous** *and* **Email/Password**.
4. **Create a host/admin login:** Authentication → *Users* → *Add user* (email + password). Copy that user's **UID**.
5. **Firestore Database → Create database** → *Production mode* → region `asia-southeast1` (Singapore).
6. **Firestore → Rules:** paste the contents of `firestore.rules` → **Publish**.
7. **Grant staff role:** Firestore → *Start collection* `staff` → *Document ID* = the UID from step 4 → add field `role` = `admin` (string). Add more docs for each host with `role` = `host`.
8. **Verify:** open `firebase-test.html` → *เริ่มทดสอบ* → all three steps should turn green.
9. **Try the loop:** open `host.html` → log in → *สร้างเซสชัน* → note the code. Open `index.html` in another tab/device → *เข้าสู่ภารกิจ* → enter the code + a nickname. The host's *joined/online* count should tick up live.

No custom Firestore indexes are required (all queries use equality filters only).

> **Scoring note:** students can write only their own `answers` (write-once). XP/badges/scores are locked from students by the rules and are written by the **host** at reveal (Phase 8). Official scores are recomputed by admin from the immutable `answers`.
