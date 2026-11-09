export type GoogleReviewApiRecord = {
  name?: string;
  reviewId?: string;
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

const ratings: Record<string, number> = {
  STAR_RATING_ONE: 1,
  STAR_RATING_TWO: 2,
  STAR_RATING_THREE: 3,
  STAR_RATING_FOUR: 4,
  STAR_RATING_FIVE: 5
};

export function normalizeGoogleReview(review: GoogleReviewApiRecord) {
  const resourceName = typeof review.name === "string" ? review.name : "";
  const reviewId = (review.reviewId || resourceName.split("/").pop() || "").trim();
  if (!reviewId) return null;

  const reply = review.reviewReply?.comment?.trim() || "";
  const rating = review.starRating ? ratings[review.starRating] ?? null : null;
  return {
    reviewId,
    googleReviewName: resourceName || null,
    reviewText: (review.comment || "").trim().slice(0, 4000),
    rating,
    reviewDate: review.createTime || review.updateTime || null,
    googleReplyText: reply || null,
    googleReplyUpdatedAt: review.reviewReply?.updateTime || null,
    reviewSource: "Google Business Profile",
    status: reply ? "REPLIED" : "REVIEW_CAPTURED",
    provenance: "GOOGLE_API"
  };
}
