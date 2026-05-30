"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    variant?: "default" | "pink" | "blue" | "yellow" | "green";
  }
>(({ className, value, variant = "default", ...props }, ref) => {
  const variants = {
    default: "bg-gray-900",
    pink: "bg-[#FF6B7A]",
    blue: "bg-[#4A90E2]",
    yellow: "bg-[#FFC93C]",
    green: "bg-[#4CD964]",
  };

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-5 w-full overflow-hidden rounded-full border-[3px] border-gray-900 bg-gray-200",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full w-full flex-1 transition-all", variants[variant])}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
