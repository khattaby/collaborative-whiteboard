"use client";

import { useState, useCallback, useRef } from "react";
import type {
  CanvasElement,
  ToolType,
  ToolSettings,
  Point,
  PencilElement,
  ShapeElement,
  TextElement,
} from "@/lib/whiteboard/types";
import {
  generateElementId,
  getElementAtPosition,
} from "@/lib/whiteboard/utils";

interface UseDrawingToolsOptions {
  userId: string;
  userName?: string;
  elements: CanvasElement[];
  setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
  screenToWorldCoords: (screenX: number, screenY: number) => Point;
  worldToScreenCoords?: (worldX: number, worldY: number) => Point;
  onElementAdd?: (element: CanvasElement) => void;
  onElementUpdate?: (element: CanvasElement) => void;
  onElementDelete?: (elementId: string) => void;
  ctx?: CanvasRenderingContext2D | null;
  scale: number;
}

interface UseDrawingToolsReturn {
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  settings: ToolSettings;
  setSettings: React.Dispatch<React.SetStateAction<ToolSettings>>;
  isDrawing: boolean;
  currentElement: CanvasElement | null;
  selectedElement: CanvasElement | null;
  textEditPosition: Point | null;
  textEditValue: string;
  setTextEditValue: (value: string) => void;
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleMouseUp: () => void;
  handleTextComplete: () => void;
  handleTextCancel: () => void;
  handleDeleteSelected: () => void;
}

const DEFAULT_SETTINGS: ToolSettings = {
  color: "#000000",
  size: 4,
  fontSize: 16,
};

const STICKY_COLORS = [
  "#fef08a", // yellow
  "#bbf7d0", // green
  "#bfdbfe", // blue
  "#fecaca", // red
  "#e9d5ff", // purple
  "#fed7aa", // orange
];

