import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Badge, Button, Card, EmptyState, Skeleton } from "@itza/ui-kit";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../app/shell/PageHeader";
import { useEconomicsStore } from "../compare/economics/economicsStore";
import { useCompare } from "../compare/useCompare";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { MethodsButton } from "../methods";
import { useFieldStore } from "../state";
import { familyColors } from "./design";
import { MAX_SEASONS, MIN_SEASONS, useBuilderStore } from "./designStore";
import { LiveCurves } from "./LiveCurves";
import { CropChip, cropDetail, PALETTE_PREFIX, Palette } from "./Palette";
import { END_ID, SlotPreview, Timeline } from "./Timeline";
import { useDesignReport } from "./useDesign";

const KEYBOARD_CODES = { start: ["Space"], cancel: ["Escape"], end: ["Space", "Tab"] };

export function BuilderStep() {
  const field = useFieldStore((s) => s.field);
  const economics = useEconomicsStore((s) => s.economics);
  const compare = useCompare();
  const navigate = useNavigate();
  const { slots, started, scored } = useBuilderStore();
  const { add, remove, move, start, clear, score } = useBuilderStore.getState();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const view = compare.view;

  const palette = view?.palette;
  const crops = useMemo(() => new Map((palette ?? []).map((c) => [c.id, c])), [palette]);
  const colors = useMemo(() => familyColors(palette ?? []), [palette]);
  const current = useMemo(
    () =>
      view?.definitions.find((d) => d.id === view.baselineId)?.seasons.map((s) => s.crop) ?? null,
    [view],
  );
  useEffect(() => {
    if (!started && current) start(current);
  }, [started, current, start]);

  const cropIds = useMemo(() => slots.map((s) => s.crop), [slots]);
  const report = useDesignReport(compare, cropIds);
  const warnings = report.data?.warnings ?? [];
  const warned = useMemo(() => new Set(warnings.flatMap((w) => w.positions)), [warnings]);
  const names = useMemo(() => new Map([...crops].map(([id, c]) => [id, c.name])), [crops]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: KEYBOARD_CODES,
    }),
  );

  const nameOf = (id: string | number): string => {
    const key = String(id);
    if (key.startsWith(PALETTE_PREFIX)) return names.get(key.slice(PALETTE_PREFIX.length)) ?? key;
    const slot = slots.find((s) => s.key === key);
    return (slot && names.get(slot.crop)) ?? key;
  };
  const indexOf = (id: string | number) => slots.findIndex((s) => s.key === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => fmt(t("builder.drag.start"), { crop: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? over.id === END_ID
          ? fmt(t("builder.drag.overEnd"), { crop: nameOf(active.id) })
          : fmt(t("builder.drag.over"), { crop: nameOf(active.id), n: indexOf(over.id) })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? over.id === END_ID
          ? fmt(t("builder.drag.dropEnd"), { crop: nameOf(active.id) })
          : fmt(t("builder.drag.drop"), { crop: nameOf(active.id), n: indexOf(over.id) })
        : fmt(t("builder.drag.cancel"), { crop: nameOf(active.id) }),
    onDragCancel: ({ active }) => fmt(t("builder.drag.cancel"), { crop: nameOf(active.id) }),
  };

  const addCrop = (crop: string, index?: number) => {
    if (add(crop, index)) {
      const n = index === undefined ? useBuilderStore.getState().slots.length : index + 1;
      setAnnouncement(fmt(t("builder.drag.added"), { crop: names.get(crop) ?? crop, n }));
    } else {
      setAnnouncement(fmt(t("builder.timeline.full"), { max: MAX_SEASONS }));
    }
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const id = String(active.id);
    if (id.startsWith(PALETTE_PREFIX)) {
      const crop = id.slice(PALETTE_PREFIX.length);
      if (over.id === END_ID) addCrop(crop);
      else {
        const at = slots.findIndex((s) => s.key === over.id);
        addCrop(crop, at < 0 ? undefined : at);
      }
      return;
    }
    const from = slots.findIndex((s) => s.key === id);
    const to = over.id === END_ID ? slots.length - 1 : slots.findIndex((s) => s.key === over.id);
    if (from >= 0 && to >= 0 && from !== to) move(from, to);
  };

  if (!field) {
    return (
      <EmptyState
        title={t("builder.noField")}
        action={
          <Button asChild>
            <Link to="/field">{t("builder.toField")}</Link>
          </Button>
        }
      />
    );
  }

  let body: React.ReactNode;
  if (compare.status === "error") {
    body = (
      <p role="alert" className="rounded-control bg-risk-soft p-3 text-body text-risk-ink">
        {fmt(t("builder.error"), { message: compare.error?.message ?? "" })}
      </p>
    );
  } else if (!view || !palette) {
    body = (
      <div className="space-y-3" aria-busy="true">
        <p role="status" className="text-body text-ink-muted">
          {t("builder.loading")}
        </p>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else {
    const blocked = (report.data?.seasons.length ?? 0) === 0;
    const tooShort = slots.length < MIN_SEASONS;
    const same = scored !== null && scored.join() === cropIds.join();
    const reason = tooShort
      ? fmt(t("builder.score.minimum"), { min: MIN_SEASONS })
      : report.data && blocked
        ? t("builder.score.blocked")
        : null;
    const activeCrop = activeId?.startsWith(PALETTE_PREFIX)
      ? crops.get(activeId.slice(PALETTE_PREFIX.length))
      : crops.get(slots.find((s) => s.key === activeId)?.crop ?? "");
    const colorOf = (family: string | null | undefined) =>
      (family && colors.get(family)) || "bg-line-soft";
    body = (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t("builder.drag.instructions") },
        }}
        onDragStart={({ active }) => setActiveId(String(active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Palette crops={palette} colors={colors} onAdd={(crop) => addCrop(crop)} />
          <div className="space-y-4">
            <Timeline
              slots={slots}
              crops={crops}
              colors={colors}
              warnedPositions={warned}
              onRemove={(key) => {
                const slot = slots.find((s) => s.key === key);
                remove(key);
                setAnnouncement(
                  fmt(t("builder.drag.removed"), { crop: names.get(slot?.crop ?? "") ?? "" }),
                );
              }}
              onMove={(from, to) => {
                move(from, to);
                const slot = slots[from];
                setAnnouncement(
                  fmt(t("builder.drag.moved"), {
                    crop: names.get(slot?.crop ?? "") ?? "",
                    n: to + 1,
                  }),
                );
              }}
              onClear={clear}
              onUseCurrent={current ? () => start(current) : null}
            />
            <LiveCurves
              seasons={report.data?.seasons ?? []}
              slots={slots.length}
              names={names}
              replayed={report.data?.replayedSeasons ?? 0}
              source={fmt(t("builder.curves.source"), {
                seasons: report.data?.replayedSeasons ?? 0,
                pack: view.packId,
                label: view.label,
              })}
              loading={report.isFetching}
              error={report.isError ? report.error.message : null}
              economics={economics}
            />
            <Card className="space-y-2">
              <h2 className="text-title font-semibold text-ink">{t("builder.warnings.title")}</h2>
              {warnings.length === 0 ? (
                <p className="text-body text-ink-muted">{t("builder.warnings.none")}</p>
              ) : (
                <ul className="space-y-2">
                  {warnings.map((w) => (
                    <li
                      key={`${w.kind}-${w.positions.join()}-${w.message}`}
                      className="rounded-control bg-warn-soft px-3 py-2 text-body text-warn-ink"
                    >
                      {w.message}
                      {w.positions.length > 0 ? (
                        <span className="ml-2 text-caption">
                          {fmt(t("builder.warnings.seasons"), {
                            seasons: w.positions.map((p) => p + 1).join(", "),
                          })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="space-y-2">
              <p className="text-body text-ink-muted">{t("builder.score.hint")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={reason !== null || report.isFetching}
                  onClick={() => {
                    score();
                    navigate({ to: "/compare" });
                  }}
                >
                  {t("builder.score.button")}
                </Button>
                {reason ? <span className="text-caption text-ink-muted">{reason}</span> : null}
                {same ? (
                  <>
                    <Badge tone="good">{t("builder.score.scored")}</Badge>
                    <Button asChild variant="secondary">
                      <Link to="/compare">{t("builder.score.view")}</Link>
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
        <DragOverlay>
          {activeCrop ? (
            activeId?.startsWith(PALETTE_PREFIX) ? (
              <div className="rounded-control border border-accent bg-surface px-3 py-2 shadow-lg">
                <CropChip
                  crop={activeCrop}
                  color={colorOf(activeCrop.family)}
                  detail={cropDetail(activeCrop)}
                />
              </div>
            ) : (
              <SlotPreview
                crop={activeCrop}
                color={colorOf(activeCrop.family)}
                n={indexOf(activeId ?? "")}
              />
            )
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={t("nav.group.futures")}
        title={t("builder.title")}
        subtitle={t("builder.body")}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {body}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="secondary">
          <Link to="/compare">{t("builder.back")}</Link>
        </Button>
        <MethodsButton />
      </div>
    </div>
  );
}
