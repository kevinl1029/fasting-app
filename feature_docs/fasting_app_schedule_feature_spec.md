# Schedule Feature — Product Specification

**Doc Status:** Draft v1.2  
**Product Area:** Core Fasting Experience  
**Primary Stakeholders:** PM, Design, iOS/Android/Web Eng, Backend Eng, Data, QA  
**Related Docs:** Timer Screen Spec, Fasting Log Spec, Post-Onboarding Nav, Visual Fasting Timer, Fat Loss Forecaster, PRD, Dashboard

---

## 1) Problem & Goals
**Problem.** New and existing fasters often follow recurring patterns (e.g., Mon–Wed 68h, Fri 48h, weekend eating windows), but most apps only track ad-hoc fasts. Users need a reliable way to **plan, view, and adhere to a recurring fasting schedule** that integrates with the live timer and their log, handles travel/time-zone shifts, and flexes for real life.

**Goals**
- Let users **create a weekly recurring fasting schedule** with one or more fasting blocks and feeding windows.
- **Start/skip/shift** any scheduled fast without breaking the plan.
- **Sync** with the Timer (one source of truth) and **auto-create Log entries** when scheduled fasts complete.
- Provide **actionable notifications** and **milestone education** aligned to scheduled phases (glycogen → ketosis, etc.).
- **Travel-proof**: graceful handling of time-zone changes and DST.
- **Metrics**: adherence, total planned vs. completed hours, variance from forecast.
- **Forecast link:** Provide a lightweight preview of the user’s projected body weight and fat % trajectory, with deep link to Dashboard for detailed view.

**Non-Goals (v1):** Calorie targets, meal plans, and complex calendar sharing.

---

## 2) Key User Stories
1. *As a planner*, I can define **recurring fasting blocks** (e.g., Start Tue 20:00 → Fri 16:00 weekly) so I don’t have to set the timer manually each time.
2. *As a traveler*, when I change time zones, my upcoming schedule **adjusts predictably** with clear explanations.
3. *As a flexible faster*, I can **snooze**, **shift**, or **start early** without deleting the plan.
4. *As a data-driven user*, I can see **planned vs. actual** hours per week and per block.
5. *As a learner*, I receive **contextual tips** at scheduled milestones.
6. *As a motivated user*, after setting my schedule, I can see a **preview of my forecast trajectory** and explore full projections in the Dashboard.
7. *As a forgetful user*, I get a nudge **before** a scheduled start and a **grace window** to cancel/adjust.

---

## 3) Scope & Definitions
- **Schedule:** A **recurring weekly template** composed of one or more **Fasting Blocks** and **Feeding Windows**. The week anchor is configurable (defaults to local Monday).
- **Fasting Block:** Start Day+Time → End Day+Time, recurring weekly. Examples: (Wed 20:00 → Sat 16:00), (Sun 20:00 → Mon 20:00).
- **One-off Override:** A single upcoming instance that deviates from the recurrence (skip, shift, extend, shorten, or start early).
- **Grace Window:** Configurable period (default 60 min) around scheduled start to confirm, cancel, or shift.
- **Forecast Preview:** A simplified projection (headline + sparkline) displayed after schedule confirmation, linking to the Dashboard’s Forecast view.

---

## 4) UX / UI
### 4.1 Entry Points
- **Nav Tab:** *Schedule* (primary tab; Timer remains center/home per nav spec).
- **Timer Screen:** If no active fast and a start is within 6h → show **“Upcoming: Wed 20:00”** with CTA to Edit/Start Early.
- **Onboarding Path:** After Fat Loss Forecaster and account creation, present **Schedule Builder** (or “Start now”).

### 4.2 Schedule Home
- **Weekly Grid View** (7 days × 24h, zoomable): Colored bands for fasting vs. feeding. Tap to open block details.
- **List View** (toggle): “Wed 20:00 → Sat 16:00, 68h (Next: Sep 3)”.
- **Metrics Header:** Planned hours this week, # blocks, adherence last 4 weeks.
- **Actions:** + Add Block, Manage Overrides, Pause All (vacation), Time-zone mode.

### 4.3 Create / Edit Fasting Block
- **Form:**
  - Name (optional)
  - Start Day & Time (picker)
  - End Day & Time (picker)
  - Repeat: Weekly (v1), future: biweekly presets
  - **Notifications:** Pre-start reminder (e.g., 3h & 30m), Start confirmation, Milestones
  - **Time-zone Behavior:** *Stick to local clock* (default) **or** *Anchor to origin TZ*
- **Validation:** Prevent overlaps; offer **auto-resolve** (merge, trim, or allow overlap with precedence).
- **Preview:** Shows next 4 occurrences in user’s current TZ.

