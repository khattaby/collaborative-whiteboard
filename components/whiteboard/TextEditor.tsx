"use client";

import React, { useRef, useEffect } from "react";
import { Check, X } from "lucide-react";
import type { Point, ToolType } from "@/lib/whiteboard/types";

interface TextEditorProps {
    position: Point;
    value: string;
    onChange: (value: string) => void;
    onComplete: () => void;
    onCancel: () => void;
    toolType: ToolType;
    viewport: { offsetX: number; offsetY: number; scale: number };
}

export function TextEditor({
    position,
    value,
    onChange,
    onComplete,
    onCancel,
    toolType,
    viewport,
}: TextEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Calculate screen position
    const screenX = position.x * viewport.scale + viewport.offsetX;
    const screenY = position.y * viewport.scale + viewport.offsetY;

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onComplete();
        } else if (e.key === "Escape") {
            onCancel();
        }
    };

    const isSticky = toolType === "sticky";

    return (
        <div
            className="absolute z-50"
            style={{
                left: screenX,
                top: screenY,
            }}
        >
            <div
                className={`relative ${isSticky
                        ? "bg-yellow-100 shadow-lg rounded-sm"
                        : "bg-white border border-gray-300 rounded-lg shadow-md"
                    }`}
                style={{
                    minWidth: isSticky ? "180px" : "200px",
                }}
            >
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isSticky ? "Add a note..." : "Type here..."}
                    className={`w-full resize-none outline-none ${isSticky
                            ? "bg-transparent p-4 text-gray-800 min-h-[80px]"
                            : "bg-transparent p-3 text-gray-800 min-h-[60px]"
                        }`}
                    style={{
                        fontSize: isSticky ? "14px" : "16px",
                    }}
                    autoFocus
                />

                {/* Action buttons */}
                <div className="absolute -bottom-10 left-0 flex gap-1">
                    <button
                        onClick={onComplete}
                        className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-md"
                        title="Confirm (Enter)"
                    >
                        <Check size={16} />
                    </button>
                    <button
                        onClick={onCancel}
                        className="p-1.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors shadow-md"
                        title="Cancel (Esc)"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default TextEditor;
