import { motion } from "framer-motion";
import { memo } from "react";
import StatusDot from "../../../shared/components/StatusDot";
import type { RefObject } from "react";

type ProfilePopupProps = {
  profilePopupRef: RefObject<HTMLDivElement | null>;
  effectiveProfilePic: string;
  effectiveStatus: string;
  displayName: string;
  username: string;
  customStatus: string;
  userStatus: string;
  setProfileTab: (tab: "about" | "info") => void;
  setIsViewingOwnProfile: (v: boolean) => void;
  setShowProfileModal: (v: boolean) => void;
  setShowProfilePopup: (v: boolean) => void;
  setTempStatus: (v: string) => void;
  setTempCustom: (v: string) => void;
  setShowStatusModal: (v: boolean) => void;
  setConfirmModal: (value: any) => void;
  handleLogout: () => Promise<void>;
  safeImageSrc: (value?: string, fallback?: string) => string;
};

function ProfilePopup({
  profilePopupRef,
  effectiveProfilePic,
  effectiveStatus,
  displayName,
  username,
  customStatus,
  userStatus,
  setProfileTab,
  setIsViewingOwnProfile,
  setShowProfileModal,
  setShowProfilePopup,
  setTempStatus,
  setTempCustom,
  setShowStatusModal,
  setConfirmModal,
  handleLogout,
  safeImageSrc,
}: ProfilePopupProps) {
  return (
    <motion.div
      ref={profilePopupRef}
      initial={{ opacity: 0, scale: 0.9, y: 15, filter: "blur(12px) brightness(1.2)" }}
      animate={{
        opacity: 1,
        scale: 1,
        y: 0,
        filter: "blur(0px) brightness(1)",
        transition: { type: "spring", damping: 25, stiffness: 400, mass: 0.8 },
      }}
      exit={{ opacity: 0, scale: 0.95, y: 10, filter: "blur(8px)", transition: { duration: 0.15, ease: "easeOut" } }}
      className="profile-popup"
    >
      <div
        className="popup-header"
        onClick={(e) => {
          e.stopPropagation();
          setProfileTab("about");
          setIsViewingOwnProfile(true);
          setShowProfileModal(true);
          setShowProfilePopup(false);
        }}
      >
        <div className="popup-pp-container">
          <img src={safeImageSrc(effectiveProfilePic, "https://i.hizliresim.com/ntdyvrh.jpg")} className="popup-pp" alt="Profil" />
          <StatusDot className="status-badge-popup x" status={effectiveStatus} size="lg" />
        </div>
        <div className="popup-names">
          <span className="popup-display">{displayName || username}</span>
          <span className="popup-user">{username}</span>
        </div>
      </div>

      <div className="popup-menu">
        <div
          className="status-item"
          onClick={(e) => {
            e.stopPropagation();
            setTempStatus(userStatus);
            setTempCustom(customStatus);
            setShowStatusModal(true);
          }}
          style={{ position: "relative" }}
        >
          <div className="status-item-left">
            <StatusDot className="status-dot" status={effectiveStatus} size="sm" />
            <span>
              {customStatus
                ? customStatus.length > 20
                  ? customStatus.substring(0, 20) + "..."
                  : customStatus
                : "Durum Ayarla"}
            </span>
          </div>
        </div>

        <div
          className="menu-item logout-item"
          onClick={() => {
            setConfirmModal({
              show: true,
              title: "Çıkış Yap",
              message: "Hesabından çıkış yapmak istediğine emin misin?",
              onConfirm: handleLogout,
            });
          }}
        >
          Çıkış Yap
        </div>
      </div>
    </motion.div>
  );
}

export default memo(ProfilePopup);