### 4.4 Overrides & Quick Actions
- From an upcoming instance: **Skip once**, **Shift start** (+/− X hours), **Shorten/Extend** by X hours, **Start now**, **Start early**.
- From an active fast: **Convert to ad-hoc** (detach from schedule), **End now**, **Adjust start time** (writes to Log).

**Start Early Flow**
- If a user taps **Start Fast** in the Timer before the scheduled start:
  - System detects a scheduled fast within the next 12h.
  - Prompt: *“Do you want to start your scheduled fast early? This will update today’s plan.”*
  - **Yes** → Scheduled instance is shifted to the new start time, end time remains proportional to planned duration.
  - **No** → A new ad-hoc fast begins, detached from the schedule (but still logged).

### 4.5 Forecast Preview & Handoff
- After user saves a schedule (new or edited):
  - Show a **confirmation screen** with weekly summary and a **Forecast Preview module**.
  - Preview includes: *Projected goal date, body weight & body fat trajectory sparkline*.
  - CTA: “See Full Forecast” → navigates to **Dashboard → Forecast view**.
  - Ensures smooth handoff: *Schedule = plan input, Dashboard = results & projections.*

### 4.6 Notifications
- **Pre-Start:** T-3h and T-30m (configurable). CTA: Start early, Snooze 1–12h, Skip once.
- **Start Window:** At T-0, confirm start; if user does nothing, **auto-start** at T+Grace (configurable) or require explicit confirmation (setting).
- **Milestones:** Glycogen depletion, ketosis onset, deep ketosis checkpoint; links to Learning Hub.
- **End:** T-0 end reminder with celebratory summary and Log link.

### 4.7 Empty / Edge States
- No schedule yet → **Template chooser** (e.g., 16:8, OMAD, 24h 2×/wk, 48h mid-week, 68h+48h cadence) and **Custom**.
- Traveling across time zones → banner explaining current **TZ mode** with change option.
- DST change week → banner and preview differences.

---

## 5) Behavioral Rules
1. **One Source of Truth:** If a scheduled fast is active, the **Timer** reflects it. Ad-hoc timer starts during a scheduled window will **attach** to that instance unless the user opts to keep ad-hoc.
2. **Auto Logging:** At scheduled end, the app creates a **Log** entry (planned vs. actual). Manual edits post-hoc are allowed via Log spec.
3. **Conflicts:**
   - Overlapping blocks → user must resolve (merge/trim). If forced, last-saved block wins precedence.
   - Mid-fast edits: applying changes **does not** retroactively alter the currently active instance unless explicitly chosen.
4. **Grace Window:** If *auto-start* is on, timer flips to active at **T + grace** unless user cancels.
5. **Start Early Rule:** Early starts initiated from the Timer update the scheduled instance unless the user chooses ad-hoc mode.
6. **Forecast Preview Rule:** Forecast projections are displayed only in confirmation step and Dashboard, not embedded persistently in Schedule.
7. **Time-Zone Modes:**
   - **Local Clock (default):** The 20:00 start always occurs at 20:00 local time wherever the user is (instances shift in UTC).
   - **Anchor to Origin TZ:** The instance occurs at the original UTC time; local clock time may differ when traveling.
   - Users can set mode **per block**.

---

## 6) Data Model (v1)
**Entities**
- `Schedule` { id, user_id, week_anchor (Mon=1..Sun=7), is_paused, created_at, updated_at }
- `FastingBlock` { id, schedule_id, name, start_dow (0–6), start_time (HH:mm), end_dow (0–6), end_time (HH:mm), tz_mode (local|anchor), anchor_tz, notifications: {pre_start:[hrs], start_grace_mins:int, milestones:boolean}, is_active }
- `Override` { id, block_id, occurrence_date (YYYY-MM-DD), type (skip|shift|extend|shorten|custom_times|start_early), payload, reason }
- `PlannedInstance` (materialized or computed) { id, block_id, start_at_utc, end_at_utc, source:scheduled, status (upcoming|active|completed|skipped|missed) }
- `FastSession` (shared with Timer/Log) { id, user_id, start_at, end_at, source (scheduled|adhoc), planned_instance_id? }
- `ForecastPreview` (derived, not stored) { planned_hours_per_week, projected_goal_date, projected_weight_curve, projected_body_fat_curve }

**Notes**
- Start early is represented as an **Override** linked to a block.
- Forecast preview is generated from **Forecaster engine** using planned weekly hours as input.
- `tz_mode` defaults to `local` with `anchor_tz` set at creation for reference.

---

