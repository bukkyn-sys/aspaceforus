"use client";

import { useCouple } from "@/contexts/couple-context";
import { ChipRow } from "@/components/ui/form";
import { SignedImg } from "@/components/signed-img";
import { cn } from "@/lib/utils";
import { getAccent } from "@/lib/accent-colors";

// One partner picker for the whole app. Mirrors the calendar event form's
// "who's going" control: a row of equal-width chips, each person shown with
// their accent-ringed display picture, selected chip filled with the foreground
// colour. Non-person options ("both" / "anyone" / "shared") render as a plain
// label, exactly like the event form's "both".

export interface PersonChoice {
  value: string | null;       // value the form stores for this option
  label: string;              // chip label
  personId?: string | null;   // when this is me/partner, their avatar is shown
}

export function PersonPicker({
  value,
  onChange,
  choices,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  choices: PersonChoice[];
  className?: string;
}) {
  const { me, partner, myName, partnerName } = useCouple();

  function avatarFor(personId: string | null | undefined) {
    if (!personId) return null;
    if (personId === me.id) return { url: me.avatar_url, hex: getAccent(me.accent_color).hex, name: myName };
    if (partner && personId === partner.id) return { url: partner.avatar_url, hex: getAccent(partner.accent_color).hex, name: partnerName };
    return null;
  }

  return (
    <ChipRow className={className}>
      {choices.map((c) => {
        const on = value === c.value;
        const av = avatarFor(c.personId);
        return (
          <button
            key={c.value ?? "·null·"}
            type="button"
            onClick={() => onChange(c.value)}
            aria-pressed={on}
            className={cn(
              "flex items-center justify-center gap-1.5 px-2 h-10 rounded-xl text-xs font-medium transition-colors",
              on ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
            )}
          >
            {av && (
              <span className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0" style={{ boxShadow: `0 0 0 1.5px ${av.hex}` }}>
                {av.url
                  ? <SignedImg src={av.url} className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-[10px] font-semibold bg-secondary text-muted-foreground">{av.name[0]?.toUpperCase()}</span>}
              </span>
            )}
            <span className="truncate capitalize">{c.label}</span>
          </button>
        );
      })}
    </ChipRow>
  );
}
