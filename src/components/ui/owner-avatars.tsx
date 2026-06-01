import { cn } from "@/lib/utils";

interface AvatarPerson {
  url: string | null;
  name: string;
  hex: string;
}

/** Owner avatar(s) — one circle for a person, two overlapped for shared. */
export function OwnerAvatars({ people, className }: { people: AvatarPerson[]; className?: string }) {
  return (
    <div className={cn("flex -space-x-1.5 flex-shrink-0", className)}>
      {people.map((p, i) => (
        <div
          key={i}
          className="w-5 h-5 rounded-full overflow-hidden border-2 border-white flex items-center justify-center bg-secondary"
          style={{ boxShadow: `0 0 0 1.5px ${p.hex}` }}
        >
          {p.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[8px] font-semibold text-muted-foreground">{p.name[0]?.toUpperCase()}</span>
          )}
        </div>
      ))}
    </div>
  );
}
