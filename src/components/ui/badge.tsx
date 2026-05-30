import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "pink" | "blue" | "yellow" | "green" | "purple";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-gray-900 text-white",
    pink: "bg-[#FF6B7A] text-white",
    blue: "bg-[#4A90E2] text-white",
    yellow: "bg-[#FFC93C] text-gray-900",
    green: "bg-[#4CD964] text-white",
    purple: "bg-[#7B61FF] text-white",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border-[3px] border-gray-900 px-3 py-1 text-xs font-bold transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
