
  create table "public"."playnext_reviews" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null default auth.uid(),
    "game_id" bigint not null,
    "game_slug" text not null,
    "game_name" text not null,
    "game_image" text not null default ''::text,
    "author_name" text not null,
    "rating" smallint not null,
    "body" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."playnext_reviews" enable row level security;

CREATE INDEX playnext_reviews_game_created_idx ON public.playnext_reviews USING btree (game_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX playnext_reviews_pkey ON public.playnext_reviews USING btree (id);

CREATE UNIQUE INDEX playnext_reviews_user_id_game_id_key ON public.playnext_reviews USING btree (user_id, game_id);

alter table "public"."playnext_reviews" add constraint "playnext_reviews_pkey" PRIMARY KEY using index "playnext_reviews_pkey";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_author_name_check" CHECK (((char_length(btrim(author_name)) >= 1) AND (char_length(btrim(author_name)) <= 60))) not valid;

alter table "public"."playnext_reviews" validate constraint "playnext_reviews_author_name_check";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_body_check" CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 3000))) not valid;

alter table "public"."playnext_reviews" validate constraint "playnext_reviews_body_check";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_game_id_check" CHECK ((game_id > 0)) not valid;

alter table "public"."playnext_reviews" validate constraint "playnext_reviews_game_id_check";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_game_image_check" CHECK (((char_length(game_image) <= 2048) AND ((game_image = ''::text) OR (game_image LIKE 'https://media.rawg.io/%')))) not valid;

alter table "public"."playnext_reviews" validate constraint "playnext_reviews_game_image_check";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_game_name_check" CHECK (((char_length(btrim(game_name)) >= 1) AND (char_length(btrim(game_name)) <= 200))) not valid;

alter table "public"."playnext_reviews" validate constraint "playnext_reviews_game_name_check";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_game_slug_check" CHECK ((((char_length(game_slug) >= 1) AND (char_length(game_slug) <= 200)) AND (game_slug ~ '^[a-zA-Z0-9_-]+$'::text))) not valid;

alter table "public"."playnext_reviews" validate constraint "playnext_reviews_game_slug_check";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."playnext_reviews" validate constraint "playnext_reviews_rating_check";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."playnext_reviews" validate constraint "playnext_reviews_user_id_fkey";

alter table "public"."playnext_reviews" add constraint "playnext_reviews_user_id_game_id_key" UNIQUE using index "playnext_reviews_user_id_game_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.playnext_review_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;

grant delete on table "public"."playnext_reviews" to "authenticated";

grant delete on table "public"."playnext_reviews" to "service_role";

grant insert on table "public"."playnext_reviews" to "service_role";

grant references on table "public"."playnext_reviews" to "service_role";

grant select on table "public"."playnext_reviews" to "service_role";

grant trigger on table "public"."playnext_reviews" to "service_role";

grant truncate on table "public"."playnext_reviews" to "service_role";

grant update on table "public"."playnext_reviews" to "service_role";


  create policy "create_own_review"
  on "public"."playnext_reviews"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "delete_own_review"
  on "public"."playnext_reviews"
  as permissive
  for delete
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "edit_own_review"
  on "public"."playnext_reviews"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "published_reviews"
  on "public"."playnext_reviews"
  as permissive
  for select
  to anon, authenticated
using (true);


CREATE TRIGGER playnext_review_updated BEFORE UPDATE ON public.playnext_reviews FOR EACH ROW EXECUTE FUNCTION public.playnext_review_timestamp();

-- The schema diff tool does not capture column ACLs. Keep anonymous reads limited to public fields and owner writes limited to editable columns.
revoke all on public.playnext_reviews from public, anon, authenticated;
grant select (id, game_id, game_slug, game_name, game_image, author_name, rating, body, created_at, updated_at) on public.playnext_reviews to anon, authenticated;
grant select (user_id) on public.playnext_reviews to authenticated;
grant insert (user_id, game_id, game_slug, game_name, game_image, author_name, rating, body) on public.playnext_reviews to authenticated;
grant update (author_name, rating, body) on public.playnext_reviews to authenticated;
grant delete on public.playnext_reviews to authenticated;
revoke all on function public.playnext_review_timestamp() from public, anon, authenticated;
comment on table public.playnext_reviews is 'Public, shareable game reviews. Private collections, keys, emails and session tokens stay outside this table.';
notify pgrst, 'reload schema';
