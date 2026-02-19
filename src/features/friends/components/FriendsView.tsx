import { memo, useMemo } from "react";
import StatusDot from "../../../shared/components/StatusDot";

type FriendsTab = "active" | "friends" | "pending" | "blocked";

type FriendsViewProps = {
  friendsTab: FriendsTab;
  setFriendsTab: (tab: FriendsTab) => void;
  pendingIncomingCount: number;
  friendSearch: string;
  setFriendSearch: (value: string) => void;
  blockedSearch: string;
  setBlockedSearch: (value: string) => void;
  pendingInput: string;
  setPendingInput: (value: string) => void;
  pendingError: string;
  setPendingError: (value: string) => void;
  pendingErrorShake: boolean;
  setPendingErrorShake: (value: boolean) => void;
  handleSendFriendByUsername: () => void;
  friendUsers: Record<string, any>;
  outgoingUsers: Record<string, any>;
  incomingUsers: Record<string, any>;
  blockedUsers: Record<string, any>;
  getUserEffectiveStatus: (u: any) => string;
  openUserProfile: (u: any) => void;
  openDmWithUser: (u: any) => void;
  safeImageSrc: (value?: string, fallback?: string) => string;
  acceptFriendRequest: (uid: string) => void;
  rejectFriendRequest: (uid: string) => void;
  cancelFriendRequest: (uid: string) => Promise<void>;
  setConfirmModal: (value: any) => void;
  unblockUser: (uid: string) => Promise<void>;
};

