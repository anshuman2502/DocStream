import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { io } from 'socket.io-client';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import AnnotationCanvas from '../components/AnnotationCanvas';
import AnnotationSidebar from '../components/AnnotationSidebar';
import PresenceBar from '../components/PresenceBar';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export default function PdfViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pdf, setPdf] = useState(null);
  const [accessLevel, setAccessLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [renderWidth, setRenderWidth] = useState(700);
  const [annotations, setAnnotations] = useState([]);
  const [activeTool, setActiveTool] = useState(null);
  const [roomUsers, setRoomUsers] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const containerRef = useRef(null); // outer scroll viewport
  const pageWrapRef = useRef(null); // exact page-sized wrapper, passed to AnnotationCanvas
  const socketRef = useRef(null);

  const canAnnotate = accessLevel === 'OWNER' || accessLevel === 'EDIT';

  useEffect(() => {
    function updateWidth() {
      if (containerRef.current) setRenderWidth(Math.min(containerRef.current.clientWidth - 32, 900));
    }
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  async function fetchPdf() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/pdf/${id}`);
      setPdf(res.data.pdf);
      setAccessLevel(res.data.accessLevel);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load this PDF');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAnnotations() {
    try {
      const res = await api.get(`/pdf/${id}/annotations`);
      setAnnotations(res.data.annotations);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchPdf();
    fetchAnnotations();
  }, [id]);

  useEffect(() => {
    if (!pdf || !user) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL);
    socketRef.current = socket;

    socket.emit('join-pdf', { pdfId: id, user: { id: user.id, name: user.name, email: user.email } });

    socket.on('room-users', setRoomUsers);

    socket.on('annotation-added', (annotation) => {
      setAnnotations((prev) => (prev.some((a) => a.id === annotation.id) ? prev : [...prev, annotation]));
    });

    socket.on('annotation-updated', (annotation) => {
      setAnnotations((prev) => prev.map((a) => (a.id === annotation.id ? annotation : a)));
    });

    socket.on('annotation-deleted', ({ id: deletedId }) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== deletedId));
    });

    return () => {
      socket.emit('leave-pdf', id); // bare string — matches index.js's socket.on('leave-pdf', (pdfId) => ...)
      socket.disconnect();
    };
  }, [pdf?.id, user?.id, id]);

  function pushUndo(action) {
    setUndoStack((s) => [...s, action]);
    setRedoStack([]);
  }

  async function handleCreateAnnotation(type, data) {
    try {
      const res = await api.post(`/pdf/${id}/annotations`, { type, page: pageNumber, data });
      pushUndo({ kind: 'create', annotationType: type, annotationId: res.data.annotation.id, page: pageNumber, data });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create annotation');
    }
  }

async function handleDeleteAnnotation(annotationId) {
  const annotation = annotations.find((a) => a.id === annotationId);
  try {
    await api.delete(`/pdf/annotations/${annotationId}`);
    if (annotation) pushUndo({ kind: 'delete', annotationType: annotation.type, page: annotation.page, data: annotation.data });
  } catch (err) {
    if (err.response?.status === 404) {
      // Already gone server-side (race or stale UI) — just drop it locally instead of alarming the user
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
      return;
    }
    alert(err.response?.data?.error || 'Failed to delete annotation');
  }
}

  async function handleTextChange(payload) {
    const existing = annotations.find(
      (a) =>
        a.type === 'EDIT' &&
        a.page === pageNumber &&
        a.data?.originalText === payload.originalText &&
        Math.abs((a.data?.position?.x ?? 0) - payload.position.x) < 0.02 &&
        Math.abs((a.data?.position?.y ?? 0) - payload.position.y) < 0.02
    );
    const previousText = existing ? existing.data.currentText : payload.originalText;

    try {
      await api.post(`/pdf/${id}/text-change`, { page: pageNumber, ...payload });
      pushUndo({ kind: 'edit', page: pageNumber, originalText: payload.originalText, position: payload.position, previousText, newText: payload.currentText });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save edit');
    }
  }

  async function performUndo() {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    let nextAction = action;
    try {
      if (action.kind === 'create') {
        await api.delete(`/pdf/annotations/${action.annotationId}`);
      } else if (action.kind === 'delete') {
        const res = await api.post(`/pdf/${id}/annotations`, { type: action.annotationType, page: action.page, data: action.data });
        nextAction = { ...action, annotationId: res.data.annotation.id };
      } else if (action.kind === 'edit') {
        await api.post(`/pdf/${id}/text-change`, { page: action.page, originalText: action.originalText, currentText: action.previousText, position: action.position });
      }
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [...s, nextAction]);
    } catch (err) {
      console.error('Undo failed', err);
    }
  }

  async function performRedo() {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    let nextAction = action;
    try {
      if (action.kind === 'create') {
        const res = await api.post(`/pdf/${id}/annotations`, { type: action.annotationType, page: action.page, data: action.data });
        nextAction = { ...action, annotationId: res.data.annotation.id };
      } else if (action.kind === 'delete') {
        await api.delete(`/pdf/annotations/${action.annotationId}`);
      } else if (action.kind === 'edit') {
        await api.post(`/pdf/${id}/text-change`, { page: action.page, originalText: action.originalText, currentText: action.newText, position: action.position });
      }
      setRedoStack((s) => s.slice(0, -1));
      setUndoStack((s) => [...s, nextAction]);
    } catch (err) {
      console.error('Redo failed', err);
    }
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (!canAnnotate) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        performUndo();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        performRedo();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, canAnnotate]);

  function goPrev() {
    setPageNumber((p) => Math.max(1, p - 1));
  }
  function goNext() {
    setPageNumber((p) => Math.min(numPages, p + 1));
  }
  function toolBtnClass(tool) {
    return `text-xs px-3 py-1.5 rounded-md border font-medium ${
      activeTool === tool ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
    }`;
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  if (error)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error}</p>
        <button onClick={() => navigate('/dashboard')} className="text-blue-600 hover:underline text-sm">Back to Dashboard</button>
      </div>
    );
  if (!pdf) return null;

  const pageAnnotations = annotations.filter((a) => a.page === pageNumber);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
          <h1 className="font-medium text-gray-800 truncate">{pdf.originalName}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{pdf.state}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{accessLevel}</span>
        </div>
        <PresenceBar users={roomUsers} currentUserId={user?.id} />
      </header>

      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        {canAnnotate ? (
          <div className="flex items-center gap-2">
            <button className={toolBtnClass('highlight')} onClick={() => setActiveTool((t) => (t === 'highlight' ? null : 'highlight'))}>🖍️ Highlight</button>
            <button className={toolBtnClass('comment')} onClick={() => setActiveTool((t) => (t === 'comment' ? null : 'comment'))}>💬 Comment</button>
            <button className={toolBtnClass('edit')} onClick={() => setActiveTool((t) => (t === 'edit' ? null : 'edit'))}>✏️ Edit</button>
            <div className="mx-1 h-5 w-px bg-gray-300" />
            <button disabled={undoStack.length === 0} onClick={performUndo} className="text-xs text-gray-600 disabled:opacity-30">↶ Undo</button>
            <button disabled={redoStack.length === 0} onClick={performRedo} className="text-xs text-gray-600 disabled:opacity-30">↷ Redo</button>
          </div>
        ) : (
          <span className="text-xs text-gray-400">🔒 View-only access</span>
        )}

        <div className="flex items-center gap-3">
          <button onClick={goPrev} disabled={pageNumber <= 1} className="text-xs text-gray-600 disabled:opacity-30">← Prev</button>
          <span className="text-xs text-gray-600">Page {pageNumber} of {numPages || '...'}</span>
          <button onClick={goNext} disabled={pageNumber >= numPages} className="text-xs text-gray-600 disabled:opacity-30">Next →</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div ref={containerRef} className="flex-1 overflow-auto flex justify-center py-6">
          <div ref={pageWrapRef} className="relative inline-block bg-white shadow">
            <Document
              file={pdf.fileUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              loading={<p className="text-sm text-gray-400 p-8">Loading PDF...</p>}
              error={<p className="text-sm text-red-500 p-8">Failed to load PDF file.</p>}
            >
              <Page pageNumber={pageNumber} width={renderWidth} />
            </Document>
            <AnnotationCanvas
              containerRef={pageWrapRef}
              annotations={pageAnnotations}
              activeTool={canAnnotate ? activeTool : null}
              currentUserId={user?.id}
              onCreateAnnotation={handleCreateAnnotation}
              onTextChange={handleTextChange}
              onDeleteAnnotation={handleDeleteAnnotation}
            />
          </div>
        </div>

        <AnnotationSidebar annotations={annotations} currentUserId={user?.id} onDelete={handleDeleteAnnotation} onJumpToPage={setPageNumber} />
      </div>
    </div>
  );
}