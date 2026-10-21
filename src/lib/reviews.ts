import type { SupabaseClient } from "@supabase/supabase-js";
import type { Game } from "./types";
import { record } from "./types";
import { safeImage } from "./model";

export const REVIEW_LIMIT = 3000;
const reviewImage = (value: unknown) => {
  const image = safeImage(value);
  return image.startsWith("https://media.rawg.io/") ? image : "";
};
export const PUBLIC_REVIEW_COLUMNS =
  "id,game_id,game_slug,game_name,game_image,author_name,rating,body,created_at,updated_at";
export interface PublicReview {
  id: string;
  game_id: number;
  game_slug: string;
  game_name: string;
  game_image: string;
  author_name: string;
  rating: number;
  body: string;
  created_at: string;
  updated_at: string;
}
export interface ReviewDraft {
  author_name: string;
  rating: number;
  body: string;
}
export const isReviewId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function validReviewDraft(draft: ReviewDraft) {
  return (
    draft.author_name.trim().length > 0 &&
    draft.author_name.trim().length <= 60 &&
    Number.isInteger(draft.rating) &&
    draft.rating >= 1 &&
    draft.rating <= 5 &&
    draft.body.trim().length > 0 &&
    draft.body.trim().length <= REVIEW_LIMIT
  );
}
export function normalizeReview(value: unknown): PublicReview | null {
  const row = record(value);
  if (
    typeof row.id !== "string" ||
    !isReviewId(row.id) ||
    !Number.isSafeInteger(row.game_id) ||
    Number(row.game_id) <= 0 ||
    typeof row.game_slug !== "string" ||
    !/^[a-zA-Z0-9_-]{1,200}$/.test(row.game_slug) ||
    typeof row.game_name !== "string" ||
    row.game_name.length > 200 ||
    !row.game_name.trim() ||
    typeof row.author_name !== "string" ||
    typeof row.body !== "string" ||
    typeof row.rating !== "number" ||
    !validReviewDraft({
      author_name: row.author_name,
      rating: Number(row.rating),
      body: row.body,
    }) ||
    typeof row.created_at !== "string" ||
    !Number.isFinite(Date.parse(row.created_at)) ||
    typeof row.updated_at !== "string" ||
    !Number.isFinite(Date.parse(row.updated_at))
  )
    return null;
  return {
    id: row.id,
    game_id: row.game_id as number,
    game_slug: row.game_slug,
    game_name: row.game_name,
    game_image: reviewImage(row.game_image),
    author_name: row.author_name,
    rating: Number(row.rating),
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
export async function loadGameReviews(
  client: SupabaseClient,
  gameId: number,
  offset = 0,
  signal?: AbortSignal,
) {
  let request = client
    .from("playnext_reviews")
    .select(PUBLIC_REVIEW_COLUMNS, { count: "exact" })
    .eq("game_id", gameId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 19);
  if (signal) request = request.abortSignal(signal);
  const { data, error, count } = await request;
  if (error)
    throw new Error(
      "Public reviews are temporarily unavailable. Please try again.",
    );
  return {
    reviews: (data || [])
      .map(normalizeReview)
      .filter((review): review is PublicReview => !!review),
    total: count || 0,
  };
}
export async function loadOwnReview(
  client: SupabaseClient,
  userId: string,
  gameId: number,
  signal?: AbortSignal,
) {
  let request = client
    .from("playnext_reviews")
    .select(PUBLIC_REVIEW_COLUMNS)
    .eq("user_id", userId)
    .eq("game_id", gameId);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.maybeSingle();
  if (error) throw new Error("Could not load your review. Please try again.");
  return data ? normalizeReview(data) : null;
}
export async function publishReview(
  client: SupabaseClient,
  userId: string,
  game: Game,
  draft: ReviewDraft,
  existingId?: string,
) {
  if (!validReviewDraft(draft))
    throw new Error(
      "Add a public name, a rating from 1 to 5, and a review of up to 3,000 characters.",
    );
  const fields = {
    author_name: draft.author_name.trim(),
    rating: draft.rating,
    body: draft.body.trim(),
  };
  const request = existingId
    ? client
        .from("playnext_reviews")
        .update(fields)
        .eq("id", existingId)
        .eq("user_id", userId)
    : client.from("playnext_reviews").insert({
        ...fields,
        user_id: userId,
        game_id: game.id,
        game_slug: game.slug,
        game_name: game.name,
        game_image: reviewImage(game.image),
      });
  const { data, error } = await request.select(PUBLIC_REVIEW_COLUMNS).single();
  if (error)
    throw new Error(
      error.code === "23505"
        ? "You already reviewed this game. Reload the reviews to edit it."
        : "Could not publish your review. Your draft is still here.",
    );
  const saved = normalizeReview(data);
  if (!saved)
    throw new Error("Could not publish your review. Your draft is still here.");
  return saved;
}
export async function deleteReview(
  client: SupabaseClient,
  userId: string,
  id: string,
) {
  const { data, error } = await client
    .from("playnext_reviews")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error || data?.length !== 1)
    throw new Error("Could not delete your review. Please try again.");
}
export async function loadSharedReview(
  client: SupabaseClient,
  id: string,
  signal?: AbortSignal,
) {
  if (!isReviewId(id)) return null;
  let request = client
    .from("playnext_reviews")
    .select(PUBLIC_REVIEW_COLUMNS)
    .eq("id", id);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.maybeSingle();
  if (error)
    throw new Error(
      "Public reviews are temporarily unavailable. Please try again.",
    );
  return normalizeReview(data);
}
