# CPVS security fixes — step-by-step runbook

**Written for someone who does not code.** Every step is a thing you click or
copy and paste. You will never be asked to write code or decide anything
technical. If a step ever doesn't match what you see on screen, stop there —
don't improvise — and ask for help with the exact wording you saw.

**Time needed:** about 45 minutes, plus the wait for one deploy.
**When to do it:** pick a time when no student is checking in. Part 4 explains
how to find that time for your hospitals.

**A note on numbering:** these fixes were originally written as migrations
0014 and 0015. Your project separately gained a biometric check-in feature
(fingerprint/Face ID or a selfie match, required before a student's very
first check-in) that also claimed the number 0014, so the two have been
reconciled: the biometric feature keeps migration **0014**, and the two
security fixes below were renumbered to **0015** and **0016**. Nothing about
what they fix changed — only the file numbers and the file names this
runbook points you to. One thing DID change in the code: `check_in()` (now
migration 0016) now also checks that the student has a valid biometric
verification pass before writing the row, since the RLS policy migration
0014 originally used for that check gets dropped by 0016. If you've already
applied migration 0014 (biometric) on its own, that's fine — Part 2 and
Part 4 below don't touch it.

---

## What this is fixing, in plain language

Six real problems were found in the system. Five are security problems, one is
a feature that has never worked. Here is what each one meant in practice.

| # | The problem | What it meant in real life |
|---|---|---|
| 1 | Any student could make themselves a **Super Coordinator** | One request from a student's browser, and they would have had full control of the system — every student's records, every permission, everything. This is the most serious one. |
| 2 | Any student could change their own account **role** to coordinator | They could then read every other student's attendance, appeals, and personal details. |
| 3 | Students could **mark themselves present from anywhere** | The check-in decision — where you are, what time it is, whether you're "present" or "late" — was made on the student's own phone and then believed. Changing your phone's clock, or installing a free fake-GPS app, was enough. No coding knowledge needed. |
| 4 | Students could **edit their own attendance records** | An "absent" record could be changed to "present" after the fact. |
| 5 | Anyone could **write into anyone's notifications**, and read **other students' appeal attachments** | Fake "your appeal was approved" messages, and other students' medical documents were readable. |
| 6 | **Profile photo upload has never worked** | The place photos were meant to be stored was never created. Uploads failed silently — no error, no photo, nothing. |

Two ordinary bugs were fixed along the way:

- A coordinator whose only permission was "review appeals" could click
  **Approve** on an appeal, and the appeal would show as approved — but the
  student's absence stayed on their record. The approval quietly did nothing.
- Between midnight and 3:00 AM, the app showed **yesterday's** date as today.
  This is because it was using world time (UTC) instead of Ethiopian time.
  Anyone opening the app early in the morning saw the wrong day.

---

## Before you start — five things

### ☐ 1. You will need to be logged in to Supabase

Go to **https://supabase.com/dashboard** and log in. Keep this tab open —
you'll use it throughout.

### ☐ 2. You must take a backup (Part 1). Do not skip it.

### ☐ 3. Understand the one risky moment

Almost everything here is safe to do at any time. **One step is not.**

In Part 4, the database and the app have to be updated *together*. For the few
minutes between them, students cannot check in. That is why Part 4 tells you to
do it outside clinical hours. It is clearly marked when you get there.

### ☐ 4. Run one check now, before you change anything

This confirms the updated app code is healthy on your machine. Open VS Code
(Part 0 explains how), open the terminal, and type:

```
npm run build
```

Wait for it to finish — a minute or two.

- **If it ends without red error text**, you're good. Carry on to Part 1.
- **If it prints errors**, stop and report them. Nothing has been changed yet,
  so you are perfectly safe — but don't start Part 2 until this is clean,
  because Part 4 depends on it.

### ☐ 5. ⚠ Know which database this folder is talking to

**This matters more than it sounds.** This folder — `cvps clone` — has a
settings file called `.env.local`, and it currently holds the address and key
of your **real, live CPVS database**. Not a copy. The real one.

What that means in practice:

| Command | Safe? | Why |
|---|---|---|
| `npm run build` | ✅ **Safe** | Only checks and packages the code. Never touches any database. |
| `npm run dev` | ⚠️ **Touches the live database** | Opens the app on your own computer, but connected to your students' real data. |

So step 4 above is completely safe — run it without worrying.

But if you later open the app on your own computer with `npm run dev` and click
around, **you are clicking around inside the live system**. If you check in as a
test student, that check-in is real. If you delete a test rotation, it is really
gone.

Two ways to handle this — pick one:

