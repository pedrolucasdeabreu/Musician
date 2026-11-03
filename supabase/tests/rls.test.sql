-- SPDX-License-Identifier: GPL-3.0-only
-- Verify that authenticated users can only see and modify their own records.
-- Only run against a disposable, isolated database; never run in production.

begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

-- Two test users. The profile trigger in the migration creates their profiles.
insert into auth.users (id, email)
values
    ('11111111-1111-4111-8111-111111111111', 'user-a@musician.test'),
    ('22222222-2222-4222-8222-222222222222', 'user-b@musician.test');

insert into public.tracks (id, user_id, provider, external_id, title)
values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'youtube', 'video-a', 'User A track'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'spotify', 'track-b', 'User B track');

insert into public.playlists (id, user_id, name)
values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', '11111111-1111-4111-8111-111111111111', 'User A playlist'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc', '22222222-2222-4222-8222-222222222222', 'User B playlist');

insert into public.playlist_tracks (playlist_id, track_id, position)
values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0);

insert into public.favorites (user_id, track_id)
values
    ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.processing_jobs (id, user_id, task_type, input_storage_path)
values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac', '11111111-1111-4111-8111-111111111111', 'separate_stems', '11111111-1111-4111-8111-111111111111/input.wav'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd', '22222222-2222-4222-8222-222222222222', 'transcribe_lyrics', '22222222-2222-4222-8222-222222222222/input.wav');

-- Authenticate as User A.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
    'select count(*)::bigint from public.profiles',
    array[1::bigint],
    'User A sees only their profile'
);
select results_eq(
    'select count(*)::bigint from public.tracks',
    array[1::bigint],
    'User A sees only their track'
);
select results_eq(
    'select count(*)::bigint from public.playlists',
    array[1::bigint],
    'User A sees only their playlist'
);
select results_eq(
    'select count(*)::bigint from public.playlist_tracks',
    array[1::bigint],
    'User A sees only entries in their playlist'
);
select results_eq(
    'select count(*)::bigint from public.favorites',
    array[1::bigint],
    'User A sees only their favorites'
);
select results_eq(
    'select count(*)::bigint from public.processing_jobs',
    array[1::bigint],
    'User A sees only their processing jobs'
);

-- Switch identity without leaving the authenticated database role.
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
    'select count(*)::bigint from public.profiles',
    array[1::bigint],
    'User B sees only their profile'
);
select results_eq(
    'select count(*)::bigint from public.tracks',
    array[1::bigint],
    'User B sees only their track'
);
select results_eq(
    'select count(*)::bigint from public.playlists',
    array[1::bigint],
    'User B sees only their playlist'
);
select results_eq(
    'select count(*)::bigint from public.playlist_tracks',
    array[1::bigint],
    'User B sees only entries in their playlist'
);
select results_eq(
    'select count(*)::bigint from public.favorites',
    array[1::bigint],
    'User B sees only their favorites'
);
select results_eq(
    'select count(*)::bigint from public.processing_jobs',
    array[1::bigint],
    'User B sees only their processing jobs'
);

select is_empty(
    $$select id from public.profiles where id = '11111111-1111-4111-8111-111111111111'::uuid$$,
    'User B cannot read User A profile'
);
select is_empty(
    $$select id from public.tracks where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$,
    'User B cannot read User A track'
);
select is_empty(
    $$select id from public.playlists where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'::uuid$$,
    'User B cannot read User A playlist'
);
select is_empty(
    $$select playlist_id from public.playlist_tracks where playlist_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab'::uuid$$,
    'User B cannot read User A playlist entries'
);
select is_empty(
    $$select track_id from public.favorites where user_id = '11111111-1111-4111-8111-111111111111'::uuid$$,
    'User B cannot read User A favorites'
);
select is_empty(
    $$select id from public.processing_jobs where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac'::uuid$$,
    'User B cannot read User A processing jobs'
);
select is_empty(
    $$update public.tracks
      set title = 'Unauthorized edit'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
      returning id$$,
    'User B cannot update User A track'
);

select * from finish();
rollback;
