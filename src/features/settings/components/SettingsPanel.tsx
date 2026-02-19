import { AnimatePresence, motion } from "framer-motion";
import { memo, useState } from "react";
import StatusDot from "../../../shared/components/StatusDot";

type SettingsPanelProps = any;

function SettingsPanel(props: SettingsPanelProps) {
  const {
    CustomSelect,
    OWNER_UID,
    adminErrField,
    adminErrMsg,
    adminLoading,
    adminShake,
    adminUidInput,
    adminUidMenuOpen,
    admins,
    auth,
    authImageError,
    authImageInput,
    authImageShake,
    authImageSuccess,
    avatarInputRef,
    badgeDefs,
    badgeErrField,
    badgeErrMsg,
    badgeIconUrl,
    badgeName,
    badgePermissionKey,
    badgeShake,
    badgeType,
    bannerInputRef,
    bio,
    changelogData,
    closeEditBadge,
    closeProfileEditModal,
    cropImageRef,
    developerMode,
    desktopNotificationsEnabled,
    displayName,
    draftThemeId,
    editBadgeErrField,
    editBadgeErrMsg,
    editBadgeIconUrl,
    editBadgeName,
    editBadgePermissionKey,
    editBadgeShake,
    editBadgeType,
    effectiveBanner,
    effectiveProfilePic,
    effectiveStatus,
    fetchUserByUid,
    formatDate,
    formatDateTR,
    formatMsDateTime,
    getUserEffectiveStatus,
    getAdminTargetStatus,
    getUserLastSeenText,
    handleApplyCrop,
    handleCancelAllChanges,
    handleCancelCrop,
    handleConfirmEmailChange,
    handleCopyUserUid,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    handleCropZoomChange,
    handleLogout,
    handleMediaFileChange,
    handleSaveAllChanges,
    handleSaveAuthImage,
    handleSaveBio,
    handleSaveDisplayName,
    handleSaveEmail,
    handleSaveUsername,
    handleSelectTheme,
    handleSendNewEmailCode,
    handleToggleDeveloperMode,
    handleUpdateBadge,
    handleVerifyEmailCode,
    handleVerifyNewEmailCode,
    isAdmin,
    isApplyingSettings,
    isSavingAllChanges,
    isBadgeActiveForTarget,
    isOwner,
    isVideoUrl,
    maskEmail,
    mediaCropBaseScale,
    mediaCropBox,
    mediaCropError,
    mediaCropImage,
    mediaCropOffset,
    mediaCropOpen,
    mediaCropSrc,
    mediaCropType,
    mediaCropZoom,
    mediaDirty,
    mediaUploadState,
    openEditBadge,
    openMediaPicker,
    openProfileEditModal,
    openUrl,
    profileActionsOpen,
    profileEditCodeInput,
    profileEditError,
    profileEditErrorField,
    profileEditField,
    profileEditInfo,
    profileEditLoading,
    profileEditNewCodeInput,
    profileEditNewStage,
    profileEditPassword,
    profileEditStep,
    profileEditValue,
    profileUsernameStatus,
    renderActiveBadges,
    renderBadgesForUser,
    renderMetaCopyValue,
    requestCloseSettings,
    requestCreateBadge,
    requestDeleteBadge,
    requestToggleBadgeVisibility,
    safeImageSrc,
    safeUrl,
    sanitizeUsernameInput,
    setAdminProfileModal,
    setAdminUidInput,
    setAdminUidMenuOpen,
    setAuthImageInput,
    setBadgeErrField,
    setBadgeErrMsg,
    setBadgeIconUrl,
    setBadgeName,
    setBadgePermissionKey,
    setBadgeType,
    setBanModal,
    setBanReason,
    setClErrors,
    setClImageUrl,
    setClNewFeatures,
    setClRemoved,
    setClShake,
    setClTempDisabled,
    setConfirmModal,
    setEditBadgeIconUrl,
    setEditBadgeName,
    setEditBadgePermissionKey,
    setEditBadgeType,
    setIsViewingOwnProfile,
    setProfileActionsOpen,
    setProfileEditCodeInput,
    setProfileEditInfo,
    setProfileEditNewCodeInput,
    setProfileEditPassword,
    setProfileEditValue,
    setSettingsTab,
    setShowAdminList,
    setShowAuthImageTools,
    setShowBadgeTools,
    setShowChangelogForm,
    setShowChangelogModal,
    setShowChangelogTools,
    setShowProfileEmail,
    setShowUserOps,
    setUidCopyTip,
    settingsDirty,
    settingsTab,
    shouldBlockSettingsClose,
    showAdminList,
    showAuthImageTools,
    showBadgeEditModal,
    showBadgeTools,
    showChangelogTools,
    showProfileEditModal,
    showProfileEmail,
    showSettingsPage,
    showUserOps,
    targetUser,
    themes,
    toggleDesktopNotifications,
    toggleBadgeForTarget,
    triggerUnsavedNudge,
    uidCopyTip,
    unsavedFlash,
    userDocData,
    userOpsRef,
    username,
  } = props;
  const resolveAdminStatus = (u: any) => {
    if (typeof getAdminTargetStatus === "function") {
      return getAdminTargetStatus(u);
    }
    if (typeof getUserEffectiveStatus === "function") {
      return getUserEffectiveStatus(u);
    }
    return "offline";
  };

  const saveLoading =
    isSavingAllChanges ||
    mediaUploadState === "uploading" ||
    isApplyingSettings;

  const bounceLoader = (
    <span className="auth-btn-loader settings-save-loader">
      <span className="auth-btn-loader-dot"></span>
      <span className="auth-btn-loader-dot delay-2"></span>
      <span className="auth-btn-loader-dot delay-3"></span>
    </span>
  );


  const bounceLoaderCompact = (
    <span className="auth-btn-loader" aria-hidden="true">
      <span className="auth-btn-loader-dot"></span>
      <span className="auth-btn-loader-dot delay-2"></span>
      <span className="auth-btn-loader-dot delay-3"></span>
    </span>
  );

  const [authImageSaving, setAuthImageSaving] = useState(false);
  const [badgeCreating, setBadgeCreating] = useState(false);
  const [launchingChangelog, setLaunchingChangelog] = useState(false);

  const adminPool = (Array.isArray(admins) ? admins : []).filter(Boolean);
  const ownerFromPool =
    adminPool.find(
      (u: any) => u?.uid === OWNER_UID || String(u?.role || "") === "owner",
    ) || null;
  const ownerFallback =
    isOwner && auth.currentUser?.uid
      ? {
          uid: auth.currentUser.uid,
          username: userDocData?.username || username || "owner",
          displayName:
            userDocData?.displayName ||
            displayName ||
            userDocData?.username ||
            username ||
            "Owner",
          profilePic:
            userDocData?.profilePic ||
            userDocData?.photoURL ||
            effectiveProfilePic ||
            "https://i.hizliresim.com/ntdyvrh.jpg",
          role: "owner",
        }
      : null;
  const ownerEntry = ownerFromPool || ownerFallback;
  const sortedAdmins = adminPool
    .filter(
      (u: any) =>
        !!u?.uid &&
        u.uid !== ownerEntry?.uid &&
        (String(u?.role || "") === "admin" || u?.staff === true),
    )
    .sort((a: any, b: any) =>
      String(a?.username || "")
        .toLocaleLowerCase("tr-TR")
        .localeCompare(String(b?.username || "").toLocaleLowerCase("tr-TR")),
    );
  const hasAdminList = !!ownerEntry || sortedAdmins.length > 0;

  const scrollUserOpsIntoView = () => {
    const el = userOpsRef?.current;
    if (!el) return;
    const container = el.closest(".settings-content") as HTMLElement | null;
    if (!container) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const nextTop = container.scrollTop + (elRect.top - containerRect.top) - 10;
    container.scrollTo({
      top: Math.max(0, nextTop),
      behavior: "smooth",
    });
  };
  const openAdminFromList = (u: any) => {
    if (!u) return;
    setIsViewingOwnProfile(u.uid === auth.currentUser?.uid);
    setAdminProfileModal({
      open: true,
      user: u,
    });
  };
  return (
    <>
      <AnimatePresence mode="wait">
        {showSettingsPage && (
          <motion.div
            className="settings-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="settings-page"
              initial={{
                opacity: 0,
                scale: 0.99,
                y: 14,
                filter: "blur(6px)",
              }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.99, y: 14, filter: "blur(6px)" }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="settings-close-area">
                <button
                  className="settings-close-btn"
                  onClick={() => {
                    setShowChangelogModal(false);
                    setShowChangelogForm(false);
                    requestCloseSettings();
                  }}
                >
                  ×
                </button>
                <div className="settings-esc-text">ESC</div>
              </div>

              <div className="settings-layout">
                <div className="settings-sidebar">
                  <div
                    className="settings-sidebar-title"
                    style={{ textAlign: "center" }}
                  >
                    Ayarlar
                  </div>

                  <div
                    className={`settings-tab ${settingsTab === "profile" ? "active" : ""}`}
                    onClick={() => {
                      if (shouldBlockSettingsClose) {
                        triggerUnsavedNudge();
                        return;
                      }
                      setSettingsTab("profile");
                    }}
                  >
                    Profilim
                  </div>
                  {isAdmin && (
                    <div
                      className={`settings-tab ${settingsTab === "admin" ? "active" : ""}`}
                      onClick={() => {
                        if (shouldBlockSettingsClose) {
                          triggerUnsavedNudge();
                          return;
                        }
                        setSettingsTab("admin");
                      }}
                    >
                      Admin
                    </div>
                  )}
                  <div className="settings-separator"></div>
                  <div className="settings-sidebar-title">
                    Uygulama Ayarları
                  </div>
                  <div
                    className={`settings-tab ${settingsTab === "appearance" ? "active" : ""}`}
                    onClick={() => {
                      if (shouldBlockSettingsClose) {
                        triggerUnsavedNudge();
                        return;
                      }
                      setSettingsTab("appearance");
                    }}
                  >
                    Görünüm
                  </div>
                  <div
                    className={`settings-tab ${settingsTab === "notifications" ? "active" : ""}`}
                    onClick={() => {
                      if (shouldBlockSettingsClose) {
                        triggerUnsavedNudge();
                        return;
                      }
                      setSettingsTab("notifications");
                    }}
                  >
                    Bildirimler
                  </div>

                  <div className="settings-separator"></div>
                  <div className="settings-sidebar-title">Diğer</div>
                  <div
                    className={`settings-tab ${settingsTab === "advanced" ? "active" : ""}`}
                    onClick={() => {
                      if (shouldBlockSettingsClose) {
                        triggerUnsavedNudge();
                        return;
                      }
                      setSettingsTab("advanced");
                    }}
                  >
                    Gelişmiş
                  </div>
                  <div
                    className={`settings-tab ${settingsTab === "changelog" ? "active" : ""}`}
                    onClick={() => {
                      if (shouldBlockSettingsClose) {
                        triggerUnsavedNudge();
                        return;
                      }
                      setShowChangelogModal(true);
                    }}
                  >
                    Yenilikler
                  </div>
                  <div className="settings-separator"></div>

                  <div
                    className={`settings-tab logout ${settingsTab === "logout" ? "active" : ""}`}
                    onClick={() => {
                      if (shouldBlockSettingsClose) {
                        triggerUnsavedNudge();
                        return;
                      }
                      setConfirmModal({
                        show: true,
                        title: "Çıkış Yap",
                        message:
                          "Hesabından çıkış yapmak istediğine emin misin?",
                        onConfirm: handleLogout,
                      });
                    }}
                  >
                    Çıkış Yap
                  </div>
                </div>
                <div className="settings-content">
                  {settingsTab === "admin" && isAdmin && (
                    <div className="settings-section admin-settings-layout">
                      <h2 className="settings-title">
                        <span style={{ color: "#888" }}>Ayarlar &gt;</span>{" "}
                        Admin
                      </h2>
                      <div className="admin-scope-title">Adminler İçin</div>

                      {isAdmin && (
                        <div className="settings-note admin-tools-section">
                          {isAdmin && (
                            <div className="admin-tool-block admin-tool-auth">
                              <div
                                className="admin-collapsible-header"
                                onClick={() => setShowAuthImageTools((p: boolean) => !p)}
                              >
                                <span>Giriş / Kayıt Görseli</span>
                              </div>

                              <AnimatePresence initial={false}>
                                {showAuthImageTools && (
                                  <motion.div
                                    className="admin-collapsible-content"
                                    layout
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{
                                      duration: 0.32,
                                      ease: [0.22, 1, 0.36, 1],
                                    }}
                                    style={{ overflow: "hidden" }}
                                  >
                                    <div className="admin-changelog-card">
                                      <div className="admin-changelog-title">
                                        Giriş / Kayıt Görseli
                                      </div>
                                      <div className="admin-changelog-sub">
                                        Geçerli bir URL gir (YouTube Shorts
                                        desteklenir).
                                      </div>
                                      <div
                                        className={`piksel-group ${authImageShake ? "error-shake" : ""}`}
                                        style={{ marginTop: 12 }}
                                      >
                                        <div className="label-row">
                                          <label>Görsel / Video URL</label>
                                          {authImageError && (
                                            <span className="err-txt">
                                              {authImageError}
                                            </span>
                                          )}
                                          {!authImageError &&
                                            authImageSuccess && (
                                              <span
                                                style={{
                                                  color: "#2ecc71",
                                                  fontWeight: 700,
                                                  fontSize: "11px",
                                                }}
                                              >
                                                Güncelleme başarılı!
                                              </span>
                                            )}
                                        </div>
                                        <input
                                          className={`piksel-input2 ${authImageSuccess ? "success-flash" : ""}`}
                                          value={authImageInput}
                                          onChange={(e) =>
                                            setAuthImageInput(e.target.value)
                                          }
                                          placeholder="Görsel ya da YouTube Shorts URL"
                                        />
                                      </div>
                                      <br />
                                      <div className="admin-changelog-actions">
                                        <button
                                          className="admin-changelog-btn"
                                          type="button"
                                          onClick={async () => {
                                            setAuthImageSaving(true);
                                            try {
                                              await Promise.resolve(handleSaveAuthImage());
                                            } finally {
                                              setAuthImageSaving(false);
                                            }
                                          }}
                                        >{authImageSaving ? bounceLoaderCompact : "Kaydet"}</button>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                          {isOwner && (
                            <>
                              <div className="admin-tool-block admin-tool-changelog">
                              <div
                                className="admin-collapsible-header"
                                onClick={() => setShowChangelogTools((p: boolean) => !p)}
                              >
                                <span>Yenilik Yayınlama</span>
                              </div>

                              <AnimatePresence initial={false}>
                                {showChangelogTools && (
                                  <motion.div
                                    className="admin-collapsible-content"
                                    layout
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{
                                      duration: 0.32,
                                      ease: [0.22, 1, 0.36, 1],
                                    }}
                                    style={{ overflow: "hidden" }}
                                  >
                                    <div className="admin-changelog-card">
                                      <div className="admin-changelog-header">
                                        <div>
                                          <div className="admin-changelog-title">
                                            Son Paylaşılan Yenilikler
                                          </div>
                                          <div className="admin-changelog-sub">
                                            {formatDateTR(
                                              changelogData?.createdAt,
                                            ) || "Tarih yok"}
                                          </div>
                                        </div>
                                        <div
                                          className={`admin-changelog-badge ${changelogData ? "is-live" : "is-empty"}`}
                                        >
                                          {changelogData ? "Aktif" : "Yok"}
                                        </div>
                                      </div>

                                      <div className="admin-changelog-stack">
                                        {changelogData?.newFeatures?.trim?.() && (
                                          <div className="admin-changelog-block">
                                            <div className="admin-changelog-label">
                                              <span className="cl-badge new">
                                                Yenilikler
                                              </span>
                                            </div>
                                            <div className="admin-changelog-value">
                                              {changelogData.newFeatures}
                                            </div>
                                          </div>
                                        )}
                                        {changelogData?.tempDisabled?.trim?.() && (
                                          <div className="admin-changelog-block">
                                            <div className="admin-changelog-label">
                                              <span className="cl-badge temp">
                                                Geçici Olarak Devre Dışı
                                              </span>
                                            </div>
                                            <div className="admin-changelog-value">
                                              {changelogData.tempDisabled}
                                            </div>
                                          </div>
                                        )}
                                        {changelogData?.removed?.trim?.() && (
                                          <div className="admin-changelog-block">
                                            <div className="admin-changelog-label">
                                              <span className="cl-badge removed">
                                                Kaldırılan
                                              </span>
                                            </div>
                                            <div className="admin-changelog-value">
                                              {changelogData.removed}
                                            </div>
                                          </div>
                                        )}
                                        <div className="admin-changelog-block">
                                          <div className="admin-changelog-label">
                                            <span className="cl-badge neutral">
                                              Görsel / Video Link
                                            </span>
                                          </div>
                                          <div className="admin-changelog-value">
                                            {changelogData?.imageUrl ? (
                                              <button
                                                type="button"
                                                className="admin-changelog-link"
                                                onClick={async () => {
                                                  try {
                                                    await openUrl(
                                                      changelogData.imageUrl,
                                                    );
                                                  } catch {}
                                                }}
                                              >
                                                {isVideoUrl(
                                                  changelogData.imageUrl,
                                                )
                                                  ? "Videoyu Aç"
                                                  : "Görseli Aç"}
                                                <svg
                                                  viewBox="0 0 24 24"
                                                  aria-hidden="true"
                                                >
                                                  <path d="M14 3h7v7h-2V6.414l-9.293 9.293-1.414-1.414L17.586 5H14V3ZM5 5h6V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6h-2v6H5V5Z" />
                                                </svg>
                                              </button>
                                            ) : (
                                              "Yok"
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="admin-changelog-actions">
                                        <button
                                          className="admin-changelog-btn"
                                          onClick={() => {
                                            setLaunchingChangelog(true);
                                            setClImageUrl("");
                                            setClNewFeatures("");
                                            setClTempDisabled("");
                                            setClRemoved("");
                                            setClErrors({});
                                            setClShake({});
                                            window.setTimeout(() => {
                                              setShowChangelogForm(true);
                                              setLaunchingChangelog(false);
                                            }, 180);
                                          }}
                                        >
                                          {launchingChangelog ? bounceLoaderCompact : "Yenilik Yayınla"}
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>

                            <div className="admin-tool-block admin-tool-badge">
                              <div
                                className="admin-collapsible-header"
                                onClick={() => setShowBadgeTools((p: boolean) => !p)}
                              >
                                <span>Rozet Ayarları</span>
                              </div>

                              <AnimatePresence initial={false}>
                                {showBadgeTools && (
                                  <motion.div
                                    className="admin-collapsible-content"
                                    layout
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{
                                      duration: 0.32,
                                      ease: [0.22, 1, 0.36, 1],
                                    }}
                                    style={{ overflow: "hidden" }}
                                  >
                                    <div className="admin-badge-settings">
                                      <div className="admin-badge-settings__title">
                                        Yeni Rozet Oluştur
                                      </div>
                                      <div className="admin-badge-settings__grid">
                                        <div className="badge-select-row">
                                          <div
                                            className={`piksel-group ${badgeShake === "name" ? "error-shake" : ""}`}
                                          >
                                            <div className="label-row">
                                              <label>Rozet Adı</label>
                                              {badgeErrField === "name" && (
                                                <span className="err-txt">
                                                  {badgeErrMsg}
                                                </span>
                                              )}
                                            </div>
                                            <input
                                              className="piksel-input2"
                                              value={badgeName}
                                              onChange={(e) => {
                                                setBadgeName(e.target.value);
                                                if (badgeErrField === "name") {
                                                  setBadgeErrField("");
                                                  setBadgeErrMsg("");
                                                }
                                              }}
                                              placeholder="Rozet ismi giriniz"
                                            />
                                          </div>
                                          <div
                                            className={`piksel-group ${badgeShake === "icon" ? "error-shake" : ""}`}
                                          >
                                            <div className="label-row">
                                              <label>Rozet Görsel URL</label>
                                              {badgeErrField === "icon" && (
                                                <span className="err-txt">
                                                  {badgeErrMsg}
                                                </span>
                                              )}
                                            </div>
                                            <input
                                              className="piksel-input2"
                                              value={badgeIconUrl}
                                              onChange={(e) => {
                                                setBadgeIconUrl(e.target.value);
                                                if (badgeErrField === "icon") {
                                                  setBadgeErrField("");
                                                  setBadgeErrMsg("");
                                                }
                                              }}
                                              placeholder="Görsel URL"
                                            />
                                          </div>
                                        </div>

                                        <div className="badge-select-row">
                                          <div className="piksel-group">
                                            <div className="label-row">
                                              <label>Rozet Türü</label>
                                            </div>
                                            <CustomSelect
                                              className="badge-select"
                                              value={badgeType}
                                              onChange={(next: string) => {
                                                const nextType = next as
                                                  | "info"
                                                  | "permission";
                                                setBadgeType(nextType);
                                                if (nextType === "info") {
                                                  setBadgePermissionKey("user");
                                                }
                                              }}
                                              options={[
                                                {
                                                  value: "info",
                                                  label: "info",
                                                },
                                                {
                                                  value: "permission",
                                                  label: "permission",
                                                },
                                              ]}
                                            />
                                          </div>

                                          <div
                                            className={`piksel-group ${badgeShake === "permission" ? "error-shake" : ""} ${badgeType !== "permission" ? "is-disabled" : ""}`}
                                          >
                                            <div className="label-row">
                                              <label>Permission Key</label>
                                              {badgeErrField ===
                                                "permission" && (
                                                <span className="err-txt">
                                                  {badgeErrMsg}
                                                </span>
                                              )}
                                            </div>
                                            <CustomSelect
                                              className="badge-select"
                                              value={badgePermissionKey}
                                              onChange={(next: string) =>
                                                setBadgePermissionKey(
                                                  next as "admin" | "user",
                                                )
                                              }
                                              options={[
                                                {
                                                  value: "user",
                                                  label: "user",
                                                },
                                                {
                                                  value: "admin",
                                                  label: "admin",
                                                },
                                              ]}
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      <div className="admin-badge-settings__actions">
                                        <button
                                          className="admin-changelog-btn"
                                          type="button"
                                          onClick={async () => {
                                            setBadgeCreating(true);
                                            try {
                                              await Promise.resolve(requestCreateBadge());
                                            } finally {
                                              setBadgeCreating(false);
                                            }
                                          }}
                                        >
                                          {badgeCreating ? bounceLoaderCompact : "Rozet Oluştur"}
                                        </button>
                                      </div>

                                      <div className="admin-badge-settings__list">
                                        <div className="admin-badge-settings__title">
                                          Mevcut Rozetler
                                        </div>
                                        <div className="admin-badge-settings__items admin-badges-grid">
                                          {Object.entries(badgeDefs as Record<string, any>).map(([id, b]: [string, any]) => {
                                              const active = b.active !== false;
                                              return (
                                                <div
                                                  key={id}
                                                  className={`admin-badge-card ${active ? "is-active" : "is-passive"}`}
                                                >
                                                  <div className="admin-badge-card__left">
                                                    <img
                                                      className="admin-badge-card__icon"
                                                      src={safeImageSrc(
                                                        b.iconUrl,
                                                      )}
                                                      alt={b.name}
                                                    />
                                                    <div className="admin-badge-card__texts">
                                                      <div className="admin-badge-card__name">
                                                        {b.name}
                                                      </div>
                                                      <div className="admin-badge-card__type">
                                                        {b.type || "info"} Ã‚Â·{" "}
                                                        {b.permissionKey || "-"}
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <div className="admin-badge-card__right">
                                                    <label className="switch">
                                                      <input
                                                        type="checkbox"
                                                        checked={active}
                                                        onChange={() =>
                                                          requestToggleBadgeVisibility(
                                                            id,
                                                            b.name,
                                                          )
                                                        }
                                                      />
                                                      <span className="slider"></span>
                                                    </label>
                                                    <button
                                                      className="admin-badge-settings__edit"
                                                      type="button"
                                                      onClick={() =>
                                                        openEditBadge(id, b)
                                                      }
                                                    >
                                                      Düzenle
                                                    </button>
                                                    <button
                                                      className="admin-badge-settings__delete"
                                                      type="button"
                                                      onClick={() =>
                                                        requestDeleteBadge(
                                                          id,
                                                          b.name,
                                                        )
                                                      }
                                                    >
                                                      Kaldır
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            },
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              <AnimatePresence>
                                {showBadgeEditModal && (
                                  <motion.div
                                    className="profile-edit-overlay"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={closeEditBadge}
                                  >
                                    <motion.div
                                      className="profile-edit-card"
                                      initial={{
                                        opacity: 0,
                                        y: 16,
                                        scale: 0.98,
                                      }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: 16, scale: 0.98 }}
                                      transition={{
                                        duration: 0.2,
                                        ease: [0.16, 1, 0.3, 1],
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="profile-edit-title">
                                        Rozet Düzenle
                                      </div>
                                      <div className="badge-select-row">
                                        <div
                                          className={`profile-edit-group ${editBadgeShake === "name" ? "error-shake" : ""}`}
                                        >
                                          <div className="label-row">
                                            <label>Rozet Adı</label>
                                            {editBadgeErrField === "name" && (
                                              <span className="err-txt">
                                                {editBadgeErrMsg}
                                              </span>
                                            )}
                                          </div>
                                          <input
                                            className="piksel-input2 profile-inline-input"
                                            value={editBadgeName}
                                            onChange={(e) =>
                                              setEditBadgeName(e.target.value)
                                            }
                                          />
                                        </div>
                                        <div
                                          className={`profile-edit-group ${editBadgeShake === "icon" ? "error-shake" : ""}`}
                                        >
                                          <div className="label-row">
                                            <label>Rozet Görsel URL</label>
                                            {editBadgeErrField === "icon" && (
                                              <span className="err-txt">
                                                {editBadgeErrMsg}
                                              </span>
                                            )}
                                          </div>
                                          <input
                                            className="piksel-input2 profile-inline-input"
                                            value={editBadgeIconUrl}
                                            onChange={(e) =>
                                              setEditBadgeIconUrl(
                                                e.target.value,
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                      <div className="badge-select-stack">
                                        <div className="profile-edit-group">
                                          <div className="label-row">
                                            <label>Rozet Türü</label>
                                          </div>
                                          <CustomSelect
                                            className="badge-select"
                                            value={editBadgeType}
                                            onChange={(next: string) => {
                                              const nextType = next as
                                                | "info"
                                                | "permission";
                                              setEditBadgeType(nextType);
                                              if (nextType === "info") {
                                                setEditBadgePermissionKey(
                                                  "user",
                                                );
                                              }
                                            }}
                                            options={[
                                              { value: "info", label: "info" },
                                              {
                                                value: "permission",
                                                label: "permission",
                                              },
                                            ]}
                                          />
                                        </div>
                                        <div
                                          className={`profile-edit-group ${editBadgeShake === "permission" ? "error-shake" : ""} ${editBadgeType !== "permission" ? "is-disabled" : ""}`}
                                        >
                                          <div className="label-row">
                                            <label>Permission Key</label>
                                            {editBadgeErrField ===
                                              "permission" && (
                                              <span className="err-txt">
                                                {editBadgeErrMsg}
                                              </span>
                                            )}
                                          </div>
                                          <CustomSelect
                                            className="badge-select"
                                            value={editBadgePermissionKey}
                                            onChange={(next: string) =>
                                              setEditBadgePermissionKey(
                                                next as "admin" | "user",
                                              )
                                            }
                                            options={[
                                              { value: "user", label: "user" },
                                              {
                                                value: "admin",
                                                label: "admin",
                                              },
                                            ]}
                                          />
                                        </div>
                                      </div>
                                      <div className="profile-edit-actions confirm-btn-group">
                                        <button
                                          className="confirm-btn cancel"
                                          type="button"
                                          onClick={closeEditBadge}
                                        >
                                          Vazgeçtim
                                        </button>
                                        <button
                                          className="confirm-btn primary has-inline-loader"
                                          type="button"
                                          onClick={handleUpdateBadge}
                                        >Kaydet</button>
                                      </div>
                                    </motion.div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                            </>
                          )}
                        </div>
                      )}


                      <div className="admin-list-section admin-list-block">
                        <div
                          className="admin-collapsible-header"
                          onClick={() => setShowAdminList((p: boolean) => !p)}
                        >
                          <span>Adminler Listesi</span>
                        </div>

                        <AnimatePresence initial={false}>
                          {showAdminList && hasAdminList && (
                            <motion.div
                              className="admin-collapsible-content admin-list admin-list-wrap"
                              layout
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{
                                duration: 0.32,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              style={{ overflow: "hidden" }}
                            >
                              <div
                                className="admin-list-stack"
                                style={{ overflow: "hidden" }}
                              >
                                {!!ownerEntry && (
                                  <div className="admin-list-group">
                                    <div className="admin-scope-title owner">
                                      Owner
                                    </div>
                                    <div className="admin-list-inner">
                                      <div
                                        key={ownerEntry.uid}
                                        className="admin-chip"
                                        onClick={() => openAdminFromList(ownerEntry)}
                                      >
                                        <img
                                          className="admin-chip__pp"
                                          src={safeImageSrc(
                                            ownerEntry.profilePic,
                                            "https://i.hizliresim.com/ntdyvrh.jpg",
                                          )}
                                          alt="pp"
                                        />
                                        <div className="admin-chip__name">
                                          {ownerEntry.username}
                                          <span
                                            className="owner-crown-icon"
                                            aria-label="Owner"
                                            title="Owner"
                                          >
                                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                              <path d="M3 7.5a1 1 0 0 1 1.7-.7L8.5 10l2.8-4.4a1 1 0 0 1 1.4-.3l.3.3L16 10l3.8-3.2a1 1 0 0 1 1.6 1l-2 9.5a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8L3 7.5Z" />
                                            </svg>
                                          </span>
                                        </div>
                                        {isOwner && (
                                          <div className="admin-chip__actions">
                                            <button
                                              type="button"
                                              className="admin-uid-copy"
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                const val = `${ownerEntry.uid || ""}`;
                                                if (!val) return;
                                                setAdminUidInput(val);
                                                fetchUserByUid(val);
                                                setShowUserOps(true);
                                                window.setTimeout(() => {
                                                  scrollUserOpsIntoView();
                                                }, 240);
                                              }}
                                            >
                                              <svg
                                                viewBox="0 0 24 24"
                                                aria-hidden="true"
                                              >
                                                <path d="M10 18a8 8 0 1 1 5.293-14.008A8 8 0 0 1 10 18Zm0-14a6 6 0 1 0 0 12a6 6 0 0 0 0-12Zm9.707 16.293-4.1-4.1 1.414-1.414 4.1 4.1a1 1 0 0 1-1.414 1.414Z" />
                                              </svg>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {sortedAdmins.length > 0 && (
                                  <div className="admin-list-group">
                                    <div className="admin-scope-title">
                                      Adminler
                                    </div>
                                    <div className="admin-list-inner">
                                      {sortedAdmins.map((a: any) => (
                                        <div
                                          key={a.uid}
                                          className="admin-chip"
                                          onClick={() => openAdminFromList(a)}
                                        >
                                          <img
                                            className="admin-chip__pp"
                                            src={safeImageSrc(
                                              a.profilePic,
                                              "https://i.hizliresim.com/ntdyvrh.jpg",
                                            )}
                                            alt="pp"
                                          />
                                          <div className="admin-chip__name">
                                            {a.username}
                                          </div>
                                          {isOwner && (
                                            <div className="admin-chip__actions">
                                              <button
                                                type="button"
                                                className="admin-uid-copy"
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  const val = `${a.uid || ""}`;
                                                  if (!val) return;
                                                  setAdminUidInput(val);
                                                  fetchUserByUid(val);
                                                  setShowUserOps(true);
                                                  window.setTimeout(() => {
                                                  scrollUserOpsIntoView();
                                                }, 240);
                                                }}
                                              >
                                                <svg
                                                  viewBox="0 0 24 24"
                                                  aria-hidden="true"
                                                >
                                                  <path d="M10 18a8 8 0 1 1 5.293-14.008A8 8 0 0 1 10 18Zm0-14a6 6 0 1 0 0 12a6 6 0 0 0 0-12Zm9.707 16.293-4.1-4.1 1.414-1.414 4.1 4.1a1 1 0 0 1-1.414 1.414Z" />
                                                </svg>
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {isAdmin && (
                        <div ref={userOpsRef} className="admin-user-ops-section">
                          <div
                            className="admin-collapsible-header"
                            onClick={() => setShowUserOps((p: boolean) => !p)}
                          >
                            <span
                              style={{
                                color: "var(--text)",
                                fontSize: "13px",
                              }}
                            >
                              Kullanıcı İşlemleri
                            </span>
                          </div>

                          <AnimatePresence initial={false}>
                            {showUserOps && (
                              <motion.div
                                className="admin-collapsible-content"
                                layout
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  duration: 0.32,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                                style={{ overflow: "hidden" }}
                              >
                                <div style={{ maxWidth: 520 }}>
                                  <div className="label-row admin-label-row">
                                    <label style={{ marginTop: "3px" }}>
                                      UID, E-Posta veya Kullanıcı Adı*
                                    </label>
                                    {adminErrField === "uid" && (
                                      <span className="err-txt">
                                        {adminErrMsg}
                                      </span>
                                    )}
                                  </div>

                                  <div
                                    className={`admin-uid-row ${adminShake === "uid" ? "error-shake" : ""}`}
                                  >
                                    <input
                                      className="piksel-input2"
                                      value={adminUidInput}
                                      onChange={(e) =>
                                        setAdminUidInput(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter")
                                          fetchUserByUid(adminUidInput);
                                      }}
                                      style={{
                                        width: "20rem",
                                        marginRight: "1rem",
                                      }}
                                    />

                                    <button
                                      type="button"
                                      className="piksel-btn2"
                                      disabled={adminLoading}
                                      onClick={() =>
                                        fetchUserByUid(adminUidInput)
                                      }
                                      style={{
                                        width: "2rem",
                                        marginRight: "1rem",
                                      }}
                                    >
                                      {adminLoading ? bounceLoaderCompact : "Ara"}
                                    </button>
                                  </div>
                                </div>

                                {targetUser && (
                                  <motion.div
                                    className="admin-target-card"
                                    initial={{
                                      opacity: 0,
                                      y: 14,
                                      scale: 0.99,
                                      filter: "blur(10px)",
                                    }}
                                    animate={{
                                      opacity: 1,
                                      y: 0,
                                      scale: 1,
                                      filter: "blur(0px)",
                                    }}
                                    exit={{
                                      opacity: 0,
                                      y: 14,
                                      scale: 0.99,
                                      filter: "blur(10px)",
                                    }}
                                    transition={{
                                      duration: 0.28,
                                      ease: [0.16, 1, 0.3, 1],
                                    }}
                                  >
                                    <div className="admin-target-card__hero">
                                      <div
                                        style={{
                                          position: "absolute",
                                          top: 12,
                                          right: 12,
                                          zIndex: 5,
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 10,
                                          alignItems: "flex-end",
                                        }}
                                      >
                                        {developerMode && (
                                          <div className="profile-more admin-uid-more">
                                            <button
                                              className="profile-more-btn"
                                              onClick={() =>
                                                setAdminUidMenuOpen((p: boolean) => !p)
                                              }
                                            >
                                              â
                                            </button>
                                            <AnimatePresence>
                                              {adminUidMenuOpen && (
                                                <motion.div
                                                  className="profile-more-menu"
                                                  initial={{
                                                    opacity: 0,
                                                    y: -6,
                                                    scale: 0.98,
                                                  }}
                                                  animate={{
                                                    opacity: 1,
                                                    y: 0,
                                                    scale: 1,
                                                  }}
                                                  exit={{
                                                    opacity: 0,
                                                    y: -6,
                                                    scale: 0.98,
                                                  }}
                                                  transition={{
                                                    duration: 0.26,
                                                    ease: [0.16, 1, 0.3, 1],
                                                  }}
                                                >
                                                  <button
                                                    className="profile-more-item"
                                                    onClick={() => {
                                                      handleCopyUserUid(
                                                        targetUser?.uid,
                                                      );
                                                      setAdminUidMenuOpen(
                                                        false,
                                                      );
                                                    }}
                                                  >
                                                    UID kopyala
                                                  </button>
                                                  <button
                                                    className="profile-more-item"
                                                    onClick={() => {
                                                      setAdminUidMenuOpen(
                                                        false,
                                                      );
                                                      setIsViewingOwnProfile(
                                                        targetUser?.uid ===
                                                          auth.currentUser?.uid,
                                                      );
                                                      setAdminProfileModal({
                                                        open: true,
                                                        user: targetUser,
                                                      });
                                                    }}
                                                  >
                                                    Profili Görüntüle
                                                  </button>
                                                  <button
                                                    className="profile-more-item danger"
                                                    onClick={() => {
                                                      setAdminUidMenuOpen(
                                                        false,
                                                      );
                                                      setBanReason("");
                                                      setBanModal({
                                                        open: true,
                                                        type: "perma",
                                                      });
                                                    }}
                                                  >
                                                    Kalıcı Banla
                                                  </button>
                                                  <button
                                                    className="profile-more-item danger"
                                                    onClick={() => {
                                                      setAdminUidMenuOpen(
                                                        false,
                                                      );
                                                      setBanReason("");
                                                      setBanModal({
                                                        open: true,
                                                        type: "temp",
                                                      });
                                                    }}
                                                  >
                                                    Geçici Banla
                                                  </button>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        )}
                                      </div>

                                      <div
                                        className="admin-target-card__banner"
                                        style={{
                                          backgroundImage: safeUrl(
                                            targetUser.bannerUrl ||
                                              targetUser.banner,
                                          )
                                            ? `url(${safeUrl(targetUser.bannerUrl || targetUser.banner)})`
                                            : undefined,
                                        }}
                                      >
                                        {!targetUser.bannerUrl &&
                                          !targetUser.banner && (
                                            <div className="admin-target-card__banner-fallback" />
                                          )}
                                      </div>

                                      <div className="admin-target-card__heroRow">
                                        <div className="admin-target-card__avatarWrap">
                                          <img
                                            className="admin-target-card__avatar"
                                            src={safeImageSrc(
                                              targetUser.profilePic ||
                                                targetUser.photoURL,
                                              "https://i.hizliresim.com/ntdyvrh.jpg",
                                            )}
                                            alt="pp"
                                            draggable={false}
                                          />
                                          <StatusDot className="status-badge-popup admin-target-status" status={resolveAdminStatus(targetUser)} size="md" />
                                        </div>

                                        <div className="admin-target-card__heroTexts">
                                          <div className="admin-target-card__title">
                                            {targetUser.displayName || "-"}{" "}
                                            <span className="muted">{`(${targetUser.username || "-"})`}</span>
                                          </div>

                                          <div className="admin-target-card__uidRow">
                                            UID:{" "}
                                            <span
                                              className="mono admin-username-copy"
                                              onMouseEnter={() =>
                                                setUidCopyTip({
                                                  text: "Kopyala",
                                                  ok: false,
                                                  show: true,
                                                })
                                              }
                                              onMouseLeave={() =>
                                                setUidCopyTip((p: any) => ({
                                                  ...p,
                                                  show: false,
                                                }))
                                              }
                                              onClick={async () => {
                                                const val = `${targetUser.uid || ""}`;
                                                if (!val) return;
                                                try {
                                                  await navigator.clipboard.writeText(
                                                    val,
                                                  );
                                                  setUidCopyTip({
                                                    text: "Kopyalandı",
                                                    ok: true,
                                                    show: true,
                                                  });
                                                  setTimeout(
                                                    () =>
                                                      setUidCopyTip((p: any) => ({
                                                        ...p,
                                                        show: false,
                                                      })),
                                                    1200,
                                                  );
                                                } catch {
                                                  setUidCopyTip({
                                                    text: "Kopyalama hatası",
                                                    ok: false,
                                                    show: true,
                                                  });
                                                  setTimeout(
                                                    () =>
                                                      setUidCopyTip((p: any) => ({
                                                        ...p,
                                                        show: false,
                                                      })),
                                                    1200,
                                                  );
                                                }
                                              }}
                                            >
                                              {targetUser.uid}
                                              {uidCopyTip.show && (
                                                <span
                                                  className={`copy-tooltip ${uidCopyTip.ok ? "ok" : ""}`}
                                                >
                                                  {uidCopyTip.text}
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                          <div className="admin-target-card__badges">
                                            {renderBadgesForUser(targetUser)}
                                          </div>
                                        </div>
                                      </div>
                                      <div
                                        className="admin-target-card__section-title"
                                        style={{ marginLeft: "1rem" }}
                                      >
                                        Hakkında
                                      </div>
                                      <div
                                        className="profile-about"
                                        style={{
                                          marginLeft: "1rem",
                                          marginBottom: "1rem",
                                        }}
                                      >
                                        {targetUser.bio?.trim()?.length
                                          ? targetUser.bio
                                          : "-"}
                                      </div>
                                    </div>

                                    <div className="admin-target-card__meta">
                                      <div className="meta-pill">
                                        Rol{" "}
                                        {renderMetaCopyValue(
                                          targetUser.role || "user",
                                          "role",
                                        )}
                                      </div>
                                      <div className="meta-pill">
                                        Kullanıcı Adı{" "}
                                        {renderMetaCopyValue(
                                          targetUser.username || "-",
                                          "username",
                                        )}{" "}
                                        Görünen isim{" "}
                                        {renderMetaCopyValue(
                                          targetUser.displayName || "-",
                                          "displayName",
                                        )}
                                      </div>
                                      <div className="meta-pill">
                                        E-posta{" "}
                                        {renderMetaCopyValue(
                                          targetUser.email || "-",
                                          "email",
                                        )}
                                      </div>
                                      <div className="meta-pill">
                                        Telefon{" "}
                                        {renderMetaCopyValue(
                                          targetUser.phone || "-",
                                          "phone",
                                        )}
                                      </div>
                                      <div className="meta-pill">
                                        Kayıt tarihi{" "}
                                        {renderMetaCopyValue(
                                          formatDate(targetUser.createdAt),
                                          "createdAt",
                                        )}
                                      </div>
                                      <div className="meta-pill">
                                        Son giriş{" "}
                                        {renderMetaCopyValue(
                                          formatDate(
                                            targetUser.lastActive ||
                                              targetUser.lastLoginAt,
                                          ),
                                          "lastActive",
                                        )}{" "}
                                        Son görülme{" "}
                                        {renderMetaCopyValue(
                                          getUserLastSeenText(targetUser),
                                          "lastSeen",
                                        )}
                                      </div>
                                      <div className="meta-pill">
                                        Durum{" "}
                                        {renderMetaCopyValue(
                                          resolveAdminStatus(targetUser),
                                          "presence",
                                        )}
                                      </div>
                                      <div className="meta-pill">
                                        Özel durum{" "}
                                        {renderMetaCopyValue(
                                          targetUser.customStatus || "-",
                                          "customStatus",
                                        )}
                                      </div>
                                      {targetUser?.ban?.type ===
                                        "temporary" && (
                                        <div className="meta-pill">
                                          Ban Durumu{" "}
                                          {renderMetaCopyValue(
                                            "Geçici ban",
                                            "banType",
                                          )}{" "}
                                          {renderMetaCopyValue(
                                            formatMsDateTime(
                                              targetUser.ban.expiresAtMs,
                                            ),
                                            "banExpires",
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {Object.keys(badgeDefs).length > 0 && (
                                      <>
                                        <div className="admin-target-card__section-title">
                                          Rozetler
                                        </div>
                                        <div className="admin-badges-grid">
                                          {Object.values(badgeDefs as Record<string, any>).map((b: any) => {
                                            const active =
                                              isBadgeActiveForTarget(b.id);

                                            const PERSONNEL_BADGE_ID =
                                              "personel";
                                            const isPersonnel =
                                              b.id === PERSONNEL_BADGE_ID;

                                            const canToggle =
                                              (!isPersonnel || isOwner) &&
                                              badgeDefs?.[b.id]?.active !==
                                                false;

                                            const infoText =
                                              `Tür: ${b.type || "-"}\n` +
                                              `Yetki: ${b.permissionKey || "-"}\n` +
                                              `ID: ${b.id}` +
                                              (!canToggle
                                                ? ` (Bu rozet sadece owner tarafından verilir/kaldırılır)`
                                                : "");

                                            return (
                                              <div
                                                key={b.id}
                                                className={`admin-badge-card ${active ? "is-active" : "is-passive"} ${!canToggle ? "is-locked" : ""}`}
                                                title={
                                                  !canToggle
                                                    ? " (Bu rozet sadece owner tarafından verilir/kaldırılır)"
                                                    : undefined
                                                }
                                              >
                                                <div className="admin-badge-card__left">
                                                  <img
                                                    className="admin-badge-card__icon"
                                                    src={safeImageSrc(
                                                      b.iconUrl,
                                                    )}
                                                    alt={b.name}
                                                    draggable={false}
                                                  />

                                                  <div className="admin-badge-card__texts">
                                                    <div className="admin-badge-card__name">
                                                      {b.name}
                                                    </div>
                                                    <div className="admin-badge-card__type">
                                                      {b.type
                                                        ? b.type
                                                        : "no-type"}
                                                    </div>
                                                  </div>

                                                  <span className="badge-info-wrap">
                                                    <span className="badge-info-icon">
                                                      ?
                                                    </span>
                                                    <span className="badge-info-tooltip">
                                                      {infoText}
                                                    </span>
                                                  </span>
                                                </div>

                                                <div className="admin-badge-card__right">
                                                  <label className="switch">
                                                    <input
                                                      type="checkbox"
                                                      checked={active}
                                                      disabled={!canToggle}
                                                      onChange={() =>
                                                        toggleBadgeForTarget(
                                                          b.id,
                                                        )
                                                      }
                                                    />
                                                    <span className="slider"></span>
                                                  </label>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </>
                                    )}
                                  </motion.div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  )}

                  {settingsTab === "profile" && (
                    <div className="settings-section">
                      <h2 className="settings-title">
                        <span style={{ color: "var(--text-gray)" }}>
                          Ayarlar &gt;
                        </span>{" "}
                        Profilim
                      </h2>
                      <div className="settings-note">
                        Profilini dilediğin gibi özelleştir!
                      </div>

                      <div className="profile-settings-card">
                        <div
                          className="profile-settings-banner"
                          style={{
                            backgroundImage: safeUrl(effectiveBanner)
                              ? `url(${safeUrl(effectiveBanner)})`
                              : undefined,
                          }}
                          onClick={() => openMediaPicker("banner")}
                        >
                          <div className="profile-settings-overlay">
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                            </svg>
                          </div>
                          {!effectiveBanner && (
                            <div className="profile-settings-banner-fallback" />
                          )}
                        </div>

                        <div className="profile-settings-header">
                          <div className="profile-settings-main">
                            <div
                              className="profile-settings-avatar-wrap"
                              onClick={() => openMediaPicker("avatar")}
                            >
                              <img
                                className="profile-settings-avatar"
                                src={safeImageSrc(
                                  effectiveProfilePic,
                                  "https://i.hizliresim.com/ntdyvrh.jpg",
                                )}
                                alt="Profil"
                              />
                              <div className="profile-settings-overlay">
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                >
                                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                                </svg>
                              </div>
                              <StatusDot className="status-badge-popup profile-settings-status" status={effectiveStatus} size="md" />
                            </div>

                            <div className="profile-settings-user">
                              <div className="profile-settings-name">
                                {displayName || username || "-"}
                              </div>
                              <div className="profile-settings-username">
                                {username || "-"}
                              </div>
                              {renderActiveBadges()}
                            </div>
                          </div>
                          {developerMode && (
                            <div className="profile-settings-more">
                              <div className="profile-more">
                                <button
                                  className="profile-more-btn"
                                  onClick={() =>
                                    setProfileActionsOpen((p: boolean) => !p)
                                  }
                                >
                                  â
                                </button>
                                <AnimatePresence>
                                  {profileActionsOpen && (
                                    <motion.div
                                      className="profile-more-menu"
                                      initial={{
                                        opacity: 0,
                                        y: -6,
                                        scale: 0.98,
                                      }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{
                                        opacity: 0,
                                        y: -6,
                                        scale: 0.98,
                                      }}
                                      transition={{
                                        duration: 0.26,
                                        ease: [0.16, 1, 0.3, 1],
                                      }}
                                    >
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
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="profile-settings-list">
                          <div className="profile-settings-row">
                            <div className="profile-row-left">
                              <div className="profile-row-label">
                                Görünen Ad
                              </div>
                              <div className="profile-row-value">
                                {displayName || "-"}
                              </div>
                            </div>
                            <div className="profile-row-actions">
                              <button
                                className="profile-row-btn"
                                type="button"
                                onClick={() =>
                                  openProfileEditModal("displayName")
                                }
                              >
                                Düzenle
                              </button>
                            </div>
                          </div>

                          <div className="profile-settings-row">
                            <div className="profile-row-left">
                              <div className="profile-row-label">
                                Kullanıcı Adı
                              </div>
                              <div className="profile-row-value">
                                {username || "-"}
                              </div>
                            </div>
                            <div className="profile-row-actions">
                              <button
                                className="profile-row-btn"
                                type="button"
                                onClick={() => openProfileEditModal("username")}
                              >
                                Düzenle
                              </button>
                            </div>
                          </div>

                          <div className="profile-settings-row">
                            <div className="profile-row-left">
                              <div className="profile-row-label">E-posta</div>
                              <div className="profile-row-value">
                                {maskEmail(
                                  userDocData?.email || auth.currentUser?.email,
                                  showProfileEmail,
                                )}
                                <button
                                  className="profile-row-link"
                                  type="button"
                                  onClick={() => setShowProfileEmail((p: boolean) => !p)}
                                >
                                  {showProfileEmail ? "Gizle" : "Göster"}
                                </button>
                              </div>
                            </div>
                            <div className="profile-row-actions">
                              <button
                                className="profile-row-btn"
                                type="button"
                                onClick={() => openProfileEditModal("email")}
                              >
                                Düzenle
                              </button>
                            </div>
                          </div>
                          <div className="profile-settings-row">
                            <div className="profile-row-left">
                              <div className="profile-row-label">Hakkında</div>
                              <div className="profile-row-value">
                                {bio?.trim()?.length ? bio : "(boş)"}
                              </div>
                            </div>
                            <div className="profile-row-actions">
                              <button
                                className="profile-row-btn"
                                type="button"
                                onClick={() => openProfileEditModal("bio")}
                              >
                                Düzenle
                              </button>
                            </div>
                          </div>
                        </div>

                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          style={{ display: "none" }}
                          onChange={(e) => handleMediaFileChange("avatar", e)}
                        />
                        <input
                          ref={bannerInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          style={{ display: "none" }}
                          onChange={(e) => handleMediaFileChange("banner", e)}
                        />

                        <AnimatePresence>
                          {showProfileEditModal && profileEditField && (
                            <motion.div
                              className="profile-edit-overlay"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              <motion.div
                                className="profile-edit-card"
                                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                                transition={{
                                  duration: 0.2,
                                  ease: [0.16, 1, 0.3, 1],
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {profileEditField === "email" &&
                                  profileEditStep === "confirmEmail" && (
                                    <>
                                      <div
                                        className="profile-edit-title"
                                        style={{ margin: "auto" }}
                                      >
                                        E-Posta Değişikliği
                                      </div>
                                      <div className="profile-edit-text">
                                        E-posta değiştirmek için önce mevcut
                                        e-postanı onaylamalısın.
                                      </div>
                                      <img
                                        src="/pengi-security2.png"
                                        alt="Güvenlik"
                                        className="profile-edit-security"
                                        draggable={false}
                                      />
                                      {profileEditError && (
                                        <div className="profile-edit-error">
                                          {profileEditError}
                                        </div>
                                      )}
                                      <div className="profile-edit-actions confirm-btn-group">
                                        <button
                                          className="confirm-btn cancel"
                                          type="button"
                                          onClick={closeProfileEditModal}
                                        >
                                          Vazgeçtim
                                        </button>
                                        <button
                                          className="confirm-btn primary has-inline-loader"
                                          type="button"
                                          disabled={profileEditLoading}
                                          onClick={handleConfirmEmailChange}
                                        >
                                          Onaylayalım{" "}
                                          <span className="arrow"> âžœ</span>
                                        </button>
                                      </div>
                                    </>
                                  )}

                                {profileEditField === "email" &&
                                  profileEditStep === "verifyCode" && (
                                    <>
                                      <div
                                        className="profile-edit-title"
                                        style={{ margin: "auto" }}
                                      >
                                        Doğrulama Kodu
                                      </div>
                                      <div className="profile-edit-text">
                                        E-postana gelen kodu gir
                                      </div>
                                      <div
                                        className={`profile-edit-group ${profileEditErrorField === "code" ? "error-shake" : ""}`}
                                      >
                                        <div className="label-row">
                                          <label>Doğrulama Kodu</label>
                                          {profileEditErrorField === "code" && (
                                            <span className="err-txt">
                                              {profileEditError}
                                            </span>
                                          )}
                                        </div>
                                        <input
                                          className="piksel-input2 profile-inline-input profile-code-input"
                                          value={profileEditCodeInput}
                                          onChange={(e) => (
                                            setProfileEditCodeInput(
                                              e.target.value,
                                            ),
                                            setProfileEditInfo("")
                                          )}
                                          placeholder="Doğrulama kodu"
                                        />
                                      </div>
                                      {profileEditInfo && (
                                        <div className="profile-edit-info">
                                          {profileEditInfo}
                                        </div>
                                      )}
                                      <div className="profile-edit-actions confirm-btn-group">
                                        <button
                                          className="confirm-btn cancel"
                                          type="button"
                                          onClick={closeProfileEditModal}
                                        >
                                          Vazgeçtim
                                        </button>
                                        <button
                                          className="confirm-btn primary has-inline-loader"
                                          type="button"
                                          disabled={profileEditLoading}
                                          onClick={handleVerifyEmailCode}
                                        >
                                          Devam
                                        </button>
                                      </div>
                                    </>
                                  )}

                                {profileEditField === "email" &&
                                  profileEditStep === "newEmail" && (
                                    <>
                                      <div className="profile-edit-title">
                                        Yeni E-posta
                                      </div>
                                      <div className="profile-edit-text">
                                        Yeni e-postanı gir ve doğrulama kodunu
                                        onayla.
                                      </div>
                                      <div
                                        className={`profile-edit-group ${profileEditErrorField === "email" ? "error-shake" : ""}`}
                                      >
                                        <div className="label-row">
                                          <label>Yeni E-posta</label>
                                          {profileEditErrorField ===
                                            "email" && (
                                            <span className="err-txt">
                                              {profileEditError}
                                            </span>
                                          )}
                                        </div>
                                        <input
                                          className="piksel-input2 profile-inline-input"
                                          value={profileEditValue}
                                          onChange={(e) =>
                                            setProfileEditValue(e.target.value)
                                          }
                                          placeholder="Yeni e-posta"
                                        />
                                      </div>
                                      {profileEditNewStage !== "send" && (
                                        <div
                                          className={`profile-edit-group ${profileEditErrorField === "code" ? "error-shake" : ""}`}
                                        >
                                          <div className="label-row">
                                            <label>Doğrulama Kodu</label>
                                            {profileEditErrorField ===
                                              "code" && (
                                              <span className="err-txt">
                                                {profileEditError}
                                              </span>
                                            )}
                                          </div>
                                          <input
                                            className="piksel-input2 profile-inline-input profile-code-input"
                                            value={profileEditNewCodeInput}
                                            onChange={(e) => (
                                              setProfileEditNewCodeInput(
                                                e.target.value,
                                              ),
                                              setProfileEditInfo("")
                                            )}
                                            placeholder="Doğrulama kodu"
                                            disabled={
                                              profileEditNewStage === "password"
                                            }
                                          />
                                        </div>
                                      )}
                                      {profileEditNewStage === "password" && (
                                        <div
                                          className={`profile-edit-group ${profileEditErrorField === "password" ? "error-shake" : ""}`}
                                        >
                                          <div className="label-row">
                                            <label>Şifre</label>
                                            {profileEditErrorField ===
                                              "password" && (
                                              <span className="err-txt">
                                                {profileEditError}
                                              </span>
                                            )}
                                          </div>
                                          <input
                                            className="piksel-input2 profile-inline-input"
                                            type="password"
                                            value={profileEditPassword}
                                            onChange={(e) =>
                                              setProfileEditPassword(
                                                e.target.value,
                                              )
                                            }
                                            placeholder="Şifre Doğrulama"
                                          />
                                        </div>
                                      )}
                                      {profileEditInfo && (
                                        <div className="profile-edit-info">
                                          {profileEditInfo}
                                        </div>
                                      )}
                                      <div className="profile-edit-actions confirm-btn-group">
                                        <button
                                          className="confirm-btn cancel"
                                          type="button"
                                          onClick={closeProfileEditModal}
                                        >
                                          Vazgeçtim
                                        </button>
                                        {profileEditNewStage === "send" && (
                                          <button
                                            className="confirm-btn primary has-inline-loader"
                                            type="button"
                                            disabled={profileEditLoading}
                                            onClick={handleSendNewEmailCode}
                                          >
                                            E-Postayı Doğrula
                                          </button>
                                        )}
                                        {profileEditNewStage === "verify" && (
                                          <button
                                            className="confirm-btn primary has-inline-loader"
                                            type="button"
                                            disabled={profileEditLoading}
                                            onClick={handleVerifyNewEmailCode}
                                          >
                                            Doğrula
                                          </button>
                                        )}
                                        {profileEditNewStage === "password" && (
                                          <button
                                            className="confirm-btn danger has-inline-loader"
                                            type="button"
                                            disabled={profileEditLoading}
                                            onClick={handleSaveEmail}
                                          >{profileEditLoading ? bounceLoaderCompact : "Onayla"}</button>
                                        )}
                                      </div>
                                    </>
                                  )}

                                {profileEditField === "displayName" && (
                                  <>
                                    <div
                                      className="profile-edit-title"
                                      style={{ margin: "auto" }}
                                    >
                                      Görünen Adı Düzenle
                                    </div>
                                    <div
                                      className={`profile-edit-group ${profileEditErrorField === "displayName" ? "error-shake" : ""}`}
                                    >
                                      <div className="label-row">
                                        {profileEditErrorField ===
                                          "displayName" && (
                                          <span className="err-txt">
                                            {profileEditError}
                                          </span>
                                        )}
                                      </div>
                                      <input
                                        className="piksel-input2 profile-inline-input"
                                        value={profileEditValue}
                                        onChange={(e) =>
                                          setProfileEditValue(e.target.value)
                                        }
                                        placeholder="Görünen Ad"
                                      />
                                    </div>
                                    <div className="profile-edit-actions confirm-btn-group">
                                      <button
                                        className="confirm-btn cancel"
                                        type="button"
                                        onClick={closeProfileEditModal}
                                      >
                                        Vazgeçtim
                                      </button>
                                      <button
                                        className="confirm-btn primary has-inline-loader"
                                        type="button"
                                        disabled={profileEditLoading}
                                        onClick={handleSaveDisplayName}
                                      >{profileEditLoading ? bounceLoaderCompact : "Kaydet"}</button>
                                    </div>
                                  </>
                                )}
                                {profileEditField === "bio" && (
                                  <>
                                    <div
                                      className="profile-edit-title"
                                      style={{ margin: "auto" }}
                                    >
                                      Hakkında Düzenle
                                    </div>
                                    <div
                                      className={`profile-edit-group ${profileEditErrorField === "bio" ? "error-shake" : ""}`}
                                    >
                                      <div className="label-row">
                                        {profileEditErrorField === "bio" && (
                                          <span className="err-txt">
                                            {profileEditError}
                                          </span>
                                        )}
                                      </div>
                                      <textarea
                                        className="piksel-input2 profile-inline-input profile-bio-input"
                                        value={profileEditValue}
                                        onChange={(e) =>
                                          setProfileEditValue(e.target.value)
                                        }
                                        placeholder="Kim olduğunu bilmiyoruz ama iyi biri olduğunu düşünüyoruz..."
                                        maxLength={240}
                                      />
                                    </div>
                                    <div className="profile-edit-actions confirm-btn-group">
                                      <button
                                        className="confirm-btn cancel"
                                        type="button"
                                        onClick={closeProfileEditModal}
                                      >
                                        Vazgeçtim
                                      </button>
                                      <button
                                        className="confirm-btn primary has-inline-loader"
                                        type="button"
                                        disabled={profileEditLoading}
                                        onClick={handleSaveBio}
                                      >{profileEditLoading ? bounceLoaderCompact : "Kaydet"}</button>
                                    </div>
                                  </>
                                )}

                                {profileEditField === "username" && (
                                  <>
                                    <div
                                      className="profile-edit-title"
                                      style={{ margin: "auto" }}
                                    >
                                      Kullanıcı Adı Düzenle
                                    </div>
                                    <div
                                      className={`profile-edit-group ${profileEditErrorField === "username" ? "error-shake" : ""}`}
                                    >
                                      <div className="label-row">
                                        <label>Kullanıcı Adı</label>
                                        {profileEditErrorField ===
                                          "username" && (
                                          <span className="err-txt">
                                            {profileEditError}
                                          </span>
                                        )}
                                        {profileEditErrorField !== "username" &&
                                          profileEditValue.trim().length > 0 &&
                                          profileEditValue
                                            .trim()
                                            .toLowerCase() !==
                                            (username || "")
                                              .trim()
                                              .toLowerCase() &&
                                          profileUsernameStatus ===
                                            "checking" && (
                                            <span
                                              style={{
                                                color: "#9aa0a6",
                                                fontWeight: 600,
                                                fontSize: "11px",
                                              }}
                                            >
                                              Kontrol ediliyor
                                            </span>
                                          )}
                                        {profileEditErrorField !== "username" &&
                                          profileEditValue.trim().length > 0 &&
                                          profileEditValue
                                            .trim()
                                            .toLowerCase() !==
                                            (username || "")
                                              .trim()
                                              .toLowerCase() &&
                                          profileUsernameStatus ===
                                            "available" && (
                                            <span
                                              style={{
                                                color: "#2ecc71",
                                                fontWeight: 700,
                                                fontSize: "11px",
                                              }}
                                            >
                                              Bu kullanıcı adı güzel görünüyor!
                                            </span>
                                          )}
                                        {profileEditErrorField !== "username" &&
                                          profileEditValue.trim().length > 0 &&
                                          profileEditValue
                                            .trim()
                                            .toLowerCase() !==
                                            (username || "")
                                              .trim()
                                              .toLowerCase() &&
                                          profileUsernameStatus === "taken" && (
                                            <span className="err-txt">
                                              Bu kullanıcı adı kullanılıyor
                                            </span>
                                          )}
                                      </div>
                                      <input
                                        className="piksel-input2 profile-inline-input"
                                        value={profileEditValue}
                                        onChange={(e) =>
                                          setProfileEditValue(
                                            sanitizeUsernameInput(
                                              e.target.value,
                                            ),
                                          )
                                        }
                                        placeholder="Kullanıcı Adı"
                                        maxLength={16}
                                      />
                                    </div>
                                    <div
                                      className={`profile-edit-group ${profileEditErrorField === "password" ? "error-shake" : ""}`}
                                    >
                                      <div className="label-row">
                                        <label>Şifre</label>
                                        {profileEditErrorField ===
                                          "password" && (
                                          <span className="err-txt">
                                            {profileEditError}
                                          </span>
                                        )}
                                      </div>
                                      <input
                                        className="piksel-input2 profile-inline-input"
                                        type="password"
                                        value={profileEditPassword}
                                        onChange={(e) =>
                                          setProfileEditPassword(e.target.value)
                                        }
                                        placeholder="Şifreni doğrula"
                                      />
                                    </div>
                                    <div
                                      className="profile-row-hint"
                                      style={{ margin: "auto" }}
                                    >
                                      Şifre doğrulaması gerekli
                                    </div>
                                    <div className="profile-edit-actions confirm-btn-group">
                                      <button
                                        className="confirm-btn cancel"
                                        type="button"
                                        onClick={closeProfileEditModal}
                                      >
                                        Vazgeçtim
                                      </button>
                                      <button
                                        className="confirm-btn primary has-inline-loader"
                                        type="button"
                                        disabled={profileEditLoading}
                                        onClick={handleSaveUsername}
                                      >{profileEditLoading ? bounceLoaderCompact : "Kaydet"}</button>
                                    </div>
                                  </>
                                )}
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                  {settingsTab === "appearance" && (
                    <div className="settings-section">
                      <h2 className="settings-title">
                        <span style={{ color: "var(--text-gray)" }}>
                          Ayarlar &gt;
                        </span>{" "}
                        Görünüm
                      </h2>
                      <div className="settings-note">
                        Renkler yoksa eğlence olur mu?
                      </div>

                      <div className="appearance-block">
                        <br /> <br />
                        <div className="appearance-title">Tema</div>
                        <div className="theme-grid">
                          {themes.map((t: any) => (
                            <button
                              key={t.id}
                              className={`theme-item ${draftThemeId === t.id ? "active" : ""}`}
                              onClick={() => handleSelectTheme(t.id)}
                            >
                              <div className="theme-circle">
                                {(t.swatches || [])
                                  .slice(0, 4)
                                  .map((c: string, i: number) => (
                                    <span
                                      key={i}
                                      className="theme-swatch"
                                      style={{ backgroundColor: c }}
                                    />
                                  ))}
                              </div>
                              <div className="theme-name">{t.name}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {settingsTab === "notifications" && (
                    <div className="settings-section">
                      <h2 className="settings-title">
                        <span style={{ color: "var(--text-gray)" }}>
                          Ayarlar &gt;
                        </span>{" "}
                        Bildirimler
                      </h2>
                      <div className="settings-note">
                        Masaüstü uygulaması bildirimlerini buradan yönetebilirsin.
                      </div>
                      <br />
                      <div className="advanced-card">
                        <div className="advanced-row">
                          <div className="advanced-text">
                            <div className="advanced-title">Masaüstü Bildirimleri</div>
                            <div className="advanced-desc">
                              DM ve grup mesajları, gelen arkadaşlık isteği ve isteğin
                              reddedildiğinde bildirim alırsın.
                            </div>
                          </div>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={!!desktopNotificationsEnabled}
                              onChange={toggleDesktopNotifications}
                            />
                            <span className="slider"></span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                  {settingsTab === "advanced" && (
                    <div className="settings-section">
                      <h2 className="settings-title">
                        <span style={{ color: "var(--text-gray)" }}>
                          Ayarlar &gt;
                        </span>{" "}
                        Gelişmiş
                      </h2>
                      <div className="settings-note">
                        Geliştirici araçları ve gelişmiş seçenekler burada.
                      </div>
                      <br />
                        <div className="advanced-card">
                        <div className="advanced-row">
                          <div className="advanced-text">
                            <div className="advanced-title">
                              Geliştirici modu
                            </div>
                            <div className="advanced-desc">
                              Geliştirici Modu, Piksel üzerinde ileri seviye
                              etkileşimleri açar ve teknik kullanıcılar için ek
                              seçenekleri görünür hale getirir.
                            </div>
                          </div>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={developerMode}
                              onChange={handleToggleDeveloperMode}
                            />
                            <span className="slider"></span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <AnimatePresence>
                {(settingsDirty || mediaDirty || saveLoading) && (
                  <motion.div
                    className={`settings-unsaved-bar ${unsavedFlash ? "unsaved-nudge" : ""}`}
                    initial={{ opacity: 0, y: 22, scale: 0.98 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      x: unsavedFlash ? [0, -6, 6, -4, 4, 0] : 0,
                    }}
                    exit={{ opacity: 0, y: [0, -2, 22], scale: 0.985 }}
                    transition={{
                      duration: 0.32,
                      ease: [0.16, 1, 0.3, 1],
                      x: { duration: 0.32, ease: "easeInOut" },
                    }}
                  >
                    <div className="settings-unsaved-text">
                      {mediaDirty && settingsDirty
                        ? "Görünüm ve profil görsellerinde kaydedilmemiş değişiklikler var."
                        : mediaDirty
                          ? "Profil görsellerinde kaydedilmemiş değişiklikler var."
                          : "Dikkat! Değişiklikleri kaydetmeyi unutmayın!"}
                    </div>

                    <div className="settings-unsaved-actions">
                      <button
                        className="settings-unsaved-cancel"
                        onClick={handleCancelAllChanges}
                        disabled={
                          mediaUploadState === "uploading" ||
                          isApplyingSettings ||
                          isSavingAllChanges
                        }
                      >
                        İptal
                      </button>
                      <button
                        className="settings-unsaved-save"
                        onClick={handleSaveAllChanges}
                        disabled={saveLoading}
                      >
                        <span
                          className={`settings-save-label ${saveLoading ? "is-hidden" : ""}`}
                        >
                          Değişiklikleri Kaydet
                        </span>
                        {saveLoading ? (
                          <span className="settings-save-loader-wrap">
                            {bounceLoader}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {mediaCropOpen && mediaCropType && (
          <motion.div
            className="media-crop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="media-crop-card"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="media-crop-header">
                <div className="media-crop-title">
	                  {mediaCropType === "avatar"
	                    ? "Profil Fotoğrafını Kırp"
	                    : mediaCropType === "group"
	                      ? "Grup Görselini Kırp"
	                      : "Arkaplanı Kırp"}
                </div>
                <button className="media-crop-close" onClick={handleCancelCrop}>
                  ×
                </button>
              </div>
              <div className="media-crop-body">
                <div
                  className={`media-crop-area ${mediaCropType}`}
                  style={{
                    width: mediaCropBox.w,
                    height: mediaCropBox.h,
                  }}
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                >
                  {mediaCropSrc && (
                    <img
                      src={mediaCropSrc}
                      className="media-crop-image"
                      ref={cropImageRef}
                      style={{
                        width:
                          (mediaCropImage?.width || 0) *
                          mediaCropBaseScale *
                          mediaCropZoom,
                        height:
                          (mediaCropImage?.height || 0) *
                          mediaCropBaseScale *
                          mediaCropZoom,
                        transform: `translate3d(${mediaCropOffset.x}px, ${mediaCropOffset.y}px, 0)`,
                      }}
                      draggable={false}
                    />
                  )}
                </div>
                <div className="media-crop-controls">
                  <label className="media-crop-label">
                    Yakınlaştır
                    <input
                      className="media-crop-slider"
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={mediaCropZoom}
                      onChange={(e) =>
                        handleCropZoomChange(Number(e.target.value))
                      }
                    />
                  </label>
                  <div className="media-crop-hint">
                    Görseli sürükleyerek konumlandırabilirsin!
                  </div>
                  {mediaCropError && (
                    <div className="media-crop-error">{mediaCropError}</div>
                  )}
                </div>
              </div>
              <div className="media-crop-actions">
                <button
                  className="confirm-btn cancel"
                  type="button"
                  onClick={handleCancelCrop}
                >
                  Vazgeçtim
                </button>
                <button
                  className="confirm-btn primary has-inline-loader"
                  type="button"
                  onClick={handleApplyCrop}
                >
                  Uygula
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default memo(SettingsPanel);




















