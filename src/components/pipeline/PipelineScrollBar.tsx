import { useEffect, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export function PipelineScrollBar({ boardRef }: { boardRef: RefObject<HTMLDivElement | null> }) {
  const [position, setPosition] = useState({ left: 0, width: 0, max: 0, value: 0, visible: false });

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => {
      const rect = board.getBoundingClientRect();
      const max = Math.max(0, board.scrollWidth - board.clientWidth);
      const width = Math.min(384, Math.max(0, rect.width - 24));
      setPosition({
        left: rect.left + (rect.width - width) / 2,
        width,
        max,
        value: Math.min(max, Math.max(0, board.scrollLeft)),
        visible: max > 1 && rect.bottom > 100 && rect.top < window.innerHeight,
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(board);
    Array.from(board.children).forEach((child) => observer.observe(child));
    board.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true, capture: true });
    update();
    return () => {
      observer.disconnect();
      board.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [boardRef]);

  const move = (direction: number) => {
    const board = boardRef.current;
    if (!board) return;
    board.scrollBy({
      left: direction * Math.max(200, board.clientWidth * 0.75),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  if (!position.visible) return null;

  return (
    <div
      role="region"
      aria-label="Rolagem lateral do pipeline"
      className="fixed bottom-4 z-30 flex h-12 items-center gap-3 rounded-lg border bg-background/95 px-2 text-foreground shadow-lg backdrop-blur-sm"
      style={{ left: position.left, width: position.width }}
    >
      <Button variant="ghost" size="icon" className="shrink-0" aria-label="Mover pipeline para a esquerda" title="Mover para a esquerda" disabled={position.value <= 1} onClick={() => move(-1)}>
        <ChevronLeft />
      </Button>
      <Slider
        aria-label="Posição horizontal do pipeline"
        className="min-w-0 flex-1 py-3"
        min={0}
        max={position.max}
        step={1}
        value={[position.value]}
        onValueChange={([value]) => {
          if (value !== undefined) boardRef.current?.scrollTo({ left: value, behavior: "instant" });
        }}
      />
      <Button variant="ghost" size="icon" className="shrink-0" aria-label="Mover pipeline para a direita" title="Mover para a direita" disabled={position.value >= position.max - 1} onClick={() => move(1)}>
        <ChevronRight />
      </Button>
    </div>
  );
}