# 🚀 Deploy — DIGITAL SURVIVAL → GitHub Pages

Static site (no build step). The Firebase web config is already in `js/firebase.js`
(public identifier — safe to commit). **Never commit the Admin SDK service-account key.**

## Prerequisites (already done)
- Firebase project set up (Auth + Firestore + rules published). See `README.md`.
- Re-deploy the **Phase 10 hardened** `firestore.rules` if you haven't (Firestore → Rules → paste → Publish).

---

## Option A — GitHub website (no command line)
1. Go to https://github.com/new → create a repo, e.g. **`digital-survival`** (Public) → *Create*.
2. On the repo page → **Add file → Upload files** → drag **all files & folders** from this project
   (`index.html`, `student.html`, `host.html`, `presenter.html`, `admin.html`, `guide.html`,
   `student-guide.html`, `firebase-test.html`, and the `css/`, `js/`, `data/` folders,
   plus `firestore.rules`, `.nojekyll`, `README.md`) → **Commit changes**.
3. **Settings → Pages** → *Build and deployment* → Source: **Deploy from a branch** →
   Branch: **main** / **/(root)** → **Save**.
4. Wait ~1 min → your site is live at
   **`https://<your-username>.github.io/digital-survival/`**

## Option B — Git command line
```bash
cd digital-survival
git init && git add . && git commit -m "Digital Survival — initial deploy"
git branch -M main
git remote add origin https://github.com/<your-username>/digital-survival.git
git push -u origin main
```
Then do step 3–4 above (Settings → Pages).

---

## After deploy
- Open **`.../firebase-test.html`** → *เริ่มทดสอบ* → all green.
- Open **`.../host.html`** → log in → *สร้างเซสชัน* → the **presenter QR** and all
  in-app links automatically use your deployed URL (they are relative).
- Hand students the URL **`.../index.html`** (or let them scan the QR on the projector).

## Event-day URLs
| Role | URL |
|------|-----|
| Students | `.../index.html` |
| Host | `.../host.html` |
| Presenter (projector) | `.../presenter.html?s=<CODE>` (opened from host) |
| Admin | `.../admin.html` |
| Player guide | `.../student-guide.html` |
| Facilitator guide | `.../guide.html` |

## Notes
- **Cache:** GitHub Pages caches briefly. Deploy the final version the day before; iPads loading
  fresh on the morning get the latest. If you push a fix, tell devices to hard-refresh.
- **Custom domain / project path:** all asset paths are relative, so the app works whether it's
  served from a user site (`user.github.io`) or a project path (`user.github.io/digital-survival/`).
