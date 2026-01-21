"use client";

import React, { useMemo, useState } from "react";
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
    SlidersHorizontal,
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
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const visibleTools = useMemo(() => {
        if (viewOnly) {
            return TOOLS.filter((t) => t.type === "pan" || t.type === "select");
        }
        return TOOLS;
    }, [viewOnly]);

    return (
        <div className="absolute top-24 left-6 z-40">
            <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="p-2">
                    <div className="grid grid-cols-2 gap-1.5">
                        {visibleTools.map(({ type, icon, label }) => {
                            const isActive = tool === type;
                            return (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => onToolChange(type)}
                                    className={[
                                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                                        isActive
                                            ? "bg-green-100 text-green-700 ring-1 ring-green-200 shadow-sm"
                                            : "text-gray-700 hover:bg-gray-100",
                                    ].join(" ")}
                                    title={label}
                                    aria-label={label}
                                >
                                    {icon}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {!viewOnly && (
                    <>
                        <div className="h-px bg-gray-200" />

                        <div className="p-2 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={() => setIsSettingsOpen((v) => !v)}
                                className="h-10 w-10 rounded-xl flex items-center justify-center text-gray-700 hover:bg-gray-100 transition-colors"
                                title="Style"
                                aria-label="Style"
                            >
                                <SlidersHorizontal size={18} />
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsSettingsOpen(true)}
                                className="h-10 w-10 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-colors"
                                title="Current color"
                                aria-label="Current color"
                            >
                                <span
                                    className="h-6 w-6 rounded-full ring-2 ring-white shadow-sm border border-gray-200"
                                    style={{ backgroundColor: color }}
                                />
                            </button>
                        </div>

                        {isSettingsOpen && (
                            <>
                                <div className="h-px bg-gray-200" />
                                <div className="p-3 w-[104px]">
                                    <div className="grid grid-cols-4 gap-2 mb-3">
                                        {PRESET_COLORS.map((presetColor) => (
                                            <button
                                                key={presetColor}
                                                type="button"
                                                onClick={() => onColorChange(presetColor)}
                                                className={[
                                                    "h-5 w-5 rounded-full transition-transform",
                                                    color === presetColor
                                                        ? "ring-2 ring-green-500 ring-offset-1 ring-offset-white"
                                                        : "hover:scale-110",
                                                ].join(" ")}
                                                style={{ backgroundColor: presetColor }}
                                                title={presetColor}
                                                aria-label={presetColor}
                                            />
                                        ))}
                                    </div>

                                    <input
                                        type="color"
                                        value={color}
                                        onChange={(e) => onColorChange(e.target.value)}
                                        className="w-full h-8 cursor-pointer rounded-lg border border-gray-200 bg-white"
                                        title="Custom color"
                                        aria-label="Custom color"
                                    />

                                    <div className="mt-3">
                                        <input
                                            type="range"
                                            min="1"
                                            max="20"
                                            value={size}
                                            onChange={(e) => onSizeChange(parseInt(e.target.value))}
                                            className="w-full h-1 accent-green-600"
                                            aria-label="Size"
                                        />
                                        <div className="mt-1 text-[11px] text-gray-600 text-center">
                                            {size}px
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default Toolbar;
