"use client";

import { useEffect, useState } from "react";

export function CityClock() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const format = () => new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    setLabel(format());
    const timer = window.setInterval(() => setLabel(format()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return <p className="text-sm text-[#C5D0DC]">{label ? `${label} SAST` : "South African time"}</p>;
}