- **Simplest:** don't run `npm run dev` at all. Do your testing in Part 5 on the
  real website (the Vercel address your students use), where at least you know
  what you're looking at.
- **Safer, if you want somewhere to practise:** point this folder at a *separate,
  empty* Supabase project instead, so nothing you do here can reach real student
  records. Ask me and I'll set that up for you — it is a ten-minute job and it
  gives you a rehearsal copy where you can run this entire runbook end-to-end
  first, without any risk at all. Given that Part 4 is the one timing-critical
  step, having rehearsed it once is worth a lot.

---

## Part 0 — Finding your way around VS Code

Skip this if you already know it.

### Opening the project

1. Open **VS Code**.
2. Menu bar → **File** → **Open Folder…**
3. Choose the folder `cvps clone` on your Desktop.
4. Click **Select Folder**.

### The file list

Down the left side you'll see a panel listing folders and files. That's the
**Explorer**. If you can't see it, press `Ctrl` + `Shift` + `E`.

Click any file name once to open it and read it. Click a folder name (like
`supabase`) to expand it.

### Finding a specific file fast

Press `Ctrl` + `P`, start typing the file name, press `Enter` on the match.
This is much faster than clicking through folders. For example, press
`Ctrl` + `P`, type `0015`, press `Enter`.

### Copying the whole contents of a file

1. Click inside the file so the cursor is in the text.
2. Press `Ctrl` + `A` (selects everything).
3. Press `Ctrl` + `C` (copies it).

You'll do this several times below.

### The terminal

Some steps need you to type a command. Open the terminal with:

- Menu bar → **Terminal** → **New Terminal**, or press `` Ctrl + ` ``

A panel opens at the bottom with a blinking cursor. You type a command there
and press `Enter`. When something is finished, the blinking cursor comes back.

> **A note on reading files:** every file mentioned in this runbook starts with
> a long comment explaining what it does and why, in ordinary sentences. You
> don't need to understand the code underneath. Reading the top 40 lines of
> each one will tell you what you're about to apply.

---

## Part 1 — Back up your database (mandatory)

Nothing in these fixes deletes data. But you should never change a live
system's permissions without a way back. This takes five minutes.

### Option A — the automatic backup (best, if your plan has it)

1. In the Supabase dashboard, click **Database** in the left sidebar.
2. Click **Backups**.
3. If you see a list of dated backups, note today's most recent one — that's
   your restore point. **You're done with Part 1.**
4. If the page says backups aren't available on your plan, use Option B.

### Option B — export your important tables by hand

Do this for each of these tables: **attendance**, **profiles**, **students**,
**coordinators**, **rotations**, **appeals**.

1. In the Supabase dashboard, click **Table Editor** in the left sidebar.
2. Pick the table from the list on the left.
3. Near the top right, click the **⋯** (three dots) or **Export** button.
4. Choose **Download as CSV**.
5. Save it into a folder on your computer called something like
   `cpvs-backup-2026-08-27`.

Repeat for each table in the list above.

> This gives you a copy of your data. It is not a one-click restore — but if
> anything ever went badly wrong, having these files is the difference between
> "we can rebuild this" and "the records are gone."

### ☐ Also: write down where the emergency button is

If the app breaks at any point, the file
**`supabase/ROLLBACK_0015_0016.sql`** contains first-aid instructions,
organised by symptom ("students cannot check in", "coordinator cannot log
in", and so on). Open it now in VS Code (`Ctrl` + `P`, type `ROLLBACK`) and
read the first 25 lines so you know what's in there before you need it.

---

## Part 2 — Apply the first set of fixes (safe, do this any time)

This is migration **0015**. It fixes problems 1, 2, 4, 5 and 6 from the table
above. It does not require the app to be updated, and it does not stop students
checking in. You can do this in the middle of a clinical day if you want to.

### ☐ Step 2.1 — Open the file and skim it

Press `Ctrl` + `P`, type `0015`, press `Enter`.

The first 95 lines are an explanation in plain sentences. Read them if you'd
like. Notice the section headed **SAFETY / COMPATIBILITY** — it lists every
place in the app that was checked to make sure nothing that currently works
gets taken away.

### ☐ Step 2.2 — Copy the whole file

Click in the file, press `Ctrl` + `A`, then `Ctrl` + `C`.

### ☐ Step 2.3 — Run it in Supabase

1. Supabase dashboard → **SQL Editor** in the left sidebar.
2. Click **New query** (top left of that panel).
3. Click in the big empty area and press `Ctrl` + `V` to paste.
4. Click the green **Run** button (bottom right), or press `Ctrl` + `Enter`.

**What you should see:** a message like `Success. No rows returned`.

**If you see an error instead:** stop. Don't run anything else. Copy the exact
error message. Nothing has been half-applied in a damaging way — Supabase runs
the whole thing as one unit, so an error means nothing was changed.

### ☐ Step 2.4 — Check it worked

Click **New query** again, paste this in, and click **Run**:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('coordinators', 'profiles', 'attendance', 'notifications', 'appeals')
order by tablename, cmd;
```

