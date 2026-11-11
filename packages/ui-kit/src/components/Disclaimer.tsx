import { cn } from "../cn";
import { type DisclaimerId, disclaimers } from "../disclaimers";

export function Disclaimer({ id, className }: { id: DisclaimerId; className?: string }) {
  return <p className={cn("text-caption text-ink-muted", className)}>{disclaimers[id]}</p>;
}

export function DisclaimerList({ className }: { className?: string }) {
  return (
    <ul className={cn("list-disc space-y-1 pl-5 text-caption text-ink-muted", className)}>
      {Object.values(disclaimers).map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}
