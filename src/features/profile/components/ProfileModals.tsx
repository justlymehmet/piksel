import { AnimatePresence, motion } from "framer-motion";
import { memo } from "react";
import StatusDot from "../../../shared/components/StatusDot";

type ProfileModalsProps = any;

function ProfileModals(props: ProfileModalsProps) {
  const {
    adminProfileModal,
    setAdminProfileModal,
    safeUrl,
    u,
    safeImageSrc,
    getUserEffectiveStatus,
    isSelf,
    developerMode,
    isFriendWith,
    profileActionsOpen,
    setProfileActionsOpen,
    handleCopyUserUid,
    setShowProfileModal,
    setShowSettingsPage,
    setSettingsTab,
    openDmWithUser,
    incomingRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    outgoingRequests,
    setConfirmModal,
    cancelFriendRequest,
    sendFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    isBlockedUser,
    renderBadgesForUser,
    profileTab,
    setProfileTab,
    formatFirestoreDate,
    getUserLastSeenText,
    showProfileModal,
    effectiveBanner,
    effectiveProfilePic,
    effectiveStatus,
    customStatus,
    isViewingOwnProfile,
    getPresenceState,
    presence,
    userStatus,
    lastActive,
    displayName,
    username,
    renderActiveBadges,
    isFriendVisual,
    auth,
    userDocData,
    bio,
    createdAt,
  } = props;

  return (
    <>        <AnimatePresence>
          {adminProfileModal.open && adminProfileModal.user && (
            <motion.div
              className="profile-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onMouseDown={() =>
                setAdminProfileModal({ open: false, user: null })
              }
            >
              <motion.div
                className="profile-modal-card"
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.985 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className="profile-modal-banner"
                  style={{
                    backgroundImage: safeUrl(u.bannerUrl || u.banner)
                      ? `url(${safeUrl(u.bannerUrl || u.banner)})`
                      : undefined,
                  }}
                />

                <div className="profile-modal-body">
                  <div className="profile-left profile-left-column">
                    <div className="profile-avatar-wrap">
                      <img
                        className="profile-avatar"
                        src={safeImageSrc(
                          u.profilePic || u.photoURL,
                          "https://i.hizliresim.com/ntdyvrh.jpg",
                        )}
                        alt="avatar"
                        draggable={false}
                      />
                      <StatusDot className="profile-status-dot status-dot-location" status={getUserEffectiveStatus(u)} size="lg" />

                      {u.customStatus?.trim()?.length > 0 &&
                        (isSelf || getUserEffectiveStatus(u) !== "offline") && (
                          <div className="profile-status-bubble-on-avatar">
                            <div className="psb-text-wrapper">
                              <span className="psb-text">
                                {u.customStatus}
                              </span>
                            </div>
                          </div>
                        )}
                    </div>

                    <div className="profile-names">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div className="profile-displayname">
                          {u.displayName || u.username}
                        </div>
                      </div>
                      <div className="profile-username">{u.username}</div>
                      {renderBadgesForUser(u)}
                    </div>
                  </div>

                  <div className="profile-right">
                    <div
                      className={`profile-actions ${developerMode ? "dev-compact" : ""}`}
                    >
                      {isSelf ? (
                        <>
                          <button
                            className={`profile-action-btn primary ${developerMode ? "compact-right" : ""}`}
                            onClick={() => {
                              setShowProfileModal(false);
                              setAdminProfileModal({ open: false, user: null });
                              setShowSettingsPage(true);
                              setSettingsTab("profile");
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              style={{ marginRight: 8 }}
                            >
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                            </svg>
                            Profili Düzenle
                          </button>
                          {(developerMode || isFriendWith(u?.uid)) && (
                            <div className="profile-more compact-attach">
                              <button
                                className="profile-more-btn compact-left"
                                onClick={() => setProfileActionsOpen((p: boolean) => !p)}
                              >
                                ⁝
                              </button>
                              <AnimatePresence>
                                {profileActionsOpen && (
                                  <motion.div
                                    className="profile-more-menu"
                                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                    transition={{
                                      duration: 0.26,
                                      ease: [0.16, 1, 0.3, 1],
                                    }}
                                  >
                                    {developerMode && (
                                      <button
                                        className="profile-more-item"
                                        onClick={() => {
                                          handleCopyUserUid(u?.uid);
                                          setProfileActionsOpen(false);
                                        }}
                                      >
                                        Kullanıcı UID kopyala
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            className={`profile-action-btn ${developerMode ? "compact" : ""}`}
                            onClick={async () => {
                              await openDmWithUser(u);
                              setAdminProfileModal({ open: false, user: null });
                            }}
                          >
                            Mesaj Gönder
                          </button>

                          {isFriendWith(u?.uid) ? (
                            <button
                              className={`profile-action-btn action-wide ${(developerMode || isFriendWith(u?.uid)) ? "compact-right" : ""}`}
                            >
                              Arkadaşın
                            </button>
                          ) : incomingRequests[u?.uid || ""]?.status ===
                            "pending" ? (
                            <div className="request-manage">
                              <button
                                className={`profile-action-btn action-wide ${(developerMode || isFriendWith(u?.uid)) ? "compact-right" : ""}`}
                                type="button"
                              >
                                İsteği Yönet
                                <span className="request-arrow">&gt;</span>
                              </button>
                              <div className="request-menu">
                                <button
                                  className="request-menu-item primary"
                                  type="button"
                                  onClick={() => acceptFriendRequest(u.uid)}
                                >
                                  Kabul Et
                                </button>
                                <button
                                  className="request-menu-item danger"
                                  type="button"
                                  onClick={() => rejectFriendRequest(u.uid)}
                                >
                                  Reddet
                                </button>
                              </div>
                            </div>
                          ) : outgoingRequests[u?.uid || ""]?.status ===
                            "pending" ? (
                            <button
                              className={`profile-action-btn ${(developerMode || isFriendWith(u?.uid)) ? "compact-right" : ""}`}
                              onClick={() => {
                                setAdminProfileModal({ open: false, user: null });
                                setConfirmModal({
                                  show: true,
                                  title: "İstek İptali",
                                  message:
                                    "Arkadaşlık isteğini iptal etmek istediğine emin misin?",
                                  onConfirm: async () => {
                                    await cancelFriendRequest(u.uid);
                                    setAdminProfileModal({
                                      open: true,
                                      user: u,
                                    });
                                  },
                                  onCancel: () => {
                                    setAdminProfileModal({
                                      open: true,
                                      user: u,
                                    });
                                  },
                                });
                              }}
                            >
                              İstek Gönderildi
                            </button>
                          ) : (
                            <button
                              className={`profile-action-btn action-wide ${(developerMode || isFriendWith(u?.uid)) ? "compact-right" : ""}`}
                              onClick={async () => {
                                if (isBlockedUser(u?.uid)) return;
                                const result = await sendFriendRequest(u.uid, u.username);
                                if (result === "blocked_by_target") {
                                  const reopenUser = u;
                                  setAdminProfileModal({ open: false, user: null });
                                  setConfirmModal({
                                    show: true,
                                    title: "Bilgilendirme",
                                    message: "Bu kullanıcı seni engelledi.",
                                    confirmText: "Anladım",
                                    hideCancel: true,
                                    onConfirm: () => {
                                      setAdminProfileModal({ open: true, user: reopenUser });
                                    },
                                    onCancel: () => {
                                      setAdminProfileModal({ open: true, user: reopenUser });
                                    },
                                  });
                                }
                              }}
                            >
                              {isBlockedUser(u?.uid) ? "Engelledin" : "Arkadaş Ekle"}
                            </button>
                          )}
                          {!!u?.uid && (
                            <div className="profile-more compact-attach">
                              <button
                                className="profile-more-btn compact-left"
                                onClick={() => setProfileActionsOpen((p: boolean) => !p)}
                              >
                                ⁝
                              </button>
                              <AnimatePresence>
                                {profileActionsOpen && (
                                  <motion.div
                                    className="profile-more-menu"
                                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                    transition={{
                                      duration: 0.26,
                                      ease: [0.16, 1, 0.3, 1],
                                    }}
                                  >
                                    {isFriendWith(u?.uid) && (
                                      <button
                                        className="profile-more-item danger"
                                        onClick={() => {
                                          const reopenUser = u;
                                          setAdminProfileModal({
                                            open: false,
                                            user: null,
                                          });
                                          setConfirmModal({
                                            show: true,
                                            title: "Arkadaşlıktan Çıkar",
                                            message:
                                              "Bu kullanıcıyı arkadaşlıktan çıkarmak istediğine emin misin?",
                                            confirmText: "Arkadaşlıktan çıkar",
                                            onConfirm: async () => {
                                              await removeFriend(reopenUser.uid);
                                              setAdminProfileModal({
                                                open: true,
                                                user: reopenUser,
                                              });
                                            },
                                            onCancel: () => {
                                              setAdminProfileModal({
                                                open: true,
                                                user: reopenUser,
                                              });
                                            },
                                          });
                                          setProfileActionsOpen(false);
                                        }}
                                      >
                                        Arkadaşlıktan çıkar
                                      </button>
                                    )}
                                    <button
                                      className="profile-more-item danger"
                                      onClick={() => {
                                        const reopenUser = u;
                                        const blocked = isBlockedUser(reopenUser?.uid);
                                        setAdminProfileModal({
                                          open: false,
                                          user: null,
                                        });
                                        setConfirmModal({
                                          show: true,
                                          title: blocked ? "Engellemeyi Kaldır" : "Kullanıcıyı Engelle",
                                          message: blocked
                                            ? `${reopenUser?.displayName || reopenUser?.username || "Bu kullanıcı"} için engellemeyi kaldırmak istediğine emin misin?`
                                            : `${reopenUser?.displayName || reopenUser?.username || "Bu kullanıcı"} kullanıcısını engellemek istediğine emin misin?`,
                                          confirmText: blocked ? "Engeli kaldır" : "Evet, devam et",
                                          onConfirm: async () => {
                                            if (blocked) {
                                              await unblockUser(reopenUser.uid);
                                            } else {
                                              await blockUser(reopenUser.uid);
                                            }
                                            setAdminProfileModal({
                                              open: true,
                                              user: reopenUser,
                                            });
                                          },
                                          onCancel: () => {
                                            setAdminProfileModal({
                                              open: true,
                                              user: reopenUser,
                                            });
                                          },
                                        });
                                        setProfileActionsOpen(false);
                                      }}
                                    >
                                      {isBlockedUser(u?.uid) ? "Engellemeyi Kaldır" : "Kullanıcıyı Engelle"}
                                    </button>
                                    {developerMode && (
                                      <button
                                        className="profile-more-item"
                                        onClick={() => {
                                          handleCopyUserUid(u?.uid);
                                          setProfileActionsOpen(false);
                                        }}
                                      >
                                        Kullanıcı UID kopyala
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="profile-tabs">
                  <button
                    className={`profile-tab ${profileTab === "about" ? "active" : ""}`}
                    onClick={() => setProfileTab("about")}
                  >
                    Hakkında
                  </button>

                  <button
                    className={`profile-tab ${profileTab === "info" ? "active" : ""}`}
                    onClick={() => setProfileTab("info")}
                  >
                    Kullanıcı Bilgisi
                  </button>
                </div>

                <div className="profile-tab-content">
                  {profileTab === "about" ? (
                    <div className="profile-about">
                      {u.bio?.trim()?.length ? u.bio : ""}
                    </div>
                  ) : (
                    <div className="profile-info">
                      <div className="profile-info-row">
                        <span className="profile-info-label">
                          Şu tarihten beri üye:{" "}
                          <span className="profile-info-value">
                            {" "}
                            {formatFirestoreDate(u.createdAt, false)}
                          </span>
                        </span>
                      </div>
                      <div className="profile-info-row">
                        <span className="profile-info-label">
                          Son görülme:{" "}
                          <span className="profile-info-value">
                            {getUserLastSeenText(u)}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showProfileModal && (
            <motion.div
              className="profile-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onMouseDown={() => setShowProfileModal(false)}
            >
              <motion.div
                className="profile-modal-card"
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.985 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className="profile-modal-banner"
                  style={{
                    backgroundImage: safeUrl(effectiveBanner)
                      ? `url(${safeUrl(effectiveBanner)})`
                      : undefined,
                  }}
                />

                <div className="profile-modal-body">
                  <div className="profile-left profile-left-column">
                    <div className="profile-avatar-wrap">
                      <img
                        className="profile-avatar"
                        src={safeImageSrc(
                          effectiveProfilePic,
                          "https://i.hizliresim.com/ntdyvrh.jpg",
                        )}
                        alt="avatar"
                        draggable={false}
                      />
                      <StatusDot className="profile-status-dot status-dot-location" status={effectiveStatus} size="lg" />

                      {customStatus?.trim()?.length > 0 &&
                        (isViewingOwnProfile ||
                          (getPresenceState(
                            presence,
                            userStatus,
                            lastActive,
                          ) === "online" &&
                            userStatus !== "offline")) && (
                          <div className="profile-status-bubble-on-avatar">
                            <div className="psb-text-wrapper">
                              <span className="psb-text">{customStatus}</span>
                            </div>
                          </div>
                        )}
                    </div>

                    <div className="profile-names">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div className="profile-displayname">
                          {displayName || username}
                        </div>
                      </div>
                      <div className="profile-username">{username}</div>
                      {renderActiveBadges()}
                    </div>
                  </div>

                  <div className="profile-right">
                    <div
                      className={`profile-actions ${developerMode ? "dev-compact" : ""}`}
                    >
                      {isViewingOwnProfile ? (
                        <>
                          <button
                            className={`profile-action-btn primary ${developerMode ? "compact-right" : ""}`}
                            onClick={() => {
                              setShowProfileModal(false);
                              setShowSettingsPage(true);
                              setSettingsTab("profile");
                            }}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              style={{ marginRight: 8 }}
                            >
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                            </svg>
                            Profili Düzenle
                          </button>
                          {developerMode && (
                            <div className="profile-more compact-attach">
                              <button
                                className="profile-more-btn compact-left"
                                onClick={() => setProfileActionsOpen((p: boolean) => !p)}
                              >
                                ⁝
                              </button>
                              <AnimatePresence>
                                {profileActionsOpen && (
                                  <motion.div
                                    className="profile-more-menu"
                                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                    transition={{
                                      duration: 0.26,
                                      ease: [0.16, 1, 0.3, 1],
                                    }}
                                  >
                                    {developerMode && (
                                      <button
                                        className="profile-more-item"
                                        onClick={() => {
                                          handleCopyUserUid(
                                            userDocData?.uid ||
                                              auth.currentUser?.uid,
                                          );
                                          setProfileActionsOpen(false);
                                        }}
                                      >
                                        Kullanıcı UID kopyala
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            className={`profile-action-btn ${developerMode ? "compact" : ""}`}
                          >
                            Mesaj Gönder
                          </button>

                          {(isFriendVisual || isFriendWith(u?.uid)) ? (
                            <button
                              className={`profile-icon-btn ${(developerMode || isFriendVisual || isFriendWith(u?.uid)) ? "compact-right" : ""}`}
                            >
                              ?
                            </button>
                          ) : (
                            <button
                              className={`profile-action-btn ${(developerMode || isFriendVisual || isFriendWith(u?.uid)) ? "compact-right" : ""}`}
                            >
                              {isBlockedUser(u?.uid) ? "Engelledin" : "Arkadaş Ekle"}
                            </button>
                          )}
                          {!!u?.uid && (
                            <div className="profile-more compact-attach">
                              <button
                                className="profile-more-btn compact-left"
                                onClick={() => setProfileActionsOpen((p: boolean) => !p)}
                              >
                                ⁝
                              </button>
                              <AnimatePresence>
                                {profileActionsOpen && (
                                  <motion.div
                                    className="profile-more-menu"
                                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                    transition={{
                                      duration: 0.26,
                                      ease: [0.16, 1, 0.3, 1],
                                    }}
                                  >
                                    {isFriendWith(u?.uid) && (
                                      <button
                                        className="profile-more-item danger"
                                        onClick={() => {
                                          const reopenUser = u;
                                          setAdminProfileModal({
                                            open: false,
                                            user: null,
                                          });
                                          setConfirmModal({
                                            show: true,
                                            title: "Arkadaşlıktan Çıkar",
                                            message:
                                              "Bu kullanıcıyı arkadaşlıktan çıkarmak istediğine emin misin?",
                                            confirmText: "Arkadaşlıktan çıkar",
                                            onConfirm: async () => {
                                              await removeFriend(reopenUser.uid);
                                              setAdminProfileModal({
                                                open: true,
                                                user: reopenUser,
                                              });
                                            },
                                            onCancel: () => {
                                              setAdminProfileModal({
                                                open: true,
                                                user: reopenUser,
                                              });
                                            },
                                          });
                                          setProfileActionsOpen(false);
                                        }}
                                      >
                                        Arkadaşlıktan çıkar
                                      </button>
                                    )}
                                    <button
                                      className="profile-more-item danger"
                                      onClick={() => {
                                        const reopenUser = u;
                                        const blocked = isBlockedUser(reopenUser?.uid);
                                        setAdminProfileModal({
                                          open: false,
                                          user: null,
                                        });
                                        setConfirmModal({
                                          show: true,
                                          title: blocked ? "Engellemeyi Kaldır" : "Kullanıcıyı Engelle",
                                          message: blocked
                                            ? `${reopenUser?.displayName || reopenUser?.username || "Bu kullanıcı"} için engellemeyi kaldırmak istediğine emin misin?`
                                            : `${reopenUser?.displayName || reopenUser?.username || "Bu kullanıcı"} kullanıcısını engellemek istediğine emin misin?`,
                                          confirmText: blocked ? "Engeli kaldır" : "Evet, devam et",
                                          onConfirm: async () => {
                                            if (blocked) {
                                              await unblockUser(reopenUser.uid);
                                            } else {
                                              await blockUser(reopenUser.uid);
                                            }
                                            setAdminProfileModal({
                                              open: true,
                                              user: reopenUser,
                                            });
                                          },
                                          onCancel: () => {
                                            setAdminProfileModal({
                                              open: true,
                                              user: reopenUser,
                                            });
                                          },
                                        });
                                        setProfileActionsOpen(false);
                                      }}
                                    >
                                      {isBlockedUser(u?.uid) ? "Engellemeyi Kaldır" : "Kullanıcıyı Engelle"}
                                    </button>
                                    {developerMode && (
                                      <button
                                        className="profile-more-item"
                                        onClick={() => {
                                          handleCopyUserUid(u?.uid);
                                          setProfileActionsOpen(false);
                                        }}
                                      >
                                        Kullanıcı UID kopyala
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="profile-tabs">
                  <button
                    className={`profile-tab ${profileTab === "about" ? "active" : ""}`}
                    onClick={() => setProfileTab("about")}
                  >
                    Hakkında
                  </button>

                  <button
                    className={`profile-tab ${profileTab === "info" ? "active" : ""}`}
                    onClick={() => setProfileTab("info")}
                  >
                    Kullanıcı Bilgisi
                  </button>
                </div>

                <div className="profile-tab-content">
                  {profileTab === "about" ? (
                    <div className="profile-about">
                      {bio?.trim()?.length ? bio : ""}
                    </div>
                  ) : (
                    <div className="profile-info">
                      <div className="profile-info-row">
                        <span className="profile-info-label">
                          Şu tarihten beri üye:{" "}
                          <span className="profile-info-value">
                            {" "}
                            {formatFirestoreDate(createdAt, false)}
                          </span>
                        </span>
                      </div>
                      <div className="profile-info-row">
                        <span className="profile-info-label">
                          Son görülme:{" "}
                          <span className="profile-info-value">
                            {isViewingOwnProfile
                              ? getUserLastSeenText({
                                  uid: auth.currentUser?.uid,
                                  status: userStatus,
                                  presence,
                                  lastActive,
                                })
                              : getUserLastSeenText(userDocData)}
                          </span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </>
  );
}

export default memo(ProfileModals);














