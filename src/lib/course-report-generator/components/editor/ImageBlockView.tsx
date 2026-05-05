"use client";

import * as React from "react";
import type { CanvasBlock } from "../../types/report";

interface Props {
  block: Extract<CanvasBlock, { kind: "image" }>;
  selected: boolean;
}

export function ImageBlockView({ block }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={block.src}
      alt={block.alt ?? ""}
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: block.borderRadius,
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
}
