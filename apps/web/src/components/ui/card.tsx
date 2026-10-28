import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  glass,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { glass?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-[var(--surface-glass)] text-card-foreground shadow-[var(--shadow-glass)] backdrop-blur-xl",
        "motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 motion-safe:[@media(hover:hover)]:hover:-translate-y-0.5",
        glass && "bg-card/60",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pb-0", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm font-semibold text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
