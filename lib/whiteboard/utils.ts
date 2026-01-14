import type { Point, CanvasElement, TextElement } from "./types";

/**
 * Generate a consistent color from a string (e.g., user ID)
 */
export function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 50%)`;
}

/**
 * Calculate distance from a point to a line segment
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
        return Math.hypot(p.x - a.x, p.y - a.y);
    }

    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;

    return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Calculate the height of a sticky note based on its content
 */
export function calculateStickyHeight(
    ctx: CanvasRenderingContext2D,
    sticky: TextElement
): number {
    const minWidth = sticky.width || 180;
    const padding = 16;
    const lineHeight = sticky.fontSize * 1.4;
    const contentWidth = minWidth - padding * 2;

    ctx.font = `${sticky.fontSize}px sans-serif`;

    const lines: string[] = [];
    const paragraphs = sticky.content.split("\n");

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

            if (metrics.width > contentWidth && currentLine) {
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

    const textHeight = Math.max(1, lines.length) * lineHeight;
    return textHeight + padding * 2 + 8; // Extra padding for visual comfort
}

/**
 * Check if a point is inside a triangle
 */
function isPointInTriangle(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number
): boolean {
    const area =
        0.5 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3);
    const sign = area < 0 ? -1 : 1;

    const s =
        (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py) * sign;
    const t =
        (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py) * sign;

    return s > 0 && t > 0 && s + t < 2 * area * sign;
}

/**
 * Check if a point is inside a diamond shape
 */
function isPointInDiamond(
    px: number,
    py: number,
    cx: number,
    cy: number,
    halfWidth: number,
    halfHeight: number
): boolean {
    const dx = Math.abs(px - cx);
    const dy = Math.abs(py - cy);
    return dx / halfWidth + dy / halfHeight <= 1;
}

/**
 * Get the element at a specific position (hit testing)
 */
export function getElementAtPosition(
    x: number,
    y: number,
    elements: CanvasElement[],
    ctx?: CanvasRenderingContext2D | null
): CanvasElement | null {
    // Iterate in reverse to get top-most element first
    for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i];

        switch (element.type) {
            case "pencil": {
                const threshold = (element.size || 4) + 5;
                for (let j = 0; j < element.points.length - 1; j++) {
                    const dist = distanceToSegment(
                        { x, y },
                        element.points[j],
                        element.points[j + 1]
                    );
                    if (dist < threshold) return element;
                }
                break;
            }

            case "rectangle": {
                const padding = 5;
                if (
                    x >= element.x - padding &&
                    x <= element.x + element.width + padding &&
                    y >= element.y - padding &&
                    y <= element.y + element.height + padding
                ) {
                    return element;
                }
                break;
            }

            case "circle": {
                const cx = element.x + element.width / 2;
                const cy = element.y + element.height / 2;
                const rx = Math.abs(element.width / 2) + 5;
                const ry = Math.abs(element.height / 2) + 5;
                const dx = (x - cx) / rx;
                const dy = (y - cy) / ry;
                if (dx * dx + dy * dy <= 1) return element;
                break;
            }

            case "triangle": {
                const x1 = element.x + element.width / 2;
                const y1 = element.y;
                const x2 = element.x;
                const y2 = element.y + element.height;
                const x3 = element.x + element.width;
                const y3 = element.y + element.height;
                if (isPointInTriangle(x, y, x1, y1, x2, y2, x3, y3)) {
                    return element;
                }
                break;
            }

            case "diamond": {
                const cx = element.x + element.width / 2;
                const cy = element.y + element.height / 2;
                if (
                    isPointInDiamond(
                        x,
                        y,
                        cx,
                        cy,
                        Math.abs(element.width / 2) + 5,
                        Math.abs(element.height / 2) + 5
                    )
                ) {
                    return element;
                }
                break;
            }

            case "arrow":
            case "line": {
                const threshold = (element.size || 2) + 5;
                const start = { x: element.x, y: element.y };
                const end = {
                    x: element.x + element.width,
                    y: element.y + element.height,
                };
                if (distanceToSegment({ x, y }, start, end) < threshold) {
                    return element;
                }
                break;
            }

            case "text": {
                const padding = 5;
                const textWidth = element.width || 200;
                const textHeight = element.height || element.fontSize * 1.5;
                if (
                    x >= element.x - padding &&
                    x <= element.x + textWidth + padding &&
                    y >= element.y - padding &&
                    y <= element.y + textHeight + padding
                ) {
                    return element;
                }
                break;
            }

            case "sticky": {
                const stickyWidth = element.width || 180;
                let stickyHeight = element.height || 100;

                // Calculate actual height if context available
                if (ctx) {
                    stickyHeight = calculateStickyHeight(ctx, element);
                }

                const padding = 5;
                if (
                    x >= element.x - padding &&
                    x <= element.x + stickyWidth + padding &&
                    y >= element.y - padding &&
                    y <= element.y + stickyHeight + padding
                ) {
                    return element;
                }
                break;
            }
        }
    }

    return null;
}

/**
 * Generate a unique element ID
 */
export function generateElementId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(
    screenX: number,
    screenY: number,
    offsetX: number,
    offsetY: number,
    scale: number,
    canvasRect: DOMRect
): Point {
    return {
        x: (screenX - canvasRect.left - offsetX) / scale,
        y: (screenY - canvasRect.top - offsetY) / scale,
    };
}

/**
 * Convert world coordinates to screen coordinates
 */
export function worldToScreen(
    worldX: number,
    worldY: number,
    offsetX: number,
    offsetY: number,
    scale: number
): Point {
    return {
        x: worldX * scale + offsetX,
        y: worldY * scale + offsetY,
    };
}
