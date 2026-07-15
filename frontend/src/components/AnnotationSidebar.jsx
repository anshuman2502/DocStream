const TYPE_LABEL = { HIGHLIGHT: 'Highlight', COMMENT: 'Comment', EDIT: 'Edit' };
const TYPE_ICON = { HIGHLIGHT: '🖍️', COMMENT: '💬', EDIT: '✏️' };

function describe(annotation) {
  if (annotation.type === 'HIGHLIGHT') return annotation.data?.text ? `"${annotation.data.text}"` : 'Highlighted text';
  if (annotation.type === 'COMMENT') return annotation.data?.text || '';
  if (annotation.type === 'EDIT') return `"${annotation.data?.originalText}" → "${annotation.data?.currentText}"`;
  return '';
}

export default function AnnotationSidebar({ annotations, currentUserId, onDelete, onJumpToPage }) {
  const sorted = [...annotations].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Annotations ({sorted.length})</h2>
      {sorted.length === 0 && <p className="text-sm text-gray-400">No annotations yet.</p>}
      <ul className="space-y-2">
        {sorted.map((a) => {
          const canDelete = a.userId === currentUserId && a.type !== 'EDIT';
          return (
            <li key={a.id} className="rounded-md border border-gray-100 p-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{TYPE_ICON[a.type]} {TYPE_LABEL[a.type]} · {a.user?.name || 'Unknown'}</span>
                <button className="text-blue-600 hover:underline" onClick={() => onJumpToPage(a.page)}>p.{a.page}</button>
              </div>
              <p className="mt-1 text-sm text-gray-800 break-words">{describe(a)}</p>
              {a.type === 'HIGHLIGHT' && a.data?.color && (
                <span className="mt-1 inline-block h-3 w-3 rounded-full" style={{ backgroundColor: a.data.color }} />
              )}
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">{new Date(a.createdAt).toLocaleString()}</span>
                {canDelete ? (
                  <button className="text-[11px] text-red-500" onClick={() => onDelete(a.id)}>Delete</button>
                ) : a.type === 'EDIT' ? (
                  <span className="text-[11px] text-gray-400">permanent</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}