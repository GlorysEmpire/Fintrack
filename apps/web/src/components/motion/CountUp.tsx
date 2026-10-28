"use client";

import { Money } from "@/components/Money";
import { useCountUp } from "@/hooks/useCountUp";

/** A money amount that counts to its new value (M1). Jumps under reduced motion. */
export function CountUp({
  value,
  currency,
  className,
  signed,
}: {
  value: number;
  currency: string;
  className?: string;
  signed?: boolean;
}) {
  const shown = useCountUp(value);
  return <Money amount={shown} currency={currency} className={className} signed={signed} />;
}
