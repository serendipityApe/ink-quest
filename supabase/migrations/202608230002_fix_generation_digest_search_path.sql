begin;

alter function public.commit_generated_story_text(
  uuid, text, text, text, jsonb, jsonb, text, jsonb, text, jsonb, boolean
) set search_path = public, extensions;

commit;
