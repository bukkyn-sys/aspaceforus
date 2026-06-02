import { cn } from "@/lib/utils";
import { SignedImg } from "@/components/signed-img";

interface AvatarPerson {
  url: string | null;
  name: string;
  hex: string;
}

/** Owner avatar(s) — one circle for a person, two overlapped for shared.
 *  Accent ring only (no white border) to match the home avatars; for the
 *  overlapped pair a card-coloured ring sits under the accent to separate them. */
export function OwnerAvatars({ people, className }: { people: AvatarPerson[]; className?: string }) {
  const shared = people.length > 1;
  return (
    <div className={cn("flex -space-x-1.5 flex-shrink-0", className)}>
      {people.map((p, i) => (
        <div
          key={i}
          className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-secondary"
          style={{ boxShadow: shared ? `0 0 0 1.5px ${p.hex}, 0 0 0 3px var(--card)` : `0 0 0 1.5px ${p.hex}` }}
        >
          {p.url ? (
            <SignedImg src={p.url} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[8px] font-semibold text-muted-foreground">{p.name[0]?.toUpperCase()}</span>
          )}
        </div>
      ))}
    </div>
  );
}
