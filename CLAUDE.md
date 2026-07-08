# Westerpark Tennis

React + Vite + Firebase (Firestore, Auth, Analytics, Messaging) PWA for a public tennis court in Amsterdam: live court status, timers, a join queue, geofencing, and an admin panel. Solo-maintained, deployed on Vercel. Not an official service — a free community tool.

- `src/App.jsx` — the public app (routes to this unless path is `/admin`, see `src/main.jsx`)
- `src/Admin.jsx` — admin panel, separate React tree, no shared components with `App.jsx` (small components like icons get duplicated between the two files, not extracted)
- `src/firebase.js` — Firebase init, exports `db`, `auth`, `analytics`, notification helpers
- `firestore.rules` / `firebase.json` / `.firebaserc` — deployed manually via the Firebase Console; no Node/npm on the primary dev machine, so `firebase deploy` isn't available here. Treat `firestore.rules` in the repo as the source of truth and remind the user to paste it into the console after changing it.

## Design principles (don't relitigate these)

**No accounts for regular visitors, by design.** Anyone physically at the courts can mark a court occupied, join the queue, or mark themselves done — deliberately frictionless, not an oversight. Only the admin panel has real auth (Firebase email/password, `lucacolussi56@gmail.com`).

**Geo-verification is a queue-independent, reusable trust signal.** `checkGeo(setStatus)` in `App.jsx` is the single geolocation check used everywhere. Once a user passes it, `geoVerifiedAt` is stamped and stays valid for `GEO_TRUST_MS` (60 min) — other geo-gated actions in that window skip straight to "ok" rather than re-prompting. This is deliberately time-boxed rather than a plain boolean flag: a boolean would stay true indefinitely if the tab is merely backgrounded (mobile OS tab lifecycle is unpredictable), defeating the point of checking presence.

**"Correct the court's state" and "join the queue" are separate actions — never bundle them.** This was a deliberate fix, not the original design: "Someone is playing" (marking a free-looking court as actually occupied) used to also auto-join the reporter to the queue as position 1. That caused a real bug — if the *other* court was also stale/free-looking, the now-auto-queued user would see a misleading "Go play" button pointing at a court someone was actually using. `markCourtOccupied` is now a pure correction (match type + geo check, no name, no queue write); joining the queue is always a separate, explicit action via the main CTA.

**Court-state corrections must not require queue membership.** The force-free (✕) button had the same class of bug as above: it only appeared for users first-in-queue, but if a real court is genuinely free, the app never routes anyone into the queue — so there was no way to reach the button to fix a stuck/stale occupied court. It's now available to anyone on any occupied court, gated only by the geo-verification step (`forceFreeGeo`), not by queue position.

**Firestore rules are intentionally split by risk, not uniformly locked down.** `courts`/`queue` stay fully open (`allow read, write: if true`) — that matches the no-account design above. `settings` writes and `feedback`/`problems`/`sessions` reads+deletes require `request.auth.token.email == 'lucacolussi56@gmail.com'` (admin only) — these are the paths that could brick the app for everyone (`maintenance` flag) or leak/corrupt data with no legitimate public reason. Don't loosen the admin-only paths, and don't lock down `courts`/`queue`.

**No push notifications, deliberately.** The code collects an FCM token on queue-join and has a service worker ready (`public/firebase-messaging-sw.js`), but nothing sends a push — no Cloud Function or backend exists. Current "notify" is a local `Notification()` that only fires while the tab is open. Decided against building a real sender: Firebase Cloud Functions require the Blaze (pay-as-you-go) plan (card on file, even if usage stays free — user explicitly doesn't want that), and the card-free alternative (a Vercel serverless function, since deploy is already on Vercel) was also declined once benefit was sized down — Android-only, small local user base, and iOS Safari only gets web push if installed to the home screen (iOS ≥16.4, a hard Apple limit unrelated to backend choice). Don't re-propose this unless the user brings it up or a Vercel `api/` function gets added for other reasons.

**No emoji as the header logo, deliberately.** Went through a custom-SVG-icon iteration; user decided against having any icon there at all. Header is wordmark-only ("Wester"/"park" two-tone text). Theme toggle icons (🌝/🌚) are a separate, kept decision — don't conflate the two.

## Known environment constraint

The primary dev machine has no Node/npm/Homebrew installed. Changes made via Claude Code here are syntax-checked (brace/paren balance) but **not build-tested or run**. Always tell the user to run `npm run dev` and click through affected flows before treating a change as verified.
