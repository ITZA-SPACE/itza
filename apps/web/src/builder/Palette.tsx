import { useDraggable } from "@dnd-kit/core";
import type { PaletteCrop } from "@itza/engine/worker";
import { Card } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";

export const PALETTE_PREFIX = "palette:";

function CropIcon({ kind }: { kind: PaletteCrop["kind"] }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "crop" ? (
        <path d="M8 14V6M8 6c0-2 1-3 3-3 0 2-1 3-3 3ZM8 9c0-2-1-3-3-3 0 2 1 3 3 3Z" />
      ) : kind === "cover" ? (
        <path d="M3 13h10M5 13V9m3 4V6m3 7v-3" />
      ) : (
        <path d="M2 11h12M2 14h12" strokeDasharray="2 2" />
      )}
    </svg>
  );
}

/** What a crop chip looks like on the palette and under the pointer while it is dragged. */
export function CropChip({
  crop,
  color,
  detail,
}: {
  crop: PaletteCrop;
  color: string;
  detail: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-3 shrink-0 rounded-full border border-ink/30 ${color}`}
      />
      <CropIcon kind={crop.kind} />
      <span className="text-body font-medium text-ink">{crop.name}</span>
      <span className="text-caption text-ink-muted">{detail}</span>
    </span>
  );
}

export const cropDetail = (crop: PaletteCrop) =>
  crop.seasonDays === null
    ? t("builder.palette.nodays")
    : fmt(t("builder.palette.days"), { days: crop.seasonDays });

function PaletteItem({
  crop,
  color,
  onAdd,
}: {
  crop: PaletteCrop;
  color: string;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_PREFIX}${crop.id}`,
  });
  return (
    <li>
      <button
        type="button"
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={onAdd}
        aria-label={fmt(t("builder.palette.add"), { crop: crop.name, detail: cropDetail(crop) })}
        className={`min-h-11 w-full cursor-grab touch-manipulation rounded-control border border-line bg-surface px-3 py-2 text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${isDragging ? "opacity-40" : ""}`}
      >
        <CropChip crop={crop} color={color} detail={cropDetail(crop)} />
      </button>
    </li>
  );
}

const GROUPS = [
  { id: "winter", match: (c: PaletteCrop) => c.kind === "crop" && c.sowing === "winter" },
  { id: "summer", match: (c: PaletteCrop) => c.kind === "crop" && c.sowing === "summer" },
  { id: "other", match: (c: PaletteCrop) => c.kind !== "crop" },
] as const;

/** Every crop of the field's region, grouped by when it is sown. */
export function Palette({
  crops,
  colors,
  onAdd,
}: {
  crops: readonly PaletteCrop[];
  colors: ReadonlyMap<string, string>;
  onAdd: (crop: string) => void;
}) {
  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-title font-semibold text-ink">{t("builder.palette.title")}</h2>
        <p className="text-caption text-ink-muted">{t("builder.palette.hint")}</p>
      </div>
      {GROUPS.map((group) => {
        const members = crops.filter(group.match);
        if (members.length === 0) return null;
        return (
          <div key={group.id} className="space-y-1">
            <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
              {t(`builder.palette.group.${group.id}`)}
            </h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {members.map((crop) => (
                <PaletteItem
                  key={crop.id}
                  crop={crop}
                  color={(crop.family && colors.get(crop.family)) || "bg-line-soft"}
                  onAdd={() => onAdd(crop.id)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}
