import lottie from "lottie-web/build/player/lottie_light";
import { useEffect, useRef } from "react";
import animation from "./assets/thinking.json";

/** The frame shown, still, when the person asks for reduced motion. */
const STILL_FRAME = 15;

/**
 * The thinking animation (a Lottie file drawn as SVG by the light player, which has no expression
 * engine). It loops while the assistant works; with reduced motion it stands still on one frame.
 * Purely decorative: the live region in the panel announces each step.
 */
export function LottieLoader({ className }: { className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const player = lottie.loadAnimation({
      container: element,
      renderer: "svg",
      loop: true,
      autoplay: !still,
      // The player changes the data it is given, so each instance gets its own copy.
      animationData: structuredClone(animation),
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
    });
    if (still) player.goToAndStop(STILL_FRAME, true);
    return () => player.destroy();
  }, []);
  return <span ref={host} aria-hidden="true" data-testid="lottie" className={className} />;
}
