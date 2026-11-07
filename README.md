# Bloody Savior · deployable prototype

Responsive, installable web app prototype for donors, requesters, blood banks, hospitals, NGOs and college coordinators. GitHub Pages hosts the front end; Supabase provides OTP sign-in, private records, realtime aggregate counters and Edge Functions. Twilio can deliver SMS or approved WhatsApp templates from the server side.

## Repository layout

```
.github/workflows/pages.yml   publishes the site to GitHub Pages on every push to main
index.html                    the whole front end (HTML + CSS + UI logic)
backend.js                    optional Supabase layer (OTP, counts, requests); idle in demo mode
config.js                     demo-mode placeholder; the workflow overwrites it from repo Variables
config.example.js             shape of the public browser config
service-worker.js             offline shell (network-first, so new deploys show up immediately)
manifest.webmanifest, icon*.png, apple-touch-icon.png, icon.svg   installable-app assets
.nojekyll                     tells Pages to skip Jekyll
supabase/                     schema.sql and functions/notify (add these here; see "Configure Supabase")
```

## Deploy the front end (demo mode, about 3 minutes)

1. Create a GitHub repository and upload the **contents of this folder to the repository root** (index.html must sit at the root, and `.github/` and `.nojekyll` are hidden files, so use `git push` or drag-and-drop with hidden files shown).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The *Deploy to GitHub Pages* workflow runs (Actions tab) and prints the live URL, usually `https://<owner>.github.io/<repository>/`.
4. Demo mode needs nothing else. Forms save sample data only in the visitor's own browser.

Prefer no Actions? Set **Source → Deploy from a branch → main / (root)** instead. The site works the same in demo mode.

To go live with a backend, add repository **Variables** (Settings → Secrets and variables → Actions → Variables) named `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then re-run the workflow. The anon key is public by design; security depends on row-level security. Never put a service-role key in the site. Then, in Supabase Auth, add the Pages URL to the redirect URLs, enable phone sign-in and configure an SMS provider.

Serve over HTTPS (Pages does) or localhost to install the PWA and use the offline shell. To test locally: `python3 -m http.server 8000` in this folder.

## Presentation checklist

- Open the live URL once on the venue Wi-Fi beforehand. Fonts and the Supabase script load from CDNs; without internet the site still works, using fallback fonts.
- Demo mode shows 0 in the "People ready to help" counters on purpose; no fake numbers are displayed.
- Walk-through that works offline: landing → I want to donate (try a date of birth under 18, then an adult one) → I need blood → My requests → Partner workspace → Review a sample request.
- Use **Delete my data → Delete demo data** to reset between runs, or an incognito window.
- The Hindi toggle only shows a "coming soon" message.
- Sign-in OTP, the donor directory and notifications require the Supabase backend and an SMS provider; do not demo them in demo mode.

## Configure Supabase

1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor (this file and `supabase/functions/notify` were not part of the upload this repo was prepared from; copy them in from the original project).
2. Enable Realtime for `public.public_metrics` (the SQL publication statement does this on a standard Supabase project).
3. From this folder, link the Supabase project (`supabase link --project-ref <project-ref>`) and deploy the notification function with `supabase functions deploy notify`.
4. Set function secrets: `SITE_ORIGIN`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`, and WhatsApp content SIDs `TWILIO_WA_CONTENT_SID_REQUEST_SUBMITTED`, `TWILIO_WA_CONTENT_SID_REQUEST_STATUS`, `TWILIO_WA_CONTENT_SID_DONOR_INVITE`.
5. Use the appropriate approved sender IDs and message templates. Register SMS templates with the applicable Indian DLT operator and submit WhatsApp templates to Meta/Twilio. No provider secrets belong in GitHub Pages or `config.js`.
6. Set Supabase Auth redirect URLs to the final Pages URL. Restrict the Edge Function CORS origin to the deployed site. Have a responsible admin create/approve pilot blood-bank organizations and memberships before inviting staff.
7. Configure a scheduled job to expire stale requests hourly, following the commented SQL at the end of `schema.sql`.

`config.example.js` shows the browser configuration shape. The Pages workflow writes the real public config from repository Variables during deployment.

## Included flows

- Adults-only donor profile with separate profile, alert and public-recognition consent; OTP flow; donor data is private under RLS.
- Request form with callback/doctor fields, optional requisition upload placeholder, verification status, 48-hour expiry and opt-in SMS/WhatsApp status messages.
- Pending organization applications for licensed blood banks, hospitals, NGOs and colleges. Blood-bank applications require a licence and admin approval.
- Public aggregate counts for opted-in available donors, distinct people with open requests, open requests and approved partners. Counts update through Supabase Realtime without exposing donor/request rows.
- Server-side Twilio notification function with consent checks, bank-only donor invitations, a weekly limit, and no caller-supplied phone number.
- India/world road-safety context uses published annual estimates averaged into a locally ticking daily estimate. It is not live incident data and is not presented as deaths caused by blood shortage.

## Limits before a real pilot

This is a class/demo build, not a launched or legally reviewed medical service. The secure backend foundation is included, but the bank dashboard screens are still illustrative rather than full staff/admin CRUD, certificate PDF/QR issuance and donor recall matching need implementation, and the requisition file input is intentionally not uploaded. Configure OTP, hosting, provider templates, staff accounts, retention/deletion, audit trails, document scanning, operational verification and lawyer/company-secretary review before real personal or medical data is collected. Do not use the demo profile or sample bank rows to coordinate an actual transfusion.

## Data sources in the site

- India: [PIB / Ministry of Road Transport and Highways report summary](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2245285&lang=1&reg=3), citing about 4.73 lakh road crashes and 1.70 lakh fatalities in 2024.
- World: [WHO 2026 road-safety update](https://www.who.int/philippines/news/detail-global/20-07-2026-road-deaths-fall-by-21--globally-but-stronger-action-is-needed-to-save-lives), estimating 1.16 million road deaths in 2025.
- Blood-shortage deaths in India: [Rajya Sabha written answer, 19 August 2025](https://sansad.in/getFile/annex/268/AU2995_zdPv2V.pdf?source=pqars) says no such deaths had been reported to the Blood Transfusion Service; this is not an estimate of zero deaths.

