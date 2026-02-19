import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db, auth, authPersistenceReady } from "./firebase";
import {
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
  orderBy,
  limit,
  increment,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  signOut,
  updateEmail,
  verifyBeforeUpdateEmail,
  reload,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";
import { sendNotification as tauriSendNotification } from "@tauri-apps/plugin-notification";
import { io, type Socket } from "socket.io-client";
import {
  createGroup as createGroupService,
  addGroupMembers as addGroupMembersService,
  deleteDm as deleteDmService,
  fetchConversationParticipants as fetchConversationParticipantsService,
  fetchDmInbox as fetchDmInboxService,
  fetchDmStatePayload as fetchDmStatePayloadService,
  kickGroupMember as kickGroupMemberService,
  leaveGroup as leaveGroupService,
  updateGroupSettings as updateGroupSettingsService,
  fetchDmMessages as fetchDmMessagesService,
  getDmThreadId as getDmThreadIdService,
  markDmRead as markDmReadService,
  openDm as openDmService,
  saveDmState as saveDmStateService,
  sendDm as sendDmService,
  updateDm as updateDmService,
} from "./features/dm/services/dm.service";
import DmView from "./features/dm/components/DmView";
import DmRail from "./features/dm/components/DmRail";
import FriendsView from "./features/friends/components/FriendsView";
import AuthView from "./features/auth/components/AuthView";
import ProfilePopup from "./features/profile/components/ProfilePopup";
import ProfileModals from "./features/profile/components/ProfileModals";
import StatusDot from "./shared/components/StatusDot";
import SettingsPanel from "./features/settings/components/SettingsPanel";
import {
  safeImageSrc as safeImageSrcUtil,
  safeUrl as safeUrlUtil,
} from "./shared/utils/url";
import {
  filterVisibleDmInboxes,
  readClosedDmIds,
  sameDmRows,
  writeClosedDmIds,
} from "./features/dm/hooks/useDm";
import { useDmRailLoading } from "./features/dm/hooks/useDmRailLoading";
import {
  acceptFriendRequestTx,
  blockUserTx,
  cancelFriendRequestTx,
  rejectFriendRequestTx,
  removeFriendTx,
  sendFriendRequestTx,
  unblockUserTx,
} from "./features/friends/services/friends.service";
import {
  fetchPresenceBatch as fetchPresenceBatchService,
  pingUserPresence as pingUserPresenceService,
  setUserPresence as setUserPresenceService,
  setUserStatus as setUserStatusService,
} from "./features/presence/services/presence.service";
import {
  decryptE2eeTextForUser,
  ensureAndRegisterE2eeIdentity,
  encryptE2eeTextForRecipients,
  fetchConversationE2eeKeys,
} from "./features/dm/services/e2ee.service";
const appWindow = getCurrentWindow();
import "./App.css";

type SelectOption = { value: string; label: string; icon?: ReactNode };

function CustomSelect({
  value,
  onChange,
  options,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  options: SelectOption[];
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) || options[0];
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div
      className={`custom-dropdown-container ${className} ${disabled ? "is-disabled" : ""}`}
      ref={wrapperRef}
    >
      <div
        className={`custom-dropdown-header ${open ? "open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setOpen((p) => !p);
        }}
      >
        {current?.icon ? (
          <span className="custom-select-icon" aria-hidden="true">
            {current.icon}
          </span>
        ) : null}
        <span>{current?.label}</span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className="custom-dropdown-list"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            {options.map((opt) => (
              <div
                key={opt.value}
                className={`dropdown-option ${opt.value === value ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.icon ? (
                  <span className="custom-select-icon" aria-hidden="true">
                    {opt.icon}
                  </span>
                ) : null}
                <span>{opt.label}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [banState, setBanState] = useState<null | {
    type: "permanent" | "temporary";
    reason: string;
    expiresAtMs?: number;
  }>(null);
  const [unsavedNudge, setUnsavedNudge] = useState(0);
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
  const [showFullStatus, setShowFullStatus] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [authStateReady, setAuthStateReady] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMediaReady, setAuthMediaReady] = useState(false);
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [showProfileEmail, setShowProfileEmail] = useState(false);
  const [profileEditValue, setProfileEditValue] = useState("");
  const [profileEditPassword, setProfileEditPassword] = useState("");
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [profileEditField, setProfileEditField] = useState<
    null | "displayName" | "username" | "email" | "bio"
  >(null);
  const [profileEditStep, setProfileEditStep] = useState<
    "input" | "confirmEmail" | "verifyCode" | "newEmail"
  >("input");
  const [profileEditCode, setProfileEditCode] = useState("");
  const [profileEditCodeInput, setProfileEditCodeInput] = useState("");
  const [profileEditNewCode, setProfileEditNewCode] = useState("");
  const [profileEditNewCodeInput, setProfileEditNewCodeInput] = useState("");
  const [profileEditNewStage, setProfileEditNewStage] = useState<
    "send" | "verify" | "password"
  >("send");
  const [profileEditError, setProfileEditError] = useState("");
  const [profileEditErrorField, setProfileEditErrorField] = useState<
    "" | "code" | "email" | "password" | "username" | "displayName" | "bio"
  >("");
  const profileErrorTimerRef = useRef<number | null>(null);
  const [profileEditInfo, setProfileEditInfo] = useState("");
  const [profileEditLoading, setProfileEditLoading] = useState(false);
  const [developerMode, setDeveloperMode] = useState(false);
  const [regUsernameStatus, setRegUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [profileUsernameStatus, setProfileUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const regUsernameCheckRef = useRef(0);
  const profileUsernameCheckRef = useRef(0);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [dbImage, setDbImage] = useState("");
  const [timer, setTimer] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [showFirstWelcome, setShowFirstWelcome] = useState(false);
  const [profilePic, setProfilePic] = useState(
    "https://i.hizliresim.com/ntdyvrh.jpg",
  );
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
  const [pendingBanner, setPendingBanner] = useState<string | null>(null);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [mediaUploadState, setMediaUploadState] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [mediaCropOpen, setMediaCropOpen] = useState(false);
  const [mediaCropType, setMediaCropType] = useState<
    "avatar" | "banner" | "group" | null
  >(null);
  const [mediaCropSrc, setMediaCropSrc] = useState("");
  const [mediaCropError, setMediaCropError] = useState("");
  const [mediaCropZoom, setMediaCropZoom] = useState(1);
  const [mediaCropOffset, setMediaCropOffset] = useState({ x: 0, y: 0 });
  const [mediaCropBaseScale, setMediaCropBaseScale] = useState(1);
  const [mediaCropBox, setMediaCropBox] = useState({ w: 320, h: 320 });
  const [mediaCropImage, setMediaCropImage] = useState<HTMLImageElement | null>(
    null,
  );
  const cropRafRef = useRef<number | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);
  const mediaCropOffsetRef = useRef({ x: 0, y: 0 });
  const lastPresenceRef = useRef<string | null>(null);
  const windowIdRef = useRef<string | null>(null);
  const windowClosedRef = useRef(false);
  const [errorField, setErrorField] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [shakeField, setShakeField] = useState("");
  const [errorPopup, setErrorPopup] = useState({ show: false, msg: "" });
  const [userStatus, setUserStatus] = useState("online");
  const [presence, setPresence] = useState("offline");
  const effectiveStatus = presence === "offline" ? "offline" : userStatus;
  const effectiveProfilePic = pendingAvatar || profilePic;
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [customStatus, setCustomStatus] = useState("");
  const [tempStatus, setTempStatus] = useState(userStatus);
  const [tempCustom, setTempCustom] = useState("");
  const [profileActionsOpen, setProfileActionsOpen] = useState(false);
  const [adminUidMenuOpen, setAdminUidMenuOpen] = useState(false);
  const [banModal, setBanModal] = useState<{
    open: boolean;
    type: "perma" | "temp" | null;
  }>({ open: false, type: null });
  const [banReason, setBanReason] = useState("");
  const [tempBanSeconds, setTempBanSeconds] = useState(100);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSettingsPage, setShowSettingsPageState] = useState(false);
  const allowSettingsCloseRef = useRef(false);

  const setShowSettingsPage = (next: boolean) => {
    if (!next && !allowSettingsCloseRef.current) return;
    setShowSettingsPageState(next);
  };
  const requestCloseSettings = () => {
    if (shouldBlockSettingsClose) {
      triggerUnsavedNudge();
      return;
    }
    allowSettingsCloseRef.current = true;
    setShowSettingsPageState(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    });
    window.setTimeout(() => {
      allowSettingsCloseRef.current = false;
    }, 0);
  };
  const [settingsTab, setSettingsTab] = useState<
    | "profile"
    | "appearance"
    | "notifications"
    | "admin"
    | "logout"
    | "changelog"
    | "advanced"
  >("admin");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const settingsInitRef = useRef(false);
  const [isApplyingSettings, setIsApplyingSettings] = useState(false);
  const [isSavingAllChanges, setIsSavingAllChanges] = useState(false);
  const [themes, setThemes] = useState<ThemeDoc[]>([]);
  const [savedThemeId, setSavedThemeId] = useState("default");
  const [draftThemeId, setDraftThemeId] = useState("default");
  const [holdLoader, setHoldLoader] = useState(true);
  const loaderHideTimerRef = useRef<number | null>(null);
  const postLoginUiInitRef = useRef(false);
  const [adminUidInput, setAdminUidInput] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [targetBadgeToggleBusy, setTargetBadgeToggleBusy] = useState(false);
  const [unsavedFlash, setUnsavedFlash] = useState(false);
  const unsavedFlashTimerRef = useRef<number | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileTab, setProfileTab] = useState<"about" | "info">("about");
  const [friendsTab, setFriendsTab] = useState<
    "active" | "friends" | "pending" | "blocked"
  >("pending");
  const [dmSection, setDmSection] = useState<
    "friends" | "store" | "subscription"
  >("friends");
  const [dmInboxes, setDmInboxes] = useState<any[]>([]);
  const [conversationParticipants, setConversationParticipants] = useState<
    Record<string, any[]>
  >({});
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupMemberUids, setGroupMemberUids] = useState<string[]>([]);
  const [groupCreateLoading, setGroupCreateLoading] = useState(false);
  const [groupCreateError, setGroupCreateError] = useState("");
  const [groupNameRequiredError, setGroupNameRequiredError] = useState(false);
  const groupNameRequiredTimerRef = useRef<number | null>(null);
  const [showAddGroupMembersModal, setShowAddGroupMembersModal] =
    useState(false);
  const [groupAddMemberUids, setGroupAddMemberUids] = useState<string[]>([]);
  const [groupAddMembersLoading, setGroupAddMembersLoading] = useState(false);
  const [groupAddMembersError, setGroupAddMembersError] = useState("");
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [groupSettingsNameInput, setGroupSettingsNameInput] = useState("");
  const [groupSettingsAvatarInput, setGroupSettingsAvatarInput] = useState("");
  const [pendingGroupAvatar, setPendingGroupAvatar] = useState<string | null>(
    null,
  );
  const [groupSettingsSendPolicy, setGroupSettingsSendPolicy] = useState<
    "all_members" | "owner_only" | "selected_members"
  >("all_members");
  const [groupSettingsSaving, setGroupSettingsSaving] = useState(false);
  const [groupSettingsError, setGroupSettingsError] = useState("");
  const [groupMembersCollapsed, setGroupMembersCollapsed] = useState(false);
  const GROUP_MEMBER_SELECT_LIMIT = 11;
  const GROUP_MAX_PARTICIPANTS = 12;
  const [dmInboxReady, setDmInboxReady] = useState(false);
  const [dmUsersReady, setDmUsersReady] = useState(false);
  const [closedDmIds, setClosedDmIds] = useState<Record<string, number>>({});
  const [dmUsers, setDmUsers] = useState<Record<string, any>>({});
  const { showLoadingSkeleton: showDmRailSkeleton } = useDmRailLoading({
    isLoggedIn,
    dmInboxReady,
    dmUsersReady,
    holdMs: 500,
  });
  const [activeDmId, setActiveDmId] = useState<string | null>(null);
  const [activeDmUser, setActiveDmUser] = useState<any | null>(null);
  const [dmMessages, setDmMessages] = useState<any[]>([]);
  const [dmComposer, setDmComposer] = useState("");
  const [remoteTypingUids, setRemoteTypingUids] = useState<string[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmLoadingMore, setDmLoadingMore] = useState(false);
  const [dmHasMore, setDmHasMore] = useState(true);
  const [dmBeforeCursor, setDmBeforeCursor] = useState<string | null>(null);
  const [editingDmMessageId, setEditingDmMessageId] = useState<string | null>(
    null,
  );
  const [editingDmText, setEditingDmText] = useState("");
  const [dmActionMenuMessageId, setDmActionMenuMessageId] = useState<
    string | null
  >(null);
  const [deleteConfirmDmMessageId, setDeleteConfirmDmMessageId] = useState<
    string | null
  >(null);
  const [friendSearch, setFriendSearch] = useState("");
  const [blockedSearch, setBlockedSearch] = useState("");
  const [pendingInput, setPendingInput] = useState("");
  const [pendingError, setPendingError] = useState("");
  const [pendingErrorShake, setPendingErrorShake] = useState(false);
  const pendingErrorTimerRef = useRef<number | null>(null);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [showChangelogForm, setShowChangelogForm] = useState(false);
  const [changelogData, setChangelogData] = useState<any>(null);
  const [autoChangelogQueued, setAutoChangelogQueued] = useState(false);
  const [clErrors, setClErrors] = useState<{
    image?: string;
    new?: string;
    temp?: string;
    removed?: string;
  }>({});
  const [clShake, setClShake] = useState<{
    image?: boolean;
    new?: boolean;
    temp?: boolean;
    removed?: boolean;
  }>({});
  const [showUserOps, setShowUserOps] = useState(false);
  const userOpsRef = useRef<HTMLDivElement | null>(null);
  const autoChangelogHandledRef = useRef<string | null>(null);
  const [clImageUrl, setClImageUrl] = useState("");
  const [clNewFeatures, setClNewFeatures] = useState("");
  const [clTempDisabled, setClTempDisabled] = useState("");
  const [clRemoved, setClRemoved] = useState("");
  const [isPublishingChangelog, setIsPublishingChangelog] = useState(false);
  const [showAdminList, setShowAdminList] = useState(false);
  const [showChangelogTools, setShowChangelogTools] = useState(false);
  const [showBadgeTools, setShowBadgeTools] = useState(false);
  const [showAuthImageTools, setShowAuthImageTools] = useState(false);
  const [authImageInput, setAuthImageInput] = useState("");
  const [authImageError, setAuthImageError] = useState("");
  const [authImageShake, setAuthImageShake] = useState(false);
  const [authImageSuccess, setAuthImageSuccess] = useState(false);
  const [badgeName, setBadgeName] = useState("");
  const [badgeType, setBadgeType] = useState<"info" | "permission">("info");
  const [badgePermissionKey, setBadgePermissionKey] = useState<
    "admin" | "user"
  >("user");
  const [badgeIconUrl, setBadgeIconUrl] = useState("");
  const [badgeErrField, setBadgeErrField] = useState<
    "" | "name" | "icon" | "permission"
  >("");
  const [badgeErrMsg, setBadgeErrMsg] = useState("");
  const [badgeShake, setBadgeShake] = useState<
    "" | "name" | "icon" | "permission"
  >("");
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);
  const [editBadgeName, setEditBadgeName] = useState("");
  const [editBadgeType, setEditBadgeType] = useState<"info" | "permission">(
    "info",
  );
  const [editBadgePermissionKey, setEditBadgePermissionKey] = useState<
    "admin" | "user"
  >("user");
  const [editBadgeIconUrl, setEditBadgeIconUrl] = useState("");
  const [showBadgeEditModal, setShowBadgeEditModal] = useState(false);
  const [editBadgeErrField, setEditBadgeErrField] = useState<
    "" | "name" | "icon" | "permission"
  >("");
  const [editBadgeErrMsg, setEditBadgeErrMsg] = useState("");
  const [editBadgeShake, setEditBadgeShake] = useState<
    "" | "name" | "icon" | "permission"
  >("");
  const [uidCopyTip, setUidCopyTip] = useState<{
    text: string;
    ok: boolean;
    show: boolean;
  }>({ text: "", ok: false, show: false });

  const [bio, setBio] = useState("");
  const [createdAt, setCreatedAt] = useState<any>(null);
  const [lastActive, setLastActive] = useState<any>(null);
  const [presenceByUid, setPresenceByUid] = useState<
    Record<
      string,
      {
        status: "online" | "idle" | "dnd" | "offline";
        presence: "online" | "offline";
        customStatus: string;
        lastActive: any;
        updatedAt?: any;
      }
    >
  >({});
  const presenceUpdateMsRef = useRef<Record<string, number>>({});
  const [isViewingOwnProfile, setIsViewingOwnProfile] = useState(true);
  const [adminProfileModal, setAdminProfileModal] = useState<{
    open: boolean;
    user: any | null;
  }>({
    open: false,
    user: null,
  });

  const [isFriendVisual, setIsFriendVisual] = useState(false);
  const [friendsMeta, setFriendsMeta] = useState<{
    incoming: string[];
    outgoing: string[];
    blocked: string[];
    friends: string[];
  }>({ incoming: [], outgoing: [], blocked: [], friends: [] });
  const [friendsMetaReady, setFriendsMetaReady] = useState(false);
  const [friendsMap, setFriendsMap] = useState<Record<string, boolean>>({});
  const [friendUsers, setFriendUsers] = useState<Record<string, any>>({});
  const [incomingUsers, setIncomingUsers] = useState<Record<string, any>>({});
  const [outgoingUsers, setOutgoingUsers] = useState<Record<string, any>>({});
  const [blockedUsers, setBlockedUsers] = useState<Record<string, any>>({});
  const [outgoingRequests, setOutgoingRequests] = useState<
    Record<string, { status: string; updatedAt?: any }>
  >({});
  const [incomingRequests, setIncomingRequests] = useState<
    Record<string, { status: string; updatedAt?: any }>
  >({});
  const outgoingSeenRef = useRef<Record<string, string>>({});
  const incomingSeenRef = useRef<Record<string, string>>({});
  const incomingWatchReadyRef = useRef(false);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] =
    useState(true);
  const targetStatusLockRef = useRef<Record<string, string>>({});
  const targetBadgeToggleBusyRef = useRef(false);
  const [copyTip, setCopyTip] = useState<{
    text: string;
    ok: boolean;
    show: boolean;
    key: string | null;
  }>({
    text: "",
    ok: false,
    show: false,
    key: null,
  });
  const [userDocData, setUserDocData] = useState<any>(null);
  const effectiveBanner =
    pendingBanner || userDocData?.bannerUrl || userDocData?.banner;
  const [admins, setAdmins] = useState<any[]>([]);
  const [adminCopyTip, setAdminCopyTip] = useState<{
    uid: string | null;
    text: string;
  }>({
    uid: null,
    text: "Kopyala",
  });
  const [activeBadgeIds, setActiveBadgeIds] = useState<string[]>([]);
  const [adminErrField, setAdminErrField] = useState<"" | "uid">("");
  const [adminErrMsg, setAdminErrMsg] = useState("");
  const [adminShake, setAdminShake] = useState<"" | "uid">("");
  type UserBadge = { id: string; active: boolean };
  type BadgeDef = {
    id: string;
    name: string;
    iconUrl: string;
    type?: string;
    permissionKey?: string | null;
    active?: boolean;
  };
  const [badgeDefs, setBadgeDefs] = useState<Record<string, BadgeDef>>({});
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmText?: string;
    hideCancel?: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    show: false,
    title: "",
    message: "",
    confirmText: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  type ThemeDoc = {
    id: string;
    name: string;
    swatches?: string[];
    vars?: Record<string, string>;
  };

  const topInputRef = useRef<HTMLInputElement>(null);
  const profilePopupRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const dmMessagesViewportRef = useRef<HTMLDivElement | null>(null);
  const dmStickToBottomRef = useRef(true);
  const dmPrependAdjustRef = useRef<{ height: number; top: number } | null>(
    null,
  );
  const dmRestoreTargetRef = useRef<string | null>(null);
  const dmLastSavedStateRef = useRef<string | null>(null);
  const closedDmIdsRef = useRef<Record<string, number>>({});
  const closedDmIdsHydratedRef = useRef(false);
  const dmSendQueueRef = useRef<
    Array<{
      localId: string;
      clientNonce: string;
      conversationId: string;
      senderId: string;
      text: string;
      retryCount: number;
    }>
  >([]);
  const dmSendWorkerRunningRef = useRef(false);
  const dmLocalMessageCounterRef = useRef(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const remoteTypingExpireTimersRef = useRef<Record<string, number>>({});
  const localTypingStateRef = useRef<{
    conversationId: string | null;
    active: boolean;
    lastStartAt: number;
  }>({
    conversationId: null,
    active: false,
    lastStartAt: 0,
  });
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const cropDragRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const userData = userDocData;
  type Role = "user" | "admin" | "owner";
  const OWNER_UID = "qgaLJq7g5Hes7obQGmd2h6N1L3H3";
  const isOwner =
    auth.currentUser?.uid === OWNER_UID || userDocData?.role === "owner";
  const isAdmin = isOwner || userDocData?.role === "admin";
  const PERSONEL_BADGE_ID = "personel";
  const FRIENDS_LIMIT = 200;
  const BACKEND_URL = String(
    import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:3001",
  ).replace(/\/+$/, "");
  const getDesktopNotifyStorageKey = (uid: string) =>
    `piksel:desktop-notify:${String(uid || "").trim()}`;
  const triggerDesktopNotification = useCallback(
    (title: string, body: string, opts?: { icon?: string }) => {
      if (!desktopNotificationsEnabled) return;
      try {
        void tauriSendNotification({
          title: String(title || "Piksel"),
          body: String(body || "").trim(),
          icon: opts?.icon ? String(opts.icon) : undefined,
        });
      } catch {
        if (typeof Notification === "undefined") return;
        try {
          new Notification(String(title || "Piksel"), {
            body: String(body || "").trim(),
            silent: false,
            icon: opts?.icon ? String(opts.icon) : undefined,
          });
        } catch {}
      }
    },
    [desktopNotificationsEnabled],
  );
  const chatSocketRef = useRef<Socket | null>(null);
  const activeDmIdRef = useRef<string | null>(null);
  const dmInboxesRef = useRef<any[]>([]);
  const dmUsersRef = useRef<Record<string, any>>({});
  const friendUsersRef = useRef<Record<string, any>>({});
  const FRIENDS_META_DEFAULT = {
    incoming: [],
    outgoing: [],
    blocked: [],
    friends: [],
  } as const;
  const applyPresenceState = useCallback((raw: any) => {
    const uid = String(raw?.uid || "");
    if (!uid) return;
    const statusRaw = String(raw?.status || "online").toLowerCase();
    const status =
      statusRaw === "idle" || statusRaw === "dnd" || statusRaw === "offline"
        ? statusRaw
        : "online";
    const presenceValue =
      String(raw?.presence || "").toLowerCase() === "online"
        ? "online"
        : "offline";
    const customStatusValue = String(raw?.customStatus || "");
    const lastActiveValue = raw?.lastActive || null;
    const updatedAtValue = raw?.updatedAt || null;
    const hasCurrent = Object.prototype.hasOwnProperty.call(
      presenceUpdateMsRef.current,
      uid,
    );
    if (!updatedAtValue && hasCurrent) {
      return;
    }
    const parsedUpdatedMs = updatedAtValue
      ? new Date(String(updatedAtValue)).getTime()
      : Number.NEGATIVE_INFINITY;
    const nextUpdatedMs = Number.isFinite(parsedUpdatedMs)
      ? parsedUpdatedMs
      : Number.NEGATIVE_INFINITY;
    const currentUpdatedMs =
      presenceUpdateMsRef.current[uid] ?? Number.NEGATIVE_INFINITY;
    if (nextUpdatedMs < currentUpdatedMs) {
      return;
    }
    presenceUpdateMsRef.current[uid] = nextUpdatedMs;

    setPresenceByUid((prev) => ({
      ...prev,
      [uid]: {
        status,
        presence: presenceValue,
        customStatus: customStatusValue,
        lastActive: lastActiveValue,
        updatedAt: updatedAtValue,
      },
    }));
    const patchPresenceInMap = (
      setter: (
        updater: (prev: Record<string, any>) => Record<string, any>,
      ) => void,
    ) => {
      setter((prev) => {
        const current = prev?.[uid];
        if (!current) return prev;
        const next = {
          ...prev,
          [uid]: {
            ...current,
            status,
            presence: presenceValue,
            customStatus: customStatusValue,
            lastActive: lastActiveValue,
          },
        };
        return next;
      });
    };
    patchPresenceInMap(setFriendUsers);
    patchPresenceInMap(setIncomingUsers);
    patchPresenceInMap(setOutgoingUsers);
    patchPresenceInMap(setBlockedUsers);
    patchPresenceInMap(setDmUsers);
    setAdminProfileModal((prev) => {
      if (!prev.open || prev.user?.uid !== uid) return prev;
      return {
        ...prev,
        user: {
          ...(prev.user || {}),
          status,
          presence: presenceValue,
          customStatus: customStatusValue,
          lastActive: lastActiveValue,
        },
      };
    });
    setActiveDmUser((prev: any) => {
      if (!prev || prev.uid !== uid) return prev;
      return {
        ...prev,
        status,
        presence: presenceValue,
        customStatus: customStatusValue,
        lastActive: lastActiveValue,
      };
    });
    setTargetUser((prev: any) => {
      if (!prev || String(prev.uid || "") !== uid) return prev;
      return {
        ...prev,
        status,
        presence: presenceValue,
        customStatus: customStatusValue,
        lastActive: lastActiveValue,
      };
    });
    if (auth.currentUser?.uid === uid) {
      setUserStatus(status);
      setPresence(presenceValue);
      setCustomStatus(customStatusValue);
      setLastActive(lastActiveValue);
    }
  }, []);

  const getFirestoreWriteErrorMessage = (
    err: any,
    fallback: string,
  ): string => {
    const code = String(err?.code || "");
    const message = String(err?.message || "");
    if (
      code.includes("resource-exhausted") ||
      message.includes("Quota exceeded")
    ) {
      return "Firestore kotasi dolu. Bu İşlem su an kaydedilemiyor.";
    }
    if (code.includes("permission-denied")) {
      return "Bu İşlem güvenlik kurallari nedeniyle engellendi.";
    }
    return fallback;
  };

  const sanitizePlainText = (value: string, maxLen = 2000) => {
    if (!value) return "";
    return value
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[<>]/g, "")
      .slice(0, maxLen);
  };

  const sanitizeSingleLine = (value: string, maxLen = 120) =>
    sanitizePlainText(value, maxLen)
      .replace(/[\r\n]+/g, " ")
      .trim();

  const isE2eeConversation = useCallback(
    (conversationId: string | null | undefined) => {
      if (!conversationId) return false;
      const row = dmInboxes.find(
        (x) => String(x?.id || "") === String(conversationId),
      );
      const mode = String(row?.encryptionMode || "").trim();
      if (!mode) return true;
      return mode === "e2ee_private";
    },
    [dmInboxes],
  );

  const decryptDmMessageForUid = useCallback(async (msg: any, uid: string) => {
    if (!msg || !uid) return msg;
    if (!msg?.isEncrypted || !msg?.encryptedPayload) return msg;
    if (String(msg?.messageKind || "user") !== "user") return msg;
    try {
      const plainText = await decryptE2eeTextForUser(uid, msg.encryptedPayload);
      return { ...msg, text: plainText };
    } catch {
      return { ...msg, text: "[Sifre cozulmedi]", isDecryptFailed: true };
    }
  }, []);

  const decryptDmRowsForUid = useCallback(
    async (rows: any[], uid: string) => {
      if (!uid || !Array.isArray(rows) || rows.length === 0) return rows || [];
      return await Promise.all(
        rows.map((row) => decryptDmMessageForUid(row, uid)),
      );
    },
    [decryptDmMessageForUid],
  );

  const getE2eeRecipientPublicKeys = useCallback(
    async (conversationId: string, uid: string) => {
      const rows = await fetchConversationE2eeKeys(
        conversationId,
        uid,
        BACKEND_URL,
      );
      const participantUids = rows
        .map((row) => String(row?.uid || "").trim())
        .filter(Boolean);
      const missingUids = rows
        .filter((row) => !!row?.uid && !row?.publicKeyJwk)
        .map((row) => String(row.uid));
      if (participantUids.length === 0) {
        throw new Error("E2EE_PARTICIPANTS_EMPTY");
      }
      if (missingUids.length > 0) {
        throw new Error(
          `E2EE_PARTICIPANT_KEY_MISSING:${missingUids.join(",")}`,
        );
      }
      return rows.map((row) => ({
        uid: String(row.uid),
        publicKeyJwk: row.publicKeyJwk as JsonWebKey,
      }));
    },
    [],
  );

  const hasUnsavedChanges = settingsDirty || mediaDirty;
  const shouldBlockSettingsClose =
    settingsDirty || mediaDirty || showProfileEditModal;

  useEffect(() => {
    if (settingsTab !== "admin") {
      setAdminUidInput("");
      setTargetUser(null);
    }
  }, [settingsTab]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser?.uid) {
      setDesktopNotificationsEnabled(true);
      return;
    }
    const key = getDesktopNotifyStorageKey(auth.currentUser.uid);
    const raw = localStorage.getItem(key);
    if (raw == null) {
      setDesktopNotificationsEnabled(true);
      return;
    }
    setDesktopNotificationsEnabled(raw === "1");
  }, [isLoggedIn, auth.currentUser?.uid]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser?.uid) return;
    const key = getDesktopNotifyStorageKey(auth.currentUser.uid);
    localStorage.setItem(key, desktopNotificationsEnabled ? "1" : "0");
  }, [isLoggedIn, auth.currentUser?.uid, desktopNotificationsEnabled]);

  useEffect(() => {
    if (isLogin) {
      setRegUsernameStatus("idle");
      return;
    }
    const raw = username.trim();
    if (!raw) {
      setRegUsernameStatus("idle");
      return;
    }
    if (!isUsernameValid(raw)) {
      setRegUsernameStatus("invalid");
      return;
    }
    setRegUsernameStatus("checking");
    const currentCheck = ++regUsernameCheckRef.current;
    const t = window.setTimeout(async () => {
      const candidate = normalizeUsername(raw);
      try {
        const snap = await getDoc(doc(db, "usernames", candidate));
        if (regUsernameCheckRef.current !== currentCheck) return;
        if (!snap.exists()) {
          setRegUsernameStatus("available");
          return;
        }
        setRegUsernameStatus("taken");
      } catch {
        if (regUsernameCheckRef.current !== currentCheck) return;
        setRegUsernameStatus("invalid");
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [username, isLogin]);

  useEffect(() => {
    if (!showProfileEditModal || profileEditField !== "username") {
      setProfileUsernameStatus("idle");
      return;
    }
    const raw = profileEditValue.trim();
    if (!raw) {
      setProfileUsernameStatus("idle");
      return;
    }
    if (!isUsernameValid(raw)) {
      setProfileUsernameStatus("invalid");
      return;
    }
    const currentUsername = normalizeUsername(username || "");
    const candidate = normalizeUsername(raw);
    if (candidate === currentUsername) {
      setProfileUsernameStatus("idle");
      return;
    }
    setProfileUsernameStatus("checking");
    const currentCheck = ++profileUsernameCheckRef.current;
    const t = window.setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, "usernames", candidate));
        if (profileUsernameCheckRef.current !== currentCheck) return;
        if (!snap.exists()) {
          setProfileUsernameStatus("available");
          return;
        }
        const data = snap.data() as any;
        const hasOther = data?.uid && data.uid !== auth.currentUser?.uid;
        setProfileUsernameStatus(hasOther ? "taken" : "available");
      } catch {
        if (profileUsernameCheckRef.current !== currentCheck) return;
        setProfileUsernameStatus("invalid");
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [profileEditValue, profileEditField, showProfileEditModal, username]);

  useEffect(() => {
    if (!isAdmin) {
      setAdmins([]);
      return;
    }

    const qRoleAdmins = query(
      collection(db, "users"),
      where("role", "==", "admin"),
    );
    const qOwners = query(
      collection(db, "users"),
      where("role", "==", "owner"),
    );
    const qStaff = query(collection(db, "users"), where("staff", "==", true));

    const mergeUsers = (rows: any[]) => {
      setAdmins((prev) => {
        const map = new Map<string, any>();
        [...prev, ...rows].forEach((u) => {
          const uid = String(u?.uid || "");
          if (!uid) return;
          map.set(uid, u);
        });
        return Array.from(map.values());
      });
    };

    const unsub1 = onSnapshot(qRoleAdmins, (snap) => {
      mergeUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    const unsub2 = onSnapshot(qOwners, (snap) => {
      mergeUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    const unsub3 = onSnapshot(qStaff, (snap) => {
      mergeUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    if (userStatus === "offline") return;
    setPresence("online");
    lastPresenceRef.current = "online";
    void setUserPresenceService(auth.currentUser.uid, "online", BACKEND_URL)
      .then((state) => applyPresenceState(state))
      .catch(() => {});
  }, [isLoggedIn, userStatus, applyPresenceState]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    if (userStatus === "offline") return;

    const uid = auth.currentUser.uid;
    let disposed = false;

    const heartbeat = () => {
      if (disposed) return;
      void pingUserPresenceService(uid, BACKEND_URL)
        .then((state) => applyPresenceState(state))
        .catch(() => {});
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 20000);

    const onFocus = () => heartbeat();
    const onVisibility = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isLoggedIn, userStatus, applyPresenceState]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) {
      setFriendsMetaReady(false);
      setFriendsMap({});
      setFriendsMeta({
        incoming: [],
        outgoing: [],
        blocked: [],
        friends: [],
      });
      setOutgoingRequests({});
      setIncomingRequests({});
      outgoingSeenRef.current = {};
      incomingSeenRef.current = {};
      incomingWatchReadyRef.current = false;
      return;
    }

    const uid = auth.currentUser.uid;
    const metaRef = getFriendsMetaRef(uid);
    setFriendsMetaReady(false);

    const unsubMeta = onSnapshot(
      metaRef,
      (snap) => {
        if (!snap.exists()) {
          setDoc(metaRef, FRIENDS_META_DEFAULT, { merge: true }).catch(
            () => {},
          );
          setFriendsMeta({
            incoming: [],
            outgoing: [],
            blocked: [],
            friends: [],
          });
          setFriendsMap({});
          setOutgoingRequests({});
          setIncomingRequests({});
          incomingSeenRef.current = {};
          setFriendsMetaReady(true);
          return;
        }
        const data = snap.data() as any;
        const incoming = normalizeUidArray(data?.incoming);
        const outgoing = normalizeUidArray(data?.outgoing);
        const blocked = normalizeUidArray(data?.blocked);
        const friends = normalizeUidArray(data?.friends);

        setFriendsMeta({ incoming, outgoing, blocked, friends });

        const next: Record<string, boolean> = {};
        friends.forEach((fid: string) => {
          next[fid] = true;
        });
        setFriendsMap(next);

        const outMap: Record<string, { status: string; updatedAt?: any }> = {};
        outgoing.forEach((fid: string) => {
          outMap[fid] = { status: "pending" };
        });
        const inMap: Record<string, { status: string; updatedAt?: any }> = {};
        incoming.forEach((fid: string) => {
          inMap[fid] = { status: "pending" };
        });
        setOutgoingRequests(outMap);
        setIncomingRequests(inMap);
        setFriendsMetaReady(true);
      },
      () => {
        setFriendsMeta({
          incoming: [],
          outgoing: [],
          blocked: [],
          friends: [],
        });
        setFriendsMap({});
        setOutgoingRequests({});
        setIncomingRequests({});
        incomingSeenRef.current = {};
        setFriendsMetaReady(true);
      },
    );

    return () => {
      unsubMeta();
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    const friends = friendsMeta.friends || [];
    const incoming = friendsMeta.incoming || [];
    const outgoing = friendsMeta.outgoing || [];
    const blocked = friendsMeta.blocked || [];
    const watchUsers = (
      uids: string[],
      setter: (value: Record<string, any>) => void,
    ) => {
      const uniq = Array.from(new Set((uids || []).filter(Boolean)));
      if (uniq.length === 0) {
        setter({});
        return () => {};
      }
      const cache: Record<string, any> = {};
      const unsubs = uniq.map((uid) =>
        onSnapshot(
          doc(db, "users", uid),
          (snap) => {
            if (snap.exists()) {
              cache[uid] = { id: snap.id, ...(snap.data() as any) };
            } else {
              delete cache[uid];
            }
            setter({ ...cache });
          },
          () => {
            delete cache[uid];
            setter({ ...cache });
          },
        ),
      );
      return () => {
        unsubs.forEach((unsub) => {
          try {
            unsub();
          } catch {}
        });
      };
    };

    const stopFriends = watchUsers(friends, setFriendUsers);
    const stopIncoming = watchUsers(incoming, setIncomingUsers);
    const stopOutgoing = watchUsers(outgoing, setOutgoingUsers);
    const stopBlocked = watchUsers(blocked, setBlockedUsers);

    return () => {
      stopFriends();
      stopIncoming();
      stopOutgoing();
      stopBlocked();
    };
  }, [isLoggedIn, friendsMeta]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const uids = new Set<string>();
    uids.add(myUid);
    Object.keys(friendUsers || {}).forEach((uid) => uid && uids.add(uid));
    Object.keys(incomingUsers || {}).forEach((uid) => uid && uids.add(uid));
    Object.keys(outgoingUsers || {}).forEach((uid) => uid && uids.add(uid));
    Object.keys(blockedUsers || {}).forEach((uid) => uid && uids.add(uid));
    Object.keys(dmUsers || {}).forEach((uid) => uid && uids.add(uid));
    dmInboxes.forEach((row) => {
      const uid = String(row?.otherUid || "");
      if (uid) uids.add(uid);
      const conversationId = String(row?.id || "");
      const members = conversationParticipants[conversationId] || [];
      members.forEach((p) => {
        const memberUid = String(p?.uid || "");
        if (memberUid) uids.add(memberUid);
      });
    });
    const adminModalUid = String(adminProfileModal.user?.uid || "");
    if (adminModalUid) uids.add(adminModalUid);
    const targetUserUid = String(targetUser?.uid || "");
    if (targetUserUid) uids.add(targetUserUid);
    const activeUid = String(activeDmUser?.uid || "");
    if (activeUid) uids.add(activeUid);
    const list = Array.from(uids);
    if (list.length === 0) return;

    let disposed = false;
    let inFlight = false;
    const runPresenceSync = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const rows = await fetchPresenceBatchService(list, BACKEND_URL);
        if (disposed) return;
        rows.forEach((row) => applyPresenceState(row));
      } catch {
      } finally {
        inFlight = false;
      }
    };

    const t = window.setTimeout(() => {
      void runPresenceSync();
    }, 120);
    const interval = window.setInterval(() => {
      void runPresenceSync();
    }, 1000);

    return () => {
      disposed = true;
      window.clearTimeout(t);
      window.clearInterval(interval);
    };
  }, [
    isLoggedIn,
    friendUsers,
    incomingUsers,
    outgoingUsers,
    blockedUsers,
    dmUsers,
    dmInboxes,
    conversationParticipants,
    activeDmUser,
    adminProfileModal.user?.uid,
    targetUser?.uid,
    applyPresenceState,
  ]);

  useEffect(() => {
    const currentOutgoing = outgoingRequests;
    Object.keys(currentOutgoing).forEach((uid) => {
      if (!outgoingSeenRef.current[uid]) {
        outgoingSeenRef.current[uid] = "pending";
      }
    });
    Object.keys(outgoingSeenRef.current).forEach((uid) => {
      const stillPending = currentOutgoing[uid]?.status === "pending";
      if (!stillPending && friendsMap[uid]) {
        const u = outgoingUsers?.[uid] || friendUsers?.[uid];
        const name = String(
          u?.displayName || u?.username || uid || "Bir kullanıcı",
        );
        triggerDesktopNotification("Piksel", `${name} isteğini kabul etti.`, {
          icon: safeImageSrcUtil(
            u?.profilePic || u?.photoURL,
            "https://i.hizliresim.com/ntdyvrh.jpg",
          ),
        });
      } else if (!stillPending && !friendsMap[uid]) {
        const u = outgoingUsers?.[uid] || friendUsers?.[uid];
        const name = String(
          u?.displayName || u?.username || uid || "Bir kullanıcı",
        );
        triggerDesktopNotification("Piksel", `${name} isteğini reddetti.`, {
          icon: safeImageSrcUtil(
            u?.profilePic || u?.photoURL,
            "https://i.hizliresim.com/ntdyvrh.jpg",
          ),
        });
      }
      if (!stillPending) {
        delete outgoingSeenRef.current[uid];
      }
    });
  }, [
    outgoingRequests,
    friendsMap,
    outgoingUsers,
    friendUsers,
    triggerDesktopNotification,
  ]);

  useEffect(() => {
    const currentIncoming = incomingRequests;
    if (!incomingWatchReadyRef.current) {
      const seed: Record<string, string> = {};
      Object.keys(currentIncoming).forEach((uid) => {
        if (currentIncoming[uid]?.status === "pending") {
          seed[uid] = "seen";
        }
      });
      incomingSeenRef.current = seed;
      incomingWatchReadyRef.current = true;
      return;
    }
    Object.keys(currentIncoming).forEach((uid) => {
      const status = currentIncoming[uid]?.status;
      if (status !== "pending") return;
      if (incomingSeenRef.current[uid] === "seen") return;
      const u = incomingUsers?.[uid] || friendUsers?.[uid];
      const name = String(
        u?.displayName || u?.username || uid || "Bir kullanıcı",
      );
      triggerDesktopNotification(
        "Piksel",
        `${name} sana arkadaşlık isteği gönderdi.`,
        {
          icon: safeImageSrcUtil(
            u?.profilePic || u?.photoURL,
            "https://i.hizliresim.com/ntdyvrh.jpg",
          ),
        },
      );
      incomingSeenRef.current[uid] = "seen";
    });
    Object.keys(incomingSeenRef.current).forEach((uid) => {
      const stillPending = currentIncoming[uid]?.status === "pending";
      if (!stillPending) delete incomingSeenRef.current[uid];
    });
  }, [
    incomingRequests,
    incomingUsers,
    friendUsers,
    triggerDesktopNotification,
  ]);

  useEffect(() => {
    closedDmIdsRef.current = closedDmIds;
  }, [closedDmIds]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    let disposed = false;
    void fetchPresenceBatchService([auth.currentUser.uid], BACKEND_URL)
      .then((rows) => {
        if (disposed) return;
        rows.forEach((row) => applyPresenceState(row));
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [isLoggedIn, applyPresenceState]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) {
      setFriendsMetaReady(false);
      setFriendsMap({});
      setFriendsMeta({
        incoming: [],
        outgoing: [],
        blocked: [],
        friends: [],
      });
      setOutgoingRequests({});
      setIncomingRequests({});
      outgoingSeenRef.current = {};
      incomingSeenRef.current = {};
      return;
    }

    const uid = auth.currentUser.uid;
    const metaRef = getFriendsMetaRef(uid);
    setFriendsMetaReady(false);

    const unsubMeta = onSnapshot(
      metaRef,
      (snap) => {
        if (!snap.exists()) {
          setDoc(metaRef, FRIENDS_META_DEFAULT, { merge: true }).catch(
            () => {},
          );
          setFriendsMeta({
            incoming: [],
            outgoing: [],
            blocked: [],
            friends: [],
          });
          setFriendsMap({});
          setOutgoingRequests({});
          setIncomingRequests({});
          incomingSeenRef.current = {};
          incomingWatchReadyRef.current = false;
          setFriendsMetaReady(true);
          return;
        }
        const data = snap.data() as any;
        const incoming = normalizeUidArray(data?.incoming);
        const outgoing = normalizeUidArray(data?.outgoing);
        const blocked = normalizeUidArray(data?.blocked);
        const friends = normalizeUidArray(data?.friends);

        setFriendsMeta({ incoming, outgoing, blocked, friends });

        const next: Record<string, boolean> = {};
        friends.forEach((fid: string) => {
          next[fid] = true;
        });
        setFriendsMap(next);

        const outMap: Record<string, { status: string; updatedAt?: any }> = {};
        outgoing.forEach((fid: string) => {
          outMap[fid] = { status: "pending" };
        });
        const inMap: Record<string, { status: string; updatedAt?: any }> = {};
        incoming.forEach((fid: string) => {
          inMap[fid] = { status: "pending" };
        });
        setOutgoingRequests(outMap);
        setIncomingRequests(inMap);
        setFriendsMetaReady(true);
      },
      () => {
        setFriendsMeta({
          incoming: [],
          outgoing: [],
          blocked: [],
          friends: [],
        });
        setFriendsMap({});
        setOutgoingRequests({});
        setIncomingRequests({});
        setFriendsMetaReady(true);
      },
    );

    return () => {
      unsubMeta();
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) {
      closedDmIdsHydratedRef.current = false;
      return;
    }
    if (!closedDmIdsHydratedRef.current) return;
    writeClosedDmIds(auth.currentUser.uid, closedDmIds);
  }, [isLoggedIn, closedDmIds]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) {
      closedDmIdsHydratedRef.current = false;
      closedDmIdsRef.current = {};
      setClosedDmIds({});
      return;
    }
    const nextClosed = readClosedDmIds(auth.currentUser.uid);
    closedDmIdsRef.current = nextClosed;
    setClosedDmIds(nextClosed);
    closedDmIdsHydratedRef.current = true;
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    setDmInboxes((prev) => filterVisibleDmInboxes(prev, closedDmIds));
  }, [isLoggedIn, closedDmIds]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser?.uid) return;
    let disposed = false;
    void ensureAndRegisterE2eeIdentity(auth.currentUser.uid, BACKEND_URL).catch(
      () => {
        if (disposed) return;
      },
    );
    return () => {
      disposed = true;
    };
  }, [isLoggedIn, auth.currentUser?.uid]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) {
      setGroupMembersCollapsed(false);
      return;
    }
    let disposed = false;
    void fetchDmStatePayloadService(auth.currentUser.uid, BACKEND_URL)
      .then((state) => {
        if (disposed) return;
        setGroupMembersCollapsed(!!state?.groupMembersCollapsed);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) {
      setDmInboxes([]);
      setDmInboxReady(false);
      dmRestoreTargetRef.current = null;
      dmLastSavedStateRef.current = null;
      return;
    }

    const uid = auth.currentUser.uid;
    let disposed = false;
    setDmInboxReady(false);

    const loadınbox = async () => {
      try {
        const rows = await fetchDmInboxService(uid, BACKEND_URL);
        const visible = filterVisibleDmInboxes(rows, closedDmIdsRef.current);
        if (!disposed) {
          setDmInboxes((prev) => (sameDmRows(prev, visible) ? prev : visible));
        }
      } catch {
      } finally {
        if (!disposed) setDmInboxReady(true);
      }
    };

    void loadınbox();
    const timer = window.setInterval(loadınbox, 6000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) {
      setFriendsMetaReady(false);
      setFriendsMap({});
      setFriendsMeta({
        incoming: [],
        outgoing: [],
        blocked: [],
        friends: [],
      });
      setOutgoingRequests({});
      setIncomingRequests({});
      outgoingSeenRef.current = {};
      incomingSeenRef.current = {};
      incomingWatchReadyRef.current = false;
      return;
    }

    const uid = auth.currentUser.uid;
    const metaRef = getFriendsMetaRef(uid);
    setFriendsMetaReady(false);

    const unsubMeta = onSnapshot(
      metaRef,
      (snap) => {
        if (!snap.exists()) {
          setDoc(metaRef, FRIENDS_META_DEFAULT, { merge: true }).catch(
            () => {},
          );
          setFriendsMeta({
            incoming: [],
            outgoing: [],
            blocked: [],
            friends: [],
          });
          setFriendsMap({});
          setOutgoingRequests({});
          setIncomingRequests({});
          incomingSeenRef.current = {};
          incomingWatchReadyRef.current = false;
          setFriendsMetaReady(true);
          return;
        }
        const data = snap.data() as any;
        const incoming = normalizeUidArray(data?.incoming);
        const outgoing = normalizeUidArray(data?.outgoing);
        const blocked = normalizeUidArray(data?.blocked);
        const friends = normalizeUidArray(data?.friends);

        setFriendsMeta({ incoming, outgoing, blocked, friends });

        const next: Record<string, boolean> = {};
        friends.forEach((fid: string) => {
          next[fid] = true;
        });
        setFriendsMap(next);

        const outMap: Record<string, { status: string; updatedAt?: any }> = {};
        outgoing.forEach((fid: string) => {
          outMap[fid] = { status: "pending" };
        });
        const inMap: Record<string, { status: string; updatedAt?: any }> = {};
        incoming.forEach((fid: string) => {
          inMap[fid] = { status: "pending" };
        });
        setOutgoingRequests(outMap);
        setIncomingRequests(inMap);
        setFriendsMetaReady(true);
      },
      () => {
        setFriendsMeta({
          incoming: [],
          outgoing: [],
          blocked: [],
          friends: [],
        });
        setFriendsMap({});
        setOutgoingRequests({});
        setIncomingRequests({});
        setFriendsMetaReady(true);
      },
    );

    return () => {
      unsubMeta();
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    dmRestoreTargetRef.current = null;
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      setDmUsersReady(false);
      setDmUsers({});
      return;
    }
    if (dmInboxes.length === 0) {
      setDmUsers({});
      setDmUsersReady(true);
      return;
    }
    setDmUsersReady(false);
    const preloadUidSet = new Set<string>();
    dmInboxes.forEach((row) => {
      const otherUid = String(row?.otherUid || "");
      if (otherUid) preloadUidSet.add(otherUid);
      const conversationId = String(row?.id || "");
      const members = conversationParticipants[conversationId] || [];
      members.forEach((p) => {
        const memberUid = String(p?.uid || "");
        if (memberUid) preloadUidSet.add(memberUid);
      });
    });
    const uids = Array.from(preloadUidSet);
    if (uids.length === 0) {
      setDmUsers({});
      setDmUsersReady(true);
      return;
    }
    const cache: Record<string, any> = {};
    const readyFailSafe = window.setTimeout(() => {
      setDmUsersReady(true);
    }, 1800);
    const pending = new Set(uids);
    const markReady = () => {
      if (pending.size === 0) setDmUsersReady(true);
    };
    const unsubs = uids.map((uid) =>
      onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          if (snap.exists()) {
            cache[uid] = { id: snap.id, ...(snap.data() as any) };
          } else {
            delete cache[uid];
          }
          setDmUsers({ ...cache });
          pending.delete(uid);
          markReady();
        },
        () => {
          delete cache[uid];
          setDmUsers({ ...cache });
          pending.delete(uid);
          markReady();
        },
      ),
    );
    return () => {
      window.clearTimeout(readyFailSafe);
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {}
      });
    };
  }, [isLoggedIn, dmInboxes, conversationParticipants]);

  useEffect(() => {
    if (!adminProfileModal.open || !adminProfileModal.user?.uid) return;
    const uid = adminProfileModal.user.uid;
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (!snap.exists()) return;
        setAdminProfileModal((prev) => {
          if (!prev.open || prev.user?.uid !== uid) return prev;
          return {
            ...prev,
            user: {
              ...(prev.user || {}),
              id: snap.id,
              ...(snap.data() as any),
            },
          };
        });
      },
      () => {},
    );
    return () => unsub();
  }, [adminProfileModal.open, adminProfileModal.user?.uid]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    if (activeDmId) return;
    const restoreId = dmRestoreTargetRef.current;
    if (!restoreId) return;
    const row = dmInboxes.find((r) => r.id === restoreId);
    if (!row) return;
    const u = buildActiveUserFromInboxRow(row);
    setDmSection("friends");
    setActiveDmId(row.id);
    setActiveDmUser(u);
    setDmComposer("");
    setEditingDmMessageId(null);
    setEditingDmText("");
    dmRestoreTargetRef.current = null;
  }, [isLoggedIn, activeDmId, dmInboxes, dmUsers, friendUsers]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser?.uid) return;
    if (!dmInboxReady || !activeDmId) return;
    const existsInInbox = dmInboxes.some(
      (row) => String(row?.id || "") === String(activeDmId),
    );
    if (existsInInbox) return;
    const isActiveGroup =
      Boolean(activeDmUser?.isGroup) || String(activeDmId).startsWith("grp_");
    if (!isActiveGroup) return;

    dmRestoreTargetRef.current = null;
    dmLastSavedStateRef.current = null;
    setActiveDmId(null);
    setActiveDmUser(null);
    setEditingDmMessageId(null);
    setEditingDmText("");
    setDmComposer("");
    setDmMessages([]);
    setDmSection("friends");
    setFriendsTab("pending");
    void saveDmStateService(
      auth.currentUser.uid,
      null,
      undefined,
      BACKEND_URL,
    ).catch(() => {});
  }, [
    isLoggedIn,
    auth.currentUser?.uid,
    dmInboxReady,
    activeDmId,
    activeDmUser,
    dmInboxes,
  ]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    const nextStateId = dmSection === "friends" ? activeDmId || null : null;
    if (dmLastSavedStateRef.current === nextStateId) return;
    dmLastSavedStateRef.current = nextStateId;
    void saveDmStateService(
      auth.currentUser.uid,
      nextStateId,
      undefined,
      BACKEND_URL,
    ).catch(() => {});
  }, [isLoggedIn, dmSection, activeDmId]);

  useEffect(() => {
    activeDmIdRef.current = activeDmId;
  }, [activeDmId]);

  useEffect(() => {
    dmInboxesRef.current = dmInboxes;
  }, [dmInboxes]);

  useEffect(() => {
    dmUsersRef.current = dmUsers;
  }, [dmUsers]);

  useEffect(() => {
    friendUsersRef.current = friendUsers;
  }, [friendUsers]);

  useEffect(() => {
    if (!activeDmId) return;
    const activeRow = dmInboxes.find((row) => row.id === activeDmId);
    const user = buildActiveUserFromInboxRow(activeRow);
    if (user) {
      setActiveDmUser(user);
    }
    if (activeRow?.unreadCount && activeRow.unreadCount > 0) {
      markDmAsRead(activeDmId);
    }
  }, [activeDmId, dmInboxes, dmUsers, friendUsers]);

  useEffect(() => {
    if (!isLoggedIn || !activeDmId) return;
    chatSocketRef.current?.emit("chat:join_conversation", {
      conversationId: activeDmId,
    });
  }, [isLoggedIn, activeDmId]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!isLoggedIn || !uid || !activeDmId) return;
    const row = dmInboxes.find(
      (x) => String(x?.id || "") === String(activeDmId),
    );
    const isGroup = String(row?.type || "") === "group";
    if (!isGroup) return;
    let disposed = false;
    void fetchConversationParticipantsService(activeDmId, uid, BACKEND_URL)
      .then((rows) => {
        if (disposed) return;
        setConversationParticipants((prev) => ({
          ...prev,
          [activeDmId]: rows || [],
        }));
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [isLoggedIn, activeDmId, dmInboxes]);

  useEffect(() => {
    if (!isLoggedIn || !activeDmId) {
      setDmMessages([]);
      setDmHasMore(true);
      setDmBeforeCursor(null);
      dmStickToBottomRef.current = true;
      return;
    }
    setDmLoading(true);
    setDmLoadingMore(false);
    setDmHasMore(true);
    setDmBeforeCursor(null);
    dmStickToBottomRef.current = true;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setDmMessages([]);
      setDmLoading(false);
      return;
    }
    let disposed = false;

    (async () => {
      try {
        const rows = await fetchDmMessagesService(
          activeDmId,
          uid,
          {
            limit: 100,
          },
          BACKEND_URL,
        );
        const decryptedRows = await decryptDmRowsForUid(rows, uid);
        if (!disposed) {
          setDmMessages(decryptedRows);
          setDmBeforeCursor(
            decryptedRows.length > 0
              ? String(decryptedRows[0].createdAt)
              : null,
          );
          setDmHasMore(decryptedRows.length >= 100);
        }
      } catch {
        if (!disposed) {
          setDmMessages([]);
          setDmBeforeCursor(null);
          setDmHasMore(false);
        }
      } finally {
        if (!disposed) setDmLoading(false);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [isLoggedIn, activeDmId, decryptDmRowsForUid]);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    const uid = auth.currentUser.uid;
    const socket = io(BACKEND_URL, {
      transports: ["websocket", "polling"],
    });
    chatSocketRef.current = socket;

    const refreshInbox = async () => {
      try {
        const rows = await fetchDmInboxService(uid, BACKEND_URL);
        const visible = filterVisibleDmInboxes(rows, closedDmIdsRef.current);
        setDmInboxes((prev) => (sameDmRows(prev, visible) ? prev : visible));
      } catch {
      } finally {
        setDmInboxReady(true);
      }
    };
    let refreshTimer: number | null = null;
    const scheduleInboxRefresh = () => {
      if (refreshTimer != null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshInbox();
      }, 350);
    };

    socket.on("connect", () => {
      socket.emit("chat:auth", { uid });
      void refreshInbox();
      const currentActiveDmId = String(activeDmIdRef.current || "");
      if (currentActiveDmId) {
        socket.emit("chat:join_conversation", {
          conversationId: currentActiveDmId,
        });
      }
    });

    socket.on("presence:snapshot", (payload: any) => {
      applyPresenceState(payload);
    });

    socket.on("presence:update", (payload: any) => {
      applyPresenceState(payload);
    });

    socket.on("chat:inbox_updated", () => {
      scheduleInboxRefresh();
    });

    socket.on("chat:dm_opened", (payload: any) => {
      const conversationId = String(payload?.conversationId || "");
      const otherUid = String(payload?.otherUid || "");
      if (!conversationId) {
        scheduleInboxRefresh();
        return;
      }
      setClosedDmIds((prev) => {
        if (!prev[conversationId]) return prev;
        const next = { ...prev };
        delete next[conversationId];
        closedDmIdsRef.current = next;
        if (auth.currentUser?.uid) {
          writeClosedDmIds(auth.currentUser.uid, next);
        }
        return next;
      });
      if (otherUid) {
        upsertDmInboxTop(conversationId, otherUid);
      }
      scheduleInboxRefresh();
    });

    socket.on("chat:group_updated", (payload: any) => {
      const conversationId = String(payload?.conversationId || "");
      const memberCount =
        typeof payload?.memberCount === "number"
          ? Number(payload.memberCount)
          : null;
      if (
        conversationId &&
        memberCount != null &&
        Number.isFinite(memberCount)
      ) {
        setDmInboxes((prev) =>
          prev.map((row) =>
            String(row?.id || "") === conversationId
              ? { ...row, memberCount: Math.max(0, memberCount) }
              : row,
          ),
        );
        setActiveDmUser((prev: any) => {
          if (!prev?.isGroup) return prev;
          if (String(prev?.conversationId || "") !== conversationId)
            return prev;
          return { ...prev, memberCount: Math.max(0, memberCount) };
        });
      }
      scheduleInboxRefresh();
      if (!conversationId) return;
      if (String(activeDmIdRef.current || "") !== conversationId) return;
      void fetchConversationParticipantsService(
        conversationId,
        uid,
        BACKEND_URL,
      )
        .then((rows) => {
          setConversationParticipants((prev) => ({
            ...prev,
            [conversationId]: rows || [],
          }));
        })
        .catch(() => {});
    });

    socket.on("chat:typing_start", (payload: any) => {
      const conversationId = String(payload?.conversationId || "");
      const senderUid = String(payload?.uid || "");
      if (!conversationId || !senderUid) return;
      if (senderUid === uid) return;
      if (String(activeDmIdRef.current || "") !== conversationId) return;
      setRemoteTypingUids((prev) =>
        prev.includes(senderUid) ? prev : [...prev, senderUid],
      );
      const prevTimer = remoteTypingExpireTimersRef.current[senderUid];
      if (prevTimer != null) {
        window.clearTimeout(prevTimer);
      }
      remoteTypingExpireTimersRef.current[senderUid] = window.setTimeout(() => {
        setRemoteTypingUids((prev) => prev.filter((x) => x !== senderUid));
        delete remoteTypingExpireTimersRef.current[senderUid];
      }, 2600);
    });

    socket.on("chat:typing_stop", (payload: any) => {
      const conversationId = String(payload?.conversationId || "");
      const senderUid = String(payload?.uid || "");
      if (!conversationId || !senderUid) return;
      if (senderUid === uid) return;
      if (String(activeDmIdRef.current || "") !== conversationId) return;
      const prevTimer = remoteTypingExpireTimersRef.current[senderUid];
      if (prevTimer != null) {
        window.clearTimeout(prevTimer);
        delete remoteTypingExpireTimersRef.current[senderUid];
      }
      setRemoteTypingUids((prev) => prev.filter((x) => x !== senderUid));
    });

    socket.on("chat:message", (payload: any) => {
      if (!payload?.conversationId || !payload?.message) return;
      const conversationId = String(payload?.conversationId || "");
      const senderId = String(payload?.message?.senderId || "");
      const isOwnMessage = senderId === uid;
      const isActiveConversation =
        conversationId === String(activeDmIdRef.current || "");
      const appFocused =
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        (typeof document.hasFocus === "function" ? document.hasFocus() : true);
      if (!isOwnMessage && (!isActiveConversation || !appFocused)) {
        const row = (dmInboxesRef.current || []).find(
          (x) => String(x?.id || "") === conversationId,
        );
        const isGroup =
          String(row?.type || "") === "group" ||
          conversationId.startsWith("grp_");
        const senderUser =
          dmUsersRef.current?.[senderId] || friendUsersRef.current?.[senderId];
        const senderName = String(
          senderUser?.displayName ||
            senderUser?.username ||
            senderId ||
            "Bir kullanıcı",
        ).trim();
        if (isGroup) {
          const groupName = String(row?.groupName || "").trim() || "Grup";
          triggerDesktopNotification(
            "Piksel",
            `${groupName} • ${senderName} yeni mesaj gönderdi.`,
            {
              icon: safeImageSrcUtil(row?.groupAvatarUrl, "/group-default.svg"),
            },
          );
        } else {
          triggerDesktopNotification(
            "Piksel",
            `${senderName}: Yeni mesaj aldın.`,
            {
              icon: safeImageSrcUtil(
                senderUser?.profilePic || senderUser?.photoURL,
                "https://i.hizliresim.com/ntdyvrh.jpg",
              ),
            },
          );
        }
      }
      if (payload.conversationId !== activeDmIdRef.current) {
        scheduleInboxRefresh();
        return;
      }
      void decryptDmMessageForUid(payload.message, uid).then((safeMessage) => {
        setDmMessages((prev) => {
          const nonce = String(safeMessage?.clientNonce || "");
          if (nonce) {
            const noncePendingIndex = prev.findIndex(
              (m) => m?.isPending && String(m?.clientNonce || "") === nonce,
            );
            if (noncePendingIndex >= 0) {
              const next = [...prev];
              next[noncePendingIndex] = safeMessage;
              return next;
            }
          }
          const pendingIndex = prev.findIndex(
            (m) =>
              m?.isPending &&
              m?.senderId === safeMessage.senderId &&
              m?.text === safeMessage.text,
          );
          if (pendingIndex >= 0) {
            const next = [...prev];
            next[pendingIndex] = safeMessage;
            return next;
          }
          const exists = prev.some(
            (m) => String(m.id) === String(safeMessage.id),
          );
          if (exists) return prev;
          return [...prev, safeMessage];
        });
        scheduleInboxRefresh();
      });
    });

    socket.on("chat:message_updated", (payload: any) => {
      if (!payload?.conversationId || !payload?.message) return;
      if (payload.conversationId !== activeDmIdRef.current) return;
      void decryptDmMessageForUid(payload.message, uid).then((safeMessage) => {
        setDmMessages((prev) =>
          prev.map((m) =>
            String(m.id) === String(safeMessage.id) ? safeMessage : m,
          ),
        );
        scheduleInboxRefresh();
      });
    });

    socket.on("chat:message_deleted", (payload: any) => {
      if (!payload?.conversationId || !payload?.messageId) return;
      if (payload.conversationId !== activeDmIdRef.current) {
        scheduleInboxRefresh();
        return;
      }
      setDmMessages((prev) =>
        prev.filter((m) => String(m.id) !== String(payload.messageId)),
      );
      setDeleteConfirmDmMessageId((prev) =>
        prev && String(prev) === String(payload.messageId) ? null : prev,
      );
      scheduleInboxRefresh();
    });

    return () => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }
      socket.disconnect();
      if (chatSocketRef.current === socket) {
        chatSocketRef.current = null;
      }
    };
  }, [
    isLoggedIn,
    applyPresenceState,
    decryptDmMessageForUid,
    triggerDesktopNotification,
  ]);

  useEffect(() => {
    if (!activeDmId || !dmMessagesViewportRef.current) return;
    const el = dmMessagesViewportRef.current;
    const pendingAdjust = dmPrependAdjustRef.current;
    if (pendingAdjust) {
      const nextHeight = el.scrollHeight;
      el.scrollTop = pendingAdjust.top + (nextHeight - pendingAdjust.height);
      dmPrependAdjustRef.current = null;
      return;
    }
    if (dmStickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeDmId, dmMessages, editingDmMessageId]);

  useEffect(() => {
    if (showProfileModal) {
      setIsViewingOwnProfile(true);
    }
  }, [showProfileModal]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest(".dm-message-menu") || t.closest(".dm-message-more-btn")) {
        return;
      }
      setDmActionMenuMessageId(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setDeleteConfirmDmMessageId(null);
    setDmActionMenuMessageId(null);
  }, [activeDmId]);

  useEffect(() => {
    if (typingStopTimerRef.current != null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    localTypingStateRef.current = {
      conversationId: activeDmId,
      active: false,
      lastStartAt: 0,
    };
    Object.values(remoteTypingExpireTimersRef.current).forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    remoteTypingExpireTimersRef.current = {};
    setRemoteTypingUids([]);
  }, [activeDmId]);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current != null) {
        window.clearTimeout(typingStopTimerRef.current);
      }
      Object.values(remoteTypingExpireTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, []);

  const loadOlderDmMessages = async () => {
    const uid = auth.currentUser?.uid;
    const el = dmMessagesViewportRef.current;
    if (
      !uid ||
      !activeDmId ||
      !el ||
      !dmHasMore ||
      dmLoading ||
      dmLoadingMore ||
      !dmBeforeCursor
    ) {
      return;
    }
    setDmLoadingMore(true);
    const prevHeight = el.scrollHeight;
    const prevTop = el.scrollTop;
    try {
      const olderRows = await fetchDmMessagesService(
        activeDmId,
        uid,
        {
          limit: 100,
          before: dmBeforeCursor,
        },
        BACKEND_URL,
      );
      const decryptedRows = await decryptDmRowsForUid(olderRows, uid);
      if (decryptedRows.length === 0) {
        setDmHasMore(false);
        return;
      }
      dmPrependAdjustRef.current = { height: prevHeight, top: prevTop };
      setDmMessages((prev) => {
        const existing = new Set(prev.map((m) => String(m.id)));
        const onlyNew = decryptedRows.filter(
          (m) => !existing.has(String(m.id)),
        );
        if (onlyNew.length === 0) return prev;
        return [...onlyNew, ...prev];
      });
      setDmBeforeCursor(String(decryptedRows[0].createdAt));
      setDmHasMore(decryptedRows.length >= 100);
    } catch {
    } finally {
      setDmLoadingMore(false);
    }
  };

  const handleDmMessagesScroll = () => {
    const el = dmMessagesViewportRef.current;
    if (!el) return;
    const distToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    dmStickToBottomRef.current = distToBottom < 72;
    if (el.scrollTop <= 40) {
      void loadOlderDmMessages();
    }
  };

  const handleDmMessagesWheel = (deltaY: number) => {
    if (deltaY < 0) {
      dmStickToBottomRef.current = false;
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser) return;
    if (!windowIdRef.current) {
      windowIdRef.current = `w-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    }
    windowClosedRef.current = false;
    const id = windowIdRef.current;
    upsertActiveWindow(id);

    const t = window.setInterval(() => {
      upsertActiveWindow(id);
    }, WINDOW_HEARTBEAT_MS);

    const handleBeforeUnload = () => {
      handleWindowExitPresence();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.clearInterval(t);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleWindowExitPresence();
    };
  }, [isLoggedIn]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "badges"), (snap) => {
      const next: Record<string, BadgeDef> = {};
      snap.forEach((d) => {
        next[d.id] = { id: d.id, ...(d.data() as Omit<BadgeDef, "id">) };
      });
      setBadgeDefs(next);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!showStatusModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowStatusModal(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showStatusModal]);

  useEffect(() => {
    if (
      !showProfileModal &&
      !showProfilePopup &&
      !adminProfileModal.open &&
      !showChangelogModal
    )
      return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showChangelogModal) {
          setShowChangelogModal(false);
          return;
        }
        setShowProfileModal(false);
        setShowProfilePopup(false);
        setAdminProfileModal({ open: false, user: null });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showProfileModal,
    showProfilePopup,
    adminProfileModal.open,
    showChangelogModal,
  ]);

  useEffect(() => {
    if (!showSettingsPage) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (
          showProfileModal ||
          showProfilePopup ||
          adminProfileModal.open ||
          showProfileEditModal ||
          mediaCropOpen ||
          showStatusModal ||
          showChangelogModal
        ) {
          return;
        }
        requestCloseSettings();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    showSettingsPage,
    shouldBlockSettingsClose,
    showProfileModal,
    showProfilePopup,
    adminProfileModal.open,
    showProfileEditModal,
    mediaCropOpen,
    showStatusModal,
    showChangelogModal,
  ]);

  useEffect(() => {
    let unlisten: null | (() => void) = null;

    const syncMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      setIsWindowMaximized(maximized);
    };

    (async () => {
      await syncMaximized();
      unlisten = await appWindow.onResized(async () => {
        await syncMaximized();
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: null | (() => void) = null;
    (async () => {
      try {
        unlisten = await appWindow.onCloseRequested(async () => {
          await handleWindowExitPresence();
        });
      } catch {}
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const checkFirstLogin = async () => {
      if (isLoggedIn && auth.currentUser) {
        const { getDoc } = await import("firebase/firestore");
        const userDocRef = doc(db, "users", auth.currentUser.uid);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
          const userData = docSnap.data();
          if (userData.isFirstLogin === true) {
            setShowFirstWelcome(true);
          }
        }
      }
    };
    checkFirstLogin();
  }, [isLoggedIn]);

  useEffect(() => {
    const loadThemes = async () => {
      try {
        const snap = await getDocs(collection(db, "themes"));
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as ThemeDoc,
        );
        setThemes(list);
      } catch (e) {
        setThemes([]);
      }
    };

    loadThemes();
  }, []);

  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside, true);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside, true);
  }, [showDropdown]);

  useEffect(() => {
    if (!showSettingsPage) return;
    if (settingsTab === "changelog") {
      setShowChangelogModal(true);
    }
  }, [settingsTab, showSettingsPage]);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;
    let unsubscribeAuth: (() => void) | null = null;
    let cancelled = false;
    setAuthStateReady(false);

    const handleAuthState = async (user: any) => {
      if (cancelled) return;
      if (isRegistering) {
        setIsLoggedIn(false);
        setDbReady(true);
        setAuthStateReady(true);
        return;
      }

      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);

          if (unsubscribeDoc) unsubscribeDoc();

          const { getDoc } = await import("firebase/firestore");
          const docSnap = await getDoc(userDocRef);
          const userData = docSnap.exists() ? docSnap.data() : null;

          const deviceId = await getDeviceId();

          const ban = userData?.ban;

          if (ban?.type === "permanent") {
            setBanState({
              type: "permanent",
              reason: ban.reason || "Hesabınız engellendi.",
            });

            setDbReady(true);
            setAuthStateReady(true);
            return;
          }

          if (ban?.type === "temporary") {
            const expiresAtMs = ban.expiresAtMs;

            if (typeof expiresAtMs === "number" && Date.now() < expiresAtMs) {
              setBanState({
                type: "temporary",
                reason: ban.reason || "Geçici ban yediniz.",
                expiresAtMs,
              });

              setDbReady(true);
              setAuthStateReady(true);
              return;
            }

            if (typeof expiresAtMs === "number" && Date.now() >= expiresAtMs) {
              await updateDoc(userDocRef, {
                ban: deleteField(),
                status: "online",
                presence: "online",
              });
            }
          }

          if (deviceId) {
            try {
              const currentLastDeviceId = userData?.lastDeviceId;
              const currentDeviceIds = Array.isArray(userData?.deviceIds)
                ? userData.deviceIds
                : [];
              const hasDeviceId = currentDeviceIds.includes(deviceId);

              if (currentLastDeviceId !== deviceId || !hasDeviceId) {
                await updateDoc(userDocRef, {
                  lastDeviceId: deviceId,
                  deviceIds: arrayUnion(deviceId),
                });
              }
            } catch {}
          }

          unsubscribeDoc = onSnapshot(userDocRef, async (snapshot) => {
            if (isRegistering) return;

            if (!snapshot.exists()) {
              await signOut(auth);
              setIsLoggedIn(false);
              showLoginError("Hesabınız kalıcı sekilde silinmistir.");
              setDbReady(true);
              setAuthStateReady(true);
              return;
            }

            const userData = snapshot.data();
            setUserDocData(userData);
            const badgesMap = (userData.badges || {}) as Record<
              string,
              { active?: boolean }
            >;
            const actives = Object.entries(badgesMap)
              .filter(([_, v]) => v?.active)
              .map(([k]) => k);
            setActiveBadgeIds(actives);

            const liveBan = userData?.ban;
            if (liveBan?.type === "permanent") {
              setBanState({
                type: "permanent",
                reason: liveBan.reason || "Hesabınız engellendi.",
              });
              setAuthStateReady(true);
              return;
            }

            if (liveBan?.type === "temporary") {
              const expiresAtMs = liveBan.expiresAtMs;
              if (typeof expiresAtMs === "number" && Date.now() < expiresAtMs) {
                setBanState({
                  type: "temporary",
                  reason: liveBan.reason || "Geçici ban yediniz.",
                  expiresAtMs,
                });
                setAuthStateReady(true);
                return;
              }

              if (
                typeof expiresAtMs === "number" &&
                Date.now() >= expiresAtMs
              ) {
                await updateDoc(userDocRef, {
                  ban: deleteField(),
                  status: "online",
                  presence: "online",
                });
              }
            }
            if (userData.status === "deactive") {
              setBanState({
                type: "temporary",
                reason:
                  userData?.ban?.reason ||
                  "Hesabınız geçici olarak askıya alınmıştır.",
                expiresAtMs: userData?.ban?.expiresAtMs,
              });
              setDbReady(true);
              setAuthStateReady(true);
              return;
            } else if (userData.status === "askıya alındı") {
              setBanState({
                type: "permanent",
                reason:
                  userData?.ban?.reason ||
                  "Hesabınız kalıcı olarak askıya alınmıştır.",
              });
              setDbReady(true);
              setAuthStateReady(true);
              return;
            } else {
              setDisplayName(userData.displayName || "");
              setUsername(userData.username || "");
              setBio(userData.bio || "");
              const resolvedPresence = resolveUserPresenceFields(userData);
              const nextStatus = resolvedPresence.status;
              const nextPresence = resolvedPresence.presence;
              const nextCustomStatus = resolvedPresence.customStatus || "";
              setUserStatus(nextStatus);
              setPresence(nextPresence);
              setCustomStatus(nextCustomStatus);
              setPresenceByUid((prev) => ({
                ...prev,
                [user.uid]: {
                  status: nextStatus,
                  presence: nextPresence,
                  customStatus: nextCustomStatus,
                  lastActive:
                    resolvedPresence.lastActive || userData.lastActive || null,
                },
              }));
              lastPresenceRef.current = nextPresence;
              if (!showStatusModal) {
                setTempStatus(nextStatus);
                setTempCustom(nextCustomStatus);
              }
              setProfilePic(
                userData.profilePic ||
                  userData.photoURL ||
                  "https://i.hizliresim.com/ntdyvrh.jpg",
              );
              setDeveloperMode(!!userData.developerMode);
              setCreatedAt(userData.createdAt || null);
              setLastActive(
                resolvedPresence.lastActive || userData.lastActive || null,
              );

              if (userData.isFirstLogin === true) {
                setShowFirstWelcome(true);
              }
              setSavedThemeId(userData.themeId || "default");
              setDraftThemeId(userData.themeId || "default");
              setSettingsDirty(false);
              if (!postLoginUiInitRef.current) {
                setFriendsTab("pending");
                setDmSection("friends");
                setActiveDmId(null);
                setActiveDmUser(null);
                setShowSettingsPageState(false);
                setShowProfileModal(false);
                setShowProfilePopup(false);
                setShowStatusModal(false);
                if (!showFirstWelcome) {
                  setSettingsTab("profile");
                }
                postLoginUiInitRef.current = true;
              }
              settingsInitRef.current = true;
              setIsLoggedIn(true);
            }
            setDbReady(true);
            setAuthStateReady(true);
          });
        } catch (error) {
          setDbReady(true);
          setAuthStateReady(true);
        }
      } else {
        if (unsubscribeDoc) {
          unsubscribeDoc();
          unsubscribeDoc = null;
        }
        setIsLoggedIn(false);
        setPresence("offline");
        setUserStatus("online");
        setCustomStatus("");
        setTempStatus("online");
        setTempCustom("");
        lastPresenceRef.current = "offline";
        setPresenceByUid({});
        setUsername("");
        setDisplayName("");
        setProfilePic("https://i.hizliresim.com/ntdyvrh.jpg");
        setShowFirstWelcome(false);
        autoChangelogHandledRef.current = null;
        settingsInitRef.current = false;
        postLoginUiInitRef.current = false;
        setShowSettingsPageState(false);
        setFriendsTab("pending");
        setDbReady(true);
        setAuthStateReady(true);
      }
    };

    void authPersistenceReady.finally(() => {
      if (cancelled) return;
      unsubscribeAuth = auth.onAuthStateChanged(handleAuthState);
    });

    return () => {
      cancelled = true;
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, [isRegistering]);

  useEffect(() => {
    const closePopup = () => setShowProfilePopup(false);

    if (showProfilePopup) {
      window.addEventListener("click", closePopup);
    }

    return () => window.removeEventListener("click", closePopup);
  }, [showProfilePopup]);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        const appearanceRef = doc(db, "settings", "appearance");

        unsub = onSnapshot(
          appearanceRef,
          (snap) => {
            if (snap.exists()) {
              const data = snap.data() as any;

              setDbImage(data?.loginImage || "");
              setAuthImageInput(data?.loginImage || "");
            } else {
              setDbImage("");
              setAuthImageInput("");
            }
            setDbReady(true);
          },
          (err) => {
            setDbImage("");
            setDbReady(true);
          },
        );
      } catch (e) {
        setDbImage("");
        setDbReady(true);
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "changelog"), (snap) => {
      if (snap.exists()) {
        setChangelogData(snap.data());
      } else {
        setChangelogData(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !auth.currentUser || !changelogData) return;

    const createdMs = getTimestampMs(changelogData?.createdAt);
    if (!createdMs) return;

    const lastSeenMs = getTimestampMs(userDocData?.lastChangelogSeenAt);
    const isNew = !lastSeenMs || createdMs > lastSeenMs;
    if (!isNew) return;

    const handledKey = String(createdMs);
    if (autoChangelogHandledRef.current === handledKey) return;
    autoChangelogHandledRef.current = handledKey;

    if (showFirstWelcome) {
      setAutoChangelogQueued(true);
      return;
    }

    setShowChangelogModal(true);
    const userRef = doc(db, "users", auth.currentUser.uid);
    updateDoc(userRef, {
      lastChangelogSeenAt: changelogData.createdAt || serverTimestamp(),
    }).catch(() => {});
  }, [isLoggedIn, changelogData, userDocData, showFirstWelcome]);

  useEffect(() => {
    if (!autoChangelogQueued) return;
    if (!isLoggedIn || !auth.currentUser || !changelogData) return;
    if (showFirstWelcome) return;

    setAutoChangelogQueued(false);
    setShowChangelogModal(true);
    const userRef = doc(db, "users", auth.currentUser.uid);
    updateDoc(userRef, {
      lastChangelogSeenAt: changelogData.createdAt || serverTimestamp(),
    }).catch(() => {});
  }, [autoChangelogQueued, showFirstWelcome, isLoggedIn, changelogData]);

  useEffect(() => {
    const authReady = isLoggedIn ? true : authMediaReady;
    const dmReady = isLoggedIn ? dmInboxReady && dmUsersReady : true;
    const friendsReady = isLoggedIn ? friendsMetaReady : true;
    const userCoreReady = isLoggedIn
      ? !!userDocData?.uid &&
        !!username &&
        !!(userDocData?.status || userStatus) &&
        !!(userDocData?.presence || presence)
      : true;
    const fullyReady =
      authStateReady &&
      dbReady &&
      authReady &&
      dmReady &&
      friendsReady &&
      userCoreReady;

    if (!fullyReady) {
      if (loaderHideTimerRef.current) {
        window.clearTimeout(loaderHideTimerRef.current);
        loaderHideTimerRef.current = null;
      }
      setHoldLoader(true);
      return;
    }

    if (loaderHideTimerRef.current) {
      window.clearTimeout(loaderHideTimerRef.current);
      loaderHideTimerRef.current = null;
    }
    loaderHideTimerRef.current = window.setTimeout(() => {
      setHoldLoader(false);
      loaderHideTimerRef.current = null;
    }, 2000);

    return () => {
      if (loaderHideTimerRef.current) {
        window.clearTimeout(loaderHideTimerRef.current);
        loaderHideTimerRef.current = null;
      }
    };
  }, [
    authStateReady,
    dbReady,
    isLoggedIn,
    authMediaReady,
    dmInboxReady,
    dmUsersReady,
    friendsMetaReady,
    userDocData,
    username,
    userStatus,
    presence,
  ]);

  useEffect(() => {
    setHoldLoader(true);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!dbReady) return;
    if (!isLoggedIn) {
      setAuthMediaReady(false);
    }
  }, [isLoggedIn, dbReady]);

  useEffect(() => {
    if (!dbReady || isLoggedIn) return;
    if (!safeUrl(dbImage)) {
      setAuthMediaReady(true);
      return;
    }
    const fallbackTimer = window.setTimeout(() => {
      setAuthMediaReady(true);
    }, 1800);
    return () => window.clearTimeout(fallbackTimer);
  }, [dbImage, isLoggedIn, dbReady]);

  useEffect(() => {
    if (!isLoggedIn && dbReady) {
      setTimeout(() => {
        topInputRef.current?.focus();
      }, 150);
    }
  }, [isLogin, isVerifying, isLoggedIn, dbReady]);

  useEffect(() => {
    let interval: any;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    if (isLoggedIn) {
      window.resizeTo(1200, 800);
      document.body.style.resize = "none";
      document.body.style.overflow = "auto";
      document.body.style.minWidth = "1100px";
      document.body.style.minHeight = "750px";
      document.documentElement.classList.add("expanded-view");
    } else {
      window.resizeTo(1064, 700);
      document.body.style.resize = "none";

      document.body.style.overflow = "auto";
      document.documentElement.classList.remove("expanded-view");
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (
        showProfilePopup &&
        profilePopupRef.current &&
        !profilePopupRef.current.contains(target) &&
        !target.closest(".profile-click-wrapper")
      ) {
        setShowProfilePopup(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfilePopup]);
  const u = adminProfileModal.user;
  const isSelf = !!auth.currentUser && u?.uid === auth.currentUser.uid;

  const triggerAdminError = (msg: string) => {
    setAdminErrField("uid");
    setAdminErrMsg(msg);
    setAdminShake("uid");
    setTimeout(() => {
      setAdminShake("");
      setAdminErrField("");
    }, 1000);
  };
  const triggerClErrors = (
    fields: Array<"image" | "new" | "temp" | "removed">,
    msg: string,
  ) => {
    const nextErrors: {
      image?: string;
      new?: string;
      temp?: string;
      removed?: string;
    } = {};
    const nextShake: {
      image?: boolean;
      new?: boolean;
      temp?: boolean;
      removed?: boolean;
    } = {};
    fields.forEach((f) => {
      nextErrors[f] = msg;
      nextShake[f] = true;
    });
    setClErrors(nextErrors);
    setClShake(nextShake);
    setTimeout(() => {
      setClShake({});
      setClErrors({});
    }, 1000);
  };
  const triggerPendingError = (msg: string) => {
    setPendingError(msg);
    setPendingErrorShake(true);
    if (pendingErrorTimerRef.current) {
      window.clearTimeout(pendingErrorTimerRef.current);
    }
    pendingErrorTimerRef.current = window.setTimeout(() => {
      setPendingError("");
      setPendingErrorShake(false);
      pendingErrorTimerRef.current = null;
    }, 2000);
  };
  const isValidHttpUrl = (value: string) => {
    try {
      const u = new URL(value);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };
  const isVideoUrl = (value: string) => {
    const v = value.toLowerCase();
    return (
      v.includes("youtube.com") || v.includes("youtu.be") || v.endsWith(".mp4")
    );
  };
  const getTimestampMs = (value: any) => {
    if (!value) return null;
    if (typeof value === "number") return value;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    return null;
  };
  const formatDateTR = (value: any) => {
    const ms = getTimestampMs(value);
    if (!ms) return "";
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };
  const normalizeUserPresenceStatus = (rawPresence: any, rawStatus: any) => {
    const normalizedPresence =
      String(rawPresence || "").toLowerCase() === "online"
        ? "online"
        : "offline";
    const statusRaw = String(rawStatus || "online").toLowerCase();
    let normalizedStatus: "online" | "idle" | "dnd" | "offline" = "online";
    if (
      statusRaw === "idle" ||
      statusRaw === "dnd" ||
      statusRaw === "offline"
    ) {
      normalizedStatus = statusRaw;
    }
    // Eski veriden kalan "status: offline" durumunu, Kullanıcı online iken kilitleme.
    if (normalizedPresence === "online" && normalizedStatus === "offline") {
      normalizedStatus = "online";
    }
    return { normalizedPresence, normalizedStatus };
  };
  const toJsDateOrNull = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value?.seconds === "number")
      return new Date(value.seconds * 1000);
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const resolveUserPresenceFields = (u: any) => {
    const uid = String(u?.uid || "");
    const override = uid ? presenceByUid[uid] : null;
    const src = override || u || {};
    const normalized = normalizeUserPresenceStatus(src.presence, src.status);
    const hasPresenceField =
      src != null &&
      Object.prototype.hasOwnProperty.call(
        src as Record<string, unknown>,
        "presence",
      );
    const isSelf = !!auth.currentUser && uid === auth.currentUser.uid;
    const effectivePresence =
      !override &&
      isSelf &&
      !hasPresenceField &&
      normalized.normalizedStatus !== "offline"
        ? "online"
        : normalized.normalizedPresence;
    return {
      status: normalized.normalizedStatus,
      presence: effectivePresence,
      customStatus:
        typeof src.customStatus === "string"
          ? src.customStatus
          : String(src.customStatus || ""),
      lastActive: toJsDateOrNull(src.lastActive) || src.lastActive || null,
    };
  };

  const triggerAuthImageError = (msg: string) => {
    setAuthImageError(msg);
    setAuthImageShake(true);
    setTimeout(() => {
      setAuthImageShake(false);
      setAuthImageError("");
    }, 1000);
  };

  const handleSaveAuthImage = async () => {
    const value = authImageInput.trim();
    setAuthImageSuccess(false);
    if (!value) {
      triggerAuthImageError("URL gerekli");
      return;
    }
    if (!isValidHttpUrl(value)) {
      triggerAuthImageError("Geçerli bir URL giriniz");
      return;
    }
    try {
      const ref = doc(db, "settings", "appearance");
      await setDoc(ref, { loginImage: value }, { merge: true });
      setDbImage(value);
      setAuthImageSuccess(true);
      window.setTimeout(() => setAuthImageSuccess(false), 1500);
    } catch {
      triggerAuthImageError("Güncelleme başarısız");
    }
  };
  const getChangelogSnippet = (data: any) => {
    if (!data) return "Henüz yenilik yayinlanmadı.";
    const parts = [data?.newFeatures, data?.tempDisabled, data?.removed]
      .map((t: any) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean);
    if (!parts.length) return "Içerik yok.";
    const text = parts[0];
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  };
  const applyUserDoc = (data: any) => {
    if (!data) return;
    const resolved = resolveUserPresenceFields(data);
    setUserDocData(data);
    setDisplayName(data.displayName || "");
    setUsername(data.username || "");
    setBio(data.bio || "");
    setCreatedAt(data.createdAt || null);
    setLastActive(resolved.lastActive || data.lastActive || null);
    setSavedThemeId(data.themeId || "default");
    setDraftThemeId(data.themeId || "default");
    setSettingsDirty(false);
    setUserStatus(resolved.status);
    setPresence(resolved.presence);
    setCustomStatus(resolved.customStatus || "");
    const badgesMap = (data.badges || {}) as Record<
      string,
      { active?: boolean }
    >;
    const actives = Object.entries(badgesMap)
      .filter(([_, v]) => v?.active)
      .map(([k]) => k);
    setActiveBadgeIds(actives);
    if (data.isFirstLogin === true) {
      setShowFirstWelcome(true);
    }
  };
  const getDeviceId = async (): Promise<string | null> => {
    try {
      const tauri = (window as any).__TAURI__;
      if (tauri?.invoke) {
        const mac = await tauri.invoke("get_mac_address");
        if (typeof mac === "string" && mac.trim().length > 0) return mac.trim();
      }
    } catch {}

    try {
      let id = localStorage.getItem("piksel_device_id");
      if (!id) {
        const rand = Math.random().toString(36).slice(2, 10);
        id = `dev-${Date.now()}-${rand}`;
        localStorage.setItem("piksel_device_id", id);
      }
      return id;
    } catch {
      return null;
    }
  };
  async function banPermanent(
    uid: string,
    email: string,
    reason: string,
    _deviceId?: string | null,
  ) {
    const adminUid = auth.currentUser?.uid;
    if (!adminUid) return showLoginError("Admin oturumu yok.");

    const userRef = doc(db, "users", uid);

    try {
      await setDoc(
        userRef,
        {
          ban: {
            type: "permanent",
            reason,
            bannedAt: serverTimestamp(),
            bannedBy: adminUid,
          },
          status: "offline",
          presence: "offline",
        },
        { merge: true },
      );
    } catch (e: any) {
      return showLoginError(
        `Ban başarısız: ${e?.code || ""} ${e?.message || "Bilinmeyen hata"}`,
      );
    }

    try {
      await tauriFetch(`${BACKEND_URL}/send-ban-mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "permanent", reason }),
      });
    } catch (e) {}
  }

  function TempBanCountdown({ expiresAtMs }: { expiresAtMs: number }) {
    const [timeLeft, setTimeLeft] = useState<string>("");

    useEffect(() => {
      const updateCountdown = () => {
        const now = Date.now();
        const diff = expiresAtMs - now;

        if (diff <= 0) {
          setTimeLeft("Ban süresi doldu");
          return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
        );
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        if (days > 0) {
          setTimeLeft(
            `${days} gün ${hours} saat ${minutes} dakika ${seconds} saniye`,
          );
        } else if (hours > 0) {
          setTimeLeft(`${hours} saat ${minutes} dakika ${seconds} saniye`);
        } else if (minutes > 0) {
          setTimeLeft(`${minutes} dakika ${seconds} saniye`);
        } else {
          setTimeLeft(`${seconds} saniye`);
        }
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }, [expiresAtMs]);

    return (
      <div style={{ color: "#bbb", fontSize: 18, fontWeight: 600 }}>
        Ban cezasinin bitmesine:{" "}
        <span style={{ color: "#ff6b6b" }}>{timeLeft}</span>
      </div>
    );
  }
  async function banTemporary(
    uid: string,
    email: string,
    reason: string,
    seconds: number,
  ) {
    const adminUid = auth.currentUser?.uid;
    if (!adminUid) return showLoginError("Admin oturumu yok.");

    const safeSeconds = Math.max(60, seconds);
    const userRef = doc(db, "users", uid);
    const expiresAtMs = Date.now() + safeSeconds * 1000;

    try {
      await setDoc(
        userRef,
        {
          ban: {
            type: "temporary",
            reason,
            bannedAt: serverTimestamp(),
            bannedBy: adminUid,
            expiresAtMs,
          },
          status: "deactive",
          presence: "offline",
        },
        { merge: true },
      );
    } catch (e: any) {
      return showLoginError(
        `Ban başarısız: ${e?.code || ""} ${e?.message || "Bilinmeyen hata"}`,
      );
    }

    try {
      await tauriFetch(`${BACKEND_URL}/send-ban-mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          type: "temporary",
          seconds: safeSeconds,
          reason,
        }),
      });
    } catch {}
  }

  const renderActiveBadges = () => {
    if (!activeBadgeIds || activeBadgeIds.length === 0) return null;
    const visible = activeBadgeIds
      .filter((id) => badgeDefs?.[id]?.active === true)
      .sort((a, b) => {
        const an = (badgeDefs?.[a]?.name || "").toLocaleLowerCase("tr-TR");
        const bn = (badgeDefs?.[b]?.name || "").toLocaleLowerCase("tr-TR");
        return an.localeCompare(bn, "tr-TR");
      });
    if (visible.length === 0) return null;

    return (
      <div
        style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}
        className="badges-container"
      >
        {visible.map((id) => {
          const b = badgeDefs[id];
          if (!b) return null;

          return (
            <span key={id} className="badge-wrap">
              <img
                src={safeImageSrc(b.iconUrl)}
                alt={b.name}
                className="badge-img"
                draggable={false}
              />
              <span className="badge-tooltip">{b.name}</span>
            </span>
          );
        })}
      </div>
    );
  };
  const setUserRole = async (uid: string, role: Role) => {
    if (!isOwner) return;

    if (uid === OWNER_UID && role !== "owner") {
      throw new Error("Owner kendisini ownerliktan çikaramaz");
    }

    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      role,
      roleUpdatedAt: serverTimestamp(),
      roleUpdatedBy: auth.currentUser?.uid || null,
    });
  };

  const promoteToAdminByUid = async () => {
    if (!isOwner) return;
    if (!targetUser?.uid) return;
    await setUserRole(targetUser.uid, "admin");
    setTargetUser((p: any) => (p ? { ...p, role: "admin" } : p));
  };

  const demoteAdminByUid = async (uid: string) => {
    if (!isOwner) return;
    await setUserRole(uid, "user");
  };

  const formatDate = (v: any) => {
    if (!v) return "-";

    if (typeof v?.toDate === "function") {
      return v.toDate().toLocaleDateString("tr-TR");
    }

    if (typeof v?.seconds === "number") {
      return new Date(v.seconds * 1000).toLocaleDateString("tr-TR");
    }

    const d = new Date(v);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("tr-TR");
  };

  const formatMsDateTime = (ms?: number) => {
    if (!ms || typeof ms !== "number") return "-";
    const d = new Date(ms);
    return isNaN(d.getTime()) ? "-" : d.toLocaleString("tr-TR");
  };

  const maskEmail = (value?: string, showFull?: boolean) => {
    if (!value) return "-";
    if (showFull) return value;
    const [user, domain] = value.split("@");
    if (!user || !domain) return value;
    const visible =
      user.length <= 2 ? user[0] || "*" : `${user[0]}${user[user.length - 1]}`;
    const stars = "*".repeat(Math.max(3, user.length - visible.length));
    return `${user[0] || "*"}${stars}${user[user.length - 1] || ""}@${domain}`;
  };

  const safeUrl = safeUrlUtil;
  const safeImageSrc = safeImageSrcUtil;
  const normalizeUidArray = (value: any) =>
    Array.isArray(value) ? value.filter(Boolean) : [];
  const getFriendsMetaRef = (uid: string) =>
    doc(db, "users", uid, "friends", "meta");
  const chunkArray = <T,>(arr: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  };
  const loadUsersByUids = async (uids: string[]) => {
    const uniq = Array.from(new Set(uids.filter(Boolean)));
    if (uniq.length === 0) return {};
    const result: Record<string, any> = {};
    const chunks = chunkArray(uniq, 10);
    for (const c of chunks) {
      const q = query(collection(db, "users"), where("uid", "in", c));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const data = d.data() as any;
        if (data?.uid) result[data.uid] = { id: d.id, ...data };
      });
    }
    return result;
  };
  const ACTIVE_WINDOWS_KEY = "mavi_active_windows";
  const WINDOW_TTL_MS = 15000;
  const WINDOW_HEARTBEAT_MS = 5000;

  const readActiveWindows = (): Record<string, number> => {
    try {
      const raw = localStorage.getItem(ACTIVE_WINDOWS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed as Record<string, number>;
    } catch {
      return {};
    }
  };

  const writeActiveWindows = (map: Record<string, number>) => {
    try {
      localStorage.setItem(ACTIVE_WINDOWS_KEY, JSON.stringify(map));
    } catch {}
  };

  const pruneActiveWindows = (map: Record<string, number>) => {
    const now = Date.now();
    Object.keys(map).forEach((key) => {
      if (!map[key] || now - map[key] > WINDOW_TTL_MS) {
        delete map[key];
      }
    });
    return map;
  };

  const upsertActiveWindow = (id: string) => {
    const map = pruneActiveWindows(readActiveWindows());
    map[id] = Date.now();
    writeActiveWindows(map);
  };

  const removeActiveWindow = (id: string) => {
    const map = pruneActiveWindows(readActiveWindows());
    delete map[id];
    writeActiveWindows(map);
    return Object.keys(map).length;
  };

  const handleWindowExitPresence = async () => {
    if (windowClosedRef.current) return;
    windowClosedRef.current = true;
    const id = windowIdRef.current;
    if (!id) return;
    const remaining = removeActiveWindow(id);
    if (remaining === 0 && auth.currentUser) {
      void setUserPresenceService(auth.currentUser.uid, "offline", BACKEND_URL)
        .then((state) => applyPresenceState(state))
        .catch(() => {});
    }
  };

  const openProfileEditModal = (
    field: "displayName" | "username" | "email" | "bio",
  ) => {
    setProfileEditField(field);
    setProfileEditValue(
      field === "displayName"
        ? displayName || ""
        : field === "username"
          ? username || ""
          : field === "email"
            ? userDocData?.email || auth.currentUser?.email || ""
            : bio || "",
    );
    setProfileEditPassword("");
    setProfileEditCode("");
    setProfileEditCodeInput("");
    setProfileEditNewCode("");
    setProfileEditNewCodeInput("");
    setProfileEditNewStage("send");
    setProfileEditError("");
    setProfileEditErrorField("");
    setProfileEditInfo("");
    setProfileEditStep(field === "email" ? "confirmEmail" : "input");
    setShowProfileEditModal(true);
  };

  const closeProfileEditModal = () => {
    setShowProfileEditModal(false);
    setProfileEditField(null);
    setProfileEditError("");
    setProfileEditErrorField("");
    setProfileEditInfo("");
    setProfileEditPassword("");
    setProfileEditCodeInput("");
    setProfileEditNewCode("");
    setProfileEditNewCodeInput("");
    setProfileEditNewStage("send");
  };

  const setProfileError = (
    field:
      | ""
      | "code"
      | "email"
      | "password"
      | "username"
      | "displayName"
      | "bio",
    msg: string,
  ) => {
    setProfileEditError(msg);
    setProfileEditErrorField(field);
    if (profileErrorTimerRef.current) {
      window.clearTimeout(profileErrorTimerRef.current);
    }
    profileErrorTimerRef.current = window.setTimeout(() => {
      setProfileEditError("");
      setProfileEditErrorField("");
      profileErrorTimerRef.current = null;
    }, 1000);
  };

  const reauthWithPassword = async (pwd: string) => {
    const user = auth.currentUser;
    if (!user?.email) throw new Error("Oturum bulunamadı.");
    const credential = EmailAuthProvider.credential(user.email, pwd);
    await reauthenticateWithCredential(user, credential);
  };

  const sendAccountNoticeMail = async (
    field: "email" | "username",
    toEmail: string,
    oldValue?: string,
    newValue?: string,
  ) => {
    try {
      await tauriFetch(`${BACKEND_URL}/send-account-change-notice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: toEmail, field, oldValue, newValue }),
      });
    } catch {}
  };

  const handleSaveDisplayName = async () => {
    const trimmed = sanitizeSingleLine(profileEditValue, 64);
    const nextName = trimmed || username || displayName || "";
    if (!nextName) {
      setProfileError("displayName", "Görünen ad boş olamaz.");
      return;
    }
    setProfileEditLoading(true);
    try {
      if (auth.currentUser?.uid) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          displayName: nextName,
        });
      }
      setDisplayName(nextName);
      closeProfileEditModal();
    } catch (err: any) {
      setProfileError(
        "displayName",
        getFirestoreWriteErrorMessage(err, "Güncelleme başarısız."),
      );
    } finally {
      setProfileEditLoading(false);
    }
  };

  const handleSaveUsername = async () => {
    const trimmed = profileEditValue.trim();
    const candidate = normalizeUsername(trimmed);
    if (!trimmed) {
      setProfileError("username", "Kullanıcı adı bos olamaz.");
      return;
    }
    if (!/^[\p{L}0-9._]+$/u.test(trimmed)) {
      setProfileError(
        "username",
        "Sadece harf, sayi, alt çizgi (_) ve nokta (.) kullanilabilir.",
      );
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 16) {
      setProfileError("username", "Kullanıcı adı 2-16 karakter olmalı.");
      return;
    }
    if (!profileEditPassword) {
      setProfileError("password", "Şifre doğrulamasi gerekli");
      return;
    }
    setProfileEditLoading(true);
    try {
      const takenSnap = await getDoc(doc(db, "usernames", candidate));
      if (takenSnap.exists()) {
        const takenData = takenSnap.data() as any;
        if (takenData?.uid !== auth.currentUser?.uid) {
          setProfileError("username", "Kullanıcı adı alinmis");
          setProfileEditLoading(false);
          return;
        }
      }
      await reauthWithPassword(profileEditPassword);
      if (auth.currentUser?.uid) {
        const uid = auth.currentUser.uid;
        const batch = writeBatch(db);
        const userRef = doc(db, "users", uid);
        batch.update(userRef, { username: trimmed });
        batch.set(
          doc(db, "usernames", candidate),
          { uid, createdAt: serverTimestamp() },
          { merge: true },
        );
        const oldUsername = normalizeUsername(username || "");
        if (oldUsername && oldUsername !== candidate) {
          batch.delete(doc(db, "usernames", oldUsername));
        }
        await batch.commit();
      }
      const prevUsernameValue = username || "";
      setUsername(trimmed);
      const mail = userDocData?.email || auth.currentUser?.email;
      if (mail)
        await sendAccountNoticeMail(
          "username",
          mail,
          prevUsernameValue,
          trimmed,
        );
      closeProfileEditModal();
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/wrong-password") {
        setProfileError("password", "Şifre hatasi.");
      } else if (code === "auth/requires-recent-login") {
        setProfileError("password", "Güvenlik için tekrar Giriş yapmalisin.");
      } else {
        setProfileError("username", "Kullanıcı adı güncellenemedi.");
      }
    } finally {
      setProfileEditLoading(false);
    }
  };

  const handleSaveBio = async () => {
    const trimmed = sanitizePlainText(profileEditValue, 300).trim();
    setProfileEditLoading(true);
    try {
      if (auth.currentUser?.uid) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          bio: trimmed,
        });
      }
      setBio(trimmed);
      closeProfileEditModal();
    } catch (err: any) {
      setProfileError(
        "bio",
        getFirestoreWriteErrorMessage(err, "Hakkinda güncellenemedi."),
      );
    } finally {
      setProfileEditLoading(false);
    }
  };

  const handleConfirmEmailChange = async () => {
    const currentEmail = userDocData?.email || auth.currentUser?.email;
    if (!currentEmail) {
      setProfileError("email", "E-posta bulunamadı.");
      return;
    }
    setProfileEditLoading(true);
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setProfileEditCode(code);
      const res = await tauriFetch(`${BACKEND_URL}/send-email-change-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentEmail, code }),
      });
      if (!res.ok) {
        throw new Error("mail_failed");
      }
      setProfileEditStep("verifyCode");
      setProfileEditInfo(
        `${maskEmail(currentEmail)} adresine doğrulama kodu gönderildi`,
      );
      setProfileEditError("");
      setProfileEditErrorField("");
    } catch {
      setProfileError("email", "doğrulama e-postasi günderilemedi");
    } finally {
      setProfileEditLoading(false);
    }
  };

  const handleVerifyEmailCode = () => {
    setProfileEditLoading(true);
    if (profileEditCodeInput.trim() !== profileEditCode) {
      setProfileError("code", "doğrulama kodu hatali");
      setProfileEditLoading(false);
      return;
    }
    setProfileEditError("");
    setProfileEditErrorField("");
    setProfileEditInfo("");
    setProfileEditValue("");
    setProfileEditPassword("");
    setProfileEditNewCode("");
    setProfileEditNewCodeInput("");
    setProfileEditNewStage("send");
    setProfileEditStep("newEmail");
    setProfileEditLoading(false);
  };

  const handleSendNewEmailCode = async () => {
    const newEmail = profileEditValue.trim();
    if (!newEmail) {
      setProfileError("email", "Yeni e-posta bos olamaz");
      return;
    }
    const oldEmail = userDocData?.email || auth.currentUser?.email;
    if (oldEmail && newEmail.toLowerCase() === oldEmail.toLowerCase()) {
      setProfileError("email", "Yeni e-posta eskisiyle ayni olamaz");
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
    if (!emailOk) {
      setProfileError("email", "Geçersiz e-posta.");
      return;
    }
    setProfileEditLoading(true);
    try {
      const methods = await fetchSignInMethodsForEmail(auth, newEmail);
      if (methods.length > 0) {
        setProfileError("email", "Bu e-posta baska bir hesapta kullaniliyor");
        setProfileEditLoading(false);
        return;
      }
      const userCheck = query(
        collection(db, "users"),
        where("email", "==", newEmail),
      );
      const userSnap = await getDocs(userCheck);
      if (!userSnap.empty) {
        setProfileError("email", "Bu e-posta baska bir hesapta kullaniliyor");
        setProfileEditLoading(false);
        return;
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setProfileEditNewCode(code);
      const res = await tauriFetch(`${BACKEND_URL}/send-email-change-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, code }),
      });
      if (!res.ok) {
        throw new Error("mail_failed");
      }
      setProfileEditNewStage("verify");
      setProfileEditInfo(
        `${maskEmail(newEmail)} adresine doğrulama kodu gönderildi`,
      );
      setProfileEditError("");
      setProfileEditErrorField("");
    } catch {
      setProfileError("email", "doğrulama e-postasi günderilemedi");
    } finally {
      setProfileEditLoading(false);
    }
  };

  const handleVerifyNewEmailCode = () => {
    setProfileEditLoading(true);
    if (profileEditNewCodeInput.trim() !== profileEditNewCode) {
      setProfileError("code", "doğrulama kodu hatali");
      setProfileEditLoading(false);
      return;
    }
    setProfileEditError("");
    setProfileEditErrorField("");
    setProfileEditNewStage("password");
    setProfileEditInfo("");
    setProfileEditLoading(false);
  };

  const handleSaveEmail = async () => {
    const newEmail = profileEditValue.trim();
    if (!newEmail) {
      setProfileError("email", "Yeni e-posta bos olamaz.");
      return;
    }
    const oldEmail = userDocData?.email || auth.currentUser?.email;
    if (oldEmail && newEmail.toLowerCase() === oldEmail.toLowerCase()) {
      setProfileError("email", "Yeni e-posta eskisiyle ayni olamaz");
      return;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
    if (!emailOk) {
      setProfileError("email", "Geçersiz e-posta");
      return;
    }
    if (!profileEditPassword) {
      setProfileError("password", "Şifre doğrulamasi gerekli");
      return;
    }
    setProfileEditLoading(true);
    try {
      await reauthWithPassword(profileEditPassword);
      if (auth.currentUser?.uid) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          email: newEmail,
        });
      }
      const oldEmailValue = oldEmail || auth.currentUser?.email || "";
      const mail = userDocData?.email || auth.currentUser?.email || newEmail;
      if (mail)
        await sendAccountNoticeMail("email", mail, oldEmailValue, newEmail);
      closeProfileEditModal();
    } catch (err: any) {
      const code = err?.code || "";
      console.error("email change failed:", code || err?.message || err);
      if (code === "auth/wrong-password") {
        setProfileError("password", "Şifre hatali");
      } else if (code === "auth/requires-recent-login") {
        setProfileError("password", "Güvenlik için tekrar Giriş yapmalisin.");
      } else if (
        code === "auth/user-token-expired" ||
        code === "auth/invalid-user-token"
      ) {
        setProfileError(
          "password",
          "Oturum süresi dolmus. Tekrar Giriş yapiniz",
        );
      } else {
        setProfileError("email", "E-posta güncellenemedi.");
      }
    } finally {
      setProfileEditLoading(false);
    }
  };

  const normalizeMetaValue = (value: any) => {
    const str = `${value ?? ""}`.trim();
    return str.length ? str : "-";
  };

  const slugifyBadgeId = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  const showMetaCopyTip = (key: string) => {
    setCopyTip({ text: "Kopyala", ok: false, show: true, key });
  };

  const hideMetaCopyTip = (key: string) => {
    setCopyTip((p) => (p.key === key ? { ...p, show: false } : p));
  };

  const handleMetaCopy = async (value: string, key: string) => {
    if (!value || value === "-" || value === "@") return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyTip({ text: "Kopyalandi", ok: true, show: true, key });
      setTimeout(
        () => setCopyTip((p) => (p.key === key ? { ...p, show: false } : p)),
        1200,
      );
    } catch {
      setCopyTip({ text: "Kopyalama hatasi", ok: false, show: true, key });
      setTimeout(
        () => setCopyTip((p) => (p.key === key ? { ...p, show: false } : p)),
        1200,
      );
    }
  };

  useEffect(() => {
    if (!showProfileModal && !adminProfileModal.open) {
      setProfileActionsOpen(false);
    }
  }, [showProfileModal, adminProfileModal.open]);

  useEffect(() => {
    setFriendSearch("");
    setBlockedSearch("");
    setPendingInput("");
    setPendingError("");
    setPendingErrorShake(false);
  }, [friendsTab]);

  useEffect(() => {
    if (!profileActionsOpen && !adminUidMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".profile-more")) return;
      setProfileActionsOpen(false);
      setAdminUidMenuOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside, true);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside, true);
  }, [profileActionsOpen, adminUidMenuOpen]);

  const handleCopyUserUid = async (uid?: string) => {
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setCopyTip({ text: "Kopyalandi", ok: true, show: true, key: "uid-copy" });
      setTimeout(
        () =>
          setCopyTip((p) => (p.key === "uid-copy" ? { ...p, show: false } : p)),
        1200,
      );
    } catch {
      setCopyTip({
        text: "Kopyalama hatasi",
        ok: false,
        show: true,
        key: "uid-copy",
      });
      setTimeout(
        () =>
          setCopyTip((p) => (p.key === "uid-copy" ? { ...p, show: false } : p)),
        1200,
      );
    }
  };

  const renderMetaCopyValue = (value: any, key: string) => {
    const text = normalizeMetaValue(value);
    return (
      <b
        className="admin-username-copy"
        onMouseEnter={() => showMetaCopyTip(key)}
        onMouseLeave={() => hideMetaCopyTip(key)}
        onClick={() => handleMetaCopy(text, key)}
      >
        {text}
        {copyTip.show && copyTip.key === key && (
          <span className={`copy-tooltip ${copyTip.ok ? "ok" : ""}`}>
            {copyTip.text}
          </span>
        )}
      </b>
    );
  };

  async function grantBadge(targetUid: string, badgeId: string) {
    const adminUid = auth.currentUser?.uid;
    if (!adminUid) throw new Error("Admin Giriş yapmamis.");

    const userRef = doc(db, "users", targetUid);

    const updates: any = {
      [`badges.${badgeId}`]: {
        active: true,
        grantedAt: serverTimestamp(),
        grantedBy: adminUid,
      },
    };

    if (badgeId === PERSONEL_BADGE_ID) {
      updates.staff = true;
      updates.role = "admin";
      updates.roleUpdatedAt = serverTimestamp();
      updates.roleUpdatedBy = adminUid;
    }

    await updateDoc(userRef, updates);
  }

  const resolvedTargetUser = useMemo(() => {
    if (!targetUser) return targetUser;
    const uid = String(targetUser?.uid || "");
    if (!uid) return targetUser;
    const live = presenceByUid[uid];
    if (!live) return targetUser;
    return {
      ...targetUser,
      status: live.status,
      presence: live.presence,
      customStatus: live.customStatus,
      lastActive: live.lastActive || targetUser.lastActive,
    };
  }, [targetUser, presenceByUid]);
  const renderBadgesForUser = (u: any) => {
    const map = (u?.badges || {}) as Record<string, { active?: boolean }>;
    const actives = Object.entries(map)
      .filter(([k, v]) => v?.active && badgeDefs?.[k]?.active === true)
      .map(([k]) => k)
      .sort((a, b) => {
        const an = (badgeDefs?.[a]?.name || "").toLocaleLowerCase("tr-TR");
        const bn = (badgeDefs?.[b]?.name || "").toLocaleLowerCase("tr-TR");
        return an.localeCompare(bn, "tr-TR");
      });
    if (actives.length === 0) return null;

    return (
      <div
        style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}
        className="badges-container"
      >
        {actives.map((id) => {
          const b = badgeDefs[id];
          if (!b) return null;
          return (
            <span key={id} className="badge-wrap">
              <img
                src={safeImageSrc(b.iconUrl)}
                alt={b.name}
                className="badge-img"
                draggable={false}
              />
              <span className="badge-tooltip">{b.name}</span>
            </span>
          );
        })}
      </div>
    );
  };

  const isFriendWith = (uid?: string) => !!(uid && friendsMap[uid]);
  const isBlockedUser = (uid?: string) =>
    !!(uid && (friendsMeta.blocked || []).includes(uid));
  const buildActiveUserFromInboxRow = (row: any) => {
    if (!row) return null;
    const isGroup = String(row?.type || "") === "group";
    if (isGroup) {
      return {
        uid: `group:${row.id}`,
        isGroup: true,
        conversationId: row.id,
        displayName: String(row?.groupName || "").trim() || "Yeni Grup",
        username: String(row?.groupName || "").trim() || "Yeni Grup",
        profilePic: safeImageSrc(row?.groupAvatarUrl, "/group-default.svg"),
        groupOwnerId: row?.groupOwnerId || null,
        memberCount: Number(row?.memberCount || 0),
      };
    }
    const otherUid = String(row?.otherUid || "");
    if (!otherUid) return null;
    return (
      dmUsers[otherUid] ||
      friendUsers[otherUid] || {
        uid: otherUid,
        username: "",
        displayName: "Kullanıcı",
        profilePic: "https://i.hizliresim.com/ntdyvrh.jpg",
      }
    );
  };

  const getFriendCount = async (uid: string) => {
    try {
      const snap = await getDoc(getFriendsMetaRef(uid));
      if (!snap.exists()) return 0;
      const data = snap.data() as any;
      const friends = normalizeUidArray(data?.friends);
      return friends.length;
    } catch {
      return null;
    }
  };

  const isBlockedByTarget = async (targetUid: string) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return false;
    if (targetUser?.uid === targetUid && Array.isArray(targetUser?.blocked)) {
      return targetUser.blocked.includes(myUid);
    }
    try {
      const snap = await getDoc(getFriendsMetaRef(targetUid));
      if (!snap.exists()) return false;
      const data = snap.data() as any;
      const blocked = normalizeUidArray(data?.blocked);
      return blocked.includes(myUid);
    } catch {
      return false;
    }
  };

  const markDmAsRead = async (threadId: string) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return;
    const inboxRow = dmInboxes.find((row) => row.id === threadId);
    if (inboxRow && (!inboxRow.unreadCount || inboxRow.unreadCount <= 0)) {
      return;
    }
    await markDmReadService(threadId, myUid, BACKEND_URL).catch(() => {});
  };
  const refreshDmInboxNow = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const rows = await fetchDmInboxService(uid, BACKEND_URL);
      const visible = filterVisibleDmInboxes(rows, closedDmIdsRef.current);
      setDmInboxes((prev) => (sameDmRows(prev, visible) ? prev : visible));
    } catch {}
  };
  const openCreateGroupModal = () => {
    setGroupCreateError("");
    setGroupNameRequiredError(false);
    setGroupNameInput("");
    setGroupMemberUids([]);
    setShowCreateGroupModal(true);
  };
  const triggerGroupNameRequiredError = () => {
    if (groupNameRequiredTimerRef.current != null) {
      window.clearTimeout(groupNameRequiredTimerRef.current);
      groupNameRequiredTimerRef.current = null;
    }
    setGroupNameRequiredError(false);
    window.requestAnimationFrame(() => {
      setGroupNameRequiredError(true);
      groupNameRequiredTimerRef.current = window.setTimeout(() => {
        setGroupNameRequiredError(false);
        groupNameRequiredTimerRef.current = null;
      }, 1500);
    });
  };
  const toggleGroupMember = (uid: string) => {
    setGroupMemberUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((x) => x !== uid);
      }
      if (prev.length >= GROUP_MEMBER_SELECT_LIMIT) {
        setGroupCreateError("En fazla 11 üye seçebilirsin (toplam 12 kişi).");
        return prev;
      }
      if (groupCreateError) setGroupCreateError("");
      return [...prev, uid];
    });
  };
  const createGroupNow = async () => {
    const ownerUid = auth.currentUser?.uid;
    const name = groupNameInput.trim();
    const members = Array.from(new Set(groupMemberUids.filter(Boolean)));
    if (!ownerUid) return;
    if (!name) {
      triggerGroupNameRequiredError();
      return;
    }
    setGroupCreateLoading(true);
    setGroupCreateError("");
    try {
      const body = await createGroupService(
        ownerUid,
        name,
        members,
        BACKEND_URL,
      );
      const conversationId = String(body?.conversationId || "");
      await refreshDmInboxNow();
      setShowCreateGroupModal(false);
      if (conversationId) {
        setDmSection("friends");
        setActiveDmId(conversationId);
        setActiveDmUser({
          uid: `group:${conversationId}`,
          isGroup: true,
          conversationId,
          displayName: name,
          username: name,
          profilePic: "/group-default.svg",
        });
      }
    } catch {
      setGroupCreateError("Grup oluşturulamadı.");
    } finally {
      setGroupCreateLoading(false);
    }
  };
  const openGroupSettingsForActive = () => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId) return;
    const row = dmInboxes.find(
      (x) => String(x?.id || "") === String(activeDmId),
    );
    if (String(row?.type || "") !== "group") return;
    const mine = (conversationParticipants[activeDmId] || []).find(
      (p: any) => String(p?.uid || "") === myUid,
    );
    if (String(mine?.role || "") !== "owner") {
      showLoginError("Sadece grup sahibi bu ayarı düzenleyebilir.");
      return;
    }
    setGroupSettingsError("");
    setGroupSettingsNameInput(String(row?.groupName || "").trim());
    setGroupSettingsAvatarInput(String(row?.groupAvatarUrl || "").trim());
    setPendingGroupAvatar(null);
    setGroupSettingsSendPolicy(
      String(row?.groupSendPolicy || "all_members") === "owner_only"
        ? "owner_only"
        : "all_members",
    );
    setShowGroupSettingsModal(true);
  };
  const openAddGroupMembersModal = () => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId) return;
    const row = dmInboxes.find(
      (x) => String(x?.id || "") === String(activeDmId),
    );
    if (String(row?.type || "") !== "group") return;
    const mine = (conversationParticipants[activeDmId] || []).find(
      (p: any) => String(p?.uid || "") === myUid,
    );
    if (String(mine?.role || "") !== "owner") {
      showLoginError("Sadece grup sahibi üye ekleyebilir.");
      return;
    }
    setGroupAddMembersError("");
    setGroupAddMemberUids([]);
    setShowAddGroupMembersModal(true);
  };
  const toggleAddGroupMember = (uid: string) => {
    const currentCount = Array.isArray(
      conversationParticipants[activeDmId || ""],
    )
      ? conversationParticipants[activeDmId || ""].length
      : Number(activeGroupInboxRow?.memberCount || 0);
    const availableSlots = Math.max(0, GROUP_MAX_PARTICIPANTS - currentCount);
    setGroupAddMemberUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((x) => x !== uid);
      }
      if (prev.length >= availableSlots) {
        setGroupAddMembersError(
          `Bu grupta en fazla ${GROUP_MAX_PARTICIPANTS} üye olabilir.`,
        );
        return prev;
      }
      if (groupAddMembersError) setGroupAddMembersError("");
      return [...prev, uid];
    });
  };
  const addMembersToActiveGroup = async () => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId) return;
    if (groupAddMemberUids.length === 0) {
      setGroupAddMembersError("En az bir üye seçmelisin.");
      return;
    }
    setGroupAddMembersLoading(true);
    setGroupAddMembersError("");
    try {
      await addGroupMembersService(
        activeDmId,
        myUid,
        Array.from(new Set(groupAddMemberUids.filter(Boolean))),
        Object.fromEntries(
          addGroupCandidates
            .filter((u: any) =>
              groupAddMemberUids.includes(String(u?.uid || "")),
            )
            .map((u: any) => [
              String(u?.uid || ""),
              String(u?.displayName || u?.username || u?.uid || "").trim(),
            ]),
        ),
        BACKEND_URL,
      );
      await refreshDmInboxNow();
      const rows = await fetchConversationParticipantsService(
        activeDmId,
        myUid,
        BACKEND_URL,
      );
      setConversationParticipants((prev) => ({
        ...prev,
        [activeDmId]: rows || [],
      }));
      setShowAddGroupMembersModal(false);
    } catch {
      setGroupAddMembersError("Üyeler eklenemedi.");
    } finally {
      setGroupAddMembersLoading(false);
    }
  };
  useEffect(() => {
    return () => {
      if (groupNameRequiredTimerRef.current != null) {
        window.clearTimeout(groupNameRequiredTimerRef.current);
      }
    };
  }, []);
  const saveGroupSettingsNow = async () => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId) return;
    const name = groupSettingsNameInput.trim();
    if (!name) {
      setGroupSettingsError("Grup adı zorunlu.");
      return;
    }
    setGroupSettingsSaving(true);
    setGroupSettingsError("");
    try {
      let nextAvatarUrl = groupSettingsAvatarInput.trim();
      if (pendingGroupAvatar) {
        nextAvatarUrl = await uploadToCloudinary(
          pendingGroupAvatar,
          `piksel/groups/${activeDmId}/avatar`,
        );
      }
      await updateGroupSettingsService(
        activeDmId,
        myUid,
        {
          name,
          avatarUrl: nextAvatarUrl,
          sendPolicy: groupSettingsSendPolicy,
        },
        BACKEND_URL,
      );
      await refreshDmInboxNow();
      setActiveDmUser((prev: any) =>
        prev?.isGroup
          ? {
              ...prev,
              displayName: name,
              username: name,
              profilePic: nextAvatarUrl || "/group-default.svg",
            }
          : prev,
      );
      setShowGroupSettingsModal(false);
    } catch {
      setGroupSettingsError("Grup ayarları kaydedilemedi.");
    } finally {
      setGroupSettingsSaving(false);
    }
  };
  const upsertDmInboxTop = (conversationId: string, otherUid: string) => {
    if (!conversationId || !otherUid) return;
    setDmInboxes((prev) => {
      const base = Array.isArray(prev) ? [...prev] : [];
      const filtered = base.filter(
        (row) => String(row?.id || "") !== conversationId,
      );
      const topRow = {
        id: conversationId,
        otherUid,
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      };
      return [topRow, ...filtered];
    });
  };

  const openDmWithUser = async (
    u: any,
    opts?: { autoOpenBoth?: boolean; openScreen?: boolean },
  ) => {
    const myUid = auth.currentUser?.uid;
    const otherUid = u?.uid;
    if (!myUid || !otherUid) return;
    if (myUid === otherUid) return;

    let body: any = null;
    try {
      body = await openDmService(myUid, otherUid, BACKEND_URL, opts);
    } catch {
      showLoginError("Sohbet açilamadı.");
      return;
    }
    const threadId =
      body?.conversationId || getDmThreadIdService(myUid, otherUid);
    setClosedDmIds((prev) => {
      if (!prev[threadId]) return prev;
      const next = { ...prev };
      delete next[threadId];
      closedDmIdsRef.current = next;
      if (auth.currentUser?.uid) {
        writeClosedDmIds(auth.currentUser.uid, next);
      }
      return next;
    });

    upsertDmInboxTop(threadId, otherUid);
    await refreshDmInboxNow();
    if (opts?.openScreen === false) return;
    setDmSection("friends");
    setActiveDmId(threadId);
    setActiveDmUser(u);
    setDmComposer("");
    setEditingDmMessageId(null);
    setEditingDmText("");
    chatSocketRef.current?.emit("chat:join_conversation", {
      conversationId: threadId,
    });
    await markDmAsRead(threadId);
  };

  const openDmFromInbox = async (row: any) => {
    const u = buildActiveUserFromInboxRow(row);
    if (!u) return;
    setClosedDmIds((prev) => {
      if (!prev[row.id]) return prev;
      const next = { ...prev };
      delete next[row.id];
      closedDmIdsRef.current = next;
      if (auth.currentUser?.uid) {
        writeClosedDmIds(auth.currentUser.uid, next);
      }
      return next;
    });
    setDmSection("friends");
    setActiveDmId(row.id);
    setActiveDmUser(u);
    setDmComposer("");
    setEditingDmMessageId(null);
    setEditingDmText("");
    await markDmAsRead(row.id);
  };

  const emitTypingStop = (conversationId?: string | null) => {
    const socket = chatSocketRef.current;
    const uid = auth.currentUser?.uid;
    const targetConversationId = conversationId ?? activeDmId;
    if (!targetConversationId) return;

    const isSameConversation =
      String(localTypingStateRef.current.conversationId || "") ===
      String(targetConversationId);
    if (!localTypingStateRef.current.active || !isSameConversation) {
      if (typingStopTimerRef.current != null) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      return;
    }

    localTypingStateRef.current = {
      conversationId: targetConversationId,
      active: false,
      lastStartAt: 0,
    };

    if (typingStopTimerRef.current != null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }

    if (!socket || !uid) return;
    socket.emit("chat:typing_stop", {
      conversationId: targetConversationId,
      uid,
    });
  };

  const scheduleTypingStop = (conversationId: string) => {
    if (typingStopTimerRef.current != null) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    typingStopTimerRef.current = window.setTimeout(() => {
      emitTypingStop(conversationId);
    }, 1000);
  };

  const handleDmComposerChange = (value: string) => {
    const socket = chatSocketRef.current;
    const uid = auth.currentUser?.uid;
    const conversationId = activeDmId;
    if (!conversationId) return;

    const hasText = sanitizePlainText(value, 2000).trim().length > 0;
    if (!hasText) {
      emitTypingStop(conversationId);
      return;
    }

    const sameConversation =
      String(localTypingStateRef.current.conversationId || "") ===
      String(conversationId);
    const now = Date.now();
    const shouldEmitStart =
      !localTypingStateRef.current.active ||
      !sameConversation ||
      now - Number(localTypingStateRef.current.lastStartAt || 0) >= 1000;

    if (shouldEmitStart) {
      localTypingStateRef.current = {
        conversationId,
        active: true,
        lastStartAt: now,
      };
      if (socket && uid) {
        socket.emit("chat:typing_start", { conversationId, uid });
      }
    }

    scheduleTypingStop(conversationId);
  };

  const handleDmComposerBlur = () => {
    emitTypingStop(activeDmId);
  };

  const closeDmFromList = useCallback(
    (conversationId: string) => {
      if (!conversationId) return;
      const row = dmInboxes.find(
        (x) => String(x?.id || "") === String(conversationId),
      );
      const isGroup = String(row?.type || "") === "group";
      const myUid = auth.currentUser?.uid;
      const isClosingActive =
        String(activeDmId || "") === String(conversationId);

      const cleanupActive = () => {
        if (!isClosingActive) return;
        dmRestoreTargetRef.current = null;
        dmLastSavedStateRef.current = null;
        setActiveDmId(null);
        setActiveDmUser(null);
        setEditingDmMessageId(null);
        setEditingDmText("");
        setDmComposer("");
        setDmMessages([]);
        setDmSection("friends");
        setFriendsTab("pending");
        if (myUid) {
          void saveDmStateService(myUid, null, undefined, BACKEND_URL).catch(
            () => {},
          );
        }
      };

      if (isGroup && myUid) {
        setConfirmModal({
          show: true,
          title: "Gruptan Ayrıl",
          message: "Gruptan ayrılmak istediğine emin misin?",
          confirmText: "Evet, ayrıl",
          onConfirm: async () => {
            try {
              await leaveGroupService(
                conversationId,
                myUid,
                String(displayName || username || myUid || "").trim(),
                BACKEND_URL,
              );
            } catch {}
            setDmInboxes((prev) =>
              prev.filter(
                (item) => String(item?.id || "") !== String(conversationId),
              ),
            );
            setConversationParticipants((prev) => {
              const next = { ...prev };
              delete next[conversationId];
              return next;
            });
            cleanupActive();
            await refreshDmInboxNow();
          },
          onCancel: () => {},
        });
        return;
      }

      setClosedDmIds((prev) => {
        const next = { ...prev, [conversationId]: Date.now() };
        closedDmIdsRef.current = next;
        if (myUid) {
          writeClosedDmIds(myUid, next);
        }
        return next;
      });
      setDmInboxes((prev) =>
        prev.filter(
          (item) => String(item?.id || "") !== String(conversationId),
        ),
      );
      cleanupActive();
    },
    [activeDmId, dmInboxes],
  );

  const persistGroupMembersPanel = useCallback(
    (collapsed: boolean) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      void saveDmStateService(
        uid,
        dmSection === "friends" ? activeDmId || null : null,
        { groupMembersCollapsed: collapsed },
        BACKEND_URL,
      ).catch(() => {});
    },
    [auth.currentUser?.uid, dmSection, activeDmId],
  );

  const toggleGroupMembersCollapsed = useCallback(() => {
    setGroupMembersCollapsed((prev) => {
      const next = !prev;
      persistGroupMembersPanel(next);
      return next;
    });
  }, [persistGroupMembersPanel]);

  const requestKickGroupMember = useCallback(
    (member: any) => {
      const myUid = auth.currentUser?.uid;
      if (!myUid || !activeDmId || !activeDmUser?.isGroup) return;
      const mine = (conversationParticipants[activeDmId] || []).find(
        (p: any) => String(p?.uid || "") === String(myUid),
      );
      const isOwnerNow = String(mine?.role || "") === "owner";
      if (!isOwnerNow) return;
      const targetUid = String(member?.uid || "");
      if (!targetUid || targetUid === myUid) return;
      const targetName =
        member?.user?.displayName || member?.user?.username || "Bu kullanıcı";
      setConfirmModal({
        show: true,
        title: "Gruptan At",
        message: `${targetName} kullanıcısını gruptan atmak istediğine emin misin?`,
        confirmText: "Evet, at",
        onConfirm: async () => {
          try {
            await kickGroupMemberService(
              activeDmId,
              myUid,
              targetUid,
              String(targetName || targetUid || "").trim(),
              BACKEND_URL,
            );
            setConversationParticipants((prev) => {
              const current = Array.isArray(prev[activeDmId])
                ? prev[activeDmId]
                : [];
              return {
                ...prev,
                [activeDmId]: current.filter(
                  (p: any) => String(p?.uid || "") !== String(targetUid),
                ),
              };
            });
            await refreshDmInboxNow();
          } catch {
            setErrorPopup({ show: true, msg: "Kullanıcı gruptan atılamadı." });
          }
        },
        onCancel: () => {},
      });
    },
    [
      auth.currentUser?.uid,
      activeDmId,
      activeDmUser,
      conversationParticipants,
      refreshDmInboxNow,
    ],
  );

  const processDmSendQueue = async () => {
    if (dmSendWorkerRunningRef.current) return;
    dmSendWorkerRunningRef.current = true;
    try {
      while (dmSendQueueRef.current.length > 0) {
        const job = dmSendQueueRef.current[0];
        try {
          let encryptedPayload: Record<string, any> | null = null;
          if (isE2eeConversation(job.conversationId)) {
            await ensureAndRegisterE2eeIdentity(job.senderId, BACKEND_URL);
            const recipientKeys = await getE2eeRecipientPublicKeys(
              job.conversationId,
              job.senderId,
            );
            const hasSelf = recipientKeys.some(
              (x) => String(x.uid) === String(job.senderId),
            );
            if (!hasSelf) {
              throw new Error("E2EE_SELF_KEY_MISSING");
            }
            const encrypted = await encryptE2eeTextForRecipients(
              job.text,
              recipientKeys,
            );
            encryptedPayload = encrypted;
          }
          const body = await sendDmService(
            job.conversationId,
            job.senderId,
            job.text,
            job.clientNonce,
            encryptedPayload,
            BACKEND_URL,
          );
          const msg = body?.message;
          if (msg) {
            const safeMsg = await decryptDmMessageForUid(msg, job.senderId);
            setDmMessages((prev) => {
              const localIndex = prev.findIndex(
                (m) => String(m.id) === String(job.localId),
              );
              if (localIndex >= 0) {
                const next = [...prev];
                next[localIndex] = safeMsg;
                return next;
              }
              const exists = prev.some(
                (m) => String(m.id) === String(safeMsg.id),
              );
              if (exists) return prev;
              return [...prev, safeMsg];
            });
          }
        } catch (err: any) {
          const errMessage = String(err?.message || "");
          const isMissingE2eeKey =
            errMessage.startsWith("E2EE_PARTICIPANT_KEY_MISSING") ||
            errMessage === "E2EE_PARTICIPANTS_EMPTY";
          if (isMissingE2eeKey) {
            setDmMessages((prev) =>
              prev.map((m) =>
                String(m.id) === String(job.localId)
                  ? { ...m, isPending: false, isFailed: true }
                  : m,
              ),
            );
            showLoginError(
              "Mesaj gonderilemedi: Sohbetteki bir kullanicinin sifreleme anahtari hazir degil.",
            );
            continue;
          }
          const shouldRetry = (job.retryCount || 0) < 2;
          if (shouldRetry) {
            dmSendQueueRef.current[0] = {
              ...job,
              retryCount: (job.retryCount || 0) + 1,
            };
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            continue;
          }
          setDmMessages((prev) =>
            prev.map((m) =>
              String(m.id) === String(job.localId)
                ? { ...m, isPending: false, isFailed: true }
                : m,
            ),
          );
          showLoginError("Bazı mesajlar gönderilemedi.");
        } finally {
          if (
            dmSendQueueRef.current[0] &&
            String(dmSendQueueRef.current[0].localId) === String(job.localId)
          ) {
            dmSendQueueRef.current.shift();
          }
        }
      }
    } finally {
      dmSendWorkerRunningRef.current = false;
    }
  };

  const sendDmMessage = async (textOverride?: string) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId) return;
    const sourceText =
      typeof textOverride === "string" ? textOverride : dmComposer;
    const text = sanitizePlainText(sourceText, 2000).trim();
    if (!text) return;
    const isGroupConversation = !!activeDmUser?.isGroup;
    const targetUid = String(activeDmUser?.uid || "");
    const blockedByMe =
      !isGroupConversation && targetUid ? isBlockedUser(targetUid) : false;
    const blockedByTarget =
      !isGroupConversation && targetUid
        ? blockedByMe
          ? false
          : await isBlockedByTarget(targetUid)
        : false;
    if (isGroupConversation && isGroupSendLocked) {
      emitTypingStop(activeDmId);
      const nowIso = new Date().toISOString();
      const localBlockedUserId = `local-group-locked-user-${Date.now()}-${dmLocalMessageCounterRef.current++}`;
      const localBlockedNoticeId = `local-group-locked-notice-${Date.now()}-${dmLocalMessageCounterRef.current++}`;
      const noticeText =
        "Mesajın iletilemedi. Bu grupta sadece grup sahibi mesaj gönderebilir.";
      setDmMessages((prev) => [
        ...prev,
        {
          id: localBlockedUserId,
          conversationId: activeDmId,
          senderId: myUid,
          text,
          createdAt: nowIso,
          editedAt: null,
          isEdited: false,
          isPending: false,
          isFailed: true,
          isLocalOnly: true,
          localFailureType: "group_owner_only",
        },
        {
          id: localBlockedNoticeId,
          conversationId: activeDmId,
          senderId: "__pengi__",
          text: noticeText,
          createdAt: nowIso,
          editedAt: null,
          isEdited: false,
          isPending: false,
          isFailed: false,
          isLocalOnly: true,
          isSystemNotice: true,
          localFailureType: "blocked_notice",
        },
      ]);
      setDmComposer("");
      return;
    }
    if (blockedByMe || blockedByTarget) {
      emitTypingStop(activeDmId);
      const nowIso = new Date().toISOString();
      const localBlockedUserId = `local-blocked-user-${Date.now()}-${dmLocalMessageCounterRef.current++}`;
      const localBlockedNoticeId = `local-blocked-notice-${Date.now()}-${dmLocalMessageCounterRef.current++}`;
      const noticeText = blockedByMe
        ? "Mesajın iletilemedi. Bu kullanıcıyı engellediğin için bu sohbete mesaj gönderemezsin."
        : "Mesajın iletilemedi. Alıcı seni engellediği veya sadece arkadaşlarından DM kabul ettiği için bu mesaj teslim edilemedi.";
      setDmMessages((prev) => [
        ...prev,
        {
          id: localBlockedUserId,
          conversationId: activeDmId,
          senderId: myUid,
          text,
          createdAt: nowIso,
          editedAt: null,
          isEdited: false,
          isPending: false,
          isFailed: true,
          isLocalOnly: true,
          localFailureType: "blocked_user",
        },
        {
          id: localBlockedNoticeId,
          conversationId: activeDmId,
          senderId: "__pengi__",
          text: noticeText,
          createdAt: nowIso,
          editedAt: null,
          isEdited: false,
          isPending: false,
          isFailed: false,
          isLocalOnly: true,
          isSystemNotice: true,
          localFailureType: "blocked_notice",
        },
      ]);
      setDmComposer("");
      return;
    }
    emitTypingStop(activeDmId);
    const localId = `local-${Date.now()}-${dmLocalMessageCounterRef.current++}`;
    const clientNonce =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    dmStickToBottomRef.current = true;
    setDmMessages((prev) => [
      ...prev,
      {
        id: localId,
        clientNonce,
        conversationId: activeDmId,
        senderId: myUid,
        text,
        createdAt: new Date().toISOString(),
        editedAt: null,
        isEdited: false,
        isPending: true,
        isFailed: false,
      },
    ]);
    setDmComposer("");
    dmSendQueueRef.current.push({
      localId,
      clientNonce,
      conversationId: activeDmId,
      senderId: myUid,
      text,
      retryCount: 0,
    });
    void processDmSendQueue();
  };

  const startEditDmMessage = (msg: any) => {
    setDmActionMenuMessageId(null);
    setDeleteConfirmDmMessageId(null);
    setEditingDmMessageId(msg.id);
    const rawText = String(msg?.text || "");
    const cleanText = rawText.replace(/\s*\(d\u00fczenlendi\)\s*$/i, "");
    setEditingDmText(cleanText);
  };

  const cancelEditDmMessage = () => {
    setEditingDmMessageId(null);
    setEditingDmText("");
  };

  const saveEditDmMessage = async () => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId || !editingDmMessageId) return;
    const nextText = sanitizePlainText(editingDmText, 2000).trim();
    if (!nextText) {
      showLoginError("Mesaj bos birakilamaz.");
      return;
    }

    const target = dmMessages.find(
      (m) => String(m.id) === String(editingDmMessageId),
    );
    if (!target || target.senderId !== myUid) return;

    try {
      let encryptedPayload: Record<string, any> | null = null;
      if (isE2eeConversation(activeDmId)) {
        await ensureAndRegisterE2eeIdentity(myUid, BACKEND_URL);
        const recipientKeys = await getE2eeRecipientPublicKeys(
          activeDmId,
          myUid,
        );
        const hasSelf = recipientKeys.some(
          (x) => String(x.uid) === String(myUid),
        );
        if (!hasSelf) throw new Error("E2EE_SELF_KEY_MISSING");
        encryptedPayload = await encryptE2eeTextForRecipients(
          nextText,
          recipientKeys,
        );
      }
      const body = await updateDmService(
        String(editingDmMessageId),
        activeDmId,
        myUid,
        nextText,
        encryptedPayload,
        BACKEND_URL,
      );
      const msg = body?.message;
      if (msg) {
        const safeMsg = await decryptDmMessageForUid(msg, myUid);
        setDmMessages((prev) =>
          prev.map((m) => (String(m.id) === String(safeMsg.id) ? safeMsg : m)),
        );
      }
      setEditingDmMessageId(null);
      setEditingDmText("");
    } catch (err: any) {
      const errMessage = String(err?.message || "");
      if (
        errMessage.startsWith("E2EE_PARTICIPANT_KEY_MISSING") ||
        errMessage === "E2EE_PARTICIPANTS_EMPTY"
      ) {
        showLoginError(
          "Mesaj duzenlenemedi: Sohbetteki bir kullanicinin sifreleme anahtari hazir degil.",
        );
        return;
      }
      showLoginError("Mesaj düzenlenemedi.");
    }
  };

  const formatDmTime = (value: any) => {
    if (!value) return "";
    let ms = 0;
    if (typeof value === "string") ms = new Date(value).getTime();
    else if (typeof value === "number") ms = value;
    if (!ms) return "";
    const d = new Date(ms);
    return d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const deleteDmMessage = async (msg: any) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId) return;
    if (!msg?.id) return;
    if (!msg?.isLocalOnly && msg?.senderId !== myUid) return;

    if (msg?.isLocalOnly) {
      setDmMessages((prev) =>
        prev.filter((m) => String(m.id) !== String(msg.id)),
      );
      setDeleteConfirmDmMessageId((prev) =>
        prev && String(prev) === String(msg.id) ? null : prev,
      );
      return;
    }

    try {
      await deleteDmService(String(msg.id), activeDmId, myUid, BACKEND_URL);
      setDmMessages((prev) =>
        prev.filter((m) => String(m.id) !== String(msg.id)),
      );
      setDeleteConfirmDmMessageId((prev) =>
        prev && String(prev) === String(msg.id) ? null : prev,
      );
    } catch {
      showLoginError("Mesaj silinemedi.");
    }
  };

  const requestDeleteDmMessage = async (msg: any, shiftPressed: boolean) => {
    setDmActionMenuMessageId(null);
    if (shiftPressed) {
      await deleteDmMessage(msg);
      return;
    }
    setDeleteConfirmDmMessageId((prev) =>
      prev && String(prev) === String(msg.id) ? null : String(msg.id),
    );
  };

  const retryDmMessage = (msg: any) => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId || !msg?.id) return;
    if (msg?.isLocalOnly || msg?.localFailureType === "blocked_notice") return;
    const failedText = sanitizePlainText(String(msg.text || ""), 2000).trim();
    if (!failedText) return;
    const clientNonce =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setDmMessages((prev) =>
      prev.map((m) =>
        String(m.id) === String(msg.id)
          ? { ...m, clientNonce, isPending: true, isFailed: false }
          : m,
      ),
    );
    dmSendQueueRef.current.push({
      localId: String(msg.id),
      clientNonce,
      conversationId: activeDmId,
      senderId: myUid,
      text: failedText,
      retryCount: 0,
    });
    void processDmSendQueue();
  };

  const handleDmSectionFriendsClick = useCallback(() => {
    setDmSection("friends");
    setActiveDmId(null);
    setActiveDmUser(null);
    setEditingDmMessageId(null);
    setEditingDmText("");
  }, []);

  const createGroupCandidates = useMemo(() => {
    return Object.values(friendUsers || {})
      .filter((u: any) => !!u?.uid && u.uid !== auth.currentUser?.uid)
      .sort((a: any, b: any) => {
        const an = String(
          a?.displayName || a?.username || "",
        ).toLocaleLowerCase("tr-TR");
        const bn = String(
          b?.displayName || b?.username || "",
        ).toLocaleLowerCase("tr-TR");
        return an.localeCompare(bn, "tr-TR");
      });
  }, [friendUsers, auth.currentUser?.uid]);

  const activeGroupMemberUidSet = useMemo(() => {
    if (!activeDmId || !activeDmUser?.isGroup) return new Set<string>();
    const members = conversationParticipants[activeDmId] || [];
    return new Set(
      members
        .map((m: any) => String(m?.uid || "").trim())
        .filter((x: string) => x.length > 0),
    );
  }, [activeDmId, activeDmUser, conversationParticipants]);

  const addGroupCandidates = useMemo(() => {
    if (!activeDmUser?.isGroup) return [] as any[];
    return Object.values(friendUsers || {})
      .filter((u: any) => {
        const uid = String(u?.uid || "");
        if (!uid || uid === auth.currentUser?.uid) return false;
        return !activeGroupMemberUidSet.has(uid);
      })
      .sort((a: any, b: any) => {
        const an = String(
          a?.displayName || a?.username || "",
        ).toLocaleLowerCase("tr-TR");
        const bn = String(
          b?.displayName || b?.username || "",
        ).toLocaleLowerCase("tr-TR");
        return an.localeCompare(bn, "tr-TR");
      });
  }, [
    activeDmUser,
    friendUsers,
    auth.currentUser?.uid,
    activeGroupMemberUidSet,
  ]);

  const copyDmMessageId = async (messageId: string) => {
    try {
      await navigator.clipboard.writeText(String(messageId));
      showLoginError("Mesaj ID kopyalandi.");
    } catch {
      showLoginError("Mesaj ID kopyalanamadı.");
    }
  };

  const formatDmEditedAt = (value: any) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDmSenderForMessage = (m: any) => {
    if (m?.senderId === "__pengi__" || m?.isSystemNotice) {
      return {
        name: "Pengi",
        username: "pengi",
        avatar: safeImageSrc("server-dot.png", "server-dot.png"),
      };
    }
    const mine = m?.senderId === auth.currentUser?.uid;
    if (mine) {
      return {
        name: displayName || username || "Sen",
        username: username || auth.currentUser?.uid || "sen",
        avatar: safeImageSrc(
          effectiveProfilePic,
          "https://i.hizliresim.com/ntdyvrh.jpg",
        ),
      };
    }
    const senderUid = String(m?.senderId || "");
    const senderUser = dmUsers[senderUid] || friendUsers[senderUid];
    if (senderUser) {
      return {
        name: senderUser.displayName || senderUser.username || "Kullanıcı",
        username: senderUser.username || "Kullanıcı",
        avatar: safeImageSrc(
          senderUser.profilePic || senderUser.photoURL,
          "https://i.hizliresim.com/ntdyvrh.jpg",
        ),
      };
    }
    return {
      name: activeDmUser?.isGroup
        ? senderUid || "Kullanıcı"
        : activeDmUser?.displayName || activeDmUser?.username || "Kullanıcı",
      username: activeDmUser?.isGroup
        ? senderUid || "Kullanıcı"
        : activeDmUser?.username || "Kullanıcı",
      avatar: activeDmUser?.isGroup
        ? safeImageSrc("https://i.hizliresim.com/ntdyvrh.jpg")
        : safeImageSrc(
            activeDmUser?.profilePic || activeDmUser?.photoURL,
            "https://i.hizliresim.com/ntdyvrh.jpg",
          ),
    };
  };

  const getDmSenderUserForMessage = (m: any) => {
    const senderId = String(m?.senderId || "");
    if (!senderId || senderId === "__pengi__") return null;
    if (senderId === auth.currentUser?.uid) {
      return {
        uid: auth.currentUser?.uid,
        username,
        displayName: displayName || username || "Sen",
        profilePic: effectiveProfilePic,
        photoURL: effectiveProfilePic,
        status: userStatus,
        presence,
        lastActive,
      };
    }
    return (
      dmUsers?.[senderId] ||
      friendUsers?.[senderId] || {
        uid: senderId,
        username: senderId,
        displayName: senderId,
        profilePic: "https://i.hizliresim.com/ntdyvrh.jpg",
        photoURL: "https://i.hizliresim.com/ntdyvrh.jpg",
      }
    );
  };

  const getDmUserByUid = (uid: string) => {
    const targetUid = String(uid || "").trim();
    if (!targetUid) return null;
    if (targetUid === auth.currentUser?.uid) {
      return {
        uid: auth.currentUser?.uid,
        username,
        displayName: displayName || username || "Sen",
        profilePic: effectiveProfilePic,
        photoURL: effectiveProfilePic,
        status: userStatus,
        presence,
        lastActive,
      };
    }
    return (
      dmUsers?.[targetUid] ||
      friendUsers?.[targetUid] || {
        uid: targetUid,
        username: targetUid,
        displayName: targetUid,
        profilePic: "https://i.hizliresim.com/ntdyvrh.jpg",
        photoURL: "https://i.hizliresim.com/ntdyvrh.jpg",
      }
    );
  };

  const deleteConfirmMessage = deleteConfirmDmMessageId
    ? dmMessages.find(
        (m) => String(m.id) === String(deleteConfirmDmMessageId),
      ) || null
    : null;
  const deleteConfirmSender = deleteConfirmMessage
    ? getDmSenderForMessage(deleteConfirmMessage)
    : null;
  const deleteConfirmTime = deleteConfirmMessage
    ? formatDmTime(deleteConfirmMessage.createdAt)
    : "";

  const activeGroupMembers = useMemo(() => {
    if (!activeDmId || !activeDmUser?.isGroup) return [] as any[];
    const members = conversationParticipants[activeDmId] || [];
    const list = members
      .map((p: any) => {
        const uid = String(p?.uid || "");
        if (!uid) return null;
        const user = dmUsers?.[uid] ||
          friendUsers?.[uid] || { uid, username: uid };
        const state = presenceByUid?.[uid];
        const livePresence = String(state?.presence || "").toLowerCase();
        const isOnlineNow = livePresence === "online";
        const status = String(state?.status || user?.status || "online");
        const effective = isOnlineNow ? status : "offline";
        return {
          uid,
          role: String(p?.role || "member"),
          canSend: Boolean(p?.canSend),
          user,
          customStatus: String(
            state?.customStatus || user?.customStatus || "",
          ).trim(),
          effectiveStatus: effective,
          sortKey: String(
            user?.displayName || user?.username || uid,
          ).toLocaleLowerCase("tr-TR"),
        };
      })
      .filter(Boolean) as any[];
    return list
      .filter((x) => x.effectiveStatus !== "offline")
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "tr-TR"));
  }, [
    activeDmId,
    activeDmUser,
    conversationParticipants,
    dmUsers,
    friendUsers,
    presenceByUid,
  ]);

  const offlineGroupMembers = useMemo(() => {
    if (!activeDmId || !activeDmUser?.isGroup) return [] as any[];
    const members = conversationParticipants[activeDmId] || [];
    const list = members
      .map((p: any) => {
        const uid = String(p?.uid || "");
        if (!uid) return null;
        const user = dmUsers?.[uid] ||
          friendUsers?.[uid] || { uid, username: uid };
        const state = presenceByUid?.[uid];
        const livePresence = String(state?.presence || "").toLowerCase();
        const isOnlineNow = livePresence === "online";
        const status = String(state?.status || user?.status || "online");
        const effective = isOnlineNow ? status : "offline";
        return {
          uid,
          role: String(p?.role || "member"),
          canSend: Boolean(p?.canSend),
          user,
          customStatus: String(
            state?.customStatus || user?.customStatus || "",
          ).trim(),
          effectiveStatus: effective,
          sortKey: String(
            user?.displayName || user?.username || uid,
          ).toLocaleLowerCase("tr-TR"),
        };
      })
      .filter(Boolean) as any[];
    return list
      .filter((x) => x.effectiveStatus === "offline")
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "tr-TR"));
  }, [
    activeDmId,
    activeDmUser,
    conversationParticipants,
    dmUsers,
    friendUsers,
    presenceByUid,
  ]);

  const isActiveGroupOwner = useMemo(() => {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !activeDmId || !activeDmUser?.isGroup) return false;
    const mine = (conversationParticipants[activeDmId] || []).find(
      (p: any) => String(p?.uid || "") === myUid,
    );
    return String(mine?.role || "") === "owner";
  }, [
    auth.currentUser?.uid,
    activeDmId,
    activeDmUser,
    conversationParticipants,
  ]);

  const activeGroupInboxRow = useMemo(() => {
    if (!activeDmId || !activeDmUser?.isGroup) return null;
    return (
      dmInboxes.find((row) => String(row?.id || "") === String(activeDmId)) ||
      null
    );
  }, [activeDmId, activeDmUser, dmInboxes]);

  const isGroupSendLocked = useMemo(() => {
    if (!activeGroupInboxRow || !activeDmUser?.isGroup) return false;
    return activeGroupInboxRow.myCanSend === false;
  }, [activeGroupInboxRow, activeDmUser]);

  const groupMembersSorted = useMemo(() => {
    if (!activeDmUser?.isGroup) return [] as any[];
    return [...activeGroupMembers, ...offlineGroupMembers];
  }, [activeDmUser, activeGroupMembers, offlineGroupMembers]);

  const serverUnreadRows = useMemo(() => {
    return (dmInboxes || [])
      .filter((row) => Number(row?.unreadCount || 0) > 0)
      .map((row) => {
        const isGroup = String(row?.type || "") === "group";
        const otherUid = String(row?.otherUid || "");
        const u = isGroup
          ? null
          : dmUsers?.[otherUid] ||
            friendUsers?.[otherUid] || {
              uid: otherUid,
              username: "",
              displayName: "Kullanıcı",
              profilePic: "https://i.hizliresim.com/ntdyvrh.jpg",
            };
        const label = isGroup
          ? String(row?.groupName || "").trim() || "Yeni Grup"
          : String(u?.displayName || u?.username || "Kullanıcı").trim();
        return {
          id: String(row?.id || ""),
          isGroup,
          otherUid,
          unreadCount: Number(row?.unreadCount || 0),
          user: u,
          label,
          sourceRow: row,
        };
      })
      .filter((x) => x.id)
      .slice(0, 5);
  }, [dmInboxes, dmUsers, friendUsers]);
  const remoteTypingLabel = useMemo(() => {
    const names = remoteTypingUids
      .map((uid) => {
        const u = dmUsers?.[uid] || friendUsers?.[uid];
        return String(u?.displayName || u?.username || uid || "").trim();
      })
      .filter((x) => x.length > 0);
    if (names.length === 0) return `yazıyor...`;
    if (names.length === 1) return `${names[0]} yazıyor...`;
    if (names.length === 2) return `${names[0]} ve ${names[1]} yazıyor...`;
    if (names.length === 3)
      return `${names[0]}, ${names[1]} ve ${names[2]} yazıyor...`;
    return "Birden fazla kişi yazıyor...";
  }, [remoteTypingUids, dmUsers, friendUsers]);

  const sendFriendRequest = async (toUid: string, _toUsername?: string) => {
    if (!auth.currentUser) return "noop" as const;
    if (toUid === auth.currentUser.uid) return "noop" as const;
    if (isFriendWith(toUid)) return "noop" as const;
    if (outgoingRequests[toUid]?.status === "pending") return "noop" as const;
    if (incomingRequests[toUid]?.status === "pending") {
      const myUid = auth.currentUser.uid;
      const myCount = await getFriendCount(myUid);
      if (myCount !== null && myCount >= FRIENDS_LIMIT) {
        showLoginError("Maksimum 200 arkadaş limitine ulaştınız.");
        return;
      }
      const otherCount = await getFriendCount(toUid);
      if (otherCount !== null && otherCount >= FRIENDS_LIMIT) {
        showLoginError("Karşı tarafin arkadaş limiti dolu.");
        return;
      }

      await acceptFriendRequestTx(myUid, toUid);
      const acceptedUser = incomingUsers[toUid] ||
        friendUsers[toUid] ||
        dmUsers[toUid] || {
          uid: toUid,
          username: "",
          displayName: "Yükleniyor...",
          profilePic: "https://i.hizliresim.com/ntdyvrh.jpg",
        };
      await openDmWithUser(acceptedUser, {
        autoOpenBoth: true,
        openScreen: false,
      });
      return "accepted" as const;
    }
    const blocked = friendsMeta.blocked || [];
    if (blocked.includes(toUid)) {
      return "blocked_self" as const;
    }
    if (await isBlockedByTarget(toUid)) {
      return "blocked_by_target" as const;
    }

    const fromUid = auth.currentUser.uid;
    await sendFriendRequestTx(fromUid, toUid);
    return "sent" as const;
  };

  const cancelFriendRequest = async (toUid: string) => {
    if (!auth.currentUser) return;
    const fromUid = auth.currentUser.uid;
    await cancelFriendRequestTx(fromUid, toUid);
  };

  const rejectFriendRequest = async (fromUid: string) => {
    if (!auth.currentUser) return;
    const toUid = auth.currentUser.uid;
    await rejectFriendRequestTx(toUid, fromUid);
  };

  const acceptFriendRequest = async (fromUid: string) => {
    if (!auth.currentUser) return;
    const toUid = auth.currentUser.uid;

    const myCount = await getFriendCount(toUid);
    if (myCount !== null && myCount >= FRIENDS_LIMIT) {
      showLoginError("Maksimum 200 Arkadaş limitine ulaştınız.");
      return;
    }
    const otherCount = await getFriendCount(fromUid);
    if (otherCount !== null && otherCount >= FRIENDS_LIMIT) {
      showLoginError("Karşı tarafin Arkadaş limiti dolu.");
      return;
    }

    await acceptFriendRequestTx(toUid, fromUid);
    const acceptedUser = incomingUsers[fromUid] ||
      friendUsers[fromUid] ||
      dmUsers[fromUid] || {
        uid: fromUid,
        username: "",
        displayName: "Kullanıcı",
        profilePic: "https://i.hizliresim.com/ntdyvrh.jpg",
      };
    await openDmWithUser(acceptedUser, {
      autoOpenBoth: true,
      openScreen: false,
    });
  };

  const removeFriend = async (otherUid: string) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    await removeFriendTx(uid, otherUid);
  };

  const blockUser = async (otherUid: string) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    if (!otherUid || otherUid === uid) return;
    await blockUserTx(uid, otherUid);
  };

  const unblockUser = async (otherUid: string) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    if (!otherUid || otherUid === uid) return;
    await unblockUserTx(uid, otherUid);
  };
  const handleSendFriendByUsername = async () => {
    const raw = sanitizeSingleLine(pendingInput, 32).toLowerCase();
    if (!raw) {
      triggerPendingError("Kullanıcı adı giriniz");
      return;
    }
    setPendingError("");
    setPendingErrorShake(false);
    try {
      const q = query(collection(db, "users"), where("username", "==", raw));
      const snap = await getDocs(q);
      if (snap.empty) {
        triggerPendingError("Kullanıcı bulunamadı");
        return;
      }
      const data = snap.docs[0].data() as any;
      if (!data?.uid) {
        triggerPendingError("Kullanıcı bulunamadı");
        return;
      }
      if (data?.ban?.type === "permanent") {
        triggerPendingError("Bu Kullanıcı yasaklı");
        return;
      }
      const friendReqResult = await sendFriendRequest(data.uid, data.username);
      if (friendReqResult === "blocked_self") {
        triggerPendingError("Bu Kullanıcıyi engellediniz");
        return;
      }
      if (friendReqResult === "blocked_by_target") {
        triggerPendingError("Bu Kullanıcı seni engelledi");
        return;
      }
      setPendingInput("");
    } catch (err: any) {
      console.error(
        "friend-request send failed",
        err?.code || err?.message || err,
      );
      triggerPendingError("\u0130stek gönderilemedi");
    }
  };

  async function setBadgeActive(
    targetUid: string,
    badgeId: string,
    active: boolean,
  ) {
    const adminUid = auth.currentUser?.uid;
    if (!adminUid) throw new Error("Admin Giriş yapmamis");

    const userRef = doc(db, "users", targetUid);

    const updates: any = {
      [`badges.${badgeId}.active`]: active,
      [`badges.${badgeId}.updatedAt`]: serverTimestamp(),
      [`badges.${badgeId}.updatedBy`]: adminUid,
    };

    if (badgeId === PERSONEL_BADGE_ID) {
      updates.staff = active;

      if (active) {
        updates.role = "admin";
        updates.roleUpdatedAt = serverTimestamp();
        updates.roleUpdatedBy = adminUid;
      } else {
        if (targetUid !== OWNER_UID) {
          updates.role = "user";
          updates.roleUpdatedAt = serverTimestamp();
          updates.roleUpdatedBy = adminUid;
        }
      }
    }

    await updateDoc(userRef, updates);
  }

  const triggerUnsavedNudge = () => {
    setUnsavedNudge((n) => n + 1);
    setUnsavedFlash(false);
    if (unsavedFlashTimerRef.current)
      window.clearTimeout(unsavedFlashTimerRef.current);

    window.setTimeout(() => {
      setUnsavedFlash(true);

      unsavedFlashTimerRef.current = window.setTimeout(() => {
        setUnsavedFlash(false);
        unsavedFlashTimerRef.current = null;
      }, 1400);
    }, 0);
  };

  const handleSelectTheme = (nextThemeId: string) => {
    setDraftThemeId(nextThemeId);
    setSettingsDirty(nextThemeId !== savedThemeId);
  };

  const showLoginError = (msg: string) => {
    setErrorPopup({ show: true, msg });
    setTimeout(() => {
      setErrorPopup({ show: false, msg: "" });
    }, 5000);
  };

  const handleCancelSettingsChanges = () => {
    setDraftThemeId(savedThemeId);
    setSettingsDirty(false);
  };

  const handleCancelAllChanges = () => {
    if (mediaDirty) handleCancelMediaChanges();
    if (settingsDirty) handleCancelSettingsChanges();
  };

  const resolveLastActiveDate = (lastActiveValue: any) => {
    if (!lastActiveValue) return null;
    if (typeof lastActiveValue?.toDate === "function") {
      return lastActiveValue.toDate();
    }
    if (typeof lastActiveValue?.seconds === "number") {
      return new Date(lastActiveValue.seconds * 1000);
    }
    if (lastActiveValue instanceof Date) return lastActiveValue;
    return null;
  };

  const isRecentlyActive = (lastActiveValue: any, thresholdMs = 600000) => {
    const d = resolveLastActiveDate(lastActiveValue);
    if (!d) return false;
    const diffMs = Date.now() - d.getTime();
    return diffMs >= 0 && diffMs <= thresholdMs;
  };

  const getPresenceState = (presenceValue: string, lastActiveValue: any) => {
    const normalizedPresence = String(presenceValue || "").toLowerCase();
    if (normalizedPresence === "offline") return "offline";
    if (normalizedPresence === "online") return "online";
    // presence gecikmis/eksik olsa da son aktivite yakinsa Kullanıcıyi aktif say.
    if (isRecentlyActive(lastActiveValue)) return "online";
    return "offline";
  };

  const getEffectiveStatus = (
    presenceValue: string,
    statusValue: string,
    lastActiveValue: any,
  ) => {
    const state = getPresenceState(presenceValue, lastActiveValue);
    if (state === "offline") return "offline";
    const normalizedStatus = String(statusValue || "").toLowerCase();
    if (normalizedStatus === "idle" || normalizedStatus === "dnd") {
      return normalizedStatus;
    }
    return "online";
  };

  const getLastSeenText = (
    presenceValue: string,
    statusValue: string,
    lastActiveValue: any,
  ) => {
    if (
      presenceValue === "online" &&
      statusValue !== "offline" &&
      isRecentlyActive(lastActiveValue)
    ) {
      return "Su an Aktif";
    }

    const d = resolveLastActiveDate(lastActiveValue);
    if (!d) return "-";

    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return "-";

    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin <= 1) {
      return "Az önce aktifti";
    }
    if (diffHr < 10) {
      return `${diffMin} dakika önce`;
    }
    if (diffHr < 24) {
      return `${diffHr} saat önce`;
    }
    return `${diffDay} gün önce`;
  };

  const getLastSeenTextRaw = (lastActiveValue: any) => {
    const d = resolveLastActiveDate(lastActiveValue);
    if (!d) return "-";
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return "-";
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin <= 1) {
      return "Az önce aktifti";
    }
    if (diffHr < 10) {
      return `${diffMin} dakika önce`;
    }
    if (diffHr < 24) {
      return `${diffHr} saat önce`;
    }
    return `${diffDay} gün önce`;
  };

  const handleSaveSettingsChanges = async () => {
    try {
      setIsApplyingSettings(true);

      if (auth.currentUser) {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, { themeId: draftThemeId });
      }

      setSavedThemeId(draftThemeId);

      setTimeout(() => {
        setIsApplyingSettings(false);
        setSettingsDirty(false);
      }, 1000);
    } catch (e) {
      setIsApplyingSettings(false);
    }
  };

  const handleSaveAllChanges = async () => {
    setIsSavingAllChanges(true);
    try {
      if (mediaDirty) {
        await handleSaveMediaChanges();
      }
      if (settingsDirty) {
        await handleSaveSettingsChanges();
      }
    } finally {
      setIsSavingAllChanges(false);
    }
  };

  const handleToggleDeveloperMode = async () => {
    if (!auth.currentUser) return "noop" as const;
    const next = !developerMode;
    setDeveloperMode(next);
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { developerMode: next });
    } catch (err: any) {
      setDeveloperMode(!next);
      showLoginError(
        getFirestoreWriteErrorMessage(err, "Geliştirici Modu Güncellenemedi"),
      );
    }
  };

  const toggleDesktopNotifications = () => {
    setDesktopNotificationsEnabled((prev) => !prev);
  };

  const handleSaveStatus = async () => {
    if (!auth.currentUser) return "noop" as const;

    const nextStatus = tempStatus;
    const nextCustomStatus = sanitizeSingleLine(tempCustom, 120);
    setShowDropdown(false);
    setShowStatusModal(false);

    try {
      const state = await setUserStatusService(
        auth.currentUser.uid,
        nextStatus as "online" | "idle" | "dnd" | "offline",
        nextCustomStatus,
        BACKEND_URL,
      );
      applyPresenceState(state);
      const nextPresence = state.presence;
      lastPresenceRef.current = nextPresence;
      setUserDocData((prev: any) => ({
        ...(prev || {}),
        status: state.status,
        customStatus: state.customStatus,
        presence: nextPresence,
        lastActive: state.lastActive || (prev || {})?.lastActive,
      }));
    } catch (error: any) {
      showLoginError(error?.message || "Durum güncellenemedi");
    }
  };

  const formatFirestoreDate = (v: any, withTime = false) => {
    if (!v) return "-";

    let d: Date | null = null;

    if (typeof v?.toDate === "function") {
      d = v.toDate();
    } else if (typeof v?.seconds === "number") {
      d = new Date(v.seconds * 1000);
    } else if (v instanceof Date) {
      d = v;
    }

    if (!d) return "-";

    return withTime
      ? d.toLocaleString("tr-TR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : d.toLocaleDateString("tr-TR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
  };

  const getEmbedUrl = (
    url: string,
    opts?: { mute?: boolean; autoplay?: boolean },
  ) => {
    const autoplay = opts?.autoplay ?? true;
    const mute = opts?.mute ?? true;
    const params = `?autoplay=${autoplay ? 1 : 0}&mute=${mute ? 1 : 0}&loop=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1`;

    if (url.includes("youtube.com/shorts/")) {
      const videoId = url.split("/").pop();
      return `https://www.youtube.com/embed/${videoId}${params}&playlist=${videoId}`;
    }

    if (url.includes("youtube.com/watch?v=")) {
      const videoId = new URL(url).searchParams.get("v");
      return `https://www.youtube.com/embed/${videoId}${params}&playlist=${videoId}`;
    }
    return null;
  };

  const handleNoSpace = (e: any, setter: any) => {
    const value = e.target.value.replace(/\s/g, "");
    setter(value);
  };

  const sanitizeUsernameInput = (value: string) => {
    return value.replace(/[^\p{L}0-9._]/gu, "");
  };

  const isUsernameValid = (value: string) => {
    if (!value) return false;
    if (value.length < 2 || value.length > 16) return false;
    return /^[\p{L}0-9._]+$/u.test(value);
  };

  const normalizeUsername = (value: string) => value.trim().toLowerCase();

  const isUsernameAvailable = async (value: string) => {
    const candidate = normalizeUsername(value);
    if (!candidate) return false;
    const snap = await getDoc(doc(db, "usernames", candidate));
    return !snap.exists();
  };

  const cropSpecs = {
    avatar: { boxW: 320, boxH: 320, outW: 512, outH: 512 },
    banner: { boxW: 520, boxH: 200, outW: 1200, outH: 400 },
    group: { boxW: 320, boxH: 320, outW: 512, outH: 512 },
  } as const;

  const isAllowedImageFile = (file: File) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const allowedExt = ["png", "jpg", "jpeg", "webp"];
    return (
      allowedTypes.includes(file.type) ||
      (ext ? allowedExt.includes(ext) : false)
    );
  };

  const openMediaPicker = (type: "avatar" | "banner" | "group") => {
    setMediaCropError("");
    if (type === "avatar") {
      avatarInputRef.current?.click();
    } else if (type === "banner") {
      bannerInputRef.current?.click();
    } else {
      groupAvatarInputRef.current?.click();
    }
  };

  const handleMediaFileChange = (
    type: "avatar" | "banner" | "group",
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isAllowedImageFile(file)) {
      showLoginError("Sadece PNG, JPG veya WEBP uzantilari destekleniyor");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const spec = cropSpecs[type];
      setMediaCropType(type);
      setMediaCropSrc(reader.result);
      setMediaCropBox({ w: spec.boxW, h: spec.boxH });
      setMediaCropZoom(1);
      setMediaCropError("");
      setMediaCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!mediaCropSrc || !mediaCropType) return;
    const img = new Image();
    img.onload = () => {
      const spec = cropSpecs[mediaCropType];
      const baseScale = Math.max(spec.boxW / img.width, spec.boxH / img.height);
      const displayW = img.width * baseScale;
      const displayH = img.height * baseScale;
      const offsetX = (spec.boxW - displayW) / 2;
      const offsetY = (spec.boxH - displayH) / 2;
      setMediaCropBaseScale(baseScale);
      setMediaCropOffset({ x: offsetX, y: offsetY });
      mediaCropOffsetRef.current = { x: offsetX, y: offsetY };
      setMediaCropImage(img);
    };
    img.src = mediaCropSrc;
  }, [mediaCropSrc, mediaCropType]);

  const clampCropOffset = (offset: { x: number; y: number }, scale: number) => {
    if (!mediaCropImage) return offset;
    const displayW = mediaCropImage.width * scale;
    const displayH = mediaCropImage.height * scale;
    const minX = mediaCropBox.w - displayW;
    const minY = mediaCropBox.h - displayH;
    return {
      x: Math.min(0, Math.max(minX, offset.x)),
      y: Math.min(0, Math.max(minY, offset.y)),
    };
  };

  const handleCropZoomChange = (nextZoom: number) => {
    if (!mediaCropImage) return;
    const prevScale = mediaCropBaseScale * mediaCropZoom;
    const nextScale = mediaCropBaseScale * nextZoom;
    const centerX = (mediaCropBox.w / 2 - mediaCropOffset.x) / prevScale;
    const centerY = (mediaCropBox.h / 2 - mediaCropOffset.y) / prevScale;
    const nextOffset = {
      x: mediaCropBox.w / 2 - centerX * nextScale,
      y: mediaCropBox.h / 2 - centerY * nextScale,
    };
    setMediaCropZoom(nextZoom);
    const clamped = clampCropOffset(nextOffset, nextScale);
    setMediaCropOffset(clamped);
    mediaCropOffsetRef.current = clamped;
    if (cropImageRef.current) {
      cropImageRef.current.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
    }
  };

  const handleCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mediaCropImage) return;
    e.preventDefault();
    cropDragRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: mediaCropOffset.x,
      offsetY: mediaCropOffset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cropDragRef.current || !mediaCropImage) return;
    e.preventDefault();
    const dx = e.clientX - cropDragRef.current.x;
    const dy = e.clientY - cropDragRef.current.y;
    const nextOffset = {
      x: cropDragRef.current.offsetX + dx,
      y: cropDragRef.current.offsetY + dy,
    };
    const scale = mediaCropBaseScale * mediaCropZoom;
    if (cropRafRef.current) {
      cancelAnimationFrame(cropRafRef.current);
    }
    cropRafRef.current = requestAnimationFrame(() => {
      const clamped = clampCropOffset(nextOffset, scale);
      mediaCropOffsetRef.current = clamped;
      if (cropImageRef.current) {
        cropImageRef.current.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
      }
      cropRafRef.current = null;
    });
  };

  const handleCropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    cropDragRef.current = null;
    setMediaCropOffset(mediaCropOffsetRef.current);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleApplyCrop = () => {
    if (!mediaCropImage || !mediaCropType) return;
    const spec = cropSpecs[mediaCropType];
    const scale = mediaCropBaseScale * mediaCropZoom;
    const offset = mediaCropOffsetRef.current;
    const srcX = (0 - offset.x) / scale;
    const srcY = (0 - offset.y) / scale;
    const srcW = spec.boxW / scale;
    const srcH = spec.boxH / scale;
    const canvas = document.createElement("canvas");
    canvas.width = spec.outW;
    canvas.height = spec.outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      mediaCropImage,
      srcX,
      srcY,
      srcW,
      srcH,
      0,
      0,
      spec.outW,
      spec.outH,
    );
    const outputType =
      mediaCropType === "avatar" || mediaCropType === "group"
        ? "image/png"
        : "image/jpeg";
    const dataUrl =
      outputType === "image/png"
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", 0.92);
    if (mediaCropType === "avatar") {
      setPendingAvatar(dataUrl);
    } else if (mediaCropType === "group") {
      setPendingGroupAvatar(dataUrl);
    } else {
      setPendingBanner(dataUrl);
    }
    setMediaUploadState("idle");
    if (mediaCropType !== "group") {
      setMediaDirty(true);
    }
    setMediaCropOpen(false);
  };

  const handleCancelCrop = () => {
    setMediaCropOpen(false);
  };

  const uploadToCloudinary = async (dataUrl: string, publicId: string) => {
    const signatureRes = await tauriFetch(
      `${BACKEND_URL}/cloudinary-signature`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId }),
      },
    );
    let sigData: any = null;
    try {
      const raw = await signatureRes.text();
      sigData = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(
        "Cloudinary imzasi alinamadı. Backend URL/endpoint kontrol edin.",
      );
    }
    if (!sigData?.signature || !sigData?.timestamp) {
      throw new Error("Cloudinary imzasi alinamadı.");
    }
    const form = new FormData();
    form.append("file", dataUrl);
    form.append("api_key", sigData.apiKey);
    form.append("timestamp", String(sigData.timestamp));
    form.append("signature", sigData.signature);
    form.append("public_id", publicId);
    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`,
      {
        method: "POST",
        body: form,
      },
    );
    const json = await uploadRes.json();
    if (!uploadRes.ok) {
      throw new Error(json?.error?.message || "Yükleme başarısız");
    }
    return json.secure_url as string;
  };

  const handleSaveMediaChanges = async () => {
    if (!auth.currentUser) return "noop" as const;
    if (!pendingAvatar && !pendingBanner) return;
    try {
      setMediaUploadState("uploading");
      const uid = auth.currentUser.uid;
      const updates: any = {};
      if (pendingAvatar) {
        const avatarUrl = await uploadToCloudinary(
          pendingAvatar,
          `piksel/users/${uid}/avatar`,
        );
        updates.profilePic = avatarUrl;
        updates.photoURL = avatarUrl;
        setProfilePic(avatarUrl);
      }
      if (pendingBanner) {
        const bannerUrl = await uploadToCloudinary(
          pendingBanner,
          `piksel/users/${uid}/banner`,
        );
        updates.bannerUrl = bannerUrl;
        updates.banner = bannerUrl;
      }
      if (Object.keys(updates).length > 0) {
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, updates);
      }
      setPendingAvatar(null);
      setPendingBanner(null);
      setMediaDirty(false);
      setMediaUploadState("success");
      window.setTimeout(() => {
        setMediaUploadState("idle");
      }, 1500);
    } catch (err: any) {
      setMediaUploadState("error");
      showLoginError(
        getFirestoreWriteErrorMessage(err, "Profil medyasi kaydedilemedi."),
      );
    }
  };

  const handleCancelMediaChanges = () => {
    setPendingAvatar(null);
    setPendingBanner(null);
    setMediaDirty(false);
    setMediaUploadState("idle");
  };

  const clearForm = () => {
    setEmail("");
    setUsername("");
    setPassword("");
    setOtp("");
    setErrorField("");
    setErrorMsg("");
    setShakeField("");
    setTimer(0);
  };

  const triggerError = (field: string, msg: string) => {
    setErrorField(field);
    setErrorMsg(msg);
    setShakeField(field);
    setTimeout(() => {
      setShakeField("");
      setErrorField("");
    }, 1000);
  };
  const handleLogout = async () => {
    const uid = auth.currentUser?.uid || null;
    void handleWindowExitPresence();
    if (uid) {
      try {
        const state = await setUserPresenceService(uid, "offline", BACKEND_URL);
        applyPresenceState(state);
      } catch {}
    }
    setUserStatus("offline");
    setPresence("offline");
    lastPresenceRef.current = "offline";
    setIsLoggedIn(false);
    setDmSection("friends");
    setActiveDmId(null);
    setActiveDmUser(null);
    setDmMessages([]);
    setShowProfilePopup(false);
    setIsLogin(true);
    setShowFirstWelcome(false);
    clearForm();

    try {
      await signOut(auth);
    } catch (error) {}
  };

  const resendCode = async () => {
    if (timer > 0 || isSending) return;

    setIsSending(true);

    const generatedCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
    setSentCode(generatedCode);

    try {
      const res = await tauriFetch(`${BACKEND_URL}/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          code: generatedCode,
        }),
      });

      if (res.ok) {
        setIsVerifying(true);
        setTimer(120);
      } else {
        const bodyText = await res.text().catch(() => "");
        console.error("send-code failed (resend)", res.status, bodyText);
        triggerError("otp", "Kod gönderilemedi, tekrar deneyiniz");
      }
    } catch (error) {
      console.error("send-code error (resend)", error);
      triggerError("otp", "Sunucuya baglanilamadı!");
    } finally {
      setIsSending(false);
    }
  };
  const fetchUserByUid = async (uid: string) => {
    const clean = uid.trim();
    if (!clean) {
      setTargetUser(null);
      triggerAdminError("Geçerli UID giriniz");
      return;
    }

    setAdminLoading(true);
    try {
      let data: any = null;
      let id: string | null = null;
      if (clean.includes("@")) {
        const q = query(collection(db, "users"), where("email", "==", clean));
        const snap = await getDocs(q);
        if (snap.empty) {
          setTargetUser(null);
          triggerAdminError("Kullanıcı bulunamadı");
          return;
        }
        const docSnap = snap.docs[0];
        id = docSnap.id;
        data = docSnap.data();
      } else {
        const uname = clean.toLowerCase();
        const byUsername = query(
          collection(db, "users"),
          where("username", "==", uname),
        );
        const userSnap = await getDocs(byUsername);
        if (!userSnap.empty) {
          const docSnap = userSnap.docs[0];
          id = docSnap.id;
          data = docSnap.data();
        } else {
          const { getDoc } = await import("firebase/firestore");
          const snap = await getDoc(doc(db, "users", clean));
          if (!snap.exists()) {
            setTargetUser(null);
            triggerAdminError("Kullanıcı bulunamadı");
            return;
          }
          id = snap.id;
          data = snap.data();
        }
      }
      if (data?.ban?.type === "permanent") {
        setTargetUser(null);
        triggerAdminError("Bu üye yasaklandi");
        return;
      }
      setTargetUser({ id, ...data, uid: data?.uid || id });
    } catch (e) {
      setTargetUser(null);
    } finally {
      setAdminLoading(false);
    }
  };

  const isBadgeActiveForTarget = (badgeId: string) => {
    const map = (targetUser?.badges || {}) as Record<
      string,
      { active?: boolean }
    >;
    return !!map?.[badgeId]?.active;
  };

  const toggleBadgeForTarget = async (badgeId: string) => {
    if (!targetUser?.uid) return;
    const targetUid = String(targetUser.uid || "");
    if (targetUid) {
      targetStatusLockRef.current[targetUid] = getAdminTargetStatus(targetUser);
    }
    targetBadgeToggleBusyRef.current = true;
    setTargetBadgeToggleBusy(true);
    try {
      if (badgeDefs?.[badgeId]?.active === false) {
        triggerAdminError(
          "(Bu rozet su an deaktif ve aktif etmeden verilemez)",
        );
        return;
      }
      if (badgeId === PERSONEL_BADGE_ID && !isOwner) {
        triggerAdminError("(Personel rozetini sadece owner açabilir)");
        return;
      }
      if (badgeDefs?.[badgeId]?.type === "permission" && !isOwner) {
        triggerAdminError("(Yetki rozetlerini sadece owner verebilir)");
        return;
      }
      const currentlyActive = isBadgeActiveForTarget(badgeId);
      const nextActive = !currentlyActive;
      if (!currentlyActive) {
        const map = (targetUser?.badges || {}) as Record<string, any>;
        const hasBadgeObj = !!map?.[badgeId];

        if (!hasBadgeObj) {
          await grantBadge(targetUser.uid, badgeId);
        } else {
          await setBadgeActive(targetUser.uid, badgeId, true);
        }
      } else {
        await setBadgeActive(targetUser.uid, badgeId, false);
      }
      setTargetUser((prev: any) => {
        if (!prev) return prev;
        const next = { ...prev };
        next.badges = { ...(next.badges || {}) };
        next.badges[badgeId] = { ...(next.badges[badgeId] || {}) };
        next.badges[badgeId].active = nextActive;
        if (badgeId === PERSONEL_BADGE_ID) {
          next.staff = nextActive;
          if (nextActive) {
            next.role = "admin";
          } else if (next.uid !== OWNER_UID) {
            next.role = "user";
          }
        }
        return next;
      });
    } finally {
      window.setTimeout(() => {
        targetBadgeToggleBusyRef.current = false;
        setTargetBadgeToggleBusy(false);
      }, 450);
    }
  };

  const triggerBadgeError = (
    field: "" | "name" | "icon" | "permission",
    msg: string,
  ) => {
    setBadgeErrField(field);
    setBadgeErrMsg(msg);
    setBadgeShake(field);
    setTimeout(() => {
      setBadgeShake("");
      setBadgeErrField("");
      setBadgeErrMsg("");
    }, 1000);
  };

  const triggerEditBadgeError = (
    field: "" | "name" | "icon" | "permission",
    msg: string,
  ) => {
    setEditBadgeErrField(field);
    setEditBadgeErrMsg(msg);
    setEditBadgeShake(field);
    setTimeout(() => {
      setEditBadgeShake("");
      setEditBadgeErrField("");
      setEditBadgeErrMsg("");
    }, 1000);
  };

  const handleCreateBadge = async () => {
    const name = badgeName.trim();
    const icon = badgeIconUrl.trim();
    if (!name) return triggerBadgeError("name", "Rozet adı zorunlu");
    if (!icon) return triggerBadgeError("icon", "Görsel URL zorunlu");
    if (badgeType === "permission" && !badgePermissionKey) {
      return triggerBadgeError("permission", "Yetki seçilmeli");
    }
    const id = slugifyBadgeId(name);
    if (!id) return triggerBadgeError("name", "Geçerli bir rozet adı giriniz");
    if (badgeDefs?.[id]) return triggerBadgeError("name", "Bu rozet zaten var");

    try {
      await setDoc(doc(db, "badges", id), {
        name,
        iconUrl: icon,
        type: badgeType,
        permissionKey: badgeType === "permission" ? badgePermissionKey : "user",
        active: true,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || "owner",
      });
      setBadgeName("");
      setBadgeIconUrl("");
      setBadgeErrField("");
      setBadgeErrMsg("");
    } catch {
      triggerBadgeError("name", "Rozet olusturulamadı");
    }
  };

  const requestCreateBadge = () => {
    const name = badgeName.trim();
    const icon = badgeIconUrl.trim();
    if (!name) return triggerBadgeError("name", "Rozet ado zorunlu");
    if (!icon) return triggerBadgeError("icon", "Görsel URL zorunlu");
    if (badgeType === "permission" && !badgePermissionKey) {
      return triggerBadgeError("permission", "Yetki seçilmeli");
    }
    const id = slugifyBadgeId(name);
    if (!id) return triggerBadgeError("name", "Geçerli bir rozet adı giriniz");
    if (badgeDefs?.[id])
      return triggerBadgeError("name", "Bu rozet zaten var.");

    setConfirmModal({
      show: true,
      title: "Rozet Olustur",
      message: `"${name}" rozetini olusturmak istedigine emin misin?`,
      onConfirm: handleCreateBadge,
    });
  };

  const handleDeleteBadge = async (id: string) => {
    if (id === PERSONEL_BADGE_ID) {
      triggerBadgeError("name", "Personel rozeti silinemez");
      return;
    }
    try {
      await deleteDoc(doc(db, "badges", id));
    } catch {
      triggerBadgeError("name", "Rozet silinemedi");
    }
  };

  const requestDeleteBadge = (id: string, name?: string) => {
    if (id === PERSONEL_BADGE_ID) {
      triggerBadgeError("name", "Personel rozeti silinemez");
      return;
    }
    setConfirmModal({
      show: true,
      title: "Rozeti Kaldir",
      message: `"${name || id}" rozetini kaldirmak istedigine emin misin?`,
      onConfirm: async () => handleDeleteBadge(id),
    });
  };

  const openEditBadge = (id: string, badge: BadgeDef) => {
    setEditingBadgeId(id);
    setEditBadgeName(badge.name || "");
    setEditBadgeType(badge.type === "permission" ? "permission" : "info");
    setEditBadgePermissionKey(
      (badge.permissionKey as "admin" | "user") || "user",
    );
    setEditBadgeIconUrl(badge.iconUrl || "");
    setEditBadgeErrField("");
    setEditBadgeErrMsg("");
    setEditBadgeShake("");
    setShowBadgeEditModal(true);
  };

  const closeEditBadge = () => {
    setShowBadgeEditModal(false);
    setEditingBadgeId(null);
    setEditBadgeErrField("");
    setEditBadgeErrMsg("");
    setEditBadgeShake("");
  };

  const handleUpdateBadge = async () => {
    if (!editingBadgeId) return;
    const name = editBadgeName.trim();
    const icon = editBadgeIconUrl.trim();
    if (!name) return triggerEditBadgeError("name", "Rozet adı zorunlu");
    if (!icon) return triggerEditBadgeError("icon", "Görsel URL zorunlu");
    try {
      await updateDoc(doc(db, "badges", editingBadgeId), {
        name,
        iconUrl: icon,
        type: editBadgeType,
        permissionKey:
          editBadgeType === "permission" ? editBadgePermissionKey : "user",
      });
      closeEditBadge();
    } catch {
      triggerEditBadgeError("name", "Rozet güncellenemedi");
    }
  };

  const toggleBadgeVisibility = async (id: string) => {
    const current = badgeDefs?.[id];
    const nextActive = current?.active === false ? true : false;
    try {
      await updateDoc(doc(db, "badges", id), { active: nextActive });
      setBadgeDefs((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), active: nextActive },
      }));
    } catch {
      triggerBadgeError("name", "Rozet güncellenemedi");
    }
  };

  const requestToggleBadgeVisibility = (id: string, name?: string) => {
    const current = badgeDefs?.[id];
    const nextActive = current?.active === false ? true : false;
    const actionText = nextActive ? "aktiflestirmek" : "deaktif etmek";
    setConfirmModal({
      show: true,
      title: "Rozet Durumu",
      message: `"${name || id}" rozetini ${actionText} istedigine emin misin?`,
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, show: false }));
        await toggleBadgeVisibility(id);
      },
    });
  };

  const getUserEffectiveStatus = (u: any) => {
    if (!u) return "offline";
    const isSelf = !!auth.currentUser && u.uid === auth.currentUser.uid;
    const resolved = resolveUserPresenceFields(u);
    if (isSelf) {
      const presenceValue = resolved.presence || presence;
      const statusValue = resolved.status || userStatus || "offline";
      const lastActiveValue = resolved.lastActive || lastActive;
      if (presenceValue === "online" && statusValue !== "offline") {
        return statusValue || "online";
      }
      return getEffectiveStatus(presenceValue, statusValue, lastActiveValue);
    }
    const statusValue = String(resolved.status || "online").toLowerCase();
    const safeStatus =
      statusValue === "idle" ||
      statusValue === "dnd" ||
      statusValue === "offline"
        ? statusValue
        : "online";
    const presenceValue = String(resolved.presence || "").toLowerCase();
    return getEffectiveStatus(
      presenceValue,
      safeStatus,
      resolved.lastActive || u.lastActive,
    );
  };

  const getDmUserStatus = (u: any) => {
    return getUserEffectiveStatus(u);
  };

  const getDmUserCustomStatus = (u: any) => {
    const uid = String(u?.uid || "");
    if (!uid) return String(u?.customStatus || "").trim();
    const live = presenceByUid[uid];
    return String(live?.customStatus || u?.customStatus || "").trim();
  };

  const getAdminTargetStatus = (u: any) => {
    if (!u) return "offline";
    const uid = String(u?.uid || "");
    if (!uid) return getUserEffectiveStatus(u);
    const live = presenceByUid[uid];
    const nextStatus = live
      ? live.presence === "online"
        ? live.status === "offline"
          ? "online"
          : live.status
        : "offline"
      : getUserEffectiveStatus(u);

    const prevStatus = targetStatusLockRef.current[uid];
    if (
      (targetBadgeToggleBusyRef.current || targetBadgeToggleBusy) &&
      prevStatus
    ) {
      return prevStatus;
    }
    targetStatusLockRef.current[uid] = nextStatus;
    return nextStatus;
  };

  const getUserLastSeenText = (u: any) => {
    if (!u) return "-";
    const isSelf = !!auth.currentUser && u.uid === auth.currentUser.uid;
    const resolved = resolveUserPresenceFields(u);
    if (isSelf) {
      if (resolved.presence === "online" && resolved.status !== "offline") {
        return "Su an Aktif";
      }
      return getLastSeenText(
        resolved.presence || presence,
        resolved.status || userStatus,
        resolved.lastActive || lastActive,
      );
    }
    if (getUserEffectiveStatus(u) !== "offline") {
      return "Su an Aktif";
    }
    return getLastSeenTextRaw(resolved.lastActive || u.lastActive);
  };
  const openUserProfile = (u: any) => {
    if (!u) return;
    const myUid = auth.currentUser?.uid;
    const isOwnProfile = !!(myUid && u?.uid === myUid);
    const resolvedForProfile = resolveUserPresenceFields(u);
    const mergedUser = isOwnProfile
      ? {
          ...(u || {}),
          uid: myUid,
          username: username || u?.username || "",
          displayName: displayName || u?.displayName || username || "",
          profilePic: effectiveProfilePic || u?.profilePic || u?.photoURL,
          photoURL: effectiveProfilePic || u?.photoURL || u?.profilePic,
          banner: effectiveBanner || u?.banner || u?.bannerUrl,
          bannerUrl: effectiveBanner || u?.bannerUrl || u?.banner,
          status:
            resolvedForProfile.status || userStatus || u?.status || "online",
          presence:
            resolvedForProfile.presence || presence || u?.presence || "offline",
          lastActive:
            resolvedForProfile.lastActive || lastActive || u?.lastActive,
          customStatus:
            resolvedForProfile.customStatus ||
            customStatus ||
            u?.customStatus ||
            "",
          bio: bio || u?.bio || "",
        }
      : {
          ...(u || {}),
          status: resolvedForProfile.status || u?.status || "online",
          presence: resolvedForProfile.presence || u?.presence || "offline",
          lastActive: resolvedForProfile.lastActive || u?.lastActive || null,
          customStatus:
            resolvedForProfile.customStatus || u?.customStatus || "",
        };
    setProfileTab("about");
    setIsViewingOwnProfile(isOwnProfile);
    setProfileActionsOpen(false);
    setAdminProfileModal({ open: true, user: mergedUser });
  };

  const handleAction = async () => {
    const cleanEmail = sanitizeSingleLine(email, 160).toLowerCase();
    const cleanUsernameInput = sanitizeSingleLine(username, 32);
    if (isSending) return;

    if (isLogin) {
      setIsSending(true);
      try {
        const targetMail = cleanEmail;
        await signInWithEmailAndPassword(auth, targetMail, password);
      } catch (error: any) {
        const code = error?.code || "";
        if (code === "auth/user-not-found")
          return triggerError("email", "E-posta kayitli degil");
        if (code === "auth/wrong-password")
          return triggerError("password", "Şifre hatali");
        if (code === "auth/invalid-email")
          return triggerError("email", "Geçersiz e-posta");
        if (code === "auth/too-many-requests")
          return triggerError(
            "password",
            "Çok fazla deneme. Biraz sonra tekrar dene.",
          );

        triggerError(
          "password",
          "Giriş başarısız: " + (error?.message || "Bilinmeyen hata"),
        );
      } finally {
        setIsSending(false);
      }
    } else if (!isVerifying) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email))
        return triggerError("email", "Geçersiz e-posta");
      if (!/^[\p{L}0-9._]+$/u.test(cleanUsernameInput))
        return triggerError(
          "username",
          "Sadece harf, sayi, alt çizgi (_) ve nokta (.) kullanilabilir.",
        );
      if (cleanUsernameInput.length < 2 || cleanUsernameInput.length > 16)
        return triggerError("username", "2-16 Karakter");
      if (password.length < 6)
        return triggerError("password", "En az 6 haneli");

      setIsSending(true);
      try {
        const available = await isUsernameAvailable(cleanUsernameInput);
        if (!available) {
          setIsSending(false);
          return triggerError("username", "Kullanıcı adı alinmis");
        }

        const methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
        if (methods.length > 0) {
          setIsSending(false);
          return triggerError("email", "E-posta zaten kayitli");
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const res = await tauriFetch(`${BACKEND_URL}/send-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, code }),
        });

        if (res.ok) {
          setSentCode(code);
          setIsVerifying(true);
          setTimer(120);
        } else {
          const bodyText = await res.text().catch(() => "");
          console.error("send-code failed (register)", res.status, bodyText);
          throw new Error(bodyText || `HTTP ${res.status}`);
        }
      } catch (err: any) {
        console.error("send-code error (register)", err);
        const msg =
          typeof err?.message === "string" && err.message.trim().length > 0
            ? `İşlem başarısız: ${err.message}`
            : "İşlem başarısız";
        triggerError("email", msg);
      } finally {
        setIsSending(false);
      }
    } else {
      if (!otp.trim()) {
        setIsSending(false);
        return triggerError("otp", "Lütfen kodu girin");
      }
      if (otp !== sentCode) {
        setIsSending(false);
        return triggerError("otp", "Kod Hatali");
      }

      setIsSending(true);

      try {
        const userCred = await createUserWithEmailAndPassword(
          auth,
          cleanEmail,
          password,
        );
        const uid = userCred.user.uid;

        await setDoc(doc(db, "users", uid), {
          uid: uid,
          username: normalizeUsername(cleanUsernameInput),
          email: cleanEmail,
          createdAt: serverTimestamp(),
          displayName: cleanUsernameInput,
          ban: null,
          bio: " ",
          developerMode: false,
          themeId: "default",
          isFirstLogin: true,
          badges: {},
          role: uid === OWNER_UID ? "owner" : "user",
        });
        await setDoc(
          doc(db, "usernames", normalizeUsername(cleanUsernameInput)),
          {
            uid,
            createdAt: serverTimestamp(),
          },
        );
        await setDoc(getFriendsMetaRef(uid), FRIENDS_META_DEFAULT, {
          merge: true,
        });
        clearForm();
        setIsSending(false);
        setIsVerifying(false);
        setShowFirstWelcome(true);
      } catch (e: any) {
        triggerError("otp", "Kayit Hatasi: " + e.message);
        setIsSending(false);
      }
    }
  };

  const isBtnDisabled =
    !email || !password || (!isLogin && !username) || isSending;

  useEffect(() => {
    if (!banState || banState.type !== "temporary" || !banState.expiresAtMs)
      return;

    const expiresAtMs = banState.expiresAtMs;
    const clearBan = async () => {
      try {
        if (auth.currentUser) {
          const userRef = doc(db, "users", auth.currentUser.uid);
          await updateDoc(userRef, {
            ban: deleteField(),
            status: "online",
            presence: "online",
            lastActive: serverTimestamp(),
          });
          try {
            const { getDoc } = await import("firebase/firestore");
            const snap = await getDoc(userRef);
            if (snap.exists()) {
              applyUserDoc(snap.data());
            }
          } catch {}
        }
      } catch {}
      setBanState(null);
      if (auth.currentUser) {
        setIsLoggedIn(true);
      }
    };

    const delay = expiresAtMs - Date.now();
    if (delay <= 0) {
      clearBan();
      return;
    }

    const t = setTimeout(clearBan, delay);
    return () => clearTimeout(t);
  }, [banState]);

  if (banState) {
    const isTempBan = banState.type === "temporary";
    const titleTr = isTempBan
      ? "Hesabınız geçici olarak askıya alınmıştır."
      : "Hesabınız kalıcı olarak askıya alınmıştır.";
    const titleEn = isTempBan
      ? "Your account has been temporarily suspended."
      : "Your account has been permanently suspended.";
    return (
      <div className="app-wrapper">
        <div
          className="titlebar"
          data-tauri-drag-region
          style={{
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: "hidden",
          }}
        >
          <div className="titlebar-left" data-tauri-drag-region>
            <span className="titlebar-brand">PIKSEL</span>
          </div>
          <div className="titlebar-right" data-tauri-drag-region="false">
            <div
              className="titlebar-button"
              data-tauri-drag-region="false"
              onClick={() => appWindow.minimize()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect fill="currentColor" width="10" height="1" x="1" y="6" />
              </svg>
            </div>
            <div
              className="titlebar-button"
              data-tauri-drag-region="false"
              onClick={async () => {
                await appWindow.toggleMaximize();
                const maximized = await appWindow.isMaximized();
                setIsWindowMaximized(maximized);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  width="9"
                  height="9"
                  x="1.5"
                  y="1.5"
                />
              </svg>
            </div>
            <div
              className="titlebar-button close-btn"
              data-tauri-drag-region="false"
              onClick={() => appWindow.close()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  fill="currentColor"
                  d="M1.1,1.1L10.9,10.9 M10.9,1.1L1.1,10.9"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            </div>
          </div>
        </div>
        <div className="piksel-loaderfx-screen piksel-loaderfx-screen--stack">
          <div className="piksel-ban-brand">PIKSEL</div>
          <img
            src="/pengi-security.png"
            alt="Pengi Security"
            style={{ width: 140, height: "auto", marginBottom: 4 }}
          />
          <h1 className="piksel-loaderfx-ban-title">{titleTr}</h1>
          <div
            style={{
              color: "#cfcfcf",
              maxWidth: 620,
              textAlign: "center",
              whiteSpace: "pre-wrap",
            }}
          >
            {titleEn}
          </div>
          <div
            style={{
              color: "#aaa",
              maxWidth: 620,
              textAlign: "center",
              whiteSpace: "pre-wrap",
            }}
          >
            Gerekçe: {banState.reason}
          </div>

          {isTempBan && banState.expiresAtMs && (
            <TempBanCountdown expiresAtMs={banState.expiresAtMs} />
          )}

          <button
            className="ban-logout-btn"
            onClick={() => {
              setConfirmModal({
                show: true,
                title: "Çikis Yap",
                message: "Hesabindan çikis yapmak istedigine emin misin?",
                onConfirm: async () => {
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    fill="currentColor"
                    className="bi bi-box-arrow-right"
                    viewBox="0 0 16 16"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0z"
                    />
                    <path
                      fillRule="evenodd"
                      d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708z"
                    />
                  </svg>;

                  clearForm();
                  setIsLoggedIn(false);
                },
              });
            }}
          >
            Çikis Yap
            <span className="ban-logout-icon" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                className="bi bi-box-arrow-right"
                viewBox="0 0 16 16"
              >
                <path
                  fillRule="evenodd"
                  d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0z"
                />
                <path
                  fillRule="evenodd"
                  d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708z"
                />
              </svg>
            </span>
          </button>
        </div>

        <AnimatePresence>
          {confirmModal.show && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay confirm-modal-overlay ban-confirm-overlay"
              onClick={() => {
                confirmModal.onCancel?.();
                setConfirmModal({ ...confirmModal, show: false });
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="confirm-modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>{confirmModal.title}</h3>
                <p>{confirmModal.message}</p>

                <div className="confirm-btn-group">
                  {!confirmModal.hideCancel && (
                    <button
                      onClick={() => {
                        confirmModal.onCancel?.();
                        setConfirmModal({ ...confirmModal, show: false });
                      }}
                      className="confirm-btn cancel"
                    >
                      Vazgeçtim
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await confirmModal.onConfirm();
                      setConfirmModal({ ...confirmModal, show: false });
                    }}
                    className="confirm-btn danger"
                  >
                    {confirmModal.confirmText || "Evet, devam et"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
  if (isLoggedIn) {
    return (
      <div
        className={`app-wrapper main-app-bg logged-in-size ${isWindowMaximized ? "window-full" : ""}`}
        style={(() => {
          const active = themes.find((t) => t.id === draftThemeId);
          return active && active.vars
            ? (active.vars as React.CSSProperties)
            : undefined;
        })()}
      >
        <div className="titlebar" data-tauri-drag-region>
          <div className="titlebar-left" data-tauri-drag-region>
            <span className="titlebar-brand">PIKSEL</span>
          </div>
          <div className="titlebar-right" data-tauri-drag-region="false">
            <div
              className="titlebar-button"
              data-tauri-drag-region="false"
              onClick={() => appWindow.minimize()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect fill="currentColor" width="10" height="1" x="1" y="6" />
              </svg>
            </div>
            <div
              className="titlebar-button"
              data-tauri-drag-region="false"
              onClick={async () => {
                await appWindow.toggleMaximize();
                const maximized = await appWindow.isMaximized();
                setIsWindowMaximized(maximized);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  width="9"
                  height="9"
                  x="1.5"
                  y="1.5"
                />
              </svg>
            </div>
            <div
              className="titlebar-button close-btn"
              data-tauri-drag-region="false"
              onClick={() => appWindow.close()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  fill="currentColor"
                  d="M1.1,1.1L10.9,10.9 M10.9,1.1L1.1,10.9"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            </div>
          </div>
        </div>
        <div className="main-content-placeholder">
          <div className="app-shell">
            <aside className="servers-rail">
              <button
                className="main-server-dot active servers-tooltip"
                data-tooltip="Piksel"
              >
                <img src="server-dot.png" />
              </button>

              <div className="server-unread-list">
                <AnimatePresence initial={false}>
                  {serverUnreadRows.map((item) => (
                    <motion.button
                      key={item.id}
                      className="server-unread-item servers-tooltip"
                      data-tooltip={
                        item.label || (item.isGroup ? "Grup" : "Kullanıcı")
                      }
                      type="button"
                      onClick={() => openDmFromInbox(item.sourceRow)}
                      initial={{ opacity: 0, y: -8, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.92 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <img
                        className="server-unread-avatar"
                        src={
                          item.isGroup
                            ? safeImageSrc(
                                item.sourceRow?.groupAvatarUrl,
                                "/group-default.svg",
                              )
                            : safeImageSrc(
                                item.user?.profilePic || item.user?.photoURL,
                                "https://i.hizliresim.com/ntdyvrh.jpg",
                              )
                        }
                        alt={item.label || "dm"}
                      />
                      <span className="server-unread-badge">
                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                      </span>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>

              <div className="server-sep"></div>
              <button
                className="server-dot servers-tooltip"
                data-tooltip="Oluştur & Katıl"
              >
                +
              </button>
            </aside>

            <DmRail
              dmSection={dmSection}
              onSelectFriends={handleDmSectionFriendsClick}
              onSelectStore={() => setDmSection("store")}
              onSelectSubscription={() => setDmSection("subscription")}
              onOpenCreateGroup={openCreateGroupModal}
              showLoadingSkeleton={showDmRailSkeleton}
              dmInboxes={dmInboxes}
              dmUsers={dmUsers}
              friendUsers={friendUsers}
              activeDmId={activeDmId}
              openDmFromInbox={openDmFromInbox}
              closeDmFromList={closeDmFromList}
              getDmUserStatus={getDmUserStatus}
              getDmUserCustomStatus={getDmUserCustomStatus}
              safeImageSrc={safeImageSrc}
            />

            <section
              className={`friends-pane ${dmSection === "friends" && activeDmId ? "dm-open" : ""}`}
            >
              {dmSection === "friends" && (
                <>
                  {activeDmId && activeDmUser ? (
                    <DmView
                      activeDmUser={activeDmUser}
                      dmLoading={dmLoading}
                      dmLoadingMore={dmLoadingMore}
                      dmMessages={dmMessages}
                      dmMessagesViewportRef={dmMessagesViewportRef}
                      handleDmMessagesScroll={handleDmMessagesScroll}
                      handleDmMessagesWheel={handleDmMessagesWheel}
                      safeImageSrc={safeImageSrc}
                      getDmUserStatus={getDmUserStatus}
                      openUserProfile={openUserProfile}
                      authCurrentUserUid={auth.currentUser?.uid}
                      username={username}
                      displayName={displayName}
                      effectiveProfilePic={effectiveProfilePic}
                      userStatus={userStatus}
                      presence={presence}
                      lastActive={lastActive}
                      editingDmMessageId={editingDmMessageId}
                      editingDmText={editingDmText}
                      setEditingDmText={setEditingDmText}
                      saveEditDmMessage={saveEditDmMessage}
                      cancelEditDmMessage={cancelEditDmMessage}
                      retryDmMessage={retryDmMessage}
                      dmActionMenuMessageId={dmActionMenuMessageId}
                      setDmActionMenuMessageId={setDmActionMenuMessageId}
                      startEditDmMessage={startEditDmMessage}
                      requestDeleteDmMessage={requestDeleteDmMessage}
                      copyDmMessageId={copyDmMessageId}
                      developerMode={developerMode}
                      formatDmTime={formatDmTime}
                      formatDmEditedAt={formatDmEditedAt}
                      getDmSenderForMessage={getDmSenderForMessage}
                      getDmSenderUserForMessage={getDmSenderUserForMessage}
                      getDmUserByUid={getDmUserByUid}
                      dmComposer={dmComposer}
                      onDmComposerChange={handleDmComposerChange}
                      onDmComposerBlur={handleDmComposerBlur}
                      sendDmMessage={sendDmMessage}
                      isBlockedByMe={
                        !activeDmUser?.isGroup &&
                        isBlockedUser(activeDmUser?.uid)
                      }
                      unblockActiveDmUser={async () => {
                        if (!activeDmUser?.uid) return;
                        const targetUid = activeDmUser.uid;
                        const targetName =
                          activeDmUser.displayName ||
                          activeDmUser.username ||
                          "Bu kullanıcı";
                        setConfirmModal({
                          show: true,
                          title: "Engellemeyi Kaldır",
                          message: `${targetName} kullanıcısının engelini kaldırmak istediğine emin misin?`,
                          confirmText: "Engeli kaldır",
                          onConfirm: async () => {
                            await unblockUser(targetUid);
                          },
                          onCancel: () => {},
                        });
                      }}
                      isRemoteTyping={remoteTypingUids.length > 0}
                      remoteTypingLabel={remoteTypingLabel}
                      deleteConfirmMessage={deleteConfirmMessage}
                      deleteConfirmSender={deleteConfirmSender}
                      deleteConfirmTime={deleteConfirmTime}
                      setDeleteConfirmDmMessageId={setDeleteConfirmDmMessageId}
                      deleteDmMessage={deleteDmMessage}
                      groupMembers={groupMembersSorted}
                      isGroupOwner={isActiveGroupOwner}
                      onGroupTitleClick={openGroupSettingsForActive}
                      onGroupAddMemberClick={openAddGroupMembersModal}
                      groupMembersCollapsed={groupMembersCollapsed}
                      onToggleGroupMembersCollapsed={
                        toggleGroupMembersCollapsed
                      }
                      onLeaveGroupFromMembers={() => {
                        if (activeDmId) closeDmFromList(activeDmId);
                      }}
                      onKickGroupMember={requestKickGroupMember}
                      isGroupSendLocked={isGroupSendLocked}
                    />
                  ) : (
                    <FriendsView
                      friendsTab={friendsTab}
                      setFriendsTab={setFriendsTab}
                      pendingIncomingCount={friendsMeta.incoming.length}
                      friendSearch={friendSearch}
                      setFriendSearch={setFriendSearch}
                      blockedSearch={blockedSearch}
                      setBlockedSearch={setBlockedSearch}
                      pendingInput={pendingInput}
                      setPendingInput={setPendingInput}
                      pendingError={pendingError}
                      setPendingError={setPendingError}
                      pendingErrorShake={pendingErrorShake}
                      setPendingErrorShake={setPendingErrorShake}
                      handleSendFriendByUsername={handleSendFriendByUsername}
                      friendUsers={friendUsers}
                      outgoingUsers={outgoingUsers}
                      incomingUsers={incomingUsers}
                      blockedUsers={blockedUsers}
                      getUserEffectiveStatus={getUserEffectiveStatus}
                      openUserProfile={openUserProfile}
                      openDmWithUser={openDmWithUser}
                      safeImageSrc={safeImageSrc}
                      acceptFriendRequest={acceptFriendRequest}
                      rejectFriendRequest={rejectFriendRequest}
                      cancelFriendRequest={cancelFriendRequest}
                      setConfirmModal={setConfirmModal}
                      unblockUser={unblockUser}
                    />
                  )}
                </>
              )}

              {dmSection === "store" && <div className="friends-empty"></div>}

              {dmSection === "subscription" && (
                <div className="friends-empty"></div>
              )}
            </section>
          </div>
          <AnimatePresence>
            {showFirstWelcome && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  position: "fixed",
                  top: "30px",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "#000",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  zIndex: 10050,
                  userSelect: "none",
                }}
              >
                <motion.div
                  initial={{
                    opacity: 0,
                    x: 40,
                    filter: "blur(8px) brightness(1.5)",
                  }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    filter: "blur(0px) brightness(1)",
                  }}
                  transition={{
                    duration: 0.7,
                    ease: [0.23, 1, 0.32, 1],
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "30px",
                    padding: "40px",
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <img
                      src="/pengi-tada.png"
                      alt="Penguen"
                      style={{ width: "150px", height: "auto" }}
                    />
                  </div>

                  <div style={{ textAlign: "left", maxWidth: "400px" }}>
                    <h1
                      className="piksel-logo"
                      style={{ fontSize: "2rem", margin: 0, fontWeight: "800" }}
                    >
                      Selam {username}!
                    </h1>
                    <p
                      style={{
                        color: "white",
                        fontSize: "1rem",
                        margin: "15px 0",
                        lineHeight: "1.6",
                        opacity: 0.85,
                      }}
                    >
                      PIKSEL'de seni görmek gerçekten çok hos. Bir sorun
                      oldugunda sana ben yani Pengi yardim edecek!
                    </p>

                    <button
                      onClick={async () => {
                        setShowFirstWelcome(false);
                        if (auth.currentUser) {
                          const userDocRef = doc(
                            db,
                            "users",
                            auth.currentUser.uid,
                          );
                          await updateDoc(userDocRef, { isFirstLogin: false });
                        }
                      }}
                      style={{
                        borderRadius: "15px",
                        padding: "13px 30px",
                        color: "#0b0d12",
                        fontSize: "1rem",
                        fontWeight: "800",
                        cursor: "pointer",
                        transition: "0.2s",
                        float: "right",
                      }}
                    >
                      Tesekkürler!
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showProfilePopup && (
            <ProfilePopup
              profilePopupRef={profilePopupRef}
              effectiveProfilePic={effectiveProfilePic}
              effectiveStatus={effectiveStatus}
              displayName={displayName}
              username={username}
              customStatus={customStatus}
              userStatus={userStatus}
              setProfileTab={setProfileTab}
              setIsViewingOwnProfile={setIsViewingOwnProfile}
              setShowProfileModal={setShowProfileModal}
              setShowProfilePopup={setShowProfilePopup}
              setTempStatus={setTempStatus}
              setTempCustom={setTempCustom}
              setShowStatusModal={setShowStatusModal}
              setConfirmModal={setConfirmModal}
              handleLogout={handleLogout}
              safeImageSrc={safeImageSrc}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {banModal.open && (
            <motion.div
              className="modal-overlay confirm-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBanModal({ open: false, type: null })}
            >
              <motion.div
                className="confirm-modal-content"
                initial={{ scale: 0.95, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 16 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3>
                  {banModal.type === "perma" ? "kalıcı Ban" : "Geçici Ban"}
                </h3>

                <p style={{ marginBottom: 10 }}>
                  Açiklayici sekilde banlama sebebini giriniz.
                </p>

                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  rows={3}
                  className="piksel-input2"
                  placeholder="Detayli ve anlasilir bir sebep giriniz."
                  style={{
                    height: "auto",
                    paddingTop: 12,
                    paddingBottom: 12,
                    resize: "none",
                  }}
                  required
                />

                {banModal.type === "temp" && (
                  <div style={{ marginTop: 12, textAlign: "left" }}>
                    <label
                      style={{
                        color: "var(--text-gray)",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      Süre (saniye)
                    </label>
                    <input
                      type="number"
                      value={tempBanSeconds}
                      onChange={(e) =>
                        setTempBanSeconds(
                          Math.max(60, Number(e.target.value) || 60),
                        )
                      }
                      className="piksel-input2"
                      style={{ marginTop: 6 }}
                      min={60}
                    />
                  </div>
                )}

                <div className="confirm-btn-group" style={{ marginTop: 18 }}>
                  <button
                    className="confirm-btn cancel"
                    onClick={() => setBanModal({ open: false, type: null })}
                  >
                    Vazgeçtim
                  </button>

                  <button
                    className="confirm-btn danger"
                    onClick={async () => {
                      if (!banReason.trim()) {
                        showLoginError("Sebep zorunlu.");
                        return;
                      }
                      if (!targetUser?.uid) return;
                      if (!isOwner) {
                        if (
                          targetUser.role === "admin" ||
                          targetUser.role === "owner"
                        ) {
                          showLoginError(
                            "Adminler baska adminleri banlayamaz.",
                          );
                          return;
                        }
                      } else {
                        if (targetUser.uid === auth.currentUser?.uid) {
                          showLoginError("Owner kendisini banlayamaz.");
                          return;
                        }
                      }

                      if (banModal.type === "perma") {
                        const deviceId =
                          targetUser.lastDeviceId ||
                          targetUser.deviceId ||
                          (Array.isArray(targetUser.deviceIds)
                            ? targetUser.deviceIds[0]
                            : null);
                        await banPermanent(
                          targetUser.uid,
                          targetUser.email,
                          banReason,
                          deviceId,
                        );
                      } else {
                        await banTemporary(
                          targetUser.uid,
                          targetUser.email,
                          banReason,
                          tempBanSeconds,
                        );
                      }
                      setBanModal({ open: false, type: null });
                    }}
                  >
                    Onayla
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <ProfileModals
          adminProfileModal={adminProfileModal}
          setAdminProfileModal={setAdminProfileModal}
          safeUrl={safeUrl}
          u={u}
          safeImageSrc={safeImageSrc}
          getUserEffectiveStatus={getUserEffectiveStatus}
          isSelf={isSelf}
          developerMode={developerMode}
          isFriendWith={isFriendWith}
          profileActionsOpen={profileActionsOpen}
          setProfileActionsOpen={setProfileActionsOpen}
          handleCopyUserUid={handleCopyUserUid}
          setShowProfileModal={setShowProfileModal}
          setShowSettingsPage={setShowSettingsPage}
          setSettingsTab={setSettingsTab}
          openDmWithUser={openDmWithUser}
          incomingRequests={incomingRequests}
          acceptFriendRequest={acceptFriendRequest}
          rejectFriendRequest={rejectFriendRequest}
          outgoingRequests={outgoingRequests}
          setConfirmModal={setConfirmModal}
          cancelFriendRequest={cancelFriendRequest}
          sendFriendRequest={sendFriendRequest}
          removeFriend={removeFriend}
          blockUser={blockUser}
          unblockUser={unblockUser}
          isBlockedUser={isBlockedUser}
          renderBadgesForUser={renderBadgesForUser}
          profileTab={profileTab}
          setProfileTab={setProfileTab}
          formatFirestoreDate={formatFirestoreDate}
          getUserLastSeenText={getUserLastSeenText}
          getAdminTargetStatus={getAdminTargetStatus}
          showProfileModal={showProfileModal}
          effectiveBanner={effectiveBanner}
          effectiveProfilePic={effectiveProfilePic}
          effectiveStatus={effectiveStatus}
          customStatus={customStatus}
          isViewingOwnProfile={isViewingOwnProfile}
          getPresenceState={getPresenceState}
          presence={presence}
          userStatus={userStatus}
          lastActive={lastActive}
          displayName={displayName}
          username={username}
          renderActiveBadges={renderActiveBadges}
          isFriendVisual={isFriendVisual}
          auth={auth}
          userDocData={userDocData}
          bio={bio}
          createdAt={createdAt}
        />

        <AnimatePresence>
          {showCreateGroupModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay confirm-modal-overlay"
              onClick={() => {
                if (groupCreateLoading) return;
                setShowCreateGroupModal(false);
              }}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 16 }}
                className="confirm-modal-content group-create-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Grup Oluştur</h3>
                <p>
                  İstersen tek başına grup oluşturabilir, istersen arkadaş
                  ekleyebilirsin.
                </p>
                <div className="group-create-name-row">
                  <label className="group-create-name-label">Grup adı</label>
                  <span
                    className={`group-create-name-error ${groupNameRequiredError ? "is-visible" : ""}`}
                  >
                    Grup adı zorunlu.
                  </span>
                </div>
                <input
                  className={`status-input group-create-name-input ${groupNameRequiredError ? "is-error error-shake" : ""}`}
                  placeholder="Grup adı"
                  value={groupNameInput}
                  onChange={(e) => {
                    setGroupNameInput(e.target.value);
                    if (
                      groupNameRequiredError &&
                      e.target.value.trim().length > 0
                    ) {
                      setGroupNameRequiredError(false);
                      if (groupNameRequiredTimerRef.current != null) {
                        window.clearTimeout(groupNameRequiredTimerRef.current);
                        groupNameRequiredTimerRef.current = null;
                      }
                    }
                  }}
                  maxLength={60}
                  disabled={groupCreateLoading}
                />
                <div className="group-create-member-list">
                  {createGroupCandidates.length === 0 && (
                    <div className="group-create-empty">
                      Arkadaş bulunamadı. Tek başına grup oluşturabilirsin.
                    </div>
                  )}
                  {createGroupCandidates.map((u: any) => {
                    const checked = groupMemberUids.includes(String(u.uid));
                    return (
                      <label key={u.uid} className="group-create-member-row">
                        <input
                          type="checkbox"
                          className="group-create-member-checkbox"
                          checked={checked}
                          disabled={groupCreateLoading}
                          onChange={() => toggleGroupMember(String(u.uid))}
                        />
                        <img
                          className="group-create-member-avatar"
                          src={safeImageSrc(
                            u.profilePic || u.photoURL,
                            "https://i.hizliresim.com/ntdyvrh.jpg",
                          )}
                          alt="pp"
                        />
                        <span className="group-create-member-name">
                          {u.displayName || u.username || "Kullanıcı"}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="group-create-hint">
                  {groupMemberUids.length} / 11 üye seçildi (seninle birlikte en
                  fazla 12)
                </p>
                {groupCreateError && (
                  <p className="group-create-error">{groupCreateError}</p>
                )}
                <div className="confirm-btn-group">
                  <button
                    className="confirm-btn cancel"
                    disabled={groupCreateLoading}
                    onClick={() => setShowCreateGroupModal(false)}
                  >
                    Vazgeçtim
                  </button>
                  <button
                    className="confirm-btn primary"
                    disabled={groupCreateLoading}
                    onClick={() => {
                      void createGroupNow();
                    }}
                  >
                    {groupCreateLoading ? "Oluşturuluyor" : "Grubu Oluştur"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAddGroupMembersModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay confirm-modal-overlay"
              onClick={() => {
                if (groupAddMembersLoading) return;
                setShowAddGroupMembersModal(false);
              }}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 16 }}
                className="confirm-modal-content group-create-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Üye Ekle</h3>
                <p>Arkadaşlarından yeni üyeleri bu gruba ekleyebilirsin.</p>
                <div className="group-create-member-list">
                  {addGroupCandidates.length === 0 && (
                    <div className="group-create-empty">
                      Eklenebilecek arkadaş bulunamadı.
                    </div>
                  )}
                  {addGroupCandidates.map((u: any) => {
                    const checked = groupAddMemberUids.includes(String(u.uid));
                    return (
                      <label key={u.uid} className="group-create-member-row">
                        <input
                          type="checkbox"
                          className="group-create-member-checkbox"
                          checked={checked}
                          disabled={groupAddMembersLoading}
                          onChange={() => toggleAddGroupMember(String(u.uid))}
                        />
                        <img
                          className="group-create-member-avatar"
                          src={safeImageSrc(
                            u.profilePic || u.photoURL,
                            "https://i.hizliresim.com/ntdyvrh.jpg",
                          )}
                          alt="pp"
                        />
                        <span className="group-create-member-name">
                          {u.displayName || u.username || "Kullanıcı"}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="group-create-hint">
                  {groupAddMemberUids.length} /{" "}
                  {Math.max(
                    0,
                    GROUP_MAX_PARTICIPANTS -
                      (Array.isArray(conversationParticipants[activeDmId || ""])
                        ? conversationParticipants[activeDmId || ""].length
                        : Number(activeGroupInboxRow?.memberCount || 0)),
                  )}{" "}
                  üye eklenebilir
                </p>
                {groupAddMembersError && (
                  <p className="group-create-error">{groupAddMembersError}</p>
                )}
                <div className="confirm-btn-group">
                  <button
                    className="confirm-btn cancel"
                    disabled={groupAddMembersLoading}
                    onClick={() => setShowAddGroupMembersModal(false)}
                  >
                    Vazgeçtim
                  </button>
                  <button
                    className="confirm-btn primary"
                    disabled={groupAddMembersLoading}
                    onClick={() => {
                      void addMembersToActiveGroup();
                    }}
                  >
                    {groupAddMembersLoading ? "Ekleniyor" : "Üyeleri Ekle"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showGroupSettingsModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay confirm-modal-overlay"
              onClick={() => {
                if (groupSettingsSaving) return;
                setShowGroupSettingsModal(false);
                setPendingGroupAvatar(null);
              }}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 16 }}
                className="confirm-modal-content group-settings-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <h3>Grup Ayarları</h3>
                <div className="group-settings-avatar-wrap">
                  <button
                    type="button"
                    className="group-settings-avatar-circle"
                    onClick={() => openMediaPicker("group")}
                  >
                    <img
                      src={safeImageSrc(
                        pendingGroupAvatar ||
                          groupSettingsAvatarInput ||
                          activeDmUser?.profilePic,
                        "/group-default.svg",
                      )}
                      alt="Grup"
                    />
                    <div className="group-settings-avatar-overlay">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08zM20.71 7.04c.39-.39.39-1.02 0-1.41L18.37 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                      </svg>
                    </div>
                  </button>
                </div>
                <input
                  ref={groupAvatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => handleMediaFileChange("group", e)}
                />
                <input
                  className="status-input group-create-name-input"
                  placeholder="Grup adı"
                  value={groupSettingsNameInput}
                  onChange={(e) => setGroupSettingsNameInput(e.target.value)}
                  maxLength={32}
                  disabled={groupSettingsSaving}
                />
                <div className="group-settings-policy-wrap">
                  <label className="group-settings-policy-label">
                    Kimler mesaj atabilir?
                  </label>
                  <CustomSelect
                    className="group-settings-policy-select status-dropdown-group"
                    value={groupSettingsSendPolicy}
                    onChange={(next) =>
                      setGroupSettingsSendPolicy(
                        next as
                          | "all_members"
                          | "owner_only"
                          | "selected_members",
                      )
                    }
                    options={[
                      {
                        value: "all_members",
                        label: "Herkes mesaj atabilir",
                        icon: (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M7.5 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm9 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19.5c0-2.6 2.8-4.5 6-4.5s6 1.9 6 4.5V21h-12v-1.5zm13.5 1.5v-1.2c0-1.5-.7-2.8-1.9-3.7 2.6.2 4.9 1.7 4.9 3.9V21H17z" />
                          </svg>
                        ),
                      },
                      {
                        value: "owner_only",
                        label: "Sadece ben",
                        icon: (
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 3 14.5 8 20 8.8l-4 3.9.9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-3.9L9.5 8 12 3z" />
                          </svg>
                        ),
                      },
                    ]}
                    disabled={groupSettingsSaving}
                  />
                </div>
                {groupSettingsError && (
                  <p className="group-create-error">{groupSettingsError}</p>
                )}
                <div className="confirm-btn-group">
                  <button
                    className="confirm-btn cancel"
                    disabled={groupSettingsSaving}
                    onClick={() => setShowGroupSettingsModal(false)}
                  >
                    Vazgeçtim
                  </button>
                  <button
                    className="confirm-btn primary"
                    disabled={groupSettingsSaving}
                    onClick={() => {
                      void saveGroupSettingsNow();
                    }}
                  >
                    {groupSettingsSaving ? "Kaydediliyor" : "Kaydet"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {confirmModal.show && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay confirm-modal-overlay"
              onClick={() => {
                confirmModal.onCancel?.();
                setConfirmModal({ ...confirmModal, show: false });
              }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="confirm-modal-content"
              >
                <h3>{confirmModal.title}</h3>
                <p>{confirmModal.message}</p>

                <div className="confirm-btn-group">
                  {!confirmModal.hideCancel && (
                    <button
                      onClick={() => {
                        confirmModal.onCancel?.();
                        setConfirmModal({ ...confirmModal, show: false });
                      }}
                      className="confirm-btn cancel"
                    >
                      Vazgeçtim
                    </button>
                  )}
                  <button
                    onClick={() => {
                      confirmModal.onConfirm();
                      setConfirmModal({ ...confirmModal, show: false });
                    }}
                    className="confirm-btn danger"
                  >
                    {confirmModal.confirmText || "Evet, devam et"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {showStatusModal && (
            <motion.div
              className="modal-overlay"
              onClick={() => setShowStatusModal(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                className="status-modal-wrapper"
                onClick={(e) => e.stopPropagation()}
                initial={{
                  opacity: 0,
                  y: 12,
                  scale: 0.985,
                  filter: "blur(6px)",
                }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 16, scale: 0.985, filter: "blur(6px)" }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <img
                  src="/pengi-wonder.png"
                  alt="Mascot"
                  className="status-mascot"
                  draggable={false}
                />

                <motion.div
                  className="status-settings-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h2 className="status-modal-title">Su an ne yapıyorsun?</h2>

                  <div className="status-input-group">
                    <label className="status-input-label">Özel Durum</label>
                    <input
                      type="text"
                      className="status-borderless-input"
                      placeholder="Bring Me To Life sarkisini dinliyorum..."
                      value={tempCustom}
                      maxLength={100}
                      onChange={(e) => setTempCustom(e.target.value)}
                    />
                  </div>

                  <div className="status-dropdown-group">
                    <label className="status-input-label">Durum Ayarla</label>
                    <div
                      className="custom-dropdown-container"
                      ref={dropdownRef}
                    >
                      <div
                        className="custom-dropdown-header"
                        onClick={() => setShowDropdown(!showDropdown)}
                      >
                        <StatusDot
                          className="status-icon-preview"
                          status={tempStatus}
                          size="md"
                        />
                        <span className="selected-label">
                          {tempStatus === "online"
                            ? "Çevrim içi"
                            : tempStatus === "idle"
                              ? "Bosta"
                              : tempStatus === "dnd"
                                ? "Rahatsiz Etme"
                                : "Görünmez"}
                        </span>
                      </div>
                      <AnimatePresence>
                        {showDropdown && (
                          <motion.div
                            className="custom-dropdown-list"
                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                            transition={{
                              duration: 0.26,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                          >
                            {[
                              { id: "online", label: "Çevrim içi" },
                              { id: "idle", label: "Bosta" },
                              { id: "dnd", label: "Rahatsiz Etme" },
                              { id: "offline", label: "Görünmez" },
                            ].map((status) => (
                              <div
                                key={status.id}
                                className={`dropdown-option ${tempStatus === status.id ? "active" : ""}`}
                                onClick={() => {
                                  setTempStatus(status.id);
                                  setShowDropdown(false);
                                }}
                              >
                                <StatusDot
                                  className="status-icon-preview-mini"
                                  status={status.id}
                                  size="sm"
                                />
                                <span>{status.label}</span>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="status-modal-footer">
                    <span
                      className="status-cancel-text"
                      onClick={() => setShowStatusModal(false)}
                    >
                      Iptal
                    </span>
                    <button
                      className="status-apply-btn"
                      onClick={handleSaveStatus}
                    >
                      Ayarla
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <SettingsPanel
            CustomSelect={CustomSelect}
            OWNER_UID={OWNER_UID}
            adminErrField={adminErrField}
            adminErrMsg={adminErrMsg}
            adminLoading={adminLoading}
            adminShake={adminShake}
            adminUidInput={adminUidInput}
            adminUidMenuOpen={adminUidMenuOpen}
            admins={admins}
            auth={auth}
            authImageError={authImageError}
            authImageInput={authImageInput}
            authImageShake={authImageShake}
            authImageSuccess={authImageSuccess}
            avatarInputRef={avatarInputRef}
            badgeDefs={badgeDefs}
            badgeErrField={badgeErrField}
            badgeErrMsg={badgeErrMsg}
            badgeIconUrl={badgeIconUrl}
            badgeName={badgeName}
            badgePermissionKey={badgePermissionKey}
            badgeShake={badgeShake}
            badgeType={badgeType}
            bannerInputRef={bannerInputRef}
            bio={bio}
            changelogData={changelogData}
            closeEditBadge={closeEditBadge}
            closeProfileEditModal={closeProfileEditModal}
            createdAt={createdAt}
            cropImageRef={cropImageRef}
            customStatus={customStatus}
            db={db}
            developerMode={developerMode}
            desktopNotificationsEnabled={desktopNotificationsEnabled}
            displayName={displayName}
            doc={doc}
            draftThemeId={draftThemeId}
            editBadgeErrField={editBadgeErrField}
            editBadgeErrMsg={editBadgeErrMsg}
            editBadgeIconUrl={editBadgeIconUrl}
            editBadgeName={editBadgeName}
            editBadgePermissionKey={editBadgePermissionKey}
            editBadgeShake={editBadgeShake}
            editBadgeType={editBadgeType}
            effectiveBanner={effectiveBanner}
            effectiveProfilePic={effectiveProfilePic}
            effectiveStatus={effectiveStatus}
            email={email}
            fetchUserByUid={fetchUserByUid}
            formatDate={formatDate}
            formatDateTR={formatDateTR}
            formatMsDateTime={formatMsDateTime}
            getUserEffectiveStatus={getUserEffectiveStatus}
            getUserLastSeenText={getUserLastSeenText}
            handleApplyCrop={handleApplyCrop}
            handleCancelAllChanges={handleCancelAllChanges}
            handleCancelCrop={handleCancelCrop}
            handleConfirmEmailChange={handleConfirmEmailChange}
            handleCopyUserUid={handleCopyUserUid}
            handleCropPointerDown={handleCropPointerDown}
            handleCropPointerMove={handleCropPointerMove}
            handleCropPointerUp={handleCropPointerUp}
            handleCropZoomChange={handleCropZoomChange}
            handleLogout={handleLogout}
            handleMediaFileChange={handleMediaFileChange}
            handleSaveAllChanges={handleSaveAllChanges}
            handleSaveAuthImage={handleSaveAuthImage}
            handleSaveBio={handleSaveBio}
            handleSaveDisplayName={handleSaveDisplayName}
            handleSaveEmail={handleSaveEmail}
            handleSaveUsername={handleSaveUsername}
            handleSelectTheme={handleSelectTheme}
            handleSendNewEmailCode={handleSendNewEmailCode}
            handleToggleDeveloperMode={handleToggleDeveloperMode}
            handleUpdateBadge={handleUpdateBadge}
            handleVerifyEmailCode={handleVerifyEmailCode}
            handleVerifyNewEmailCode={handleVerifyNewEmailCode}
            isAdmin={isAdmin}
            isApplyingSettings={isApplyingSettings}
            isSavingAllChanges={isSavingAllChanges}
            isBadgeActiveForTarget={isBadgeActiveForTarget}
            isOwner={isOwner}
            isVideoUrl={isVideoUrl}
            lastActive={lastActive}
            maskEmail={maskEmail}
            mediaCropBaseScale={mediaCropBaseScale}
            mediaCropBox={mediaCropBox}
            mediaCropError={mediaCropError}
            mediaCropImage={mediaCropImage}
            mediaCropOffset={mediaCropOffset}
            mediaCropOpen={mediaCropOpen}
            mediaCropSrc={mediaCropSrc}
            mediaCropType={mediaCropType}
            mediaCropZoom={mediaCropZoom}
            mediaDirty={mediaDirty}
            mediaUploadState={mediaUploadState}
            openEditBadge={openEditBadge}
            openMediaPicker={openMediaPicker}
            openProfileEditModal={openProfileEditModal}
            openUrl={openUrl}
            password={password}
            presence={presence}
            profileActionsOpen={profileActionsOpen}
            profileEditCodeInput={profileEditCodeInput}
            profileEditError={profileEditError}
            profileEditErrorField={profileEditErrorField}
            profileEditField={profileEditField}
            profileEditInfo={profileEditInfo}
            profileEditLoading={profileEditLoading}
            profileEditNewCodeInput={profileEditNewCodeInput}
            profileEditNewStage={profileEditNewStage}
            profileEditPassword={profileEditPassword}
            profileEditStep={profileEditStep}
            profileEditValue={profileEditValue}
            profilePic={profilePic}
            profileUsernameStatus={profileUsernameStatus}
            renderActiveBadges={renderActiveBadges}
            renderBadgesForUser={renderBadgesForUser}
            renderMetaCopyValue={renderMetaCopyValue}
            requestCloseSettings={requestCloseSettings}
            requestCreateBadge={requestCreateBadge}
            requestDeleteBadge={requestDeleteBadge}
            requestToggleBadgeVisibility={requestToggleBadgeVisibility}
            safeImageSrc={safeImageSrc}
            safeUrl={safeUrl}
            sanitizeUsernameInput={sanitizeUsernameInput}
            serverTimestamp={serverTimestamp}
            setAdminProfileModal={setAdminProfileModal}
            setAdminUidInput={setAdminUidInput}
            setAdminUidMenuOpen={setAdminUidMenuOpen}
            setAuthImageInput={setAuthImageInput}
            setBadgeErrField={setBadgeErrField}
            setBadgeErrMsg={setBadgeErrMsg}
            setBadgeIconUrl={setBadgeIconUrl}
            setBadgeName={setBadgeName}
            setBadgePermissionKey={setBadgePermissionKey}
            setBadgeType={setBadgeType}
            setBanModal={setBanModal}
            setBanReason={setBanReason}
            setClErrors={setClErrors}
            setClImageUrl={setClImageUrl}
            setClNewFeatures={setClNewFeatures}
            setClRemoved={setClRemoved}
            setClShake={setClShake}
            setClTempDisabled={setClTempDisabled}
            setConfirmModal={setConfirmModal}
            setDoc={setDoc}
            setEditBadgeIconUrl={setEditBadgeIconUrl}
            setEditBadgeName={setEditBadgeName}
            setEditBadgePermissionKey={setEditBadgePermissionKey}
            setEditBadgeType={setEditBadgeType}
            setIsViewingOwnProfile={setIsViewingOwnProfile}
            setProfileActionsOpen={setProfileActionsOpen}
            setProfileEditCodeInput={setProfileEditCodeInput}
            setProfileEditInfo={setProfileEditInfo}
            setProfileEditNewCodeInput={setProfileEditNewCodeInput}
            setProfileEditPassword={setProfileEditPassword}
            setProfileEditValue={setProfileEditValue}
            setSettingsTab={setSettingsTab}
            setShowAdminList={setShowAdminList}
            setShowAuthImageTools={setShowAuthImageTools}
            setShowBadgeTools={setShowBadgeTools}
            setShowChangelogForm={setShowChangelogForm}
            setShowChangelogModal={setShowChangelogModal}
            setShowChangelogTools={setShowChangelogTools}
            setShowProfileEmail={setShowProfileEmail}
            setShowUserOps={setShowUserOps}
            setUidCopyTip={setUidCopyTip}
            settingsDirty={settingsDirty}
            settingsTab={settingsTab}
            shouldBlockSettingsClose={shouldBlockSettingsClose}
            showAdminList={showAdminList}
            showAuthImageTools={showAuthImageTools}
            showBadgeEditModal={showBadgeEditModal}
            showBadgeTools={showBadgeTools}
            showChangelogTools={showChangelogTools}
            showProfileEditModal={showProfileEditModal}
            showProfileEmail={showProfileEmail}
            showSettingsPage={showSettingsPage}
            showUserOps={showUserOps}
            targetUser={resolvedTargetUser}
            themes={themes}
            toggleDesktopNotifications={toggleDesktopNotifications}
            toggleBadgeForTarget={toggleBadgeForTarget}
            triggerUnsavedNudge={triggerUnsavedNudge}
            uidCopyTip={uidCopyTip}
            unsavedFlash={unsavedFlash}
            userDocData={userDocData}
            userOpsRef={userOpsRef}
            username={username}
          />
        </AnimatePresence>
        <AnimatePresence>
          {showChangelogModal && (
            <motion.div
              className="modal-overlay changelog-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChangelogModal(false)}
            >
              <motion.div
                className="changelog-card"
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.985 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="changelog-header">
                  <div className="changelog-title">Yenilikler</div>
                  <button
                    className="changelog-close"
                    onClick={() => setShowChangelogModal(false)}
                  >
                    ×
                  </button>
                </div>

                <div
                  className="changelog-hero"
                  style={{ borderRadius: "13px", userSelect: "none" }}
                >
                  {changelogData?.imageUrl ? (
                    changelogData.imageUrl.includes("youtube.com") ||
                    changelogData.imageUrl.includes("youtu.be") ? (
                      <iframe
                        className="changelog-hero-media"
                        src={
                          getEmbedUrl(changelogData.imageUrl, {
                            mute: false,
                            autoplay: true,
                          }) || ""
                        }
                        frameBorder="0"
                        allow="autoplay; encrypted-media"
                        allowFullScreen
                      />
                    ) : changelogData.imageUrl
                        .toLowerCase()
                        .endsWith(".mp4") ? (
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="changelog-hero-media"
                      >
                        <source src={changelogData.imageUrl} type="video/mp4" />
                      </video>
                    ) : (
                      <img src={changelogData.imageUrl} alt="Changelog" />
                    )
                  ) : (
                    <div className="changelog-hero-empty">
                      Görsel / video yok
                    </div>
                  )}
                </div>

                {!changelogData && (
                  <div className="changelog-empty">
                    Henüz yenilik paylasilmadı
                  </div>
                )}

                {changelogData?.newFeatures?.trim?.() && (
                  <div className="changelog-section">
                    <div className="changelog-section-header">
                      <hr className="changelog-hr" />
                      <i>
                        <div className="changelog-section-title new">
                          Yenilikler
                        </div>
                      </i>
                    </div>
                    <div className="changelog-section-body">
                      {changelogData.newFeatures}
                    </div>
                  </div>
                )}

                {changelogData?.tempDisabled?.trim?.() && (
                  <div className="changelog-section">
                    <div className="changelog-section-header">
                      <hr className="changelog-hr" />
                      <i>
                        <div className="changelog-section-title temp">
                          Devre Disi
                        </div>
                      </i>
                    </div>
                    <div className="changelog-section-body">
                      {changelogData.tempDisabled}
                    </div>
                  </div>
                )}

                {changelogData?.removed?.trim?.() && (
                  <div className="changelog-section">
                    <div className="changelog-section-header">
                      <hr className="changelog-hr" />
                      <i>
                        <div className="changelog-section-title removed">
                          Kaldırılan
                        </div>
                      </i>
                    </div>
                    <div className="changelog-section-body">
                      {changelogData.removed}
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showChangelogForm && (
            <motion.div
              className="modal-overlay changelog-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowChangelogForm(false)}
            >
              <motion.div
                className="changelog-form-card"
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.985 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="changelog-header">
                  <div
                    className="changelog-title"
                    style={{ textAlign: "center", margin: "auto" }}
                  >
                    Yenilik Yayınla
                  </div>
                  <button
                    className="changelog-close"
                    onClick={() => setShowChangelogForm(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="changelog-form">
                  <div
                    className={`piksel-group ${clShake.image ? "error-shake" : ""}`}
                  >
                    <div className="label-row">
                      <label>Görsel / Video URL</label>
                      {clErrors.image && (
                        <span className="err-txt">{clErrors.image}</span>
                      )}
                    </div>
                    <input
                      className="piksel-input2"
                      value={clImageUrl}
                      onChange={(e) => setClImageUrl(e.target.value)}
                      placeholder="Görsel / Video URL"
                    />
                  </div>

                  <div
                    className={`piksel-group ${clShake.new ? "error-shake" : ""}`}
                  >
                    <div className="label-row">
                      <label>Yeni Eklenen Özellikler</label>
                      {clErrors.new && (
                        <span className="err-txt">{clErrors.new}</span>
                      )}
                    </div>
                    <textarea
                      className="piksel-input2 row_conf"
                      rows={5}
                      value={clNewFeatures}
                      onChange={(e) => setClNewFeatures(e.target.value)}
                    />
                  </div>

                  <div
                    className={`piksel-group ${clShake.temp ? "error-shake" : ""}`}
                  >
                    <div className="label-row">
                      <label>Geçici Olarak Kapatılan</label>
                      {clErrors.temp && (
                        <span className="err-txt">{clErrors.temp}</span>
                      )}
                    </div>
                    <textarea
                      className="piksel-input2 row_conf"
                      rows={5}
                      value={clTempDisabled}
                      onChange={(e) => setClTempDisabled(e.target.value)}
                    />
                  </div>

                  <div
                    className={`piksel-group ${clShake.removed ? "error-shake" : ""}`}
                  >
                    <div className="label-row">
                      <label>Kaldırılan Özellikler</label>
                      {clErrors.removed && (
                        <span className="err-txt">{clErrors.removed}</span>
                      )}
                    </div>
                    <textarea
                      className="piksel-input2 row_conf"
                      rows={5}
                      value={clRemoved}
                      onChange={(e) => setClRemoved(e.target.value)}
                    />
                  </div>
                </div>

                <div className="confirm-btn-group" style={{ marginTop: 16 }}>
                  <button
                    className="confirm-btn cancel"
                    onClick={() => setShowChangelogForm(false)}
                  >
                    Vazgeçtim
                  </button>
                  <button
                    className="confirm-btn primary"
                    onClick={async () => {
                      setIsPublishingChangelog(true);
                      try {
                        if (!auth.currentUser) return "noop" as const;
                        const img = clImageUrl.trim();
                        const texts = [
                          clNewFeatures,
                          clTempDisabled,
                          clRemoved,
                        ].map((t) => t.trim());
                        const allEmpty = texts.every((t) => !t);
                        if (!img || allEmpty) {
                          const fields: Array<
                            "image" | "new" | "temp" | "removed"
                          > = [];
                          if (!img) fields.push("image");
                          if (allEmpty) fields.push("new", "temp", "removed");
                          triggerClErrors(fields, "Boş alanları doldurunuz");
                          return;
                        }
                        if (!isValidHttpUrl(img)) {
                          triggerClErrors(["image"], "Geçerli bir URL giriniz");
                          return;
                        }
                        const payload: any = {
                          imageUrl: clImageUrl.trim(),
                          newFeatures: clNewFeatures.trim(),
                          tempDisabled: clTempDisabled.trim(),
                          removed: clRemoved.trim(),
                          createdAt: serverTimestamp(),
                          createdBy: auth.currentUser.uid,
                        };
                        await setDoc(
                          doc(db, "settings", "changelog"),
                          payload,
                          {
                            merge: true,
                          },
                        );
                        setShowChangelogForm(false);
                      } finally {
                        setIsPublishingChangelog(false);
                      }
                    }}
                  >
                    {isPublishingChangelog ? (
                      <span className="auth-btn-loader" aria-hidden="true">
                        <span className="auth-btn-loader-dot"></span>
                        <span className="auth-btn-loader-dot delay-2"></span>
                        <span className="auth-btn-loader-dot delay-3"></span>
                      </span>
                    ) : (
                      "Paylaş!"
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="bottom-profile-area">
          <div
            className="profile-click-wrapper"
            onClick={(e) => {
              e.stopPropagation();
              setShowProfilePopup(!showProfilePopup);
            }}
          >
            <div className="profile-pp-container">
              <img
                src={safeImageSrc(
                  effectiveProfilePic,
                  "https://i.hizliresim.com/ntdyvrh.jpg",
                )}
                className="profile-circle-img"
                alt="Profil"
              />
              <StatusDot
                className="status-badge status-badge2"
                status={effectiveStatus}
                size="md"
              />
            </div>
            <div className="profile-info-container">
              <div className="name-stack">
                <span className="display-name-text">
                  {displayName || username}
                </span>
                <span className="user-name-text">{username}</span>
              </div>
              {customStatus?.trim()?.length > 0 && (
                <div className="profile-custom-status">
                  {customStatus.length > 100
                    ? customStatus.slice(0, 100) + "..."
                    : customStatus}
                </div>
              )}
            </div>
          </div>
          <div
            className="settings-icon-wrapper"
            onClick={(e) => {
              e.stopPropagation();
              setShowSettingsPage(true);
              setSettingsTab("profile");
              setSettingsDirty(false);
            }}
          >
            <div className="settings-hover-bg">
              <svg
                className="settings-svg"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.81,11.69,4.81,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.5c-1.93,0-3.5-1.57-3.5-3.5 s1.57-3.5,3.5-3.5s3.5,1.57,3.5,3.5S13.93,15.5,12,15.5z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-wrapper ${isWindowMaximized ? "window-full" : ""}`}>
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-left" data-tauri-drag-region>
          <span className="titlebar-brand">PIKSEL</span>
        </div>
        <div className="titlebar-right" data-tauri-drag-region="false">
          <div
            className="titlebar-button"
            data-tauri-drag-region="false"
            onClick={() => appWindow.minimize()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect fill="currentColor" width="10" height="1" x="1" y="6" />
            </svg>
          </div>
          <div
            className="titlebar-button"
            data-tauri-drag-region="false"
            onClick={async () => {
              await appWindow.toggleMaximize();
              const maximized = await appWindow.isMaximized();
              setIsWindowMaximized(maximized);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                width="9"
                height="9"
                x="1.5"
                y="1.5"
              />
            </svg>
          </div>
          <div
            className="titlebar-button close-btn"
            data-tauri-drag-region="false"
            onClick={() => appWindow.close()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                fill="currentColor"
                d="M1.1,1.1L10.9,10.9 M10.9,1.1L1.1,10.9"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {(!dbReady || holdLoader || (!isLoggedIn && !authMediaReady)) && (
          <motion.div exit={{ opacity: 0 }} className="piksel-loaderfx-screen">
            <div className="piksel-loaderfx-container">
              <div className="piksel-loaderfx-logo" data-text="PIKSEL">
                PIKSEL
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {errorPopup.show && (
          <motion.div className="error-status-popup">
            {errorPopup.msg}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {dbReady &&
          (isLoggedIn ? (
            <motion.div
              key="app"
              className="main-app-bg logged-in-size"
              style={{ height: "100%", width: "100%" }}
              initial={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.98, filter: "blur(10px)" }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="titlebar" data-tauri-drag-region>
                <div className="titlebar-left" data-tauri-drag-region>
                  <span className="titlebar-brand">PIKSEL</span>
                </div>
                <div className="titlebar-right" data-tauri-drag-region="false">
                  <div
                    className="titlebar-button"
                    data-tauri-drag-region="false"
                    onClick={() => appWindow.minimize()}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <rect
                        fill="currentColor"
                        width="10"
                        height="1"
                        x="1"
                        y="6"
                      />
                    </svg>
                  </div>
                  <div
                    className="titlebar-button"
                    data-tauri-drag-region="false"
                    onClick={async () => {
                      await appWindow.toggleMaximize();
                      const maximized = await appWindow.isMaximized();
                      setIsWindowMaximized(maximized);
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <rect
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        width="9"
                        height="9"
                        x="1.5"
                        y="1.5"
                      />
                    </svg>
                  </div>
                  <div
                    className="titlebar-button close-btn"
                    data-tauri-drag-region="false"
                    onClick={() => appWindow.close()}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <path
                        fill="currentColor"
                        d="M1.1,1.1L10.9,10.9 M10.9,1.1L1.1,10.9"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="main-content-placeholder"></div>
            </motion.div>
          ) : (
            <AuthView
              isLogin={isLogin}
              isVerifying={isVerifying}
              isBtnDisabled={isBtnDisabled}
              isSending={isSending}
              email={email}
              username={username}
              password={password}
              otp={otp}
              timer={timer}
              dbImage={dbImage}
              authMediaReady={authMediaReady}
              showStatusModal={showStatusModal}
              tempCustom={tempCustom}
              tempStatus={tempStatus}
              userStatus={userStatus}
              customStatus={customStatus}
              errorField={errorField}
              errorMsg={errorMsg}
              shakeField={shakeField}
              regUsernameStatus={regUsernameStatus}
              topInputRef={topInputRef}
              setEmail={setEmail}
              setUsername={setUsername}
              setPassword={setPassword}
              setOtp={setOtp}
              setAuthMediaReady={setAuthMediaReady}
              setShowStatusModal={setShowStatusModal}
              setTempCustom={setTempCustom}
              setTempStatus={setTempStatus}
              setIsLogin={setIsLogin}
              setIsVerifying={setIsVerifying}
              clearForm={clearForm}
              handleAction={handleAction}
              handleNoSpace={handleNoSpace}
              sanitizeUsernameInput={sanitizeUsernameInput}
              resendCode={resendCode}
              getEmbedUrl={getEmbedUrl}
              handleSaveStatus={handleSaveStatus}
            />
          ))}
      </AnimatePresence>
      <AnimatePresence>
        {errorPopup.show && (
          <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 50, opacity: 0 }}
            className="error-status-popup"
          >
            {errorPopup.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
