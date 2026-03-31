-- ============================================================
-- Avent Swim Club — Cleanup Functions
-- Called by the midnight background job via the backend.
-- ============================================================

-- Delete chat_messages older than 48 hours
create or replace function cleanup_old_messages()
returns integer language plpgsql as $$
declare
  deleted_count integer;
begin
  delete from chat_messages
  where created_at < now() - interval '48 hours';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function cleanup_old_messages is 'Deletes chat_messages older than 48h. Called by midnight job.';


-- Delete group_window rows that have expired
create or replace function cleanup_expired_group_window()
returns integer language plpgsql as $$
declare
  deleted_count integer;
begin
  delete from group_window
  where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function cleanup_expired_group_window is 'Deletes expired group_window rows. Called by midnight job.';


-- Delete guest sessions that have been inactive for more than 24 hours
create or replace function cleanup_stale_guest_sessions()
returns integer language plpgsql as $$
declare
  deleted_count integer;
begin
  delete from sessions
  where session_type = 'guest'
    and last_active_at < now() - interval '24 hours';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function cleanup_stale_guest_sessions is 'Deletes inactive guest sessions older than 24h.';


-- Upsert today''s daily workout (insert or replace if already exists)
create or replace function upsert_daily_workout(
  p_workout_date    date,
  p_content         jsonb,
  p_news_hook       text,
  p_model_version   text,
  p_generation_ms   integer
)
returns daily_workouts language plpgsql as $$
declare
  result daily_workouts;
begin
  insert into daily_workouts (workout_date, content, news_hook, model_version, generation_ms)
  values (p_workout_date, p_content, p_news_hook, p_model_version, p_generation_ms)
  on conflict (workout_date) do update
    set content = excluded.content,
        news_hook = excluded.news_hook,
        model_version = excluded.model_version,
        generation_ms = excluded.generation_ms,
        generated_at = now()
  returning * into result;
  return result;
end;
$$;

comment on function upsert_daily_workout is 'Insert or update today''s workout. Safe for concurrent calls.';