export function useDrawingTools(
  options: UseDrawingToolsOptions,
): UseDrawingToolsReturn {
  const {
    userId,
    userName,
    elements,
    setElements,
    screenToWorldCoords,
    worldToScreenCoords,
    onElementAdd,
    onElementUpdate,
    onElementDelete,
    ctx,
    scale,
  } = options;

  const [tool, setTool] = useState<ToolType>("pencil");
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_SETTINGS);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState<CanvasElement | null>(
    null,
  );
  const [selectedElement, setSelectedElement] = useState<CanvasElement | null>(
    null,
  );
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [textEditPosition, setTextEditPosition] = useState<Point | null>(null);
  const [textEditValue, setTextEditValue] = useState("");
  const [isErasing, setIsErasing] = useState(false);
  const dragSelectedRef = useRef<{
    start: Point;
    element: CanvasElement;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const worldPoint = screenToWorldCoords(e.clientX, e.clientY);

      // Handle select tool
      if (tool === "select") {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        const element =
          getTextOrStickyAtScreenPosition(
            screenX,
            screenY,
            elements,
            scale,
            ctx,
            worldToScreenCoords,
          ) ||
          getElementAtPosition(
            worldPoint.x,
            worldPoint.y,
            elements,
            scale,
            ctx,
          );
        setSelectedElement(element);
        if (element) {
          dragSelectedRef.current = { start: worldPoint, element };
        } else {
          dragSelectedRef.current = null;
        }
        return;
      }

      // Handle eraser tool
      if (tool === "eraser") {
        setIsErasing(true);
        const element = getElementAtPosition(
          worldPoint.x,
          worldPoint.y,
          elements,
          scale,
          ctx,
        );
        if (element) {
          setElements((prev) => prev.filter((el) => el.id !== element.id));
          onElementDelete?.(element.id);
        }
        return;
      }

      // Handle text tools
      if (tool === "text" || tool === "sticky") {
        setTextEditPosition(worldPoint);
        setTextEditValue("");
        return;
      }

      // Start drawing
      setIsDrawing(true);
      setStartPoint(worldPoint);

      const newElement = createNewElement(tool, worldPoint, userId, userName, {
        ...settings,
        size: settings.size,
      });

      if (newElement) {
        setCurrentElement(newElement);
        onElementAdd?.(newElement);
      }
    },
    [
      tool,
      userId,
      userName,
      settings,
      elements,
      screenToWorldCoords,
      worldToScreenCoords,
      setElements,
      onElementAdd,
      onElementDelete,
      ctx,
      scale,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const worldPoint = screenToWorldCoords(e.clientX, e.clientY);

      if (tool === "select" && dragSelectedRef.current) {
        const { start, element } = dragSelectedRef.current;
        const dx = worldPoint.x - start.x;
        const dy = worldPoint.y - start.y;
        if (dx !== 0 || dy !== 0) {
          const moved = translateElement(element, dx, dy);
          setElements((prev) =>
            prev.map((el) => (el.id === moved.id ? moved : el)),
          );
          setSelectedElement(moved);
          onElementUpdate?.(moved);
        }
        return;
      }

      if (isErasing && tool === "eraser") {
        const element = getElementAtPosition(
          worldPoint.x,
          worldPoint.y,
          elements,
          scale,
          ctx,
        );
        if (element) {
          setElements((prev) => prev.filter((el) => el.id !== element.id));
          onElementDelete?.(element.id);
        }
        return;
      }

      if (!isDrawing || !currentElement || !startPoint) return;

      let updatedElement: CanvasElement;

      if (currentElement.type === "pencil") {
        updatedElement = {
          ...currentElement,
          points: [...currentElement.points, worldPoint],
        } as PencilElement;
      } else {
        // Shape elements
        const width = worldPoint.x - startPoint.x;
        const height = worldPoint.y - startPoint.y;
        updatedElement = {
          ...currentElement,
          width,
          height,
        } as ShapeElement;
      }

      setCurrentElement(updatedElement);
      onElementUpdate?.(updatedElement);
    },
    [
      isDrawing,
      isErasing,
      tool,
      elements,
      scale,
      ctx,
      currentElement,
      startPoint,
      screenToWorldCoords,
      onElementUpdate,
      setElements,
      onElementDelete,
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (dragSelectedRef.current) {
      dragSelectedRef.current = null;
      return;
    }

    if (isErasing) {
      setIsErasing(false);
      return;
    }

    if (!isDrawing || !currentElement) {
      setIsDrawing(false);
      return;
    }

    // Check if element is valid (has meaningful size)
    let isValid = false;

    if (currentElement.type === "pencil") {
      isValid = currentElement.points.length > 1;
    } else {
      const shape = currentElement as ShapeElement;
      isValid = Math.abs(shape.width) > 5 || Math.abs(shape.height) > 5;
    }

    if (isValid) {
      setElements((prev) => [...prev, currentElement]);
      onElementUpdate?.(currentElement);
    } else {
      onElementDelete?.(currentElement.id);
    }

    setIsDrawing(false);
    setCurrentElement(null);
    setStartPoint(null);
  }, [
    isDrawing,
    isErasing,
    currentElement,
    setElements,
    onElementUpdate,
    onElementDelete,
  ]);

  const handleTextComplete = useCallback(() => {
    if (!textEditPosition || !textEditValue.trim()) {
      setTextEditPosition(null);
      setTextEditValue("");
      return;
    }

    const newElement: TextElement = {
      id: generateElementId(),
      type: tool === "sticky" ? "sticky" : "text",
      userId,
      authorName: userName,
      color:
        tool === "sticky"
          ? STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)]
          : settings.color,
      x: textEditPosition.x,
      y: textEditPosition.y,
      content: textEditValue,
      fontSize: settings.fontSize,
      width: tool === "sticky" ? 180 : undefined,
    };

    setElements((prev) => [...prev, newElement]);
    onElementAdd?.(newElement);

    setTextEditPosition(null);
    setTextEditValue("");
  }, [
    textEditPosition,
    textEditValue,
    tool,
    userId,
    userName,
    settings,
    setElements,
    onElementAdd,
  ]);

  const handleTextCancel = useCallback(() => {
    setTextEditPosition(null);
    setTextEditValue("");
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElement) return;

    setElements((prev) => prev.filter((el) => el.id !== selectedElement.id));
    onElementDelete?.(selectedElement.id);
    setSelectedElement(null);
  }, [selectedElement, setElements, onElementDelete]);

  return {
    tool,
    setTool,
    settings,
    setSettings,
    isDrawing,
    currentElement,
    selectedElement,
    textEditPosition,
    textEditValue,
    setTextEditValue,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTextComplete,
    handleTextCancel,
    handleDeleteSelected,
  };
}

