"use client";

import React, { useRef, useEffect, useState } from "react";

type Point = { x: number; y: number };
type Stroke = {
  points: Point[];
  color: string;
  size: number;
};

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state (Infinite Canvas)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });

  // Data state
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  // Interaction state
  const [isPanning, setIsPanning] = useState(false);
  const [tool, setTool] = useState<"pen" | "hand">("pen");
  const lastMouse = useRef<{ x: number; y: number } | null>(null);

  // Coordinate conversion
  const screenToWorld = (screenX: number, screenY: number) => {
    // If inside container, adjust client coordinates relative to container
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    const relativeX = screenX - rect.left;
    const relativeY = screenY - rect.top;

    return {
      x: relativeX / camera.zoom + camera.x,
      y: relativeY / camera.zoom + camera.y,
    };
  };

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const { clientWidth, clientHeight } = containerRef.current;

        canvasRef.current.width = clientWidth * dpr;
        canvasRef.current.height = clientHeight * dpr;
        canvasRef.current.style.width = `${clientWidth}px`;
        canvasRef.current.style.height = `${clientHeight}px`;
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Wheel Handler (Non-passive for Zoom)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const zoomFactor = Math.exp(-e.deltaY * zoomSensitivity);

      setCamera((prevCamera) => {
        const newZoom = prevCamera.zoom * zoomFactor;

        // Calculate mouse position relative to canvas
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = mouseX / prevCamera.zoom + prevCamera.x;
        const worldY = mouseY / prevCamera.zoom + prevCamera.y;

        return {
          zoom: newZoom,
          x: worldX - mouseX / newZoom,
          y: worldY - mouseY / newZoom,
        };
      });
    };

    // Add event listener with passive: false to allow preventDefault()
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;

      // Clear screen (using physical pixels)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();

      // Apply DPR Scaling
      ctx.scale(dpr, dpr);

      // Apply Camera Transform
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // Style
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw all saved strokes
      strokes.forEach((stroke) => {
        if (stroke.points.length < 1) return;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;

        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      });

      // Draw current stroke
      if (currentStroke && currentStroke.points.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = currentStroke.color;
        ctx.lineWidth = currentStroke.size;
        ctx.moveTo(currentStroke.points[0].x, currentStroke.points[0].y);
        for (let i = 1; i < currentStroke.points.length; i++) {
          ctx.lineTo(currentStroke.points[i].x, currentStroke.points[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [camera, strokes, currentStroke]);

  // Mouse / Touch Handlers
  const onMouseDown = (e: React.MouseEvent) => {
    lastMouse.current = { x: e.clientX, y: e.clientY };

    if (e.button === 1 || tool === "hand") {
      setIsPanning(true);
      return;
    }

    if (e.button === 0 && tool === "pen") {
      const point = screenToWorld(e.clientX, e.clientY);
      setCurrentStroke({
        points: [point],
        color: "#000000",
        size: 3, // Constant world-space thickness
      });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!lastMouse.current) return;

    if (isPanning) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      setCamera((prev) => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom,
      }));
    } else if (currentStroke) {
      const point = screenToWorld(e.clientX, e.clientY);
      setCurrentStroke((prev) =>
        prev ? { ...prev, points: [...prev.points, point] } : null
      );
    }

    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = () => {
    setIsPanning(false);
    if (currentStroke) {
      setStrokes((prev) => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
    lastMouse.current = null;
  };

  return (
    <div className="w-screen h-screen bg-gray-100 p-8 flex flex-col overflow-hidden">
      {/* Title */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
          Infinite Canvas
        </h1>
        <div className="text-sm text-gray-500">Auto-saved</div>
      </div>

      {/* Frame Container */}
      <div
        ref={containerRef}
        className="flex-1 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden relative"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none w-full h-full"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Minimal Floating Toolbar (Inside Frame) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur shadow-md border border-gray-200 rounded-full px-4 py-2 flex gap-4">
          <button
            onClick={() => setTool("pen")}
            className={`p-2 rounded-full transition-colors ${
              tool === "pen"
                ? "bg-blue-100 text-blue-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Pen"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </button>
          <button
            onClick={() => setTool("hand")}
            className={`p-2 rounded-full transition-colors ${
              tool === "hand"
                ? "bg-blue-100 text-blue-600"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            title="Hand (Pan)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0" />
              <path d="M6 11.5V14c0 3 2.5 5 5 5h7.5c2.5 0 5-2.5 5-5v-3.5" />
            </svg>
          </button>
          <div className="w-px h-8 bg-gray-200 mx-1 self-center"></div>
          <button
            onClick={() => setStrokes([])}
            className="p-2 rounded-full text-red-500 hover:bg-red-50 transition-colors"
            title="Clear"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>

        <div className="absolute bottom-4 left-4 text-xs text-gray-400 pointer-events-none select-none">
          Scroll to zoom • Drag to pan (Hand)
        </div>
      </div>
    </div>
  );
}
