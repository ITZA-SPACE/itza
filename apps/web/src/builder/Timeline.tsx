import { useDroppable } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PaletteCrop } from "@itza/engine/worker";
import { Badge, Button, Card } from "@itza/ui-kit";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { MAX_SEASONS, type Slot } from "./designStore";

export const END_ID = "timeline-end";

function SlotBody({
  crop,
  color,
  n,
  warned,
}: {
  crop: PaletteCrop;
  color: string;
  n: number;
  warned: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`size-3 shrink-0 rounded-full border border-ink/30 ${color}`}
        />
        <span className="text-caption font-semibold text-ink-muted">
          {fmt(t("builder.timeline.season"), { n })}
        </span>
        {warned ? <Badge tone="warn">{t("builder.timeline.warned")}</Badge> : null}
      </span>
      <span className="text-body font-medium text-ink">{crop.name}</span>
      <span className="text-caption text-ink-muted">
        {crop.sowing === "winter"
          ? t("builder.timeline.winter")
          : crop.sowing === "summer"
            ? t("builder.timeline.summer")
            : t("builder.palette.group.other")}
      </span>
    </span>
  );
}

/** A slot as it looks under the pointer while it is dragged. */
export function SlotPreview({ crop, color, n }: { crop: PaletteCrop; color: string; n: number }) {
  return (
    <div className="rounded-control border border-accent bg-surface p-3 shadow-lg">
      <SlotBody crop={crop} color={color} n={n} warned={false} />
    </div>
  );
}

function SortableSlot({
  slot,
  index,
  last,
  crop,
  color,
  warned,
  onRemove,
  onMove,
}: {
  slot: Slot;
  index: number;
  last: boolean;
  crop: PaletteCrop;
  color: string;
  warned: boolean;
  onRemove: () => void;
  onMove: (to: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.key });
  const n = index + 1;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-control border bg-surface p-2 ${warned ? "border-warn-ink" : "border-line"} ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={fmt(t("builder.timeline.drag"), { crop: crop.name, n })}
        className="min-h-11 w-full cursor-grab touch-manipulation rounded-control p-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <SlotBody crop={crop} color={color} n={n} warned={warned} />
      </button>
      <div className="mt-1 flex gap-1">
        <Button
          variant="secondary"
          className="min-w-11 flex-1"
          disabled={index === 0}
          aria-label={fmt(t("builder.timeline.earlier"), { crop: crop.name })}
          onClick={() => onMove(index - 1)}
        >
          <span aria-hidden="true">←</span>
        </Button>
        <Button
          variant="secondary"
          className="min-w-11 flex-1"
          disabled={last}
          aria-label={fmt(t("builder.timeline.later"), { crop: crop.name })}
          onClick={() => onMove(index + 1)}
        >
          <span aria-hidden="true">→</span>
        </Button>
        <Button
          variant="secondary"
          className="min-w-11 flex-1"
          aria-label={fmt(t("builder.timeline.remove"), { crop: crop.name, n })}
          onClick={onRemove}
        >
          <span aria-hidden="true">×</span>
        </Button>
      </div>
    </li>
  );
}

function EndZone({ full }: { full: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: END_ID, disabled: full });
  return (
    <li
      ref={setNodeRef}
      className={`flex min-h-24 items-center justify-center rounded-control border-2 border-dashed p-3 text-center text-caption text-ink-muted ${isOver ? "border-accent bg-accent-soft" : "border-line"}`}
    >
      {full ? fmt(t("builder.timeline.full"), { max: MAX_SEASONS }) : t("builder.timeline.end")}
    </li>
  );
}

/** The rotation as a row of seasons: drag to reorder, with buttons for the same on a keyboard. */
export function Timeline({
  slots,
  crops,
  colors,
  warnedPositions,
  onRemove,
  onMove,
  onClear,
  onUseCurrent,
}: {
  slots: readonly Slot[];
  crops: ReadonlyMap<string, PaletteCrop>;
  colors: ReadonlyMap<string, string>;
  warnedPositions: ReadonlySet<number>;
  onRemove: (key: string) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
  onUseCurrent: (() => void) | null;
}) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-title font-semibold text-ink">{t("builder.timeline.title")}</h2>
        <span className="text-caption tabular-nums text-ink-muted">
          {fmt(t("builder.timeline.count"), { n: slots.length, max: MAX_SEASONS })}
        </span>
        <span className="ml-auto flex gap-2">
          {onUseCurrent ? (
            <Button variant="secondary" onClick={onUseCurrent}>
              {t("builder.timeline.useCurrent")}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClear} disabled={slots.length === 0}>
            {t("builder.timeline.clear")}
          </Button>
        </span>
      </div>
      {slots.length === 0 ? (
        <p className="text-body text-ink-muted">{t("builder.timeline.empty")}</p>
      ) : null}
      <SortableContext items={slots.map((s) => s.key)} strategy={rectSortingStrategy}>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {slots.map((slot, index) => {
            const crop = crops.get(slot.crop);
            if (!crop) return null;
            return (
              <SortableSlot
                key={slot.key}
                slot={slot}
                index={index}
                last={index === slots.length - 1}
                crop={crop}
                color={(crop.family && colors.get(crop.family)) || "bg-line-soft"}
                warned={warnedPositions.has(index)}
                onRemove={() => onRemove(slot.key)}
                onMove={(to) => onMove(index, to)}
              />
            );
          })}
          <EndZone full={slots.length >= MAX_SEASONS} />
        </ol>
      </SortableContext>
    </Card>
  );
}