function createNewElement(
  tool: ToolType,
  point: Point,
  userId: string,
  userName: string | undefined,
  settings: ToolSettings,
): CanvasElement | null {
  const id = generateElementId();
  const baseProps = {
    id,
    userId,
    authorName: userName,
    color: settings.color,
  };

  switch (tool) {
    case "pencil":
      return {
        ...baseProps,
        type: "pencil",
        points: [point],
        size: settings.size,
      } as PencilElement;

    case "rectangle":
    case "circle":
    case "triangle":
    case "diamond":
    case "arrow":
    case "line":
      return {
        ...baseProps,
        type: tool,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        size: settings.size,
      } as ShapeElement;

    default:
      return null;
  }
}

function getTextOrStickyAtScreenPosition(
  screenX: number,
  screenY: number,
  elements: CanvasElement[],
  scale: number,
  ctx: CanvasRenderingContext2D | null | undefined,
  worldToScreenCoords: ((worldX: number, worldY: number) => Point) | undefined,
): CanvasElement | null {
  if (!worldToScreenCoords) return null;

  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (element.type !== "text" && element.type !== "sticky") continue;

    const pos = worldToScreenCoords(element.x, element.y);

    if (element.type === "text") {
      const fontPx = Math.max(10, Math.min(240, element.fontSize * scale));
      const lines = element.content.split("\n");
      const lineHeight = fontPx * 1.2;

      let widthPx = Math.max(1, (element.width ?? 200) * scale);
      if (ctx) {
        const prevFont = ctx.font;
        ctx.font = `${fontPx}px sans-serif`;
        widthPx = Math.max(
          1,
          lines.reduce((max, line) => {
            const w = ctx.measureText(line).width;
            return w > max ? w : max;
          }, 0),
        );
        ctx.font = prevFont;
      }

      const heightPx = Math.max(1, lines.length) * lineHeight;
      const padding = 6;
      if (
        screenX >= pos.x - padding &&
        screenX <= pos.x + widthPx + padding &&
        screenY >= pos.y - padding &&
        screenY <= pos.y + heightPx + padding
      ) {
        return element;
      }
      continue;
    }

    const baseWidth = element.width || 180;
    const widthPx = Math.max(140, Math.min(900, baseWidth * scale));
    const fontPx = Math.max(12, Math.min(240, element.fontSize * scale));
    const paddingPx = Math.max(10, Math.min(32, Math.round(widthPx * 0.09)));
    const contentWidthPx = Math.max(1, widthPx - paddingPx * 2);
    const lineHeight = fontPx * 1.4;

    const lines: string[] = [];
    const paragraphs = element.content.split("\n");

    if (ctx) {
      const prevFont = ctx.font;
      ctx.font = `${fontPx}px sans-serif`;

      for (const paragraph of paragraphs) {
        if (paragraph === "") {
          lines.push("");
          continue;
        }

        const words = paragraph.split(" ");
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const metrics = ctx.measureText(testLine);

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

      ctx.font = prevFont;
    } else {
      lines.push(...paragraphs);
    }

    const heightPx = Math.max(
      90,
      Math.min(
        1200,
        Math.max(1, lines.length) * lineHeight + paddingPx * 2 + 8,
      ),
    );

    const padding = 6;
    if (
      screenX >= pos.x - padding &&
      screenX <= pos.x + widthPx + padding &&
      screenY >= pos.y - padding &&
      screenY <= pos.y + heightPx + padding
    ) {
      return element;
    }
  }

  return null;
}

function translateElement(
  element: CanvasElement,
  dx: number,
  dy: number,
): CanvasElement {
  switch (element.type) {
    case "pencil":
      return {
        ...element,
        points: element.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    case "rectangle":
    case "circle":
    case "triangle":
    case "diamond":
    case "arrow":
    case "line":
      return { ...element, x: element.x + dx, y: element.y + dy };
    case "text":
    case "sticky":
      return { ...element, x: element.x + dx, y: element.y + dy };
    default:
      return element;
  }
}
