import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

function StateBadge({ state }) {
  const styles = {
    PRIVATE: 'bg-red-100 text-red-700',
    PUBLISHED: 'bg-yellow-100 text-yellow-700',
    PUBLIC: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[state]}`}>
      {state}
    </span>
  );
}

function AccessBadge({ type }) {
  const styles = {
    VIEW: 'bg-blue-100 text-blue-700',
    EDIT: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[type]}`}>
      {type}
    </span>
  );
}

function ConfirmPopup({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] px-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <p className="text-gray-800 font-medium mb-2">Are you sure?</p>
        <p className="text-gray-500 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
          >
            Yes, Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({ pdf, onClose, onStateChange }) {
  const [tab, setTab] = useState('share');
  const [email, setEmail] = useState('');
  const [accessType, setAccessType] = useState('VIEW');
  const [state, setState] = useState(pdf.state);
  const [accessList, setAccessList] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmPopup, setConfirmPopup] = useState(null);

  const isPrivate = state === 'PRIVATE';

  useEffect(() => {
    fetchAccessList();
  }, []);

  async function fetchAccessList() {
    try {
      const res = await api.get(`/pdf/${pdf.id}/access`);
      setAccessList(res.data.accessList);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleGrantAccess() {
    if (!email) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await api.post(`/pdf/${pdf.id}/access`, { email, accessType });
      setSuccess(res.data.message);
      setEmail('');
      fetchAccessList();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to grant access');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeSingle(userId, userName) {
    setConfirmPopup({
      message: `This will remove all access for ${userName}.`,
      onConfirm: async () => {
        setConfirmPopup(null);
        setError('');
        try {
          await api.delete(`/pdf/${pdf.id}/access/${userId}`);
          setSuccess('Access revoked successfully');
          setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
          fetchAccessList();
        } catch (err) {
          setError('Failed to revoke access');
        }
      },
      onCancel: () => setConfirmPopup(null),
    });
  }

  async function handleBulkRevoke() {
    if (selectedUserIds.length === 0) return;
    const names = accessList
      .filter((item) => selectedUserIds.includes(item.user.id))
      .map((item) => item.user.name)
      .join(', ');

    setConfirmPopup({
      message: `This will revoke access for ${selectedUserIds.length} user(s): ${names}.`,
      onConfirm: async () => {
        setConfirmPopup(null);
        setRevoking(true);
        setError('');
        try {
          await api.delete(`/pdf/${pdf.id}/access`, {
            data: { userIds: selectedUserIds },
          });
          setSuccess(`Access revoked for ${selectedUserIds.length} user(s)`);
          setSelectedUserIds([]);
          fetchAccessList();
        } catch (err) {
          setError('Failed to revoke access');
        } finally {
          setRevoking(false);
        }
      },
      onCancel: () => setConfirmPopup(null),
    });
  }

  async function handleStateChange(newState) {
    if (newState === state) return;

    const messages = {
      PRIVATE: 'Set to PRIVATE? All existing access grants will be revoked immediately.',
      PUBLISHED: 'Set to PUBLISHED? You can then share with specific people by email.',
      PUBLIC: 'Set to PUBLIC? Anyone with the link will be able to view this PDF.',
    };

    setConfirmPopup({
      message: messages[newState],
      onConfirm: async () => {
        setConfirmPopup(null);
        setError('');
        setSuccess('');
        try {
          const res = await api.patch(`/pdf/${pdf.id}/state`, { state: newState });
          setState(newState);
          setSuccess(res.data.message);
          onStateChange(pdf.id, newState);
          if (newState === 'PRIVATE') {
            setAccessList([]);
            setSelectedUserIds([]);
          }
        } catch (err) {
          setError('Failed to update state');
        }
      },
      onCancel: () => setConfirmPopup(null),
    });
  }

  function toggleSelectUser(userId) {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  function toggleSelectAll() {
    if (selectedUserIds.length === accessList.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(accessList.map((item) => item.user.id));
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">

          {/* Header */}
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-bold text-gray-800">Manage Access</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-400 truncate mb-4">{pdf.originalName}</p>

          {/* Document State */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document State
            </label>
            <div className="flex gap-2">
              {['PRIVATE', 'PUBLISHED', 'PUBLIC'].map((s) => (
                <button
                  key={s}
                  onClick={() => handleStateChange(s)}
                  className={`flex-1 py-1.5 text-xs rounded-md border font-medium transition-colors ${
                    state === s
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {isPrivate && (
              <p className="text-xs text-red-500 mt-2">
                ⚠️ This PDF is private. Only you can access it. Change to PUBLISHED to share.
              </p>
            )}
          </div>

          {/* Tabs — only show when not private */}
          {!isPrivate && (
            <div className="flex border-b border-gray-200 mb-4">
              <button
                onClick={() => { setTab('share'); setError(''); setSuccess(''); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'share'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Grant Access
              </button>
              <button
                onClick={() => { setTab('manage'); setError(''); setSuccess(''); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'manage'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Who Has Access
                {accessList.length > 0 && (
                  <span className="ml-1 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                    {accessList.length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Tab: Grant Access */}
          {!isPrivate && tab === 'share' && (
            <div>
              <div className="flex gap-2 mb-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={accessType}
                  onChange={(e) => setAccessType(e.target.value)}
                  className="px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none"
                >
                  <option value="VIEW">VIEW</option>
                  <option value="EDIT">EDIT</option>
                </select>
              </div>
              <button
                onClick={handleGrantAccess}
                disabled={loading || !email}
                className="w-full bg-blue-600 text-white py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Granting...' : 'Grant Access'}
              </button>
            </div>
          )}

          {/* Tab: Who Has Access */}
          {!isPrivate && tab === 'manage' && (
            <div>
              {accessList.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No one has been granted access yet.
                </p>
              ) : (
                <>
                  {/* Select all + bulk revoke */}
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.length === accessList.length}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                      Select All ({accessList.length})
                    </label>
                    {selectedUserIds.length > 0 && (
                      <button
                        onClick={handleBulkRevoke}
                        disabled={revoking}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50"
                      >
                        {revoking
                          ? 'Revoking...'
                          : `Revoke Selected (${selectedUserIds.length})`}
                      </button>
                    )}
                  </div>

                  {/* Access list with checkboxes */}
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {accessList.map((item) => (
                      <li
                        key={item.id}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                          selectedUserIds.includes(item.user.id)
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(item.user.id)}
                            onChange={() => toggleSelectUser(item.user.id)}
                            className="rounded"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {item.user.name}
                            </p>
                            <p className="text-xs text-gray-400">{item.user.email}</p>
                          </div>
                        </label>
                        <div className="flex items-center gap-2 ml-2">
                          <AccessBadge type={item.accessType} />
                          <button
                            onClick={() =>
                              handleRevokeSingle(item.user.id, item.user.name)
                            }
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            Revoke
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Feedback */}
          {error && <p className="text-red-600 text-xs mt-3">{error}</p>}
          {success && <p className="text-green-600 text-xs mt-3">{success}</p>}
        </div>
      </div>

      {/* Confirm popup */}
      {confirmPopup && (
        <ConfirmPopup
          message={confirmPopup.message}
          onConfirm={confirmPopup.onConfirm}
          onCancel={confirmPopup.onCancel}
        />
      )}
    </>
  );
}

//pop profile 
function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const initial = user?.name?.charAt(0)?.toUpperCase() || '?';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-9 w-9 rounded-full bg-blue-600 text-white font-semibold flex items-center justify-center hover:bg-blue-700"
      >
        {initial}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 z-50 py-2">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-800 truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => { setOpen(false); setShowPasswordModal(true); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Change Password
            </button>
            <button
              onClick={onLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </>
      )}

      {showPasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowPasswordModal(false)}
          onLogout={onLogout}
        />
      )}
    </div>
  );
}

function ChangePasswordModal({ onClose, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      alert('Password changed successfully. Please log in again.');
      onLogout();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-gray-800">Change Password</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Dashboard() {
  const [myPdfs, setMyPdfs] = useState([]);
  const [sharedPdfs, setSharedPdfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPdf, setSelectedPdf] = useState(null);

  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [myRes, sharedRes] = await Promise.all([
        api.get('/pdf/'),
        api.get('/pdf/shared'),
      ]);
      setMyPdfs(myRes.data.pdfs);
      setSharedPdfs(sharedRes.data.pdfs);
    } catch (err) {
      setError('Failed to load PDFs');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    setError('');
    try {
      await api.post('/pdf/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this PDF?')) return;
    try {
      await api.delete(`/pdf/${id}`);
      setMyPdfs(myPdfs.filter((pdf) => pdf.id !== id));
    } catch (err) {
      setError('Failed to delete PDF');
    }
  }

  function handleStateChange(pdfId, newState) {
    setMyPdfs((prev) =>
      prev.map((pdf) => (pdf.id === pdfId ? { ...pdf, state: newState } : pdf))
    );
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function formatSize(bytes) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">DocStream</h1>
        <UserMenu user={user} onLogout={handleLogout} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Upload */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 mb-2 block">
              Upload a PDF
            </span>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-600 file:text-white file:cursor-pointer hover:file:bg-blue-700 disabled:opacity-50"
            />
          </label>
          {uploading && (
            <p className="text-sm text-blue-600 mt-2">Uploading...</p>
          )}
        </div>

        {error && (
          <div className="bg-red-100 text-red-700 px-4 py-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {/* My PDFs */}
        <h2 className="text-lg font-semibold text-gray-800 mb-3">My PDFs</h2>
        {loading ? (
          <p className="text-gray-500 mb-8">Loading...</p>
        ) : myPdfs.length === 0 ? (
          <p className="text-gray-500 mb-8">No PDFs uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {myPdfs.map((pdf) => (
              <div
                key={pdf.id}
                className="bg-white p-4 rounded-lg shadow-sm flex flex-col"
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() =>
                    navigate(`/view/${pdf.id}`, { state: { pdf } })
                  }
                >
                  <div className="text-3xl mb-2">📄</div>
                  <p className="font-medium text-gray-800 truncate mb-1">
                    {pdf.originalName}
                  </p>
                  <div className="flex items-center gap-2 mb-1">
                    <StateBadge state={pdf.state} />
                  </div>
                  <p className="text-xs text-gray-500">
                    {formatSize(pdf.size)} ·{' '}
                    {new Date(pdf.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPdf(pdf);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {pdf.state === 'PRIVATE' ? '🔒 Manage' : '🔗 Share'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(pdf.id);
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Shared with me */}
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Shared with Me
        </h2>
        {sharedPdfs.length === 0 ? (
          <p className="text-gray-500">
            No PDFs have been shared with you yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {sharedPdfs.map((pdf) => (
              <div
                key={pdf.id}
                className="bg-white p-4 rounded-lg shadow-sm flex flex-col cursor-pointer"
                onClick={() =>
                  navigate(`/view/${pdf.id}`, { state: { pdf } })
                }
              >
                <div className="text-3xl mb-2">📄</div>
                <p className="font-medium text-gray-800 truncate mb-1">
                  {pdf.originalName}
                </p>
                <div className="flex items-center gap-2 mb-1">
                  <AccessBadge type={pdf.accessType} />
                </div>
                <p className="text-xs text-gray-500">
                  Shared by {pdf.owner.name} ·{' '}
                  {new Date(pdf.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedPdf && (
        <ShareModal
          pdf={selectedPdf}
          onClose={() => setSelectedPdf(null)}
          onStateChange={handleStateChange}
        />
      )}
    </div>
  );
}

export default Dashboard;