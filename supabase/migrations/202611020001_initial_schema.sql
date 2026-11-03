-- SPDX-License-Identifier: GPL-3.0-only
-- Initial Musician schema: profiles, tracks, playlists, favorites and processing jobs.

create type public.track_provider as enum ('youtube', 'spotify', 'upload');
create type public.processing_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    display_name text,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.tracks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    provider public.track_provider not null,
    external_id text,
    source_url text,
    title text not null,
    artist text,
    album text,
    duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
    artwork_url text,
    video_id text,
    lyrics jsonb,
    lyrics_source text,
    original_storage_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tracks_provider_reference_check check (
        (provider = 'upload' and original_storage_path is not null)
        or (provider in ('youtube', 'spotify') and external_id is not null)
    )
);

create unique index tracks_user_provider_external_id_uidx
    on public.tracks (user_id, provider, external_id)
    where external_id is not null;
create index tracks_user_created_at_idx on public.tracks (user_id, created_at desc);

create table public.playlists (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null check (length(trim(name)) between 1 and 80),
    description text check (description is null or length(description) <= 500),
    is_public boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index playlists_user_created_at_idx on public.playlists (user_id, created_at desc);

create table public.playlist_tracks (
    playlist_id uuid not null references public.playlists (id) on delete cascade,
    track_id uuid not null references public.tracks (id) on delete cascade,
    position integer not null default 0 check (position >= 0),
    added_at timestamptz not null default now(),
    primary key (playlist_id, track_id)
);
create index playlist_tracks_order_idx on public.playlist_tracks (playlist_id, position);

create table public.favorites (
    user_id uuid not null references auth.users (id) on delete cascade,
    track_id uuid not null references public.tracks (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, track_id)
);

create table public.processing_jobs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    track_id uuid references public.tracks (id) on delete set null,
    task_type text not null check (task_type in ('separate_stems', 'transcribe_lyrics')),
    status public.processing_job_status not null default 'queued',
    input_storage_path text not null,
    output_storage_paths jsonb not null default '[]'::jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz
);
create index processing_jobs_user_created_idx on public.processing_jobs (user_id, created_at desc);
create index processing_jobs_queue_idx on public.processing_jobs (created_at)
    where status = 'queued';

-- Keep updated_at consistent for user-editable records.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger tracks_set_updated_at
before update on public.tracks
for each row execute function public.set_updated_at();
create trigger playlists_set_updated_at
before update on public.playlists
for each row execute function public.set_updated_at();

-- Create a profile whenever Supabase Auth creates a user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, display_name, avatar_url)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
        new.raw_user_meta_data ->> 'avatar_url'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- Row Level Security: private data is owned by the authenticated user.
alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.favorites enable row level security;
alter table public.processing_jobs enable row level security;

create policy "Profiles: read own profile" on public.profiles
    for select to authenticated using (id = (select auth.uid()));
create policy "Profiles: update own profile" on public.profiles
    for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

create policy "Tracks: users manage their own tracks" on public.tracks
    for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Playlists: users manage their own playlists" on public.playlists
    for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

create policy "Playlist entries: access only own playlist and track" on public.playlist_tracks
    for all to authenticated
    using (
        exists (
            select 1 from public.playlists p
            where p.id = playlist_id and p.user_id = (select auth.uid())
        )
        and exists (
            select 1 from public.tracks t
            where t.id = track_id and t.user_id = (select auth.uid())
        )
    )
    with check (
        exists (
            select 1 from public.playlists p
            where p.id = playlist_id and p.user_id = (select auth.uid())
        )
        and exists (
            select 1 from public.tracks t
            where t.id = track_id and t.user_id = (select auth.uid())
        )
    );

create policy "Favorites: users manage favorites for own tracks" on public.favorites
    for all to authenticated
    using (
        user_id = (select auth.uid())
        and exists (
            select 1 from public.tracks t
            where t.id = track_id and t.user_id = (select auth.uid())
        )
    )
    with check (
        user_id = (select auth.uid())
        and exists (
            select 1 from public.tracks t
            where t.id = track_id and t.user_id = (select auth.uid())
        )
    );

create policy "Processing jobs: users read their own jobs" on public.processing_jobs
    for select to authenticated
    using (user_id = (select auth.uid()));
create policy "Processing jobs: users enqueue jobs for themselves" on public.processing_jobs
    for insert to authenticated
    with check (
        user_id = (select auth.uid())
        and status = 'queued'
        and split_part(input_storage_path, '/', 1) = (select auth.uid()::text)
        and (
            track_id is null
            or exists (
                select 1 from public.tracks t
                where t.id = track_id and t.user_id = (select auth.uid())
            )
        )
    );
-- Only the trusted worker (service role) updates job status/output fields.
-- User cancellation can be added later through a narrowly-scoped RPC.

-- Private buckets. Input files are user-uploaded; output files are written by the worker.
insert into storage.buckets (id, name, public)
values ('audio-inputs', 'audio-inputs', false), ('audio-outputs', 'audio-outputs', false)
on conflict (id) do nothing;

create policy "Audio inputs: users manage their own files" on storage.objects
    for all to authenticated
    using (
        bucket_id = 'audio-inputs'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    )
    with check (
        bucket_id = 'audio-inputs'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );

create policy "Audio outputs: users read their own results" on storage.objects
    for select to authenticated
    using (
        bucket_id = 'audio-outputs'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
    );