## 7) API (illustrative)
- `GET /schedule` → schedule, blocks, next instances
- `POST /schedule/blocks` → create block
- `PATCH /schedule/blocks/:id` → update block; optional `apply_to_current` flag
- `POST /schedule/blocks/:id/overrides` → one-off changes (skip, shift, extend, shorten, start_early)
- `POST /schedule/preview` → returns next N occurrences for given draft
- `POST /schedule/forecast-preview` → returns lightweight trajectory based on planned weekly hours
- `POST /instances/:id/actions` → { start_now, start_early, skip_once, shift:{hours}, extend:{hours}, shorten:{hours} }

---

## 8) Integrations
- **Timer:** Reads the active planned instance; provides controls (end, extend, start early); shows milestone cards.
- **Fasting Log:** Auto-writes completed sessions; supports edits per Log spec.
- **Fat Loss Forecaster:**
  - Provides engine for projecting body fat/weight trajectories.
  - Forecast preview uses the same engine, seeded with planned schedule.
- **Dashboard:** Full Forecast view displays detailed graphs and progress vs. projection.
- **Learning Hub:** Pushes milestone-aligned education.
- **Affiliate hooks (contextual):** Pre-start and mid-fast prompts for scale/DEXA when helpful (guardrails to avoid spam).

---

## 9) Edge Cases & Rules of Thumb
- **Partial Overlaps:** If a block ends after another starts, prompt to merge or trim the overlap.
- **Manual End Early:** Log actual; keep plan intact.
- **Missed Start:** If auto-start off and user takes no action, mark instance **missed** (option to retro-start in Log).
- **DST:** Show preview and tooltip explaining 23/25h days.
- **Travel:** On TZ change, surface a **before/after** preview for the next 2 weeks and persistent banner.
- **Multiple Devices:** Conflict resolution via last-write-wins with server timestamps; warn on concurrent edits.

---

## 10) Privacy & Safety
- Local notifications respect **Quiet Hours**.  
- Health disclaimers for extended fasts; link to resources.  
- No medical advice positioning; clear opt-in to long fast templates.

---

## 11) Analytics & Success Metrics
**Core:**
- Schedule adoption rate (% users with ≥1 block)
- Weekly planned hours vs. actual (ratio)
- 4-week adherence trend
- Snooze/skip/start early rates; missed starts
- Forecast preview usage (views, CTR to Dashboard)
- Churn correlation with adherence

**Secondary:**
- Forecast accuracy improvement when a schedule is set
- Notification engagement (pre-start CTR, milestone opens)

---

## 12) Experiments & Roadmap
**v1 (this spec):** Weekly recurring blocks, overrides, notifications, TZ modes, grid/list views, Timer & Log integration.

**v1.1:** Start Early flow integrated into Timer, Forecast Preview handoff to Dashboard, calendar export (read-only ICS), holiday smart-suggestions, schedule templates library.

**v1.2:** Multi-week/periodic patterns (e.g., 3-on/1-off cycles), shared schedules with accountability partners.

**Future:** Auto-tuning suggestions based on adherence and recovery; coach integrations.

---

## 13) QA Scenarios (sample)
- Create 68h mid-week + 48h Fri block; verify grid, list, and next instances.
- Change TZ by −8h (simulated); verify Local vs. Anchor behaviors.
- Overlap two blocks; accept **merge** suggestion → single continuous block.
- Miss pre-start confirmation with auto-start on → timer starts at T+grace.
- Shift an upcoming start by +6h; confirm preview and notifications update.
- Start early from Timer → scheduled instance shifts, confirm Log and Dashboard reflect planned vs. actual.
- Save schedule → verify Forecast Preview displays, CTA leads to Dashboard.
- End early; ensure Log writes planned vs. actual and forecast delta updates.

---

## 14) Open Questions
- Default **grace window** length? (30 vs. 60 min)
- Should **auto-start** be default **off** for safety? (likely yes)
- Do we need a **hard cap** template guardrail for very long blocks (e.g., >72h) in v1?
- Should Forecast Preview also appear in Schedule home header, or only post-confirmation?

---

## 15) Acceptance Criteria (v1)
- Users can create, edit, and delete weekly fasting blocks without overlaps.
- Time-zone mode clearly indicated per block with accurate previews.
- Notifications fire reliably and are actionable.
- Timer reflects scheduled state; completing a scheduled fast auto-creates a Log entry with planned vs. actual.
- Users can start early from Timer, with clear choice between updating schedule vs. logging as ad-hoc.
- After saving a schedule, users see a Forecast Preview with CTA to Dashboard.
- Analytics events captured for adoption, adherence, overrides, and forecast preview engagement.

