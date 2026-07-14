"use client";

import { useEffect, useState } from "react";

const animatedIds = new Set<string>();

function scramble(text: string): string {
  return text
    .split("")
    .map((ch) => (ch === " " ? " " : Math.random() > 0.5 ? "1" : "0"))
    .join("");
}

export function BinaryText({
  text,
  id,
  className,
}: {
  text: string;
  id: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(() =>
    animatedIds.has(id) ? text : scramble(text),
  );

  useEffect(() => {
    if (animatedIds.has(id)) {
      setDisplay(text);
      return;
    }

    const chars = text.length;
    if (chars === 0) {
      setDisplay("");
      animatedIds.add(id);
      return;
    }

    const duration = Math.min(1000, Math.max(300, chars * 35));
    const start = performance.now();
    let frame = 0;

    setDisplay(scramble(text));

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const revealed = Math.floor(progress * chars);

      setDisplay(
        text
          .split("")
          .map((ch, i) => {
            if (i < revealed) return ch;
            if (ch === " ") return " ";
            return Math.random() > 0.5 ? "1" : "0";
          })
          .join(""),
      );

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        animatedIds.add(id);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, text]);

  return <span className={className}>{display}</span>;
}
