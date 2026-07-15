import { useState, useEffect } from 'react';

const COLORS = [
  { name: 'green', value: '#86efac' },
  { name: 'yellow', value: '#fde68a' },
  { name: 'red', value: '#fca5a5' },
  { name: 'pink', value: '#f9a8d4' },
];

function CommentPin({ annotation, currentUserId, onDelete }) {
  const [open, setOpen] = useState(false);
  const canDelete = annotation.userId === currentUserId;
  const pos = annotation.data?.position || { x: annotation.data?.x, y: annotation.data?.y, height: 0 };

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: `${pos.x * 100}%`,
        top: `${(pos.y + (pos.height || 0) / 2) * 100}%`,
        transform: 'translate(calc(-100% - 6px), -50%)',
      }}
    >
      <button
        title={annotation.data?.text}
        className="block h-3.5 w-3.5 rounded-full border-2 border-white bg-amber-500 shadow"
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="absolute left-1/2 top-full z-20 mt-1 w-56 -translate-x-1/2 rounded-md border bg-white p-2 shadow-lg">
          <div className="mb-1 text-xs font-medium text-gray-700">{annotation.user?.name || 'Unknown'}</div>
          <div className="whitespace-pre-wrap text-sm text-gray-800">{annotation.data?.text}</div>
          {canDelete && (
            <button className="mt-1 text-xs text-red-500" onClick={() => onDelete(annotation.id)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Walk up from the Range's start container to the nearest Element and read its
// computed font style, so EDIT replacements render with the same size/family/
// weight as the original PDF text layer instead of a hardcoded guess.
function getSelectionFontStyle(range, containerHeight) {
  let node = range.startContainer;
  while (node && node.nodeType !== 1) node = node.parentElement;
  if (!node || !containerHeight) return null;

  const cs = window.getComputedStyle(node);
  const fontSizePx = parseFloat(cs.fontSize) || 13;

  return {
    fontFamily: cs.fontFamily,
    fontWeight: cs.fontWeight,
    fontStyle: cs.fontStyle,
    color: cs.color,
    fontSizePx,
    fontSizeFrac: fontSizePx / containerHeight,
  };
}

const SELECTION_TOOLS = ['highlight', 'edit', 'comment'];

export default function AnnotationCanvas({
  containerRef,
  annotations = [],
  activeTool,
  currentUserId,
  onCreateAnnotation,
  onTextChange,
  onDeleteAnnotation,
})  {
  const [pendingSelection, setPendingSelection] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [commentText, setCommentText] = useState('');
  const [containerHeight, setContainerHeight] = useState(0);

  // Track the live rendered height of the page container so font sizes
  // (stored as a fraction of height) stay correct across zoom/resize.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setContainerHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Clear any in-progress popup when the tool changes
  useEffect(() => {
    setPendingSelection(null);
    setEditDraft('');
    setCommentText('');
  }, [activeTool]);

  // Capture text selection for highlight/edit/comment tools — all three are
  // anchored to an actual selected line of text, not a click point.

  // Capture text selection for highlight/edit/comment tools. Comment also
  // supports a plain click (no drag) — anchored to the click point instead
  // of a selected line.
  useEffect(() => {
    if (!SELECTION_TOOLS.includes(activeTool)) return;

    let downPos = null;

    function handleMouseDown(e) {
      downPos = { x: e.clientX, y: e.clientY };
    }

    function handleMouseUp(e) {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const selection = window.getSelection();
      const hasDragSelection = selection && !selection.isCollapsed && selection.toString().trim();

      if (hasDragSelection) {
        const range = selection.getRangeAt(0);
        if (!containerRef.current.contains(range.commonAncestorContainer)) { downPos = null; return; }

        const text = selection.toString().trim();
        const clientRects = Array.from(range.getClientRects());
        if (clientRects.length === 0) { downPos = null; return; }

        const rects = clientRects.map((r) => ({
          x: (r.left - containerRect.left) / containerRect.width,
          y: (r.top - containerRect.top) / containerRect.height,
          width: r.width / containerRect.width,
          height: r.height / containerRect.height,
        }));

        const b = range.getBoundingClientRect();
        const bounds = {
          x: (b.left - containerRect.left) / containerRect.width,
          y: (b.top - containerRect.top) / containerRect.height,
          width: b.width / containerRect.width,
          height: b.height / containerRect.height,
        };

        const style = getSelectionFontStyle(range, containerRect.height);
        setPendingSelection({ rects, bounds, text, style });
        setEditDraft('');
        setCommentText('');
        downPos = null;
        return;
      }

      // No drag-selection — for the comment tool, treat a plain click as a point-comment
      if (activeTool === 'comment' && downPos) {
        const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        const insideContainer =
          e.clientX >= containerRect.left && e.clientX <= containerRect.right &&
          e.clientY >= containerRect.top && e.clientY <= containerRect.bottom;

        if (moved < 4 && insideContainer) {
          const x = (e.clientX - containerRect.left) / containerRect.width;
          const y = (e.clientY - containerRect.top) / containerRect.height;
          setPendingSelection({ rects: [], bounds: { x, y, width: 0, height: 0 }, text: '', style: null });
          setCommentText('');
        }
      }

      downPos = null;
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeTool, containerRef]);

  
  useEffect(() => {
    if (!SELECTION_TOOLS.includes(activeTool)) return;

    function handleMouseUp() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !containerRef.current) return;

      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) return;

      const text = selection.toString().trim();
      if (!text) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const clientRects = Array.from(range.getClientRects());
      if (clientRects.length === 0) return;

      const rects = clientRects.map((r) => ({
        x: (r.left - containerRect.left) / containerRect.width,
        y: (r.top - containerRect.top) / containerRect.height,
        width: r.width / containerRect.width,
        height: r.height / containerRect.height,
      }));

      const b = range.getBoundingClientRect();
      const bounds = {
        x: (b.left - containerRect.left) / containerRect.width,
        y: (b.top - containerRect.top) / containerRect.height,
        width: b.width / containerRect.width,
        height: b.height / containerRect.height,
      };

      const style = getSelectionFontStyle(range, containerRect.height);

      setPendingSelection({ rects, bounds, text, style });
      setEditDraft('');
      setCommentText('');
    }

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [activeTool, containerRef]);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);
    setEditDraft('');
    setCommentText('');
  }

  function handleConfirmHighlight(color) {
    if (!pendingSelection) return;
    onCreateAnnotation('HIGHLIGHT', { rects: pendingSelection.rects, color, text: pendingSelection.text });
    clearSelection();
  }

  function handleConfirmEdit() {
    if (!pendingSelection || !editDraft.trim()) return;
    onTextChange({
      originalText: pendingSelection.text,
      currentText: editDraft.trim(),
      position: pendingSelection.bounds,
      rects: pendingSelection.rects,
      style: pendingSelection.style,
    });
    clearSelection();
  }

  function handleConfirmComment() {
    if (!pendingSelection || !commentText.trim()) return;
    onCreateAnnotation('COMMENT', {
      text: commentText.trim(),
      position: pendingSelection.bounds,
      rects: pendingSelection.rects,
      anchorText: pendingSelection.text,
    });
    clearSelection();
  }

  const highlights = annotations.filter((a) => a.type === 'HIGHLIGHT');
  const comments = annotations.filter((a) => a.type === 'COMMENT');
  const edits = annotations.filter((a) => a.type === 'EDIT');

  return (
    <div className="absolute inset-0 pointer-events-none">
      {highlights.map((a) =>
        (a.data?.rects || []).map((r, i) => (
          <div
            key={`${a.id}-${i}`}
            className="absolute pointer-events-none"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
              backgroundColor: a.data?.color || '#fde68a',
              opacity: 0.45,
              mixBlendMode: 'multiply',
            }}
          />
        ))
      )}

      {edits.map((a) => {
        const pos = a.data?.position;
        if (!pos) return null;
        const s = a.data?.style;
        const fontSize = s?.fontSizeFrac && containerHeight ? s.fontSizeFrac * containerHeight : 13;
        return (
          <div
            key={a.id}
            className="absolute flex items-center overflow-hidden bg-white pointer-events-none"
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width: `${pos.width * 100}%`, height: `${pos.height * 100}%` }}
            title={`Edited by ${a.user?.name || 'someone'} — was: "${a.data?.originalText}"`}
          >
            <span
              className="w-full truncate leading-none text-gray-900"
              style={{
                fontSize: `${fontSize}px`,
                fontFamily: s?.fontFamily || 'inherit',
                fontWeight: s?.fontWeight || 'normal',
                fontStyle: s?.fontStyle || 'normal',
                color: s?.color || undefined,
              }}
            >
              {a.data?.currentText}
            </span>
          </div>
        );
      })}

      {comments.map((a) => (
        <CommentPin key={a.id} annotation={a} currentUserId={currentUserId} onDelete={onDeleteAnnotation} />
      ))}

      {activeTool === 'highlight' && pendingSelection && (
        <div
          className="absolute z-30 flex gap-1 rounded-md border bg-white p-1.5 shadow-lg pointer-events-auto"
          style={{ left: `${pendingSelection.bounds.x * 100}%`, top: `${(pendingSelection.bounds.y + pendingSelection.bounds.height) * 100}%`, transform: 'translateY(4px)' }}
        >
          {COLORS.map((c) => (
            <button
              key={c.name}
              title={c.name}
              className="h-6 w-6 rounded-full border border-black/10"
              style={{ backgroundColor: c.value }}
              onClick={() => handleConfirmHighlight(c.value)}
            />
          ))}
          <button className="px-2 text-xs text-gray-500" onClick={clearSelection}>✕</button>
        </div>
      )}

      {activeTool === 'edit' && pendingSelection && (
        <div
          className="absolute z-30 w-64 rounded-md border bg-white p-2 shadow-lg pointer-events-auto"
          style={{ left: `${pendingSelection.bounds.x * 100}%`, top: `${(pendingSelection.bounds.y + pendingSelection.bounds.height) * 100}%`, transform: 'translateY(4px)' }}
        >
          <div className="mb-1 truncate text-xs text-gray-500">Replacing: "{pendingSelection.text}"</div>
          <textarea
            autoFocus
            rows={2}
            className="w-full resize-none rounded border p-1 text-sm"
            style={{
              fontFamily: pendingSelection.style?.fontFamily || 'inherit',
              fontWeight: pendingSelection.style?.fontWeight || 'normal',
              fontStyle: pendingSelection.style?.fontStyle || 'normal',
            }}
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') clearSelection();
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleConfirmEdit(); }
            }}
          />
          <div className="mt-1 flex justify-end gap-2">
            <button className="text-xs text-gray-500" onClick={clearSelection}>Cancel</button>
            <button className="text-xs font-medium text-blue-600 disabled:text-gray-300" disabled={!editDraft.trim()} onClick={handleConfirmEdit}>
              Save
            </button>
          </div>
        </div>
      )}

      {activeTool === 'comment' && pendingSelection && (
        <div
          className="absolute z-30 w-64 rounded-md border bg-white p-2 shadow-lg pointer-events-auto"
          style={{ left: `${pendingSelection.bounds.x * 100}%`, top: `${(pendingSelection.bounds.y + pendingSelection.bounds.height) * 100}%`, transform: 'translateY(4px)' }}
        >
          <div className="mb-1 truncate text-xs text-gray-500">Commenting on: "{pendingSelection.text}"</div>
          <textarea
            autoFocus
            rows={3}
            className="w-full resize-none rounded border p-1 text-sm"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') clearSelection();
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleConfirmComment(); }
            }}
          />
          <div className="mt-1 flex justify-end gap-2">
            <button className="text-xs text-gray-500" onClick={clearSelection}>Cancel</button>
            <button className="text-xs font-medium text-blue-600 disabled:text-gray-300" disabled={!commentText.trim()} onClick={handleConfirmComment}>
              Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}