import * as RadixTabs from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn, focusRing } from "../cn";

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        "glass-track inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-0.5",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "min-h-10 shrink-0 rounded-full border border-transparent px-4 text-[0.8125rem] font-bold whitespace-nowrap text-subtle hover:text-ink data-[state=active]:glass-selected data-[state=active]:text-ink",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("pt-4", focusRing, className)} {...props} />;
}
