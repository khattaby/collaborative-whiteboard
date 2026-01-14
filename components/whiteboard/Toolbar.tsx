"use client";

import React from "react";
import type { ToolType } from "@/lib/whiteboard/types";
import {
    Hand,
    Pencil,
    Square,
    Circle,
    Triangle,
    Diamond,
    ArrowRight,
    Minus,
    Type,
    StickyNote,
    Eraser,
    MousePointer2,
} from "lucide-react";

interface ToolbarProps {
    tool: ToolType;
    onToolChange: (tool: ToolType) => void;
    color: string;
    onColorChange: (color: string) => void;
    size: number;
    onSizeChange: (size: number) => void;
    viewOnly?: boolean;
}

const TOOLS: { type: ToolType; icon: React.ReactNode; label: string }[] = [
    { type: "select", icon: <MousePointer2 size={18} />, label: "Select" },
    { type: "pan", icon: <Hand size={18} />, label: "Pan" },
    { type: "pencil", icon: <Pencil size={18} />, label: "Pencil" },
    { type: "rectangle", icon: <Square size={18} />, label: "Rectangle" },
    { type: "circle", icon: <Circle size={18} />, label: "Circle" },
    { type: "triangle", icon: <Triangle size={18} />, label: "Triangle" },
    { type: "diamond", icon: <Diamond size={18} />, label: "Diamond" },
    { type: "arrow", icon: <ArrowRight size={18} />, label: "Arrow" },
    { type: "line", icon: <Minus size={18} />, label: "Line" },
    { type: "text", icon: <Type size={18} />, label: "Text" },
    { type: "sticky", icon: <StickyNote size={18} />, label: "Sticky Note" },
    { type: "eraser", icon: <Eraser size={18} />, label: "Eraser" },
];

const PRESET_COLORS = [
    "#000000",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
];

export function Toolbar({
    tool,
    onToolChange,
    color,
    onColorChange,
    size,
    onSizeChange,
    viewOnly = false,
}: ToolbarProps) {
    if (viewOnly) {
        return (
            <div className="absolute top-20 left-4 bg-white rounded-xl shadow-lg border border-gray-200 p-2">
                <div className="flex flex-col gap-1">
                    {TOOLS.filter((t) => t.type === "pan" || t.type === "select").map(
                        ({ type, icon, label }) => (
                            <button
                                key={type}
                                onClick={() => onToolChange(type)}
                                className={`p-2.5 rounded-lg transition-all duration-150 ${tool === type
                                        ? "bg-green-100 text-green-700 shadow-sm"
                                        : "hover:bg-gray-100 text-gray-600"
                                    }`}
                                title={label}
                            >
                                {icon}
                            </button>
                        )
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="absolute top-20 left-4 bg-white rounded-xl shadow-lg border border-gray-200 p-2">
            {/* Tools */}
            <div className="flex flex-col gap-1">
                {TOOLS.map(({ type, icon, label }) => (
                    <button
                        key={type}
                        onClick={() => onToolChange(type)}
                        className={`p-2.5 rounded-lg transition-all duration-150 ${tool === type
                                ? "bg-green-100 text-green-700 shadow-sm"
                                : "hover:bg-gray-100 text-gray-600"
                            }`}
                        title={label}
                    >
                        {icon}
                    </button>
                ))}
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 my-2" />

            {/* Color Picker */}
            <div className="flex flex-col gap-1 items-center">
                <div className="grid grid-cols-2 gap-1">
                    {PRESET_COLORS.map((presetColor) => (
                        <button
                            key={presetColor}
                            onClick={() => onColorChange(presetColor)}
                            className={`w-5 h-5 rounded-full transition-all ${color === presetColor
                                    ? "ring-2 ring-offset-1 ring-green-500"
                                    : "hover:scale-110"
                                }`}
                            style={{ backgroundColor: presetColor }}
                            title={presetColor}
                        />
                    ))}
                </div>

                {/* Custom Color */}
                <input
                    type="color"
                    value={color}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="w-8 h-8 cursor-pointer rounded border-0 p-0"
                    title="Custom color"
                />
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 my-2" />

            {/* Size Slider */}
            <div className="flex flex-col items-center gap-1 px-1">
                <span className="text-xs text-gray-500">Size</span>
                <input
                    type="range"
                    min="1"
                    max="20"
                    value={size}
                    onChange={(e) => onSizeChange(parseInt(e.target.value))}
                    className="w-full h-1 accent-green-600"
                />
                <span className="text-xs text-gray-600 font-medium">{size}px</span>
            </div>
        </div>
    );
}

export default Toolbar;
