"use client";

import { useEffect, useState } from "react";

/** True below the md breakpoint (768px): the phone layout with the keypad and bottom sheet. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() =>
    typeof window === "undefined" ? false : !window.matchMedia("(min-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setPhone(!mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}