function FriendsView({
  friendsTab,
  setFriendsTab,
  pendingIncomingCount,
  friendSearch,
  setFriendSearch,
  blockedSearch,
  setBlockedSearch,
  pendingInput,
  setPendingInput,
  pendingError,
  setPendingError,
  pendingErrorShake,
  setPendingErrorShake,
  handleSendFriendByUsername,
  friendUsers,
  outgoingUsers,
  incomingUsers,
  blockedUsers,
  getUserEffectiveStatus,
  openUserProfile,
  openDmWithUser,
  safeImageSrc,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  setConfirmModal,
  unblockUser,
}: FriendsViewProps) {
  const friendUsersList = useMemo(() => Object.values(friendUsers), [friendUsers]);
  const outgoingUsersList = useMemo(() => Object.values(outgoingUsers), [outgoingUsers]);
  const incomingUsersList = useMemo(() => Object.values(incomingUsers), [incomingUsers]);
  const blockedUsersList = useMemo(() => Object.values(blockedUsers), [blockedUsers]);

  const filteredActiveUsers = useMemo(
    () =>
      friendUsersList
        .filter((u) => (u.username || "").toLowerCase().includes(friendSearch.toLowerCase()))
        .filter((u) => getUserEffectiveStatus(u) !== "offline"),
    [friendUsersList, friendSearch, getUserEffectiveStatus],
  );

  const filteredFriendUsers = useMemo(
    () => friendUsersList.filter((u) => (u.username || "").toLowerCase().includes(friendSearch.toLowerCase())),
    [friendUsersList, friendSearch],
  );

  const filteredBlockedUsers = useMemo(
    () => blockedUsersList.filter((u) => (u.username || "").toLowerCase().includes(blockedSearch.toLowerCase())),
    [blockedUsersList, blockedSearch],
  );

  return (
    <>
      <div className="friends-header">
        <span>ArkadaÅŸlar</span>
      </div>

      <div className="friends-tabs">
        {[
          { id: "active", label: "Aktif olanlar" },
          { id: "friends", label: "ArkadaÅŸlar" },
          { id: "pending", label: "Bekleyen" },
          { id: "blocked", label: "Engellenenler" },
        ].map((t) => {
          const isPending = t.id === "pending";
          const showCount = isPending && pendingIncomingCount > 0;
          return (
            <button
              key={t.id}
              className={`friends-tab-btn ${friendsTab === t.id ? "active" : ""}`}
              onClick={() => setFriendsTab(t.id as FriendsTab)}
            >
              {t.label}
              {showCount && <span className="friends-tab-unread">{pendingIncomingCount}</span>}
            </button>
          );
        })}
      </div>

      {(friendsTab === "active" || friendsTab === "friends") && (
        
        <div className="friends-toolbar friend-search-space">
          <input
            className="friends-search"
            placeholder="Aramak iÃ§in yaz"
            value={friendSearch}
            onChange={(e) => setFriendSearch(e.target.value)}
          />
        </div>
      )}

      {friendsTab === "pending" && (
        <div className="friends-toolbar">
          <div className="friends-error-slot">
            <div className={`friends-error-top ${pendingError ? "is-visible" : ""}`}>{pendingError}</div>
          </div>
          <div className="friends-search-inline">
            <input
              className={`friends-search ${pendingError ? "is-error" : ""} ${pendingErrorShake ? "error-shake" : ""}`}
              placeholder="ArkadaÅŸÄ±nÄ± kim olarak tanÄ±yoruz?"
              value={pendingInput}
              onChange={(e) => {
                setPendingInput(e.target.value);
                if (pendingError) {
                  setPendingError("");
                  setPendingErrorShake(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSendFriendByUsername();
                }
              }}
            />
            <button
              className="friends-inline-send-btn"
              onClick={handleSendFriendByUsername}
              type="button"
              aria-label="ArkadaÅŸlÄ±k isteÄŸi gÃ¶nder"
            >
              ArkadaÅŸ Ekle
            </button>
          </div>
        </div>
      )}

      {friendsTab === "blocked" && (
        <div className="friends-toolbar friend-search-space">
          <input
            className="friends-search"
            placeholder="Engellenenlerde ara..."
            value={blockedSearch}
            onChange={(e) => setBlockedSearch(e.target.value)}
          />
        </div>
      )}

      <div className="friends-list">
        {friendsTab === "active" && (
          <>
            {filteredActiveUsers.map((u) => (
              <div key={u.uid} className="friend-row" onClick={() => openUserProfile(u)}>
                <img className="friend-avatar" src={safeImageSrc(u.profilePic || u.photoURL, "https://i.hizliresim.com/ntdyvrh.jpg")} alt="pp" />
                <div className="friend-meta">
                  <div className="friend-name">{u.username}</div>
                  <div className="friend-sub">{u.displayName || ""}</div>
                </div>
                <StatusDot className="friend-status-dot" status={getUserEffectiveStatus(u)} size="md" />
                <div className="friend-actions">
                  <button className="friend-action-btn ghost" onClick={(e) => { e.stopPropagation(); openDmWithUser(u); }}>
                    Mesaj
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {friendsTab === "friends" && (
          <>
            {filteredFriendUsers.map((u) => (
              <div key={u.uid} className="friend-row" onClick={() => openUserProfile(u)}>
                <img className="friend-avatar" src={safeImageSrc(u.profilePic || u.photoURL, "https://i.hizliresim.com/ntdyvrh.jpg")} alt="pp" />
                <div className="friend-meta">
                  <div className="friend-name">{u.username}</div>
                  <div className="friend-sub">{u.displayName || ""}</div>
                </div>
                <StatusDot className="friend-status-dot" status={getUserEffectiveStatus(u)} size="md" />
                <div className="friend-actions">
                  <button className="friend-action-btn ghost" onClick={(e) => { e.stopPropagation(); openDmWithUser(u); }}>
                    Mesaj
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {friendsTab === "pending" && (
          <>
            {outgoingUsersList.length > 0 && (
              <>
                <div className="friends-section-title">Giden Ä°stekler</div>
                {outgoingUsersList.map((u) => (
                  <div key={u.uid} className="friend-row pending" onClick={() => openUserProfile(u)}>
                    <img className="friend-avatar" src={safeImageSrc(u.profilePic || u.photoURL, "https://i.hizliresim.com/ntdyvrh.jpg")} alt="pp" />
                    <div className="friend-meta">
                      <div className="friend-name">{u.username}</div>
                      <div className="friend-sub">Ä°stek gÃ¶nderildi</div>
                    </div>
                    <div className="friend-actions">
                      <button
                        className="friend-action-btn ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmModal({
                            show: true,
                            title: "Ä°stek Ä°ptali",
                            message: "ArkadaÅŸlÄ±k isteÄŸini iptal etmek istediÄŸine emin misin?",
                            onConfirm: async () => {
                              await cancelFriendRequest(u.uid);
                            },
                            onCancel: () => {},
                          });
                        }}
                      >
                        Ä°ptal Et
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {incomingUsersList.length > 0 && (
              <>
                <div className="friends-section-title">Gelen Ä°stekler</div>
                {incomingUsersList.map((u) => (
                  <div key={u.uid} className="friend-row pending" onClick={() => openUserProfile(u)}>
                    <img className="friend-avatar" src={safeImageSrc(u.profilePic || u.photoURL, "https://i.hizliresim.com/ntdyvrh.jpg")} alt="pp" />
                    <div className="friend-meta">
                      <div className="friend-name">{u.username}</div>
                      <div className="friend-sub">Bekleyen istek</div>
                    </div>
                    <div className="friend-actions">
                      <button className="friend-action-btn" onClick={(e) => { e.stopPropagation(); acceptFriendRequest(u.uid); }}>
                        Kabul Et
                      </button>
                      <button className="friend-action-btn ghost" onClick={(e) => { e.stopPropagation(); rejectFriendRequest(u.uid); }}>
                        Reddet
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {friendsTab === "blocked" && (
          <>
            {filteredBlockedUsers.map((u) => (
              <div key={u.uid} className="friend-row blocked" onClick={() => openUserProfile(u)}>
                <img className="friend-avatar" src={safeImageSrc(u.profilePic || u.photoURL, "https://i.hizliresim.com/ntdyvrh.jpg")} alt="pp" />
                <div className="friend-meta">
                  <div className="friend-name">{u.username}</div>
                  <div className="friend-sub">Engellendi</div>
                </div>
                <div className="friend-actions blocked-actions">
                  <button
                    className="friend-action-btn ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmModal({
                        show: true,
                        title: "Engeli KaldÄ±r",
                        message: `${u.displayName || u.username || "Bu kullanÄ±cÄ±"} iÃ§in engeli kaldÄ±rmak istediÄŸine emin misin?`,
                        confirmText: "Engeli kaldÄ±r",
                        onConfirm: async () => {
                          await unblockUser(u.uid);
                        },
                        onCancel: () => {},
                      });
                    }}
                  >
                    Engeli KaldÄ±r
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

const areFriendsViewPropsEqual = (prev: FriendsViewProps, next: FriendsViewProps) => {
  return (
    prev.friendsTab === next.friendsTab &&
    prev.pendingIncomingCount === next.pendingIncomingCount &&
    prev.friendSearch === next.friendSearch &&
    prev.blockedSearch === next.blockedSearch &&
    prev.pendingInput === next.pendingInput &&
    prev.pendingError === next.pendingError &&
    prev.pendingErrorShake === next.pendingErrorShake &&
    prev.friendUsers === next.friendUsers &&
    prev.outgoingUsers === next.outgoingUsers &&
    prev.incomingUsers === next.incomingUsers &&
    prev.blockedUsers === next.blockedUsers &&
    prev.getUserEffectiveStatus === next.getUserEffectiveStatus
  );
};

export default memo(FriendsView, areFriendsViewPropsEqual);


