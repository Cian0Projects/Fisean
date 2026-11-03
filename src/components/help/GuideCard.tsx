import { guideUrl, type Guide } from "@/lib/guides";

/**
 * One how-to video with its title and a line on what it shows. Used on the
 * landing page (the two open videos) and on the How to page (everything a
 * member's role suits). The video waits for a press rather than loading, so
 * six of them on a page cost nothing until one is watched; the poster is the
 * picture on the card until then.
 */
export function GuideCard({ guide }: { guide: Guide }) {
  return (
    <figure className="m-0">
      <video
        className="block aspect-video w-full border border-line-strong bg-surface"
        src={guideUrl(guide, "video")}
        poster={guideUrl(guide, "poster")}
        controls
        playsInline
        preload="none"
        aria-label={guide.title}
      >
        Your browser cannot play this video.
      </video>
      <figcaption className="mt-3">
        <h3 className="title text-[17px]">{guide.title}</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">{guide.blurb}</p>
      </figcaption>
    </figure>
  );
}
