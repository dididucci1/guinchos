import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ImageOff, Loader2, X } from "lucide-react";
import { tokenStore } from "../lib/api";

/** As fotos exigem login, então são baixadas com o token e guardadas em memória. */
const cache = new Map<string, Promise<string>>();

function loadPhoto(id: number, thumb: boolean) {
  const key = `${id}:${thumb ? "t" : "f"}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/expenses/photos/${id}${thumb ? "?size=thumb" : ""}`, {
      headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` },
    }).then(async (r) => {
      if (!r.ok) throw new Error("Foto indisponível");
      return URL.createObjectURL(await r.blob());
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export function PhotoImg({ id, thumb, className = "", alt = "Foto da nota" }: { id: number; thumb?: boolean; className?: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    loadPhoto(id, !!thumb).then((u) => alive && setSrc(u), () => alive && setFailed(true));
    return () => { alive = false; };
  }, [id, thumb]);
  if (failed) return <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}><ImageOff className="size-5" /></div>;
  if (!src) return <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}><Loader2 className="size-4 animate-spin" /></div>;
  return <img src={src} alt={alt} className={`object-cover ${className}`} />;
}

/** Visualizador em tela cheia, com setas para passar as fotos. */
export function PhotoViewer({ ids, index, onClose }: { ids: number[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => setI(index), [index]);
  useEffect(() => {
    setSrc(null);
    if (ids[i]) loadPhoto(ids[i], false).then(setSrc, () => {});
  }, [ids, i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(ids.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ids.length, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm tabular">{ids.length > 1 ? `Foto ${i + 1} de ${ids.length}` : "Foto da nota"}</span>
        <div className="flex gap-1">
          {src && (
            <a href={src} download={`nota-${ids[i]}.jpg`} className="rounded-lg p-2 hover:bg-white/10" aria-label="Baixar foto">
              <Download className="size-5" />
            </a>
          )}
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        {src ? (
          <img src={src} alt="Foto da nota" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        ) : (
          <Loader2 className="size-8 animate-spin text-white" />
        )}
        {i > 0 && (
          <button onClick={(e) => { e.stopPropagation(); setI(i - 1); }} className="absolute left-2 rounded-full bg-black/50 p-2 text-white" aria-label="Anterior">
            <ChevronLeft className="size-6" />
          </button>
        )}
        {i < ids.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); setI(i + 1); }} className="absolute right-2 rounded-full bg-black/50 p-2 text-white" aria-label="Próxima">
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>
    </div>
  );
}
