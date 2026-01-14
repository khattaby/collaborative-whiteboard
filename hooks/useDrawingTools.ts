"use client";

import { useState, useCallback } from "react";
import type {
    CanvasElement,
    ToolType,
    ToolSettings,
    Point,
    PencilElement,
    ShapeElement,
    TextElement,
} from "@/lib/whiteboard/types";
import { generateElementId, getElementAtPosition } from "@/lib/whiteboard/utils";

interface UseDrawingToolsOptions {
    userId: string;
    userName?: string;
    elements: CanvasElement[];
    setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
    screenToWorldCoords: (screenX: number, screenY: number) => Point;
    onElementAdd?: (element: CanvasElement) => void;
    onElementUpdate?: (element: CanvasElement) => void;
    onElementDelete?: (elementId: string) => void;
    ctx?: CanvasRenderingContext2D | null;
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
    options: UseDrawingToolsOptions
): UseDrawingToolsReturn {
    const {
        userId,
        userName,
        elements,
        setElements,
        screenToWorldCoords,
        onElementAdd,
        onElementUpdate,
        onElementDelete,
        ctx,
    } = options;

    const [tool, setTool] = useState<ToolType>("pencil");
    const [settings, setSettings] = useState<ToolSettings>(DEFAULT_SETTINGS);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentElement, setCurrentElement] = useState<CanvasElement | null>(null);
    const [selectedElement, setSelectedElement] = useState<CanvasElement | null>(null);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [textEditPosition, setTextEditPosition] = useState<Point | null>(null);
    const [textEditValue, setTextEditValue] = useState("");
    const [isPanning, setIsPanning] = useState(false);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const worldPoint = screenToWorldCoords(e.clientX, e.clientY);

            // Handle pan tool
            if (tool === "pan") {
                setIsPanning(true);
                setStartPoint({ x: e.clientX, y: e.clientY });
                return;
            }

            // Handle select tool
            if (tool === "select") {
                const element = getElementAtPosition(worldPoint.x, worldPoint.y, elements, ctx);
                setSelectedElement(element);
                return;
            }

            // Handle eraser tool
            if (tool === "eraser") {
                const element = getElementAtPosition(worldPoint.x, worldPoint.y, elements, ctx);
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

            const newElement = createNewElement(
                tool,
                worldPoint,
                userId,
                userName,
                settings
            );

            if (newElement) {
                setCurrentElement(newElement);
            }
        },
        [tool, userId, userName, settings, elements, screenToWorldCoords, setElements, onElementDelete, ctx]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const worldPoint = screenToWorldCoords(e.clientX, e.clientY);

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
        },
        [isDrawing, currentElement, startPoint, screenToWorldCoords]
    );

    const handleMouseUp = useCallback(() => {
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
            onElementAdd?.(currentElement);
        }

        setIsDrawing(false);
        setCurrentElement(null);
        setStartPoint(null);
    }, [isDrawing, currentElement, setElements, onElementAdd]);

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
            color: tool === "sticky"
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
    }, [textEditPosition, textEditValue, tool, userId, userName, settings, setElements, onElementAdd]);

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
    settings: ToolSettings
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
