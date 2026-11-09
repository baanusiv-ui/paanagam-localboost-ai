import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGoogleReview } from "./google-reviews.js";

test("normalizes Google review fields without retaining reviewer identity or media", () => {
  const review = normalizeGoogleReview({
    name: "accounts/123/locations/456/reviews/abc123",
    reviewId: "abc123",
    starRating: "STAR_RATING_FIVE",
    comment: "Excellent filter coffee",
    createTime: "2026-11-08T10:00:00Z",
    reviewer: { displayName: "Private Customer", profilePhotoUrl: "https://example.test/photo" }
  } as never);
  assert.deepEqual(review, {
    reviewId: "abc123",
    googleReviewName: "accounts/123/locations/456/reviews/abc123",
    reviewText: "Excellent filter coffee",
    rating: 5,
    reviewDate: "2026-11-08T10:00:00Z",
    googleReplyText: null,
    googleReplyUpdatedAt: null,
    reviewSource: "Google Business Profile",
    status: "REVIEW_CAPTURED",
    provenance: "GOOGLE_API"
  });
  assert.ok(!("reviewer" in (review || {})));
});

test("maps rating-only reviews and preserves an existing Google reply as read-only context", () => {
  const review = normalizeGoogleReview({
    name: "accounts/123/locations/456/reviews/xyz",
    starRating: "STAR_RATING_TWO",
    reviewReply: { comment: "Thank you for the feedback.", updateTime: "2026-11-09T08:00:00Z" }
  });
  assert.equal(review?.rating, 2);
  assert.equal(review?.reviewText, "");
  assert.equal(review?.googleReplyText, "Thank you for the feedback.");
  assert.equal(review?.status, "REPLIED");
});

test("rejects review records without a stable review id", () => {
  assert.equal(normalizeGoogleReview({ comment: "No resource identifier" }), null);
});
