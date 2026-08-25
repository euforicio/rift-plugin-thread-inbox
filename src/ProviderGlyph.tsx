// oxlint-disable jsx-a11y/prefer-tag-over-role -- the rule wants `<img>`, but
// these are inline `<svg>` paths, a CSS mask and a CSS-drawn dot; `role="img"`
// with an `aria-label` is the correct pattern and `<img>` cannot express them.
import { useEffect, useState } from "react";
import { cn } from "./lib/utils";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";
import { providerMark } from "./provider-marks";

export interface ProviderGlyphInfo {
  displayName: string;
  logoUrl: string | null;
}

/** Host logos are same-origin paths; anything else is dropped. */
function safeLogoUrl(value: string | null): string | null {
  if (value === null || !value.startsWith("/") || /["'()\\\s]/.test(value)) {
    return null;
  }
  return value;
}

/** One tint for every glyph, so the trailing column reads as one column. */
const GLYPH_TINT = "size-3 text-muted-foreground/70";

/**
 * The agent a thread runs on, drawn by this plugin.
 *
 * Always rendered, so the card's third line has a fixed right edge even when a
 * thread has no branch. Three sources, in order: a logo the host serves, the
 * mark this plugin carries for an agent BB knows, then a neutral dot for an
 * unknown provider — `providerId` is a free-form id, so that last case is
 * ordinary rather than exceptional.
 *
 * The host logo wins so that a plugin-supplied ACP agent shows its own artwork,
 * and so Pi / Codex / Cursor use the same marks as the model selector instead
 * of a placeholder dot.
 *
 * A host logo is drawn as a CSS mask rather than an `<img>`, so it takes the
 * same muted tint as every other glyph instead of arriving in its own brand
 * colour.
 */
export function ProviderGlyph({
  providerId,
  provider,
  className,
}: {
  providerId: string;
  provider?: ProviderGlyphInfo;
  className?: string;
}) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const box = cn(TRAILING_GLYPH_BOX_CLASS, className);
  const displayName = provider?.displayName ?? providerLabel(providerId);
  const logoUrl = safeLogoUrl(provider?.logoUrl ?? null);
  const maskedLogoUrl = logoUrl === failedLogoUrl ? null : logoUrl;

  // A mask reports nothing when its URL fails: it just paints an empty box.
  // Probing the image keeps a broken logo falling through to the marks below
  // rather than leaving a hole in a slot that is always the same width.
  useEffect(() => {
    if (maskedLogoUrl === null) return;
    const probe = new Image();
    const onError = () => setFailedLogoUrl(maskedLogoUrl);
    probe.addEventListener("error", onError);
    probe.src = maskedLogoUrl;
    return () => probe.removeEventListener("error", onError);
  }, [maskedLogoUrl]);

  if (maskedLogoUrl !== null) {
    const mask = {
      maskImage: `url("${maskedLogoUrl}")`,
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: "contain",
      WebkitMaskImage: `url("${maskedLogoUrl}")`,
      WebkitMaskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
    };
    return (
      <span role="img" aria-label={displayName} className={box}>
        <span className="size-3 bg-muted-foreground/70" style={mask} />
      </span>
    );
  }

  const mark = providerMark(providerId);
  if (mark !== undefined) {
    return (
      <span role="img" aria-label={displayName} title={displayName} className={box}>
        <svg
          viewBox={mark.viewBox}
          fill="currentColor"
          fillRule={mark.fillRule}
          aria-hidden="true"
          className={GLYPH_TINT}
        >
          {mark.paths.map((path) => (
            <path key={path.d} d={path.d} fillOpacity={path.fillOpacity} />
          ))}
        </svg>
      </span>
    );
  }

  if (providerId.startsWith("acp-")) {
    return (
      <span role="img" aria-label={displayName} title={displayName} className={box}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={GLYPH_TINT}
        >
          <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
        </svg>
      </span>
    );
  }

  return (
    <span role="img" aria-label={displayName} className={box}>
      <span className="size-2 rounded-full bg-muted-foreground/50" />
    </span>
  );
}

function providerLabel(providerId: string): string {
  const labels: Record<string, string> = {
    codex: "Codex",
    "claude-code": "Claude Code",
    pi: "Pi",
    "acp-cursor": "Cursor",
    "acp-grok": "Grok Build",
    "acp-hermes-agent": "Hermes Agent",
    "acp-opencode": "opencode",
    "acp-omp": "oh-my-pi",
  };
  return labels[providerId] ?? providerId;
}
