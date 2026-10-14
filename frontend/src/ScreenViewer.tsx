import { useEffect, useRef, useState } from "react";

interface Props {
  /** ws URL da co token, vd: ws://localhost:5173/vnc/<sid>?token=... (Vite proxy sang backend) */
  url: string;
}

interface Meta {
  w: number;
  h: number;
  pid: number;
}

/** Viewer tu xay: nhan frame JPEG (binary) qua WS, ve len canvas; gui click/chuột -> game. */
export default function ScreenViewer({ url }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!url) return;
    setStatus("connecting");
    const ws = new WebSocket(url);
    ws.binaryType = "blob";
    wsRef.current = ws;
    let frames = 0;
    let last = performance.now();
    const fpsTimer = setInterval(() => {
      const now = performance.now();
      setFps(Math.round((frames * 1000) / Math.max(1, now - last)));
      frames = 0;
      last = now;
    }, 1000);

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const m = JSON.parse(ev.data) as Meta & { type?: string };
          if (m.type === "meta") setMeta(m);
        } catch { /* ignore */ }
        return;
      }
      // Binary = JPEG frame.
      frames++;
      const blobUrl = URL.createObjectURL(ev.data as Blob);
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
        URL.revokeObjectURL(blobUrl);
      };
      img.src = blobUrl;
      setStatus("live");
    };
    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("idle");

    return () => {
      clearInterval(fpsTimer);
      ws.close();
    };
  }, [url]);

  function toClient(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Map tu kich thuoc hien thi ve kich thuoc client that (frame meta w,h).
    const scaleX = (meta?.w ?? canvas.width) / rect.width;
    const scaleY = (meta?.h ?? canvas.height) / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  }

  function sendMouse(e: React.MouseEvent<HTMLCanvasElement>, button: "left" | "right", action: "down" | "up" | "click") {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const { x, y } = toClient(e);
    ws.send(JSON.stringify({ type: "mouse", x, y, button, action }));
  }

  return (
    <div>
      <div className="row">
        <span className={"badge " + status}>Trạng thái: {status}</span>
        {meta && <span className="muted small">{meta.w}x{meta.h} · {fps} fps · pid {meta.pid}</span>}
      </div>
      <canvas
        ref={canvasRef}
        className="screen"
        onMouseDown={(e) => sendMouse(e, e.button === 2 ? "right" : "left", "down")}
        onMouseUp={(e) => sendMouse(e, e.button === 2 ? "right" : "left", "up")}
        onContextMenu={(e) => e.preventDefault()}
      />
      <p className="muted small">Click chuột trái để tương tác trong game. (Xem/điều khiển qua WebSocket screen-mirror, không dùng RFB.)</p>
    </div>
  );
}
