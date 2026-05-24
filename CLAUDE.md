# Wonder Kids SME — School Management App

## What This App Is
A POS-style school management system for a small tutoring school in Thailand ("Wonder Kids"). Built for older teachers who need large touch targets, simple navigation, and bilingual (English + Thai) support. It handles student enrollment, attendance tracking via QR codes, course management, billing, and parent communication via LINE OA.

## Tech Stack
- **Frontend**: React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS 4
- **State**: TanStack React Query 5 (server state) + React Context (auth only)
- **UI**: HeadlessUI (dialogs), Heroicons (icons), Framer Motion (animations)
- **Backend**: Supabase (Postgres, Auth, Realtime, Storage, Edge Functions)
- **i18n**: i18next (en.json + th.json)
- **Deploy**: Vercel (auto-deploys from GitHub main branch)
- **Supabase Project ID**: `gsicrcogciklihyflhtc`

## Architecture Rules

### Roles & Access
- Two roles: `admin` and `staff` (stored in `profiles.role`)
- **Admin-only pages**: Inbox, Settings, Billing, Reports, Messaging (guarded by `AdminRoute`)
- **Admin-only features**: Approval panel on HomePage, messaging settings/templates, unlinked accounts
- Staff see: Dashboard, Attendance, Students, Courses, More
- Client-side role checks are backed by Supabase RLS using `current_school_id()`

### Multi-School
- Every table has `school_id` column with RLS via `current_school_id()` function
- A super-admin architecture is planned but NOT yet implemented (see memory)
- Currently single-school usage

### LINE OA Integration
- **Webhook**: `line-webhook` edge function (v8) — captures follow/message/unfollow events
  - Follow/message from unknown user → stores in `unlinked_line_users` with profile pic
  - Follow/message from linked user → auto-fills `picture_url` on `line_connections` if missing
  - Unfollow → deletes from both `line_connections` and `unlinked_line_users`
  - Signature verification happens BEFORE any database operations
  - School ID in webhook URL must be a valid UUID
- **Message sending**: `send-line-messages` edge function (v5) — processes queued notifications
  - Runs via cron, claims notifications before processing (idempotent)
  - Batch-verifies attendance records exist (not N+1)
  - Auto-cleans sent notifications > 7 days, read in-app notifications > 30 days
- **Follower sync**: `sync-line-followers` edge function — fetches all follower IDs from LINE API
  - Requires verified/premium LINE OA (free plan returns 403)
  - Uses JWT auth (admin only)
- **Linking flow**: Admin matches unlinked LINE profiles to students via dropdown in MessagingPage or StudentProfilePage
  - Stores `display_name` and `picture_url` in `line_connections`
  - Optional welcome message controlled by `auto_link_notify` toggle in `line_config`
  - Welcome message uses editable template from `line_config.message_templates.link_welcome`
- **No auto-reply messages** — webhook silently captures profiles only

### Notification System
- **In-app**: `notifications` table, realtime subscription in Layout header bell
- **LINE**: `pending_line_notifications` table, processed by `send-line-messages` cron
- **Trigger functions** (all use templates from `line_config.message_templates`):
  - `queue_checkin_line_notification` — on attendance INSERT, sends immediately (no delay)
  - `queue_overlimit_line_notification` — when student exceeds purchased hours
  - `queue_enrollment_line_notification` — when student enrolled in course
  - `queue_renewal_approved_line_notification` — when renewal approved
- Name format in notifications: `nick_name || ' ' || first_name` (NOT last_name)
- Templates use `{{placeholder}}` syntax, replaced by `apply_template()` function

### Message Templates
- Stored in `line_config.message_templates` as JSONB
- Template types: `checkin`, `renewal_approaching`, `overlimit`, `enrollment`, `approval`, `link_welcome`
- Placeholders: `{{name}}`, `{{course}}`, `{{time}}`, `{{used}}`, `{{purchased}}`, `{{remaining}}`, `{{added}}`, `{{school}}`
- Editable from MessagingPage settings modal (admin only)

## Key Data Tables

| Table | Purpose |
|-------|---------|
| `students` | Student records (nick_name, first_name, last_name, parent_phone, parent_line_id, qr_code_url) |
| `courses` | Course definitions with schedules and packages |
| `enrollments` | Student-course links with purchased_hours, status |
| `attendance` | Check-in records with hours, approval |
| `applications` | Admissions applications (pending → approved) |
| `application_changes` | Pending edit/renewal requests |
| `profiles` | User accounts (role, school_id, full_name, avatar_url) |
| `notifications` | In-app notification queue |
| `line_config` | LINE OA configuration per school (channel_id, secrets_configured, auto toggles, message_templates) |
| `line_connections` | Links students to LINE user IDs (display_name, picture_url) |
| `unlinked_line_users` | LINE followers not yet matched to students (display_name, picture_url) |
| `line_messages` | Admin-composed messages (broadcast, individual chat) |
| `pending_line_notifications` | Queued LINE notifications for cron delivery |

## Important Behaviors

### Attendance
- Over-attendance is ALLOWED with a warning toast — NEVER block check-in
- Check-in notifications send immediately (`send_after = now()`), no delay
- Attendance can be undone; notification is skipped if attendance record deleted before send

### Design
- Beautiful, modern, cute design with glass effects and spring animations
- Full-featured, not stripped down
- Large touch targets (56px min) for older teachers
- Bilingual messages to parents (English + Thai in same message)

### Code Organization
- Pages in `src/` root (flat structure)
- Hooks in `src/hooks/`
- Services in `src/services/`
- Admin-only pages lazy-loaded via `React.lazy()`: Inbox, Settings, Billing, Reports, Messaging, Admissions, Courses
- `SUPABASE_FUNCTIONS_URL` exported from `supabaseClient.ts` — never hardcode Supabase URLs

### Environment Variables
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_KEY` — Supabase anon key (public, safe for client)
- `.env` is gitignored
- Edge functions use `ALLOWED_ORIGIN` env var for CORS (defaults to `*` if unset)

## Component Splitting Guidance
Large pages should be decomposed into focused components/widgets:
- **StudentProfilePage** (~900 lines) → extract: EditStudentModal, DeleteStudentModal, AddCourseModal, RenewCourseModal, LateCheckInModal, LineConnectionCard, CourseEnrollmentCard
- **MessagingPage** (~950 lines) → extract: ChatView, UnlinkedAccountsSection, BroadcastModal, SettingsModal, TemplatesModal, ChatListItem
- **AttendancePage** (~550 lines) → extract: CourseGroup, StudentGrid, HourPickerModal, WalkInSearch
- **HomePage** (~335 lines) → extract: CheckInFeed, StatsCards, ApprovalBanner
- Shared components to create: GlassCard, SearchInput, ConfirmDialog, StudentDropdown
