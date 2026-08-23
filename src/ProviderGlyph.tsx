import { cn } from "./lib/utils";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";

/** The agent a thread runs on, drawn inline so its mark follows the BB theme. */
export function ProviderGlyph({
  providerId,
  className,
}: {
  providerId: string;
  className?: string;
}) {
  const Icon = providerIcon(providerId);
  const label = providerLabel(providerId);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(TRAILING_GLYPH_BOX_CLASS, className)}
    >
      {Icon ? (
        <Icon className="size-3" />
      ) : providerId.startsWith("acp-") ? (
        <CodeIcon className="size-3" />
      ) : (
        <span className="size-2 rounded-full bg-muted-foreground/50" />
      )}
    </span>
  );
}

type ProviderIcon = (props: { className?: string }) => React.ReactNode;

function providerIcon(providerId: string): ProviderIcon | null {
  if (providerId === "codex") return OpenAiIcon;
  if (providerId === "claude-code") return ClaudeIcon;
  if (providerId === "pi") return PiIcon;
  if (providerId === "acp-cursor") return CursorIcon;
  if (providerId === "acp-grok") return GrokIcon;
  if (providerId === "acp-opencode") return OpencodeIcon;
  if (providerId === "acp-omp") return OmpIcon;
  return null;
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

function OpenAiIcon({ className }: { className?: string }) {
  return (
    <svg fill="currentColor" fillRule="evenodd" viewBox="0 0 24 24" className={className}>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 149 149" fill="currentColor" className={className}>
      <path d="M29 98.5 58.2 82.2l.5-1.4-.5-.8h-1.4l-4.9-.3-16.6-.5-14.5-.6-14-.7-3.5-.8L0 72.8l.3-2.2 3-2 4.2.4 9.4.6 14 1 10.2.6 15.1 1.6h2.4l.3-1-.8-.6-.6-.6-14.6-9.9-15.7-10.4-8.3-6-4.4-3-2.3-2.9-1-6.2 4.1-4.5 5.4.4 1.4.4 5.5 4.2 11.8 9.1 15.3 11.3 2.3 1.9.9-.7.1-.4-1-1.7-8.3-15.1-8.9-15.4-4-6.3-1-3.9c-.4-1.5-.7-2.9-.7-4.4L38.8.8 41.3 0l6.2.8 2.6 2.3 3.8 8.7 6.2 13.8 9.6 18.7 2.8 5.5 1.5 5.2.6 1.6h1v-.9l.8-10.6 1.4-12.9L79.2 15.5l.5-4.7 2.3-5.6L86.6 2.2l3.6 1.7 3 4.2-.4 2.8-1.8 11.4-3.4 17.9-2.3 12h1.3l1.5-1.5 6.1-8 10.2-12.8 4.5-5 5.2-5.6 3.4-2.7h6.4l4.7 7-2.1 7.2-6.6 8.3-5.4 7-7.8 10.6-4.9 8.4.5.7 1.1-.1 17.7-3.8 9.5-1.7 11.4-2 5.1 2.4.6 2.5-2 5-12.2 3-14.2 2.8-21.2 5-.3.2.3.4 9.6.9 4 .2h10l18.7 1.4 4.8 3.2 3 4-.5 3-7.5 3.8-10.2-2.4-23.6-5.6-8.1-2H97v.7l6.8 6.6 12.3 11.2 15.5 14.4.8 3.5-2 2.8-2.1-.3-13.6-10.2-5.2-4.6-12-10h-.7v1l2.7 4 14.5 21.8.7 6.7-1 2.1-3.7 1.4-4.2-.8-8.4-11.9-8.8-13.4-7-12-.9.5-4.2 44.8-1.9 2.3-4.5 1.7-3.8-2.8-2-4.7 2-9 2.4-11.9 2-9.5 1.7-11.7 1.1-3.9-.1-.3-.9.1-8.8 12.2-13.5 18.2-10.6 11.4-2.6 1-4.4-2.3.4-4 2.5-3.7 14.7-18.7 8.9-11.6 5.8-6.7v-1h-.4l-39.1 25.4-7 .9-3-2.8.4-4.6 1.4-1.5 11.8-8.1z" />
    </svg>
  );
}

function PiIcon({ className }: { className?: string }) {
  return (
    <svg fill="currentColor" fillRule="evenodd" viewBox="100 100 600 600" className={className}>
      <path d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z" />
      <path d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" className={className}>
      <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
    </svg>
  );
}

function GrokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0.36 0.5 33.33 32" fill="currentColor" className={className}>
      <path d="M13.2371 21.0407 24.3186 12.8506c.5433-.4015 1.3198-.2449 1.5787.3788 1.3624 3.2891.7537 7.2418-1.957 9.9557-2.7106 2.7138-6.4822 3.309-9.9295 1.9535l-3.7659 1.7457c5.4014 3.6963 11.9604 2.7822 16.0591-1.3242 3.2511-3.255 4.258-7.6918 3.3165-11.6928l.0085.0085C28.2637 7.9981 29.9647 5.6487 33.449.8446L33.6964.5l-4.5851 4.5906v-.0143L13.2343 21.0436M10.9503 23.0313c-3.8769-3.7078-3.2085-9.446 0.0995-12.755 2.4461-2.4491 6.4538-3.4486 9.9523-1.9792l3.7574-1.7371c-.6769-.4898-1.5445-1.0167-2.54-1.3869-4.4997-1.8538-9.8869-.9312-13.5447 2.7282-3.5185 3.5226-4.6249 8.939-2.7249 13.5609 1.4193 3.4543-.9073 5.8976-3.2511 8.3638-.8305.8742-1.6639 1.7485-2.3352 2.674L10.9474 23.0341" />
    </svg>
  );
}

function OpencodeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-72 -42 384 384" fill="none" className={className}>
      <path d="M180 240H60V120H180V240Z" fill="currentColor" fillOpacity={0.45} />
      <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="currentColor" />
    </svg>
  );
}

function OmpIcon({ className }: { className?: string }) {
  return (
    <svg fill="currentColor" viewBox="0 0 64 64" className={className}>
      <path d="M10 14h44v9H43v33h-9V23h-9v22h-9V23H10z" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
    </svg>
  );
}
