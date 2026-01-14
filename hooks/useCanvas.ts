"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { CanvasElement, Cursor, Point, ViewportState } from "@/lib/whiteboard/types";
import {
    stringToColor,
    calculateStickyHeight,
    screenToWorld,
    worldToScreen,
} from "@/lib/whiteboard/utils";

interface UseCanvasOptions {
    initialElements?: CanvasElement[];
}

interface UseCanvasReturn {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    ctx: CanvasRenderingContext2D | null;
    elements: CanvasElement[];
    setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
    viewport: ViewportState;
    setViewport: React.Dispatch<React.SetStateAction<ViewportState>>;
    screenToWorldCoords: (screenX: number, screenY: number) => Point;
    worldToScreenCoords: (worldX: number, worldY: number) => Point;
    render: (cursors: Map<string, Cursor>, currentElement: CanvasElement | null) => void;
    drawElement: (ctx: CanvasRenderingContext2D, element: CanvasElement) => void;
}

export function useCanvas(options: UseCanvasOptions = {}): UseCanvasReturn {
    const { initialElements = [] } = options;

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    const [elements, setElements] = useState<CanvasElement[]>(initialElements);
    const [viewport, setViewport] = useState<ViewportState>({
        offsetX: 0,
        offsetY: 0,
        scale: 1,
    });

    // Initialize canvas context
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const context = canvas.getContext("2d");
            setCtx(context);
        }
    }, []);

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
                rect
            );
        },
        [viewport]
    );

    const worldToScreenCoords = useCallback(
        (worldX: number, worldY: number): Point => {
            return worldToScreen(
                worldX,
                worldY,
                viewport.offsetX,
                viewport.offsetY,
                viewport.scale
            );
        },
        [viewport]
    );

    const drawElement = useCallback(
        (ctx: CanvasRenderingContext2D, element: CanvasElement) => {
            ctx.save();

            switch (element.type) {
                case "pencil": {
                    if (element.points.length < 2) break;
                    ctx.strokeStyle = element.color;
                    ctx.lineWidth = element.size;
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
                    ctx.strokeStyle = element.color;
                    ctx.lineWidth = element.size;
                    ctx.strokeRect(element.x, element.y, element.width, element.height);
                    if (element.fill) {
                        ctx.fillStyle = element.fill;
                        ctx.fillRect(element.x, element.y, element.width, element.height);
                    }
                    break;
                }

                case "circle": {
                    ctx.strokeStyle = element.color;
                    ctx.lineWidth = element.size;
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
                    ctx.strokeStyle = element.color;
                    ctx.lineWidth = element.size;
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
                    ctx.strokeStyle = element.color;
                    ctx.lineWidth = element.size;
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
                    ctx.strokeStyle = element.color;
                    ctx.lineWidth = element.size;
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
                    const headLength = 15;
                    ctx.beginPath();
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(
                        endX - headLength * Math.cos(angle - Math.PI / 6),
                        endY - headLength * Math.sin(angle - Math.PI / 6)
                    );
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(
                        endX - headLength * Math.cos(angle + Math.PI / 6),
                        endY - headLength * Math.sin(angle + Math.PI / 6)
                    );
                    ctx.stroke();
                    break;
                }

                case "line": {
                    ctx.strokeStyle = element.color;
                    ctx.lineWidth = element.size;
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
                        ctx.fillText(line, element.x, element.y + index * element.fontSize * 1.2);
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
        []
    );

    const render = useCallback(
        (cursors: Map<string, Cursor>, currentElement: CanvasElement | null) => {
            const canvas = canvasRef.current;
            const context = ctx;
            if (!canvas || !context) return;

            const { offsetX, offsetY, scale } = viewport;

            // Clear canvas
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);

            // Draw background grid
            context.fillStyle = "#f9fafb";
            context.fillRect(0, 0, canvas.width, canvas.height);

            // Apply transform
            context.setTransform(scale, 0, 0, scale, offsetX, offsetY);

            // Draw grid
            const gridSize = 50;
            const startX = Math.floor(-offsetX / scale / gridSize) * gridSize - gridSize;
            const startY = Math.floor(-offsetY / scale / gridSize) * gridSize - gridSize;
            const endX = Math.ceil((canvas.width - offsetX) / scale / gridSize) * gridSize + gridSize;
            const endY = Math.ceil((canvas.height - offsetY) / scale / gridSize) * gridSize + gridSize;

            context.strokeStyle = "#e5e7eb";
            context.lineWidth = 1 / scale;
            context.beginPath();

            for (let x = startX; x <= endX; x += gridSize) {
                context.moveTo(x, startY);
                context.lineTo(x, endY);
            }
            for (let y = startY; y <= endY; y += gridSize) {
                context.moveTo(startX, y);
                context.lineTo(endX, y);
            }
            context.stroke();

            // Draw elements
            elements.forEach((element) => {
                drawElement(context, element);
            });

            // Draw current element being drawn
            if (currentElement) {
                drawElement(context, currentElement);
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
                    16
                );

                context.fillStyle = "white";
                context.fillText(cursor.name, labelX, labelY);

                context.restore();
            });
        },
        [ctx, elements, viewport, drawElement]
    );

    return {
        canvasRef,
        ctx,
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
