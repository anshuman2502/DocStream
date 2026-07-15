function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function PresenceBar({ users, currentUserId }) {
  if (!users || users.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400">
        {users.length} viewing
      </span>
      <div className="flex -space-x-2">
        {users.slice(0, 8).map((u, i) => (
          <div
            key={`${u.id || u.email || i}`}
            title={u.id === currentUserId ? `${u.name} (you)` : u.name}
            className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center border-2 border-white"
          >
            {initials(u.name)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PresenceBar;