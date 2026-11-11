import { useEffect, useId, useRef, useState } from "react";
import { t } from "../copy";
import { type Place, searchPlaces } from "./places";

const DEBOUNCE_MS = 600;
const MIN_CHARS = 3;

type Status = "idle" | "searching" | "done" | "error";

/**
 * Place search with the keyboard in mind: type, arrow keys to move, Enter to go, Escape to close.
 * Requests are debounced, aborted when the text changes and cached, to stay within the geocoder's
 * fair-use policy.
 */
export function PlaceSearch({ onSelect }: { onSelect: (place: Place) => void }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const cache = useRef(new Map<string, Place[]>());
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < MIN_CHARS) {
      setPlaces([]);
      setStatus("idle");
      return;
    }
    const cached = cache.current.get(text);
    if (cached) {
      setPlaces(cached);
      setStatus("done");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("searching");
      searchPlaces(text, controller.signal)
        .then((found) => {
          cache.current.set(text, found);
          setPlaces(found);
          setStatus("done");
        })
        .catch((error: unknown) => {
          if ((error as Error).name !== "AbortError") setStatus("error");
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const choose = (place: Place) => {
    setQuery(place.label);
    setOpen(false);
    onSelect(place);
  };

  const focusResult = (index: number) => {
    const count = places.length;
    if (count === 0) return;
    results.current[((index % count) + count) % count]?.focus();
  };

  const message =
    status === "searching"
      ? t("map.search.searching")
      : status === "error"
        ? t("map.search.error")
        : status === "done" && places.length === 0
          ? t("map.search.empty")
          : "";
  const showList = open && places.length > 0;

  return (
    <div className="relative w-full">
      <label className="sr-only" htmlFor={`${id}-input`}>
        {t("map.search.label")}
      </label>
      <input
        id={`${id}-input`}
        ref={input}
        type="search"
        aria-describedby={`${id}-status`}
        autoComplete="off"
        spellCheck={false}
        placeholder={t("map.search.placeholder")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && places.length > 0) {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusResult(0));
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink shadow-sm placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <output
        id={`${id}-status`}
        className={
          message
            ? "mt-1 block rounded-control bg-surface px-3 py-1 text-caption text-ink-muted shadow-sm"
            : "sr-only"
        }
      >
        {message}
      </output>
      {showList ? (
        <ul
          aria-label={t("map.search.results")}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-control border border-line-soft bg-surface shadow-lg"
        >
          {places.map((place, i) => (
            <li key={place.id}>
              <button
                type="button"
                ref={(node) => {
                  results.current[i] = node;
                }}
                onClick={() => choose(place)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusResult(i + 1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (i === 0) input.current?.focus();
                    else focusResult(i - 1);
                  } else if (event.key === "Escape") {
                    setOpen(false);
                    input.current?.focus();
                  }
                }}
                className="min-h-11 w-full px-3 py-2 text-left text-body text-ink hover:bg-surface-muted focus-visible:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
