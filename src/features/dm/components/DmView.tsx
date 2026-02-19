import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import StatusDot from "../../../shared/components/StatusDot";

type DmViewProps = {
  activeDmUser: any;
  dmLoading: boolean;
  dmLoadingMore: boolean;
  dmMessages: any[];
  dmMessagesViewportRef: RefObject<HTMLDivElement | null>;
  handleDmMessagesScroll: () => void;
  handleDmMessagesWheel: (deltaY: number) => void;
  safeImageSrc: (value?: string, fallback?: string) => string;
  getDmUserStatus: (u: any) => string;
  openUserProfile: (u: any) => void;
  authCurrentUserUid?: string;
  username: string;
  displayName: string;
  effectiveProfilePic: string;
  userStatus: string;
  presence: string;
  lastActive: any;
  editingDmMessageId: string | null;
  editingDmText: string;
  setEditingDmText: (v: string) => void;
  saveEditDmMessage: () => void;
  cancelEditDmMessage: () => void;
  retryDmMessage: (msg: any) => void;
  dmActionMenuMessageId: string | null;
  setDmActionMenuMessageId: Dispatch<SetStateAction<string | null>>;
  startEditDmMessage: (m: any) => void;
  requestDeleteDmMessage: (m: any, shiftPressed: boolean) => Promise<void>;
  copyDmMessageId: (messageId: string) => Promise<void>;
  developerMode: boolean;
  formatDmTime: (v: any) => string;
  formatDmEditedAt: (v: any) => string;
  getDmSenderForMessage: (m: any) => {
    name: string;
    username: string;
    avatar: string;
  };
  getDmSenderUserForMessage: (m: any) => any;
  getDmUserByUid: (uid: string) => any;
  dmComposer: string;
  onDmComposerChange: (value: string) => void;
  onDmComposerBlur: () => void;
  sendDmMessage: (textOverride?: string) => void | Promise<void>;
  isBlockedByMe: boolean;
  unblockActiveDmUser: () => void | Promise<void>;
  isRemoteTyping: boolean;
  remoteTypingLabel: string;
  deleteConfirmMessage: any;
  deleteConfirmSender: any;
  deleteConfirmTime: string;
  setDeleteConfirmDmMessageId: (value: string | null) => void;
  deleteDmMessage: (msg: any) => Promise<void>;
  groupMembers: any[];
  isGroupOwner: boolean;
  onGroupTitleClick: () => void;
  onGroupAddMemberClick: () => void;
  groupMembersCollapsed: boolean;
  onToggleGroupMembersCollapsed: () => void;
  onLeaveGroupFromMembers: () => void;
  onKickGroupMember: (member: any) => void;
  isGroupSendLocked: boolean;
};

