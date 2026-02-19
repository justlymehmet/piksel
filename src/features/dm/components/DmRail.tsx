import { memo } from "react";
import DmRailSkeleton from "./DmRailSkeleton";
import StatusDot from "../../../shared/components/StatusDot";

export type DmRailSection = "friends" | "store" | "subscription";

type DmRailProps = {
  dmSection: DmRailSection;
  onSelectFriends: () => void;
  onSelectStore: () => void;
  onSelectSubscription: () => void;
  onOpenCreateGroup: () => void;
  showLoadingSkeleton: boolean;
  dmInboxes: any[];
  dmUsers: Record<string, any>;
  friendUsers: Record<string, any>;
  activeDmId: string | null;
  openDmFromInbox: (row: any) => void;
  closeDmFromList: (conversationId: string) => void;
  getDmUserStatus: (u: any) => string;
  getDmUserCustomStatus: (u: any) => string;
  safeImageSrc: (value?: string, fallback?: string) => string;
};

function DmRail({
  dmSection,
  onSelectFriends,
  onSelectStore,
  onSelectSubscription,
  onOpenCreateGroup,
  showLoadingSkeleton,
  dmInboxes,
  dmUsers,
  friendUsers,
  activeDmId,
  openDmFromInbox,
  closeDmFromList,
  getDmUserStatus,
  getDmUserCustomStatus,
  safeImageSrc,
}: DmRailProps) {
  const hasDm = dmInboxes.length > 0;

  return (
    <aside className="dm-rail">
      <button
        className={`content-toggle ${dmSection === "friends" ? "active" : ""}`}
        onClick={onSelectFriends}
      >
        <span>Arkadaşlar</span>
      </button>
      <button
        className={`content-toggle ${dmSection === "store" ? "active" : ""}`}
        onClick={onSelectStore}
      >
        <span className="dm-name">Mağaza</span>
      </button>
      <button
        className={`content-toggle ${dmSection === "subscription" ? "active" : ""}`}
        onClick={onSelectSubscription}
      >
        <span className="dm-name">Abonelik</span>
      </button>
      <div className="dm-title-row">
        <div className="dm-title">Sohbetlerin</div>
        <button
          type="button"
          className="dm-title-add-btn"
          aria-label="Grup oluştur"
          onClick={onOpenCreateGroup}
        >
          +
        </button>
      </div>
      <div className="dm-list">
        {showLoadingSkeleton ? (
          <DmRailSkeleton animated={hasDm} />
        ) : (
          <>
            {dmInboxes.length === 0 && <DmRailSkeleton animated={false} />}
            {dmInboxes.map((row) => {
              const isGroup = String(row?.type || "") === "group";
              const u = isGroup
                ? null
                : friendUsers[row.otherUid] || dmUsers[row.otherUid] || {
                    uid: row.otherUid,
                    username: "",
                    displayName: "Bir dost",
                  };
              const dmLabel = isGroup
                ? String(row?.groupName || "").trim() || "Yeni Grup"
                : u?.displayName || u?.username || "Bir dost";
              const groupMemberCount = Number(row?.memberCount || 0);
              const userCustomStatus = isGroup
                ? ""
                : String(getDmUserCustomStatus(u) || "").trim();
              const customStatusShort =
                userCustomStatus.length > 20
                  ? `${userCustomStatus.slice(0, 20)}...`
                  : userCustomStatus;
              const avatarSrc = isGroup
                ? safeImageSrc(row?.groupAvatarUrl, "/group-default.svg")
                : safeImageSrc(
                    u?.profilePic || u?.photoURL,
                    "https://i.hizliresim.com/ntdyvrh.jpg",
                  );

              return (
                <div
                  key={row.id}
                  className={`dm-item ${activeDmId === row.id ? "active" : ""}`}
                  onClick={() => openDmFromInbox(row)}
                >
                  <img className="dm-avatar" src={avatarSrc} alt="pp" />
                  <div className="dm-item-texts">
                    <div className="dm-name">{dmLabel}</div>
                    {isGroup ? (
                      <div className="dm-subtitle">
                        Grup - {groupMemberCount > 0 ? groupMemberCount : 1} Üye
                      </div>
                    ) : customStatusShort ? (
                      <div className="dm-subtitle">{customStatusShort}</div>
                    ) : null}
                  </div>
                  <div className="dm-item-meta">
                    {!isGroup && (
                      <StatusDot className="dm-status" status={getDmUserStatus(u)} size="md" />
                    )}
                    {!!row.unreadCount && row.unreadCount > 0 && (
                      <span className="dm-unread">{row.unreadCount}</span>
                    )}
                  </div>
                  <button
                    className="dm-close-btn"
                    type="button"
                    aria-label="DM kapat"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      closeDmFromList(row.id);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}

const areDmRailPropsEqual = (prev: DmRailProps, next: DmRailProps) => {
  return (
    prev.dmSection === next.dmSection &&
    prev.showLoadingSkeleton === next.showLoadingSkeleton &&
    prev.dmInboxes === next.dmInboxes &&
    prev.dmUsers === next.dmUsers &&
    prev.friendUsers === next.friendUsers &&
    prev.activeDmId === next.activeDmId &&
    prev.getDmUserStatus === next.getDmUserStatus &&
    prev.getDmUserCustomStatus === next.getDmUserCustomStatus
  );
};

export default memo(DmRail, areDmRailPropsEqual);


