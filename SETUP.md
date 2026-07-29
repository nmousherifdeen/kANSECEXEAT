# Connecting the Exeat Register to Supabase

The app is still a single static `index.html` — no build step, no bundler.
It now talks to a real Postgres database and real auth via Supabase's
JS client, loaded straight from a CDN. Multi-device sync and realtime
updates work because every browser reads/writes the same database
instead of its own `localStorage`.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's provisioned, go to **Settings → API** and copy:
   - **Project URL**
   - **anon public** key (not the `service_role` key — that one stays secret)

## 2. Run the schema

1. Open **SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql` and click **Run**.
   This creates all tables, indexes, RLS policies, the realtime
   publication, and a public `exeat-photos` storage bucket.

If the storage bucket lines fail (some plans restrict inserting into
`storage.buckets` from SQL), create it manually instead:
**Storage → New bucket → name `exeat-photos` → Public bucket: on.**
Then re-run just the two `create policy ... on storage.objects` statements.

## 3. Point the app at your project

Open `exeat-pwa/index.html`, find these two lines near the top of the
`<script>` block, and fill them in:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
```

The anon key is safe to ship in client-side code — it's what RLS
policies are designed to be used with.

## 4. Create staff accounts

Every house warden, gatekeeper and admin needs a real Supabase Auth
user **plus** a matching row in `staff_profiles`. Two ways to do this:

### Option A — quick, manual (no CLI needed)
1. **Authentication → Users → Add user** — set an email and a temporary
   password for each staff member.
2. Copy the generated user `id` (UUID).
3. In the SQL Editor, insert their profile, e.g.:
   ```sql
   insert into staff_profiles (id, name, role, house_id)
   values ('paste-the-uuid-here', 'Mr. Kwame Boateng', 'warden', 'Falcon');

   insert into staff_profiles (id, name, role, gate_post)
   values ('paste-the-uuid-here', 'Mr. Iddrisu Salifu', 'gate', 'Main Gate');

   insert into staff_profiles (id, name, role)
   values ('paste-the-uuid-here', 'V.P. Awuah', 'admin');
   ```
   Suggested starting houses: Falcon, Eagle, Hawk, Osprey (already seeded
   in the `houses` table — add more with `insert into houses ...` if needed).

### Option B — self-service from the Admin dashboard (needs the CLI once)
This lets an admin add/reset staff accounts from inside the app itself,
using the two Edge Functions in `supabase/functions/`. This is the one
place you'll actually run an npm install — the **Supabase CLI**, not
`@supabase/server` (that package doesn't exist):

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-create-staff
supabase functions deploy admin-reset-password
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The service-role key lives only as a server-side secret on Supabase's
infrastructure — it's never sent to the browser. Once deployed, the
**Admin → Staff accounts** panel in the app can create new wardens/
gatekeepers and reset passwords directly.

## 5. Deploy the static files

Because there's no build step, `exeat-pwa/` can be hosted anywhere that
serves static files: GitHub Pages, Netlify, Vercel (static), Cloudflare
Pages, or even a Supabase Storage public bucket. Just upload the folder
as-is.

## 6. Security notes (read before wider rollout)

- Students and parents don't log in in this version — `exeat_requests`
  and `notifications` use permissive RLS policies (anyone with the app
  URL can read/act on any record), matching the original prototype's
  "shared front-desk kiosk" trust model. That's reasonable for a small
  school network but not for a public deployment.
- To harden it: add real parent/student Supabase Auth accounts, then
  scope the `exeat_requests`/`notifications` policies to `auth.uid()`
  the same way `staff_profiles` already is.
- Staff passwords are real Supabase Auth passwords now — the old shared
  PIN is gone. Temporary passwords issued by account creation/reset are
  `changeme123`; the app forces a change on first login.
- Photo IDs are uploaded to a **public** storage bucket for gate-staff
  visibility without extra auth plumbing. If that's a concern, switch
  the bucket to private and use `createSignedUrl` instead of
  `getPublicUrl` when displaying photos.