function DmView(props: DmViewProps) {
  const {
    activeDmUser,
    dmLoading,
    dmLoadingMore,
    dmMessages,
    dmMessagesViewportRef,
    handleDmMessagesScroll,
    handleDmMessagesWheel,
    safeImageSrc,
    getDmUserStatus,
    openUserProfile,
    authCurrentUserUid,
    username,
    displayName,
    effectiveProfilePic,
    userStatus,
    presence,
    lastActive,
    editingDmMessageId,
    editingDmText,
    setEditingDmText,
    saveEditDmMessage,
    cancelEditDmMessage,
    retryDmMessage,
    dmActionMenuMessageId,
    setDmActionMenuMessageId,
    startEditDmMessage,
    requestDeleteDmMessage,
    copyDmMessageId,
    developerMode,
    formatDmTime,
    formatDmEditedAt,
    getDmSenderForMessage,
    getDmSenderUserForMessage,
    getDmUserByUid,
    dmComposer,
    onDmComposerChange,
    onDmComposerBlur,
    sendDmMessage,
    isBlockedByMe,
    unblockActiveDmUser,
    isRemoteTyping,
    remoteTypingLabel,
    deleteConfirmMessage,
    deleteConfirmSender,
    deleteConfirmTime,
    setDeleteConfirmDmMessageId,
    deleteDmMessage,
    groupMembers,
    isGroupOwner,
    onGroupTitleClick,
    onGroupAddMemberClick,
    groupMembersCollapsed,
    onToggleGroupMembersCollapsed,
    onLeaveGroupFromMembers,
    onKickGroupMember,
    isGroupSendLocked,
  } = props;
  const [showTypingText, setShowTypingText] = useState(false);
  const [groupMemberMenu, setGroupMemberMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    member: any | null;
    isSelf: boolean;
  }>({ open: false, x: 0, y: 0, member: null, isSelf: false });
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerNotifyTimerRef = useRef<number | null>(null);
  const latestComposerValueRef = useRef("");
  const lastNotifiedComposerValueRef = useRef("");
  const isGroupChat = !!activeDmUser?.isGroup;

  const autoResizeTextarea = (
    el: HTMLTextAreaElement | null,
    maxRows: number,
  ) => {
    if (!el) return;
    const style = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(style.lineHeight || "20") || 20;
    const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom || "0") || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth || "0") || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth || "0") || 0;
    const maxHeight =
      lineHeight * maxRows +
      paddingTop +
      paddingBottom +
      borderTop +
      borderBottom;
    el.style.height = "auto";
    const targetHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${targetHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  };
  const flushComposerChange = (value: string) => {
    if (lastNotifiedComposerValueRef.current === value) return;
    lastNotifiedComposerValueRef.current = value;
    onDmComposerChange(value);
  };
  const scheduleComposerChange = (value: string) => {
    latestComposerValueRef.current = value;
    if (composerNotifyTimerRef.current != null) return;
    composerNotifyTimerRef.current = window.setTimeout(() => {
      composerNotifyTimerRef.current = null;
      flushComposerChange(latestComposerValueRef.current);
    }, 120);
  };
  useEffect(() => {
    let timer: number | null = null;
    if (isRemoteTyping) {
      setShowTypingText(false);
      timer = window.setTimeout(() => {
        setShowTypingText(true);
      }, 500);
    } else {
      setShowTypingText(false);
    }
    return () => {
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [isRemoteTyping]);
  useEffect(() => {
    return () => {
      if (composerNotifyTimerRef.current != null) {
        window.clearTimeout(composerNotifyTimerRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (!composerRef.current) return;
    composerRef.current.value = dmComposer || "";
    autoResizeTextarea(composerRef.current, 5);
  }, [dmComposer, activeDmUser?.uid]);

  useEffect(() => {
    autoResizeTextarea(editInputRef.current, 5);
  }, [editingDmText, editingDmMessageId]);

  useEffect(() => {
    if (!groupMemberMenu.open) return;
    const close = () =>
      setGroupMemberMenu((prev) =>
        prev.open
          ? { open: false, x: 0, y: 0, member: null, isSelf: false }
          : prev,
      );
    const onScroll = () => close();
    document.addEventListener("mousedown", close, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [groupMemberMenu.open]);

  return (
    <div
      className={`dm-chat-wrap ${isGroupChat ? "group-chat" : ""} ${isGroupChat && groupMembersCollapsed ? "members-collapsed" : ""}`}
    >
      <div className="dm-chat-header">
        <div className="dm-chat-user">
          <div className="dm-chat-avatar-wrap">
            <img
              className="dm-chat-avatar"
              src={safeImageSrc(
                activeDmUser.profilePic || activeDmUser.photoURL,
                "https://i.hizliresim.com/ntdyvrh.jpg",
              )}
            />
            {!isGroupChat && (
              <StatusDot className="dm-status dm-chat-status" status={getDmUserStatus(activeDmUser)} size="md" />
            )}
          </div>
          <button
            className="dm-chat-user-trigger"
            onClick={() => {
              if (!isGroupChat) {
                openUserProfile(activeDmUser);
                return;
              }
              if (isGroupOwner) onGroupTitleClick();
            }}
            type="button"
          >
            <div className="dm-chat-name">
              {activeDmUser.displayName || activeDmUser.username || "Kullanıcı"}
            </div>
          </button>
        </div>
        {isGroupChat && (
          <div className="dm-group-header-actions">
            <button
              type="button"
              className="dm-group-add-member-btn"
              onClick={onGroupAddMemberClick}
              disabled={!isGroupOwner}
              title={
                isGroupOwner ? "Üye Ekle" : "Sadece grup sahibi üye ekleyebilir"
              }
            >
              <span className="dm-group-members-title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M15 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm1.5 11v-1a5.5 5.5 0 0 0-11 0v1h11Zm4-8v2h-2v2h-2v-2h-2v-2h2V9h2v2h2Z" />
                </svg>
              </span>
              <span>Üye Ekle</span>
            </button>
            <button
              type="button"
              className="dm-group-members-header-toggle"
              onClick={onToggleGroupMembersCollapsed}
              title={groupMembersCollapsed ? "Üyeleri göster" : "Üyeleri gizle"}
            >
              <span className="dm-group-members-title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M7.5 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm9 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19.5c0-2.6 2.8-4.5 6-4.5s6 1.9 6 4.5V21h-12v-1.5zm13.5 1.5v-1.2c0-1.5-.7-2.8-1.9-3.7 2.6.2 4.9 1.7 4.9 3.9V21H17z" />
                </svg>
              </span>
              <span>Üyeler</span>
            </button>
          </div>
        )}
      </div>

      <div className="dm-chat-body">
        <div
          className="dm-chat-messages"
          ref={dmMessagesViewportRef}
          onScroll={handleDmMessagesScroll}
          onWheel={(e) => handleDmMessagesWheel(e.deltaY)}
        >
          {dmLoadingMore && (
            <div className="dm-loading-more">
              Daha eski mesajlar yükleniyor...
            </div>
          )}
          {dmLoading && <div className="friends-empty"></div>}
          {!dmLoading && dmMessages.length === 0 && (
            <div className="friends-empty"></div>
          )}
          {!dmLoading && activeDmUser && (
            <div className="dm-chat-start">
              <img
                className="dm-chat-start-avatar"
                src={safeImageSrc(
                  activeDmUser.profilePic || activeDmUser.photoURL,
                  "https://i.hizliresim.com/ntdyvrh.jpg",
                )}
                alt={activeDmUser.username || "Kullanıcı"}
              />
              <div className="dm-chat-start-content">
                <div className="dm-chat-start-name">
                  {activeDmUser.displayName ||
                    activeDmUser.username ||
                    "Kullanıcı"}
                </div>
                <div className="dm-chat-start-text">
                  Güzel bir sohbetin başlangıcı!
                </div>
              </div>
            </div>
          )}
          {!dmLoading &&
            dmMessages.map((m, idx) => {
              const mine = m.senderId === authCurrentUserUid;
              const isGroupSystem =
                (m?.senderId === "__system__" &&
                  (m?.messageKind === "group_join" ||
                    m?.messageKind === "group_leave")) ||
                m?.messageKind === "group_join" ||
                m?.messageKind === "group_leave";
              const isEditing =
                String(editingDmMessageId || "") === String(m.id);
              const isPending = !!m?.isPending;
              const isFailed = !!m?.isFailed;
              const isPengiSystem =
                m?.isSystemNotice ||
                m?.localFailureType === "blocked_notice" ||
                m?.senderId === "__pengi__";
              const sender = getDmSenderForMessage(m);
              const senderUser = mine
                ? {
                    uid: authCurrentUserUid,
                    username,
                    displayName: displayName || username || "Sen",
                    profilePic: effectiveProfilePic,
                    photoURL: effectiveProfilePic,
                    status: userStatus,
                    presence,
                    lastActive,
                  }
                : isPengiSystem
                  ? null
                  : isGroupChat
                    ? getDmSenderUserForMessage(m)
                    : activeDmUser;
              const prev = idx > 0 ? dmMessages[idx - 1] : null;
              const hasSenderBreak = !!prev && prev.senderId !== m.senderId;
              const hasMultiline = String(m?.text || "").includes("\n");
              const isCompact =
                !!prev && prev.senderId === m.senderId && !isEditing;
              if (isGroupSystem) {
                const isJoin = m?.messageKind === "group_join";
                const fallbackSystemText = isJoin
                  ? "Bir kullanıcı gruba katıldı."
                  : "Bir kullanıcı gruptan ayrıldı.";
                let rawSystemText = String(m?.text || "").trim();
                const looksInvalid =
                  !rawSystemText ||
                  /^\d+$/.test(rawSystemText) ||
                  /^[\W_]+$/.test(rawSystemText) ||
                  rawSystemText.length < 4;
                if (looksInvalid) rawSystemText = fallbackSystemText;
                const suffixJoin = " kullanıcısı gruba katıldı.";
                const suffixLeave = " kullanıcısı gruptan ayrıldı.";
                const suffix = isJoin ? suffixJoin : suffixLeave;
                const actorName = rawSystemText.endsWith(suffix)
                  ? rawSystemText.slice(0, rawSystemText.length - suffix.length)
                  : "";
                const actionText = rawSystemText.endsWith(suffix)
                  ? suffix
                  : rawSystemText;
                const safeActionText =
                  String(actionText || "").trim().length > 0
                    ? actionText
                    : isJoin
                      ? " gruba katıldı."
                      : " gruptan ayrıldı.";
                const displayText =
                  String(rawSystemText || "").trim().length > 0
                    ? rawSystemText
                    : fallbackSystemText;
                const actorUid = String(m?.systemActorUid || "").trim();
                const actorUser = actorUid ? getDmUserByUid(actorUid) : null;
                return (
                  <div
                    key={m.id}
                    className={`dm-message-row dm-group-system-row ${isJoin ? "join" : "leave"}`}
                  >
                    <div className="dm-group-system-content">
                      <span className="dm-group-system-icon" aria-hidden="true">
                        {isJoin ? (
                          <svg viewBox="0 0 24 24">
                            <path d="M17 16l4-4m0 0l-4-4m4 4H9m6 4v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24">
                            <path d="M7 16l-4-4m0 0 4-4m-4 4h12m-6 4v1a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v1" />
                          </svg>
                        )}
                      </span>
                      <span className="dm-group-system-main">
                        {actorName ? (
                          <>
                            <button
                              type="button"
                              className="dm-group-system-actor dm-group-system-actor-btn"
                              onClick={() => {
                                if (actorUser?.uid) openUserProfile(actorUser);
                              }}
                              disabled={!actorUser?.uid}
                            >
                              {actorName}
                            </button>
                            {safeActionText}
                          </>
                        ) : (
                          displayText ||
                          (isJoin
                            ? "Bir kullanıcı gruba katıldı."
                            : "Bir kullanıcı gruptan ayrıldı.")
                        )}
                      </span>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={m.id}
                  className={`dm-message-row ${isCompact ? "compact" : ""} ${hasMultiline ? "multiline" : ""} ${isEditing ? "editing" : ""} ${hasSenderBreak ? "sender-break" : ""} ${isPending ? "pending" : ""} ${isPengiSystem ? "pengi-system" : ""} ${dmActionMenuMessageId === String(m.id) ? "menu-open" : ""}`}
                >
                  {!isCompact && (
                    <button
                      className="dm-message-avatar-btn"
                      type="button"
                      onClick={() =>
                        senderUser?.uid && openUserProfile(senderUser)
                      }
                    >
                      <img
                        className="dm-message-avatar"
                        src={sender.avatar}
                        alt={sender.username}
                      />
                    </button>
                  )}
                  {isCompact && (
                    <span className="dm-message-inline-time">
                      {formatDmTime(m.createdAt)}
                    </span>
                  )}
                  <div className="dm-message-content">
                    {!isCompact && (
                      <div className="dm-message-author-line">
                        <button
                          type="button"
                          className="dm-message-author dm-message-author-btn"
                          onClick={() =>
                            senderUser?.uid && openUserProfile(senderUser)
                          }
                        >
                          {sender.name}
                        </button>
                        {isPengiSystem && (
                          <span
                            className="dm-system-badge"
                            data-tooltip="Doğrulanmış Bot"
                          >
                            <span>UYGULAMA</span>
                            <svg
                              className="dm-system-badge-check"
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden="true"
                            >
                              <path
                                d="M20 7L10 17L5 12"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        )}
                        <span className="dm-message-time">
                          {formatDmTime(m.createdAt)}
                        </span>
                      </div>
                    )}
                    {!isEditing &&
                      !isPending &&
                      !isPengiSystem &&
                      (mine || developerMode) && (
                        <div className="dm-message-actions">
                          <button
                            className="dm-message-more-btn"
                            onClick={() =>
                              setDmActionMenuMessageId((prevMenu) =>
                                prevMenu === String(m.id) ? null : String(m.id),
                              )
                            }
                            type="button"
                            aria-label="Mesaj menüsü"
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <circle cx="5" cy="12" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="19" cy="12" r="2" />
                            </svg>
                          </button>
                          <AnimatePresence>
                            {dmActionMenuMessageId === String(m.id) && (
                              <motion.div
                                className="dm-message-menu"
                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                transition={{
                                  duration: 0.18,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                              >
                                {isFailed ? (
                                  <button
                                    className="dm-message-menu-item danger"
                                    type="button"
                                    onClick={(e) =>
                                      requestDeleteDmMessage(m, !!e.shiftKey)
                                    }
                                  >
                                    <svg
                                      width="13"
                                      height="13"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                    </svg>
                                    <span>Mesajı Sil</span>
                                  </button>
                                ) : mine ? (
                                  <>
                                    <button
                                      className="dm-message-menu-item"
                                      type="button"
                                      onClick={() => startEditDmMessage(m)}
                                    >
                                      <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                      >
                                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                                      </svg>
                                      <span>Mesajı Düzenle</span>
                                    </button>
                                    <button
                                      className="dm-message-menu-item danger"
                                      type="button"
                                      onClick={(e) =>
                                        requestDeleteDmMessage(m, !!e.shiftKey)
                                      }
                                    >
                                      <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                      >
                                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                      </svg>
                                      <span>Mesajı Sil</span>
                                    </button>
                                    {developerMode && (
                                      <button
                                        className="dm-message-menu-item"
                                        type="button"
                                        onClick={async () => {
                                          await copyDmMessageId(String(m.id));
                                          setDmActionMenuMessageId(null);
                                        }}
                                      >
                                        <svg
                                          width="13"
                                          height="13"
                                          viewBox="0 0 24 24"
                                          fill="currentColor"
                                        >
                                          <path d="M8 8h10v12H8zM6 4h10v2H8v10H6z" />
                                        </svg>
                                        <span>Mesaj ID Kopyala</span>
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    className="dm-message-menu-item"
                                    type="button"
                                    onClick={async () => {
                                      await copyDmMessageId(String(m.id));
                                      setDmActionMenuMessageId(null);
                                    }}
                                  >
                                    <svg
                                      width="13"
                                      height="13"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M8 8h10v12H8zM6 4h10v2H8v10H6z" />
                                    </svg>
                                    <span>Mesaj ID Kopyala</span>
                                  </button>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    <div
                      className={`dm-bubble ${isPending ? "pending" : ""} ${m?.isFailed ? "failed" : ""} ${m?.isEdited ? "has-edited" : ""}`}
                    >
                      {isEditing ? (
                        <div className="dm-edit-wrap">
                          <textarea
                            ref={editInputRef}
                            className="friends-search dm-edit-input"
                            value={editingDmText}
                            onChange={(e) => setEditingDmText(e.target.value)}
                            rows={5}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEditDmMessage();
                                return;
                              }
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveEditDmMessage();
                              }
                            }}
                          />
                          <div className="dm-edit-hint">
                            Kaydetmek için Enter, iptal için Esc.
                            <button
                              type="button"
                              className="dm-edit-hint-link"
                              onClick={saveEditDmMessage}
                            >
                              Kaydet
                            </button>{" "}
                            ·
                            <button
                              type="button"
                              className="dm-edit-hint-link"
                              onClick={cancelEditDmMessage}
                            >
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="dm-bubble-text">
                          {m?.localFailureType === "blocked_notice" ? (
                            <span className="dm-message-failed-localonly">
                              <span className="dm-message-failed-pengi">
                                {m.text || "Pengi: Mesajın iletilemedi."}
                              </span>
                              <span className="dm-local-only-hint">
                                <svg
                                  className="dm-local-only-eye"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                  aria-hidden="true"
                                >
                                  <path
                                    d="M2 12C3.73 7.61 7.47 5 12 5C16.53 5 20.27 7.61 22 12C20.27 16.39 16.53 19 12 19C7.47 19 3.73 16.39 2 12Z"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                  />
                                  <circle
                                    cx="12"
                                    cy="12"
                                    r="3.2"
                                    fill="currentColor"
                                  />
                                </svg>
                                <span className="dm-local-only-hint-text">
                                  Bu mesajı sadece sen görüntüleyebilirsin,
                                </span>
                                <button
                                  type="button"
                                  className="dm-local-only-delete-link-inline"
                                  onClick={() => {
                                    void deleteDmMessage(m);
                                  }}
                                >
                                  silmek için tıkla
                                </button>
                              </span>
                            </span>
                          ) : (
                            <>
                              {m.text}
                              {m.isEdited && (
                                <span className="dm-message-edited-wrap dm-message-edited-inline">
                                  <span className="dm-message-edited">
                                    (düzenlendi)
                                  </span>
                                  <span className="dm-edited-tooltip">
                                    {formatDmEditedAt(m.editedAt)}
                                  </span>
                                </span>
                              )}
                              {isPending && (
                                <span className="dm-message-pending-tag">
                                  {" "}
                                </span>
                              )}
                              {m?.isFailed && (
                                <span className="dm-message-failed-tag">
                                  {" "}
                                  (gönderilemedi)
                                  {m?.localFailureType !== "blocked_user" &&
                                    m?.localFailureType !==
                                      "group_owner_only" && (
                                      <button
                                        type="button"
                                        className="dm-retry-btn"
                                        onClick={() => retryDmMessage(m)}
                                      >
                                        Tekrar dene
                                      </button>
                                    )}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
        {isGroupChat && (
          <aside
            className={`dm-group-members ${groupMembersCollapsed ? "collapsed" : ""}`}
          >
            {!groupMembersCollapsed && (
              <div className="dm-group-members-list">
                {groupMembers.map((m) => {
                  const customStatus = String(m?.customStatus || "").trim();
                  const isSelf =
                    String(m?.uid || "") === String(authCurrentUserUid || "");
                  return (
                    <button
                      key={m.uid}
                      className={`dm-group-member-row ${m.effectiveStatus === "offline" ? "is-offline" : ""}`}
                      type="button"
                      onClick={() => openUserProfile(m.user)}
                      onContextMenu={(e) => {
                        const canOpenMenu = isSelf || isGroupOwner;
                        if (!canOpenMenu) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setGroupMemberMenu({
                          open: true,
                          x: e.clientX,
                          y: e.clientY,
                          member: m,
                          isSelf,
                        });
                      }}
                    >
                      <div className="dm-group-member-avatar-wrap">
                        <img
                          className="dm-group-member-avatar"
                          src={safeImageSrc(
                            m?.user?.profilePic || m?.user?.photoURL,
                            "https://i.hizliresim.com/ntdyvrh.jpg",
                          )}
                          alt={m?.user?.username || "üye"}
                        />
                        <StatusDot className="dm-group-member-status" status={m.effectiveStatus} size="md" />
                      </div>
                      <div className="dm-group-member-name-wrap">
                        <div className="dm-group-member-name-row">
                          <div className="dm-group-member-name">
                            {m?.user?.displayName ||
                              m?.user?.username ||
                              "Kullanıcı"}
                          </div>
                          {m?.role === "owner" && (
                            <span
                              className="dm-group-owner-badge"
                              title="Owner"
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 7.5a1 1 0 0 1 1.7-.7L8.5 10l2.8-4.4a1 1 0 0 1 1.4-.3l.3.3L16 10l3.8-3.2a1 1 0 0 1 1.6 1l-2 9.5a1 1 0 0 1-1 .8H5.6a1 1 0 0 1-1-.8L3 7.5Z" />
                              </svg>
                            </span>
                          )}
                        </div>
                        {customStatus && (
                          <div className="dm-group-member-custom-status">
                            {customStatus}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>
        )}
      </div>
      <AnimatePresence>
        {groupMemberMenu.open && (
          <motion.div
            className="dm-group-member-menu"
            style={{ left: groupMemberMenu.x, top: groupMemberMenu.y }}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {groupMemberMenu.isSelf ? (
              <button
                className="dm-message-menu-item danger"
                type="button"
                onClick={() => {
                  setGroupMemberMenu({
                    open: false,
                    x: 0,
                    y: 0,
                    member: null,
                    isSelf: false,
                  });
                  onLeaveGroupFromMembers();
                }}
              >
                <span>Gruptan Ayrıl</span>
              </button>
            ) : isGroupOwner ? (
              <button
                className="dm-message-menu-item danger"
                type="button"
                onClick={() => {
                  const member = groupMemberMenu.member;
                  setGroupMemberMenu({
                    open: false,
                    x: 0,
                    y: 0,
                    member: null,
                    isSelf: false,
                  });
                  onKickGroupMember(member);
                }}
              >
                <span>Gruptan At</span>
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`dm-typing-slot ${isRemoteTyping ? "is-visible" : ""}`}>
        <div className="dm-typing-indicator" aria-live="polite">
          <div className="dm-typing-dots" aria-hidden="true">
            <span className="dm-typing-dot"></span>
            <span className="dm-typing-dot delay-2"></span>
            <span className="dm-typing-dot delay-3"></span>
          </div>
          <span className={`dm-typing-text ${showTypingText ? "visible" : ""}`}>
            <b>{remoteTypingLabel}</b>
          </span>
        </div>
      </div>

      <div className="dm-composer-bar">
        {isBlockedByMe ? (
          <div className="dm-composer-locked">
            <span className="dm-composer-locked-text">
              Bu kullanıcıyı engellediğin için mesaj gönderemezsin
            </span>
            <button
              type="button"
              className="dm-composer-unblock-btn"
              onClick={() => {
                void unblockActiveDmUser();
              }}
            >
              Engeli Kaldır
            </button>
          </div>
        ) : isGroupSendLocked ? (
          <div className="dm-composer-locked">
            <span className="dm-composer-locked-text">
              Bu grupta sadece grup sahibi mesaj gönderebilir
            </span>
          </div>
        ) : (
          <textarea
            ref={composerRef}
            className="friends-search dm-composer-input"
            placeholder="Mesaj yaz..."
            defaultValue={dmComposer}
            onChange={(e) => {
              const next = e.target.value;
              scheduleComposerChange(next);
              autoResizeTextarea(composerRef.current, 5);
            }}
            rows={1}
            onBlur={(e) => {
              if (composerNotifyTimerRef.current != null) {
                window.clearTimeout(composerNotifyTimerRef.current);
                composerNotifyTimerRef.current = null;
              }
              flushComposerChange(e.currentTarget.value);
              onDmComposerBlur();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const payload = e.currentTarget.value;
                if (composerNotifyTimerRef.current != null) {
                  window.clearTimeout(composerNotifyTimerRef.current);
                  composerNotifyTimerRef.current = null;
                }
                void sendDmMessage(payload);
                e.currentTarget.value = "";
                flushComposerChange("");
                autoResizeTextarea(composerRef.current, 5);
              }
            }}
          />
        )}
      </div>

      <AnimatePresence>
        {deleteConfirmMessage && (
          <motion.div
            className="modal-overlay confirm-modal-overlay dm-delete-fullscreen-overlay"
            onClick={() => setDeleteConfirmDmMessageId(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <motion.div
              className="confirm-modal-content dm-delete-confirm-modal"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <h3>Silmek istediğine emin misin?</h3>
              <div className="dm-delete-modal-preview">
                <div className="dm-delete-modal-preview-meta">
                  <img
                    className="dm-delete-modal-preview-avatar"
                    src={deleteConfirmSender?.avatar}
                    alt={deleteConfirmSender?.username || "Kullanıcı"}
                  />
                  <span className="dm-delete-modal-preview-name">
                    {deleteConfirmSender?.name || "Kullanıcı"}
                  </span>
                  <span className="dm-delete-modal-preview-time">
                    {deleteConfirmTime}
                  </span>
                </div>
                <div className="dm-delete-modal-preview-body">
                  {String(deleteConfirmMessage.text || "").trim() || "Bu mesaj"}
                </div>
              </div>
              <div className="confirm-btn-group dm-delete-modal-actions">
                <button
                  className="confirm-btn cancel"
                  type="button"
                  onClick={() => setDeleteConfirmDmMessageId(null)}
                >
                  Vazgeçtim
                </button>
                <button
                  className="confirm-btn danger"
                  type="button"
                  onClick={() => deleteDmMessage(deleteConfirmMessage)}
                >
                  Evet, sil!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const areDmViewPropsEqual = (prev: DmViewProps, next: DmViewProps) => {
  return (
    prev.activeDmUser === next.activeDmUser &&
    prev.dmLoading === next.dmLoading &&
    prev.dmLoadingMore === next.dmLoadingMore &&
    prev.dmMessages === next.dmMessages &&
    prev.authCurrentUserUid === next.authCurrentUserUid &&
    prev.username === next.username &&
    prev.displayName === next.displayName &&
    prev.effectiveProfilePic === next.effectiveProfilePic &&
    prev.userStatus === next.userStatus &&
    prev.presence === next.presence &&
    prev.lastActive === next.lastActive &&
    prev.editingDmMessageId === next.editingDmMessageId &&
    prev.editingDmText === next.editingDmText &&
    prev.dmActionMenuMessageId === next.dmActionMenuMessageId &&
    prev.dmComposer === next.dmComposer &&
    prev.isRemoteTyping === next.isRemoteTyping &&
    prev.remoteTypingLabel === next.remoteTypingLabel &&
    prev.deleteConfirmMessage === next.deleteConfirmMessage &&
    prev.deleteConfirmSender === next.deleteConfirmSender &&
    prev.deleteConfirmTime === next.deleteConfirmTime &&
    prev.isBlockedByMe === next.isBlockedByMe &&
    prev.isGroupSendLocked === next.isGroupSendLocked &&
    prev.developerMode === next.developerMode &&
    prev.groupMembers === next.groupMembers &&
    prev.isGroupOwner === next.isGroupOwner &&
    prev.groupMembersCollapsed === next.groupMembersCollapsed
  );
};

export default memo(DmView, areDmViewPropsEqual);




