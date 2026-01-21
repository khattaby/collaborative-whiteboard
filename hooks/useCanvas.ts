"use client";

import { useRef, useState, useCallback } from "react";
import type {
  CanvasElement,
  Cursor,
  Point,
  ViewportState,
} from "@/lib/whiteboard/types";
import {
  calculateStickyHeight,
  screenToWorld,
  worldToScreen,
} from "@/lib/whiteboard/utils";

interface UseCanvasOptions {
  initialElements?: CanvasElement[];
}

interface UseCanvasReturn {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  elements: CanvasElement[];
  setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
  viewport: ViewportState;
  setViewport: React.Dispatch<React.SetStateAction<ViewportState>>;
  screenToWorldCoords: (screenX: number, screenY: number) => Point;
  worldToScreenCoords: (worldX: number, worldY: number) => Point;
  render: (
    cursors: Map<string, Cursor>,
    currentElement: CanvasElement | null,
  ) => void;
  drawElement: (
    ctx: CanvasRenderingContext2D,
    element: CanvasElement,
    scale: number,
  ) => void;
}

export function useCanvas(options: UseCanvasOptions = {}): UseCanvasReturn {
  const { initialElements = [] } = options;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [elements, setElements] = useState<CanvasElement[]>(initialElements);
  const [viewport, setViewport] = useState<ViewportState>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });

  const screenToWorldCoords = useCallback(
    (screenX: number, screenY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return screenToWorld(
        screenX,
        screenY,
        viewport.offsetX,
        viewport.offsetY,
        viewport.scale,
        rect,
      );
    },
    [viewport],
  );

  const worldToScreenCoords = useCallback(
    (worldX: number, worldY: number): Point => {
      return worldToScreen(
        worldX,
        worldY,
        viewport.offsetX,
        viewport.offsetY,
        viewport.scale,
      );
    },
    [viewport],
  );

  const drawElement = useCallback(
    (ctx: CanvasRenderingContext2D, element: CanvasElement, scale: number) => {
      ctx.save();

      switch (element.type) {
        case "pencil": {
          if (element.points.length < 2) break;
          ctx.lineWidth = element.size / scale;
          ctx.strokeStyle = element.color;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(element.points[0].x, element.points[0].y);
          for (let i = 1; i < element.points.length; i++) {
            ctx.lineTo(element.points[i].x, element.points[i].y);
          }
          ctx.stroke();
          break;
        }

        case "rectangle": {
          ctx.lineWidth = element.size / scale;
          ctx.strokeStyle = element.color;
          ctx.strokeRect(element.x, element.y, element.width, element.height);
          if (element.fill) {
            ctx.fillStyle = element.fill;
            ctx.fillRect(element.x, element.y, element.width, element.height);
          }
          break;
        }

        case "circle": {
          ctx.lineWidth = element.size / scale;
          ctx.strokeStyle = element.color;
          ctx.beginPath();
          const cx = element.x + element.width / 2;
          const cy = element.y + element.height / 2;
          const rx = Math.abs(element.width / 2);
          const ry = Math.abs(element.height / 2);
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          if (element.fill) {
            ctx.fillStyle = element.fill;
            ctx.fill();
          }
          ctx.stroke();
          break;
        }

        case "triangle": {
          ctx.lineWidth = element.size / scale;
          ctx.strokeStyle = element.color;
          ctx.beginPath();
          ctx.moveTo(element.x + element.width / 2, element.y);
          ctx.lineTo(element.x, element.y + element.height);
          ctx.lineTo(element.x + element.width, element.y + element.height);
          ctx.closePath();
          if (element.fill) {
            ctx.fillStyle = element.fill;
            ctx.fill();
          }
          ctx.stroke();
          break;
        }

        case "diamond": {
          ctx.lineWidth = element.size / scale;
          ctx.strokeStyle = element.color;
          const dcx = element.x + element.width / 2;
          const dcy = element.y + element.height / 2;
          ctx.beginPath();
          ctx.moveTo(dcx, element.y);
          ctx.lineTo(element.x + element.width, dcy);
          ctx.lineTo(dcx, element.y + element.height);
          ctx.lineTo(element.x, dcy);
          ctx.closePath();
          if (element.fill) {
            ctx.fillStyle = element.fill;
            ctx.fill();
          }
          ctx.stroke();
          break;
        }

        case "arrow": {
          ctx.lineWidth = element.size / scale;
          ctx.strokeStyle = element.color;
          ctx.lineCap = "round";

          const startX = element.x;
          const startY = element.y;
          const endX = element.x + element.width;
          const endY = element.y + element.height;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          // Draw arrowhead
          const angle = Math.atan2(endY - startY, endX - startX);
          const headLength = (element.size / scale) * 6;
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLength * Math.cos(angle - Math.PI / 6),
            endY - headLength * Math.sin(angle - Math.PI / 6),
          );
          ctx.moveTo(endX, endY);
          ctx.lineTo(
            endX - headLength * Math.cos(angle + Math.PI / 6),
            endY - headLength * Math.sin(angle + Math.PI / 6),
          );
          ctx.stroke();
          break;
        }

        case "line": {
          ctx.lineWidth = element.size / scale;
          ctx.strokeStyle = element.color;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(element.x, element.y);
          ctx.lineTo(element.x + element.width, element.y + element.height);
          ctx.stroke();
          break;
        }

        case "text": {
          ctx.font = `${element.fontSize}px sans-serif`;
          ctx.fillStyle = element.color;
          ctx.textBaseline = "top";

          const lines = element.content.split("\n");
          lines.forEach((line, index) => {
            ctx.fillText(
              line,
              element.x,
              element.y + index * element.fontSize * 1.2,
            );
          });
          break;
        }

        case "sticky": {
          const stickyWidth = element.width || 180;
          const stickyHeight = calculateStickyHeight(ctx, element);
          const padding = 16;

          // Background
          ctx.fillStyle = element.color || "#fef08a";
          ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          ctx.fillRect(element.x, element.y, stickyWidth, stickyHeight);

          // Reset shadow
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          // Text
          ctx.fillStyle = "#1f2937";
          ctx.font = `${element.fontSize}px sans-serif`;
          ctx.textBaseline = "top";

          const contentWidth = stickyWidth - padding * 2;
          const lineHeight = element.fontSize * 1.4;
          let y = element.y + padding;

          const paragraphs = element.content.split("\n");
          for (const paragraph of paragraphs) {
            if (paragraph === "") {
              y += lineHeight;
              continue;
            }

            const words = paragraph.split(" ");
            let currentLine = "";

            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const metrics = ctx.measureText(testLine);

              if (metrics.width > contentWidth && currentLine) {
                ctx.fillText(currentLine, element.x + padding, y);
                y += lineHeight;
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }

            if (currentLine) {
              ctx.fillText(currentLine, element.x + padding, y);
              y += lineHeight;
            }
          }
          break;
        }
      }

      ctx.restore();
    },
    [],
  );

  const render = useCallback(
    (cursors: Map<string, Cursor>, currentElement: CanvasElement | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const { offsetX, offsetY, scale } = viewport;
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const cssWidth = canvas.width / dpr;
      const cssHeight = canvas.height / dpr;

      // Clear canvas
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background grid
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#f9fafb";
      context.fillRect(0, 0, cssWidth, cssHeight);

      // Apply transform
      context.setTransform(
        dpr * scale,
        0,
        0,
        dpr * scale,
        dpr * offsetX,
        dpr * offsetY,
      );

      // Draw grid - DISABLED
      // const gridSize = 50;
      // const startX =
      //   Math.floor(-offsetX / scale / gridSize) * gridSize - gridSize;
      // const startY =
      //   Math.floor(-offsetY / scale / gridSize) * gridSize - gridSize;
      // const endX =
      //   Math.ceil((cssWidth - offsetX) / scale / gridSize) * gridSize +
      //   gridSize;
      // const endY =
      //   Math.ceil((cssHeight - offsetY) / scale / gridSize) * gridSize +
      //   gridSize;

      // context.strokeStyle = "#e5e7eb";
      // context.lineWidth = 1 / scale;
      // context.beginPath();

      // for (let x = startX; x <= endX; x += gridSize) {
      //   context.moveTo(x, startY);
      //   context.lineTo(x, endY);
      // }
      // for (let y = startY; y <= endY; y += gridSize) {
      //   context.moveTo(startX, y);
      //   context.lineTo(endX, y);
      // }
      // context.stroke();

      for (const element of elements) {
        if (element.type === "text" || element.type === "sticky") continue;
        drawElement(context, element, scale);
      }

      // Draw current element being drawn
      if (currentElement) {
        if (
          currentElement.type !== "text" &&
          currentElement.type !== "sticky"
        ) {
          drawElement(context, currentElement, scale);
        }
      }

      let hasTextOrSticky = false;
      for (const element of elements) {
        if (element.type === "text" || element.type === "sticky") {
          hasTextOrSticky = true;
          break;
        }
      }

      if (hasTextOrSticky) {
        context.save();
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.textBaseline = "top";

        for (const element of elements) {
          if (element.type !== "text" && element.type !== "sticky") continue;
          const { x: screenX, y: screenY } = worldToScreen(
            element.x,
            element.y,
            offsetX,
            offsetY,
            scale,
          );

          if (element.type === "text") {
            const fontPx = Math.max(
              10,
              Math.min(240, element.fontSize * scale),
            );
            context.font = `${fontPx}px sans-serif`;
            context.fillStyle = element.color;
            const lineHeight = fontPx * 1.2;
            const lines = element.content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              context.fillText(lines[i], screenX, screenY + i * lineHeight);
            }
            continue;
          }

          const baseWidth = element.width || 180;
          const widthPx = Math.max(140, Math.min(900, baseWidth * scale));
          const fontPx = Math.max(12, Math.min(240, element.fontSize * scale));
          const paddingPx = Math.max(
            10,
            Math.min(32, Math.round(widthPx * 0.09)),
          );

          context.font = `${fontPx}px sans-serif`;

          const contentWidthPx = Math.max(1, widthPx - paddingPx * 2);
          const lineHeight = fontPx * 1.4;

          const lines: string[] = [];
          const paragraphs = element.content.split("\n");

          for (const paragraph of paragraphs) {
            if (paragraph === "") {
              lines.push("");
              continue;
            }

            const words = paragraph.split(" ");
            let currentLine = "";

            for (const word of words) {
              const testLine = currentLine ? `${currentLine} ${word}` : word;
              const metrics = context.measureText(testLine);

              if (metrics.width > contentWidthPx && currentLine) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }

            if (currentLine) {
              lines.push(currentLine);
            }
          }

          const heightPx = Math.max(
            90,
            Math.min(
              1200,
              Math.max(1, lines.length) * lineHeight + paddingPx * 2 + 8,
            ),
          );

          context.fillStyle = element.color || "#fef08a";
          context.shadowColor = "rgba(0, 0, 0, 0.15)";
          context.shadowBlur = 8;
          context.shadowOffsetX = 2;
          context.shadowOffsetY = 2;
          context.fillRect(screenX, screenY, widthPx, heightPx);

          context.shadowColor = "transparent";
          context.shadowBlur = 0;
          context.shadowOffsetX = 0;
          context.shadowOffsetY = 0;

          context.fillStyle = "#1f2937";
          let y = screenY + paddingPx;
          for (const line of lines) {
            if (line === "") {
              y += lineHeight;
              continue;
            }
            context.fillText(line, screenX + paddingPx, y);
            y += lineHeight;
          }
        }

        context.restore();
      }

      // Draw remote cursors
      cursors.forEach((cursor) => {
        context.save();

        // Cursor pointer
        context.fillStyle = cursor.color;
        context.beginPath();
        context.moveTo(cursor.x, cursor.y);
        context.lineTo(cursor.x, cursor.y + 18);
        context.lineTo(cursor.x + 4, cursor.y + 14);
        context.lineTo(cursor.x + 10, cursor.y + 14);
        context.closePath();
        context.fill();

        // Name label
        context.font = "12px sans-serif";
        const textMetrics = context.measureText(cursor.name);
        const labelX = cursor.x + 12;
        const labelY = cursor.y + 12;
        const labelPadding = 4;

        context.fillStyle = cursor.color;
        context.fillRect(
          labelX - labelPadding,
          labelY - 12,
          textMetrics.width + labelPadding * 2,
          16,
        );

        context.fillStyle = "white";
        context.fillText(cursor.name, labelX, labelY);

        context.restore();
      });
    },
    [elements, viewport, drawElement],
  );

  return {
    canvasRef,
    elements,
    setElements,
    viewport,
    setViewport,
    screenToWorldCoords,
    worldToScreenCoords,
    render,
    drawElement,
  };
}
