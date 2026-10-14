/**
 * The club's badge, drawn inside a square so a tall crest and a wide one sit
 * the same size beside the club's name. Nothing is drawn for a club without
 * one: an empty frame in the masthead would read as something missing.
 */
export function ClubBadge({
  version,
  className = "h-6 w-6",
}: {
  /** `badgeVersion` from the session, or the version an upload returned. */
  version: number | null;
  className?: string;
}) {
  if (version == null) return null;
  return (
    // A plain img: the badge comes from our own route behind the session,
    // already small, so next/image would only add a second copy to cache.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/badge?v=${version}`} alt="" className={`${className} shrink-0 object-contain`} />
  );
}
