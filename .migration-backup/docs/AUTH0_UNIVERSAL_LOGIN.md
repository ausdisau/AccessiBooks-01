# Auth0 Universal Login, Branding, Passkeys, and MFA Notes

This document captures the AD.iD-aligned Auth0 setup notes for this app:

- **Tenant:** `https://ad-id.auth0.com`
- **App type:** Regular Web Application
- **Login approach:** Auth0 Universal Login
- **Stack:** Express + React + Tailwind

For the in-app provider routing (Google via Replit OIDC, Facebook + Microsoft via
Auth0 social connections), see [`docs/auth.md`](./auth.md). This document is
focused on Auth0 dashboard configuration and the customer-facing experience.

---

## 1. Recommended Auth0 dashboard setup

Create a **Regular Web Application** in Auth0 and use these values.

### Allowed Callback URLs
- `http://localhost:3000/auth/callback`
- `https://your-repl-name.your-username.repl.co/auth/callback`
- `<APP_URL>/api/auth/callback/auth0` (the actual callback this app uses)

### Allowed Logout URLs
- `http://localhost:3000`
- `https://your-repl-name.your-username.repl.co`
- `<APP_URL>`

### Allowed Web Origins
- `http://localhost:3000`
- `https://your-repl-name.your-username.repl.co`
- `<APP_URL>`

### Allowed Origins (if your tenant requires it)
- Same list as Allowed Web Origins.

---

## 2. Universal Login branding guidance for AD.iD

The login experience should feel like a calm front door, not a security
obstacle.

### Suggested brand title
**AD.iD**

### Suggested subtitle
**One simple sign-in for Australian Disability services**

### Suggested supporting copy
- Sign in once to access CripChat, MapAble, DisAcademy, and future services.
- You stay in control of who can access your services.
- You can use easier sign-in methods like passkeys where available.

### Tone
- plain English
- calm and respectful
- low-jargon
- confidence without sounding clinical or corporate

### Visual direction
- deep blue primary
- high contrast
- generous spacing
- large buttons
- minimal clutter

### Suggested colours
- Primary: `#2457D6`
- Dark brand: `#0F1F46`
- Soft background: `#F4F7FB`
- Text: `#172033`

### Suggested logo treatment
Use a simple wordmark:
- **AD.iD**
- optional sub-line: *Australian Disability Ltd*

If you upload a logo in Auth0 Branding, keep it legible on both light and dark
backgrounds.

---

## 3. Auth0 Branding settings checklist

In the Auth0 dashboard:

### Branding → Universal Login
- Logo: AD.iD wordmark or Australian Disability Ltd mark
- Primary color: `#2457D6`
- Page background: light neutral
- Font: system sans-serif or closest available

### Branding → Text Customization
Prefer plain-language wording where possible. Suggested replacements:
- "Log in" instead of "Authorize"
- "Continue" instead of "Proceed"
- "Email address" instead of "Username"
- "Use another way to sign in" for fallback flows

---

## 4. Passkeys setup notes

Auth0 passkeys are the next upgrade after the base prototype is stable.

### Goal
Allow users to sign in with:
- fingerprint
- face unlock
- device PIN

### Recommended approach
Turn on passkeys in Auth0 so the **Universal Login** flow handles the user
experience. This keeps the app simpler and avoids building passkey UX inside
the app first.

### Suggested rollout
1. Launch with email/password or passwordless baseline.
2. Enable passkeys for pilot users.
3. Add gentle prompts in the app:
   - "Use your face, fingerprint, or device PIN for easier sign-in"
4. Expand to all users once support content is ready.

### In-app prompt placement
- Home page security card
- Account page security panel
- After first successful sign-in

---

## 5. MFA recommendations

### Good prototype path
Use **one** strong fallback before adding too much complexity:
1. Base login.
2. Add passkeys.
3. Add MFA for higher-risk scenarios.

### Preferred MFA methods
- Authenticator app
- Passkeys
- Email as a lower-friction backup for some users

### Avoid leading with
- too many security prompts at first sign-in
- complex setup screens before people understand the service
- jargon-heavy explanations

### Plain-English MFA copy
- "Add extra sign-in protection"
- "Use a code app on your phone"
- "Use your face, fingerprint, or device PIN when available"

---

## 6. Accessibility notes for Universal Login

When reviewing the Auth0 hosted login page, test:
- keyboard navigation
- visible focus state
- screen reader labels
- error messages that are clear without colour
- large enough tap targets
- reduced confusion in recovery flows

### Content guidance
Prefer:
- short instructions
- one primary action per step
- reassurance copy such as:
  - "You can change this later."
  - "You stay in control."
  - "Need help signing in?"

### Support copy
Add links in the app, not only in Auth0:
- Sign-in help
- Easy English version
- Contact support

---

## 7. Suggested Auth0 Actions or Rules later

Not required for this prototype, but good next steps:
- add custom claims for AD roles
- enrich session with connected service permissions
- trigger branded onboarding after first login
- route higher-risk events to MFA step-up

---

## 8. Suggested UI additions in this repo

### Home page
- "Passkey available" banner
- "Review security" button

### Account page
- "Set up easier sign-in" button
- "Add extra sign-in protection" button

### Help page
- "How passkeys work"
- "How to use a code app"
- "What to do if you lose your device"

---

## 9. Copy snippets ready to use

### Security prompt
**Use your face, fingerprint, or device PIN for easier sign-in.**

### MFA prompt
**Add extra sign-in protection to keep your account safer.**

### Recovery prompt
**Lost your device? You can still get back into your account.**

### Trusted helper explanation
**You choose who can access your services, what they can do, and when that
access ends.**

---

## 10. Recommended next implementation step

After the base flow is running:
1. Enable Universal Login branding in Auth0.
2. Enable one passkey or MFA pilot flow.
3. Mirror the wording from Auth0 inside the app so the experience feels
   consistent.
4. Test with lived-experience users before broad rollout.
