-- ============================================================
-- Avent Swim Club — Initial Schema
-- Run this in Supabase SQL Editor (or via supabase CLI)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- MEMBERS
-- USMS-authenticated users only.
-- ============================================================
create table members (
  id                uuid        primary key default gen_random_uuid(),
  usms_number       text        not null unique,
  usms_verified     boolean     not null default false,
  usms_verified_at  timestamptz,
  display_name      text,
  preferences       jsonb       not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table members is 'USMS-authenticated swimmers. One row per unique USMS number.';
comment on column members.usms_number is 'Canonicalized: trimmed, uppercased. e.g. "1234-5678"';
comment on column members.preferences is 'Stroke preference, pool length, yardage goal, etc.';

-- Auto-update updated_at
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_updated_at
  before update on members
  for each row execute function touch_updated_at();


-- ============================================================
-- SESSIONS
-- Tracks guest and member sessions. Source of truth for JWTs.
-- ============================================================
create table sessions (
  id                      uuid        primary key default gen_random_uuid(),
  session_type            text        not null check (session_type in ('guest', 'member')),
  member_id               uuid        references members(id) on delete cascade,
  guest_id                uuid        unique,
  refresh_token_hash      text,
  refresh_token_expires_at timestamptz,
  migrated_at             timestamptz,
  created_at              timestamptz not null default now(),
  last_active_at          timestamptz not null default now()
);

comment on table sessions is 'One row per active session. Guest sessions have no member_id.';
comment on column sessions.guest_id is 'Client-generated UUID for guest sessions. NULL for members.';
comment on column sessions.migrated_at is 'Set when a guest session is upgraded to a member session.';
comment on column sessions.refresh_token_hash is 'bcrypt hash of the refresh token. One-time use.';

create index sessions_member_id_idx on sessions(member_id) where member_id is not null;
create index sessions_guest_id_idx on sessions(guest_id) where guest_id is not null;


-- ============================================================
-- SWIMMER PROFILES
-- Extended profile for each member. One-to-one with members.
-- ============================================================
create table swimmer_profiles (
  id                uuid        primary key default gen_random_uuid(),
  member_id         uuid        not null unique references members(id) on delete cascade,
  background        text,
  training_goals    text,
  preferences       text,
  key_learnings     text,
  notes             jsonb       not null default '[]',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table swimmer_profiles is 'Background, goals, and AI learnings per member. Always loaded into context.';
comment on column swimmer_profiles.notes is 'Array of dated note objects: [{date, entry, type}]';

create trigger swimmer_profiles_updated_at
  before update on swimmer_profiles
  for each row execute function touch_updated_at();


-- ============================================================
-- CALENDARS
-- Personal calendar entries and reminders per member.
-- ============================================================
create table calendars (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null references members(id) on delete cascade,
  title        text        not null,
  description  text,
  event_date   timestamptz,
  reminder_at  timestamptz,
  is_reminder  boolean     not null default false,
  completed    boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table calendars is 'Personal events and reminders. Always loaded into context.';

create index calendars_member_id_idx on calendars(member_id);
create index calendars_reminder_at_idx on calendars(reminder_at) where reminder_at is not null;

create trigger calendars_updated_at
  before update on calendars
  for each row execute function touch_updated_at();


-- ============================================================
-- CONTACTS
-- People mentioned by the swimmer during conversation.
-- ============================================================
create table contacts (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null references members(id) on delete cascade,
  name         text        not null,
  relationship text,
  context      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table contacts is 'People referenced in swimmer conversations. Always loaded into context.';

create index contacts_member_id_idx on contacts(member_id);

create trigger contacts_updated_at
  before update on contacts
  for each row execute function touch_updated_at();


-- ============================================================
-- WORKOUTS (COMPLETED)
-- Permanent record. Never deleted. One entry per workout per member.
-- ============================================================
create table workouts (
  id              uuid        primary key default gen_random_uuid(),
  member_id       uuid        not null references members(id) on delete cascade,
  workout_date    date        not null,
  yardage         integer,
  sets            jsonb       not null default '[]',
  notes           text,
  completed_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

comment on table workouts is 'Completed workouts. Permanent — never deleted.';
comment on column workouts.sets is 'Array of set objects logged during the session.';

create index workouts_member_id_date_idx on workouts(member_id, workout_date desc);


-- ============================================================
-- DAILY WORKOUTS (CACHED)
-- One row per calendar date. Shared across all members.
-- Generated once by AI, served to everyone.
-- ============================================================
create table daily_workouts (
  id              uuid        primary key default gen_random_uuid(),
  workout_date    date        not null unique,
  content         jsonb       not null,
  news_hook       text,
  generated_at    timestamptz not null default now(),
  model_version   text        not null,
  generation_ms   integer
);

comment on table daily_workouts is 'AI-generated daily workout. Cached per day. Shared across all users.';
comment on column daily_workouts.content is 'Structured workout: {purpose, sets: [{sets, distance, type, interval?, pace?}], total_yardage}';
comment on column daily_workouts.news_hook is 'One-sentence swimming news reference woven into the header.';

create index daily_workouts_date_idx on daily_workouts(workout_date);


-- ============================================================
-- CHAT MESSAGES
-- TTL: deleted after 48 hours by midnight cleanup job.
-- ============================================================
create table chat_messages (
  id            uuid        primary key default gen_random_uuid(),
  session_id    uuid        not null references sessions(id) on delete cascade,
  member_id     uuid        references members(id) on delete cascade,
  role          text        not null check (role in ('user', 'assistant')),
  content       text        not null,
  metadata      jsonb       not null default '{}',
  created_at    timestamptz not null default now()
);

comment on table chat_messages is 'Raw chat. Auto-deleted after 48h by midnight job. Guests store nothing after session ends.';
comment on column chat_messages.metadata is 'Token counts, model version, finish_reason, etc.';

create index chat_messages_session_created_idx on chat_messages(session_id, created_at desc);
create index chat_messages_member_created_idx on chat_messages(member_id, created_at desc)
  where member_id is not null;


-- ============================================================
-- COMMUNITY BULLETIN
-- Member-shared articles, events, meets. Pulled when relevant.
-- ============================================================
create table community_bulletin (
  id            uuid        primary key default gen_random_uuid(),
  member_id     uuid        not null references members(id) on delete cascade,
  title         text        not null,
  body          text,
  url           text,
  event_date    date,
  bulletin_type text        not null default 'article' check (bulletin_type in ('article', 'event', 'meet', 'announcement')),
  is_published  boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table community_bulletin is 'Member-contributed content. Shared. Pulled into context when relevant.';

create index community_bulletin_created_idx on community_bulletin(created_at desc);
create index community_bulletin_event_date_idx on community_bulletin(event_date) where event_date is not null;

create trigger community_bulletin_updated_at
  before update on community_bulletin
  for each row execute function touch_updated_at();


-- ============================================================
-- GROUP WINDOW
-- Post-workout messages shared with the group.
-- Auto-deleted after 24 hours.
-- ============================================================
create table group_window (
  id          uuid        primary key default gen_random_uuid(),
  member_id   uuid        not null references members(id) on delete cascade,
  content     text        not null,
  window_date date        not null default current_date,
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  created_at  timestamptz not null default now()
);

comment on table group_window is '24-hour post-workout share stream. Rows expire and are deleted by midnight job.';

create index group_window_expires_idx on group_window(expires_at);
create index group_window_date_idx on group_window(window_date desc);


-- ============================================================
-- FEEDBACK
-- Admin access only. Logged by background AI processing.
-- ============================================================
create table feedback (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        references members(id) on delete set null,
  category     text        not null default 'general' check (category in ('general', 'workout', 'ai', 'app', 'bug')),
  content      text        not null,
  sentiment    text        check (sentiment in ('positive', 'neutral', 'negative')),
  source_date  date        not null default current_date,
  created_at   timestamptz not null default now()
);

comment on table feedback is 'Admin-only. Extracted from chat by background AI processing.';

create index feedback_created_idx on feedback(created_at desc);
create index feedback_member_idx on feedback(member_id) where member_id is not null;


-- ============================================================
-- BACKGROUND JOBS
-- Audit log for midnight processing runs.
-- ============================================================
create table background_jobs (
  id            uuid        primary key default gen_random_uuid(),
  job_type      text        not null,
  status        text        not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  result        jsonb,
  error         text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

comment on table background_jobs is 'Audit log for all scheduled and background AI processing runs.';

create index background_jobs_status_idx on background_jobs(status);
create index background_jobs_created_idx on background_jobs(created_at desc);


-- ============================================================
-- ROW LEVEL SECURITY
-- Service role key bypasses RLS (used by backend only).
-- Anon/authenticated roles should never access this data directly.
-- ============================================================
alter table members            enable row level security;
alter table sessions           enable row level security;
alter table swimmer_profiles   enable row level security;
alter table calendars          enable row level security;
alter table contacts           enable row level security;
alter table workouts           enable row level security;
alter table daily_workouts     enable row level security;
alter table chat_messages      enable row level security;
alter table community_bulletin enable row level security;
alter table group_window       enable row level security;
alter table feedback           enable row level security;
alter table background_jobs    enable row level security;

-- No public access policies — backend uses service role key only.
-- Add member-scoped policies here if you ever expose Supabase directly to the client.
