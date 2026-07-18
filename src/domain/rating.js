export function calculateEaSquadRating(ratings = [], requiredPlayerCount = ratings.length) {
  const count = Number(requiredPlayerCount || ratings.length || 0);
  const values = (ratings || []).map(Number).filter((rating) => Number.isFinite(rating) && rating > 0);
  if (!count || values.length !== count) return 0;
  let adjustedTotal = values.reduce((sum, rating) => sum + rating, 0);
  const average = adjustedTotal / count;
  values.forEach((rating) => {
    if (rating > average) adjustedTotal += rating - average;
  });
  return Math.floor(Math.round(adjustedTotal) / count);
}