Look down the `policyname` column. **You should NOT see** a row called
`coordinators_write_self` and **you should NOT see** one called
`notifications_insert_system`. Those two were the holes. If they're gone, the
fix took.

Now check the storage folders exist. New query, paste, Run:

```sql
select id, public from storage.buckets order by id;
```

You should see two rows: `appeal-files` (public = false) and **`profile-photos`
(public = true)**. That second one is new — it's the folder that never existed,
which is why photo upload never worked.

### ☐ Step 2.5 — Test the app briefly

Open the app as it is now (you haven't changed the app yet, only the database).

- Log in as a **coordinator** → does the dashboard load? Can you see students?
- Log in as a **student** → does the dashboard load? Can you see your rotation?
- As a student, **check out** if you have an open check-in today → does it work?

If all of that works, Part 2 is done and five of the six problems are fixed.

---

## Part 3 — Update the absence-marking job

The job that automatically marks students absent had **no check on who was
allowed to run it**. Any student's login was enough to trigger it — which meant
a student could have marked their entire class absent for any past date, and
sent them all real-looking "You were marked absent" notifications.

It now checks that the caller is either the automatic scheduler or an active
coordinator with attendance permission.

Two other things in the same file were fixed:

- If even one student's record clashed while the job was running, the whole
  batch was rejected — **nobody** got marked absent, and no notifications went
  out. Now only the clashing record is skipped.
- Students no longer get a "You were marked absent" message for a day they
  actually attended (this could happen if they checked in at the exact moment
  the job ran).

### ☐ Step 3.1 — Deploy it

Open the VS Code terminal (**Terminal** → **New Terminal**) and type this,
then press `Enter`:

```
supabase functions deploy mark-absences
```

Wait for it to finish. You're looking for the word **Deployed** near the end.

> **If it says `supabase: command not found`** — the Supabase tool isn't
> installed on this computer. Use `npx supabase functions deploy mark-absences`
> instead (the `npx` version downloads it for you).
>
> **If it asks you to log in**, type `supabase login` and press Enter, then
> follow the link it prints.

### ☐ Step 3.2 — Test it

1. Log in to the app as a **coordinator**.
2. Go to the coordinator dashboard.
3. Click **Check for missed check-ins** (or whatever that button is labelled on
   your dashboard).
4. It should work exactly as before and report how many students it checked.

If it now says *"You don't have permission to run the absence check"* while
logged in as a coordinator, that coordinator is either marked inactive or
doesn't have the **manage attendance** permission. Give them that permission
from the coordinators page, or use a Super Coordinator account.

---

## Part 4 — ⚠ The one step with timing ⚠

This is migration **0016**, and it fixes problem 3 — the big one. It moves the
check-in decision off the student's phone and into the database. The database
now decides the date, the time, the distance to the hospital, and whether the
student is present, late, or very late. The phone only reports where it thinks
it is, and the server checks that claim.

**Because of that, the database and the app must be updated together.**
Migration 0016 takes away the app's old way of recording attendance. The new
app build uses the new way. In between, check-in doesn't work.

### ☐ Step 4.1 — Find a safe window

Run this in the Supabase SQL Editor:

```sql
select name, checkin_start_time, session_expires_at
from hospitals
order by checkin_start_time;
```

Look at the **earliest** `checkin_start_time` and the **latest**
`session_expires_at` in the results. Do Part 4 either:

- **before** that earliest start time (early morning), or
- **after** that latest expiry time (evening),

and ideally on a day that isn't a clinical day at all. Check your clinical days
with:

```sql
select * from clinical_days_config;
```

The columns marked `true` are the clinical days.

### ☐ Step 4.2 — Build the new app first, before touching the database

Doing the build first means the gap is as short as possible. In the VS Code
terminal:

```
npm run build
```

This takes a minute or two. **You must see it finish without errors.** If it
prints red error text, stop here — do not go on to Step 4.3. Nothing has
changed yet, so you're safe; just report the error.

### ☐ Step 4.3 — Apply migration 0016

1. In VS Code, press `Ctrl` + `P`, type `0016`, press `Enter`.
2. Read the box at the very top marked **ORDERING WARNING** — it says the same
   thing this section does.
3. Click in the file, `Ctrl` + `A`, `Ctrl` + `C`.
4. Supabase dashboard → **SQL Editor** → **New query** → `Ctrl` + `V` → **Run**.
5. You want `Success. No rows returned`.

**From this moment, students cannot check in until Step 4.4 finishes.** Move
straight on.

### ☐ Step 4.4 — Put the new app live

How you do this depends on how your app is hosted. This project has a
`vercel.json` file, so it's set up for **Vercel**.

**If your Vercel project is connected to GitHub** (most likely): pushing your
code is the deploy. In the VS Code terminal:

```
git add -A
git commit -m "Security fixes: server-side check-in, RLS hardening"
git push
```

Then go to **https://vercel.com/dashboard**, open your project, and watch the
deployment. When it says **Ready**, the new app is live.

**If you deploy manually:** run `npx vercel --prod` in the terminal, or upload
the `dist` folder through the Vercel dashboard.

**If you also ship the Android app** (this project uses Capacitor): the website
deploy above is what students using the web app get. The Android app needs its
own rebuild and store update, which takes longer — so if students are using the
Android app, **plan Part 4 around the Android release**, not the website.

### ☐ Step 4.5 — Check the new check-in works, immediately

Do this yourself, standing inside one of the hospitals' geofences, on a
clinical day, during check-in hours. There is no substitute for this test.

1. Log in as a student.
2. Open the check-in page → **Verify my location**.
3. It should show your distance to the hospital.
4. Tap **Check in now**.
5. The status should appear (present / late / very late).

Then check the record landed correctly. In the Supabase SQL Editor:

```sql
select date, status, check_in_time, check_in_lat, check_in_lng
from attendance
order by created_at desc
limit 5;
```

The newest row should be yours, with today's date and a sensible time.

### ☐ Step 4.6 — Confirm it now refuses a fake check-in

This is the whole point of the change, so it's worth confirming. From **outside
any hospital's radius** — your home is fine — log in as a student and try to
check in.

You should get a clear message: *"You are 4,312 metres from Black Lion
Hospital. You must be within 200 metres to check in."*

Before this fix, that check happened on the phone and could be bypassed. Now
the refusal comes from the server, and there is nothing the phone can say to
change its mind.

---

## Part 5 — Final checklist

Go through these once. Tick each one.

**As a student:**

- ☐ Log in
- ☐ Dashboard loads, shows your rotation and hospital
- ☐ Check-in page shows your distance to the hospital
- ☐ Check in works (inside the radius, on a clinical day, in hours)
- ☐ Check out works
- ☐ Checking in from outside the radius is **refused with a clear message**
- ☐ Submit an appeal with a file attached → the upload works
- ☐ **Upload a profile photo → it appears** (this has never worked before)
- ☐ Change your password → it works, and you aren't asked to change it again

**As a coordinator:**

- ☐ Log in
- ☐ Dashboard loads, today's numbers look right
- ☐ Attendance management page loads
- ☐ Correcting a student's attendance status works
- ☐ Viewing an appeal's attached file works
- ☐ Approving an appeal **actually changes the student's record to excused** —
  check the student's attendance afterwards, don't just trust the appeal status
- ☐ Sending an announcement works, and students receive the notification
- ☐ "Check for missed check-ins" works

**On the coordinators page (as a Super Coordinator):**

- ☐ You can still change another coordinator's permissions
- ☐ You **cannot** change your own permissions (this is intentional — it stops
  a coordinator locking everyone else out)

---

## Part 6 — If something goes wrong

**First: don't panic and don't start running SQL you found online.**

1. Write down the **exact** error message a user sees. The messages in this
   system are written to be readable — *"You have already checked in today"*
   means something different from *"permission denied for table attendance"*,
   and the wording tells whoever helps you exactly where to look.
2. Open **`supabase/ROLLBACK_0015_0016.sql`** in VS Code
   (`Ctrl` + `P`, type `ROLLBACK`).
3. Find the section whose **SYMPTOM** heading matches what you're seeing.
4. Follow that section's instructions.

Each section is deliberately separate so you can undo *only* the one thing
causing trouble, and keep the rest of the protection. Every section also states
plainly what security you're giving up by running it — read that part.

The most likely problem by far: **students can't check in and get a permissions
error.** That almost always means migration 0016 was applied but the new app
build isn't live yet. The correct fix is to finish Step 4.4, not to roll back.

---

## Part 7 — Optional cleanup (nothing here is urgent)

These are housekeeping items. None of them affect security or fix a bug — skip
them entirely if you'd rather not.

### 7a. Stop your database password file being tracked by Git

The folder `supabase/.temp/` holds local Supabase working files that shouldn't
be shared. In the VS Code terminal:

```
git rm -r --cached supabase/.temp
echo "supabase/.temp/" >> .gitignore
git add .gitignore
git commit -m "Stop tracking supabase/.temp"
```

### 7b. Let the code catch database mistakes for you

Right now the code doesn't know your database's shape, so a typo in a column
name only shows up when a page breaks in front of a user. This makes those
mistakes appear in VS Code instead, as you type. In the terminal:

```
supabase gen types typescript --linked > src/types/supabase-generated.ts
```

Then ask a developer to wire it into `src/lib/supabase.ts`. It's a two-line
change but it needs someone who can read the file.

### 7c. Refresh the schema reference file

`supabase/schema.sql` is a written description of the database, and it is now
out of date — it still shows the old, insecure permissions. It isn't used to
run anything, so this is cosmetic, but anyone reading it to understand the
system would be misled. Regenerating it needs a developer.

### 7d. Check where this project's Git repository actually starts

Your `git status` shows files from an unrelated project (`eden-portfolio`)
mixed in with this one, which suggests the Git repository was started at your
Desktop folder rather than inside the project. That means "commit everything"
commits both projects together. Worth having someone sort out before it causes
confusion.

---

## Appendix A — Every file that changed

**New database migrations** (you apply these — Parts 2 and 4):

| File | What it does |
|---|---|
| `supabase/migrations/0015_rls_hardening.sql` | Fixes problems 1, 2, 4, 5, 6. Safe on its own. |
| `supabase/migrations/0016_server_side_checkin.sql` | Fixes problem 3. Must go live with the app. Also now requires a valid biometric verification pass (migration 0014) before it will write a check-in row. |

**New emergency file** (you only use this if something breaks):

| File | What it does |
|---|---|
| `supabase/ROLLBACK_0015_0016.sql` | First aid, organised by symptom. |

**Changed server code** (Part 3 deploys this):

| File | What changed |
|---|---|
| `supabase/functions/mark-absences/index.ts` | Now checks who is calling it. Also no longer skips the whole batch when one record clashes, and no longer sends "marked absent" messages for days a student attended. |

**Changed app code** (Part 4's build includes all of this):

| File | What changed |
|---|---|
| `src/utils/attendanceApi.ts` | **New.** The app's only route for recording attendance — it asks the database to do it. Also carries the biometric method/selfie path/match distance through as audit fields. |
| `src/utils/addisDate.ts` | **New.** One correct answer to "what day is it in Addis Ababa". |
| `src/pages/student/Attendance.tsx` | Check-in and check-out now ask the database instead of writing the record themselves. Also fixed a case where a student with two overlapping rotations got a blank page. The fingerprint/Face ID/selfie step from migration 0014 still runs first, unchanged from the student's point of view — it now hands its result to the database call instead of building the record itself. |
| `src/pages/student/StudentDashboard.tsx` | Uses Ethiopian time, not world time. |
| `src/pages/coordinator/CoordinatorDashboard.tsx` | Uses Ethiopian time, not world time. |
| `src/pages/ChangePassword.tsx` | Removed leftover debugging code that printed to the browser console. |
| `src/pages/student/Profile.tsx` | Photo upload failures now show you an error instead of silently doing nothing. |

---

## Appendix B — For whoever edits this code next

If you are a developer picking this up later, two things are load-bearing and
easy to undo by accident:

1. **`src/pages/student/Attendance.tsx` must keep calling `checkIn()` and
   `checkOut()` from `src/utils/attendanceApi.ts`.** Migration 0016 revoked the
   client's INSERT permission on `attendance`, so a rewrite of this page that
   goes back to `supabase.from('attendance').insert(...)` will not fail a code
   review or a type check — it will fail in a hospital car park. If you
   redesign this page, keep those two calls.

2. **`prevent_student_attendance_tamper()` in migration 0015 has an escape
   hatch** — a transaction-local setting called `cpvs.trusted_write` that
   `check_in()` and `check_out()` set before writing. If you add another
   server-side function that writes to `attendance` on a student's behalf, it
   needs `perform set_config('cpvs.trusted_write', 'on', true);` too, or the
   trigger will block it. It has to stay transaction-local (`true` as the third
   argument) — that's what makes it impossible to set from a browser.

Both migrations end with a commented-out **VERIFICATION** block of SQL you can
paste into the SQL Editor to confirm the current state of the database.
