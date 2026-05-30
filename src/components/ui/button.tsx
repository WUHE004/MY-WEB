import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "pink" | "blue" | "yellow" | "ghost";
  size?: "sm" | "md" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary: "neo-btn neo-btn-primary",
      secondary: "neo-btn neo-btn-secondary",
      pink: "neo-btn neo-btn-pink",
      blue: "neo-btn neo-btn-blue",
      yellow: "neo-btn neo-btn-yellow",
      ghost: "border-0 shadow-none hover:bg-gray-100 rounded-xl font-bold",
    };

    const sizes = {
      sm: "px-4 py-2 text-sm",
      md: "px-6 py-3 text-base",
      lg: "px-8 py-4 text-lg",
    };

    return (
      <button
        ref={ref}
        className={cn(variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
