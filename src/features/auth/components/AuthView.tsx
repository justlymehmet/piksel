import { AnimatePresence, motion } from "framer-motion";
import { memo } from "react";
import type { RefObject } from "react";

type AuthViewProps = {
  isLogin: boolean;
  isVerifying: boolean;
  isBtnDisabled: boolean;
  isSending: boolean;
  email: string;
  username: string;
  password: string;
  otp: string;
  timer: number;
  dbImage: string;
  authMediaReady: boolean;
  showStatusModal: boolean;
  tempCustom: string;
  tempStatus: string;
  userStatus: string;
  customStatus: string;
  errorField: string;
  errorMsg: string;
  shakeField: string;
  regUsernameStatus: "idle" | "checking" | "available" | "taken" | "invalid";
  topInputRef: RefObject<HTMLInputElement | null>;
  setEmail: (v: string) => void;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  setOtp: (v: string) => void;
  setAuthMediaReady: (v: boolean) => void;
  setShowStatusModal: (v: boolean) => void;
  setTempCustom: (v: string) => void;
  setTempStatus: (v: string) => void;
  setIsLogin: (v: boolean) => void;
  setIsVerifying: (v: boolean) => void;
  clearForm: () => void;
  handleAction: () => void;
  handleNoSpace: (e: any, setter: any) => void;
  sanitizeUsernameInput: (v: string) => string;
  resendCode: () => void;
  getEmbedUrl: (url: string) => string | null;
  handleSaveStatus: () => void;
};

function AuthView({
  isLogin,
  isVerifying,
  isBtnDisabled,
  isSending,
  email,
  username,
  password,
  otp,
  timer,
  dbImage,
  showStatusModal,
  tempCustom,
  tempStatus,
  userStatus,
  customStatus,
  errorField,
  errorMsg,
  shakeField,
  regUsernameStatus,
  topInputRef,
  setEmail,
  setUsername,
  setPassword,
  setOtp,
  setAuthMediaReady,
  setShowStatusModal,
  setTempCustom,
  setTempStatus,
  setIsLogin,
  setIsVerifying,
  clearForm,
  handleAction,
  handleNoSpace,
  sanitizeUsernameInput,
  resendCode,
  getEmbedUrl,
  handleSaveStatus,
}: AuthViewProps) {
  const bounceLoader = (
    <div className="auth-btn-loader" aria-hidden="true">
      <div className="auth-btn-loader-dot"></div>
      <div className="auth-btn-loader-dot delay-2"></div>
      <div className="auth-btn-loader-dot delay-3"></div>
    </div>
  );

  return (
    <motion.div
      key="auth"
      className="split-container"
      initial={{ opacity: 0, x: 120, filter: "blur(10px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: -60, filter: "blur(10px)" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="form-section">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isBtnDisabled || isSending) return;
            handleAction();
          }}
        >
          <motion.div key={isLogin ? "l" : "r"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="form-content">
            <h1 className="form-title unselectable">{isLogin ? "GIRIŞ YAP" : "KAYIT OL"}</h1>
            <div className="input-stack">
              <div className={`piksel-group ${shakeField === "email" ? "error-shake" : ""}`}>
                <div className="label-row">
                  <label>{isLogin ? "E-Posta*" : "E-Posta* (Kod Gönderilecek)"}</label>
                  {errorField === "email" && <span className="err-txt">{errorMsg}</span>}
                </div>
                <input ref={topInputRef} type="text" value={email} onChange={(e) => handleNoSpace(e, setEmail)} className="piksel-input" />
              </div>

              {!isLogin && (
                <div className={`piksel-group ${shakeField === "username" ? "error-shake" : ""}`}>
                  <div className="label-row">
                    <label>Kullanıcı Adı*</label>
                    {errorField === "username" && <span className="err-txt">{errorMsg}</span>}
                    {errorField !== "username" && username.trim().length > 0 && regUsernameStatus === "checking" && (
                      <span style={{ color: "#9aa0a6", fontWeight: 600, fontSize: "11px" }}>Kontrol ediliyor</span>
                    )}
                    {errorField !== "username" && username.trim().length > 0 && regUsernameStatus === "available" && (
                      <span style={{ color: "#2ecc71", fontWeight: 700, fontSize: "11px" }}>Bu kullanıcı adı güzel görünüyor</span>
                    )}
                    {errorField !== "username" && username.trim().length > 0 && regUsernameStatus === "taken" && (
                      <span className="err-txt">Bu kullanıcı adı kullanılıyor</span>
                    )}
                  </div>
                  <input type="text" value={username} onChange={(e) => setUsername(sanitizeUsernameInput(e.target.value))} className="piksel-input" maxLength={16} />
                </div>
              )}

              <div className={`piksel-group ${shakeField === "password" ? "error-shake" : ""}`}>
                <div className="label-row">
                  <label>Şifre*</label>
                  {errorField === "password" && <span className="err-txt">{errorMsg}</span>}
                </div>
                <input type="password" value={password} onChange={(e) => handleNoSpace(e, setPassword)} className="piksel-input" />
                {!isLogin && password.length > 0 && (
                  <div className="strength-bar">
                    <div className={`bar ${password.length > 0 ? "active" : ""}`}></div>
                    <div className={`bar ${password.length > 5 ? "active" : ""}`}></div>
                    <div className={`bar ${password.length > 8 ? "active" : ""}`}></div>
                  </div>
                )}
              </div>

              {isVerifying && (
                <div className={`piksel-group ${shakeField === "otp" ? "error-shake" : ""}`}>
                  <div className="label-row">
                    <label>Doğrulama Kodunuz*</label>
                    {errorField === "otp" && <span className="err-txt">{errorMsg}</span>}
                  </div>
                  <input ref={topInputRef} type="text" value={otp} onChange={(e) => handleNoSpace(e, setOtp)} className="piksel-input center-text" />
                </div>
              )}

              <div className="button-logic-wrapper">
                {!isVerifying ? (
                  <div className={`btn-container ${isBtnDisabled ? "locked" : "active"}`}>
                    <button type="submit" disabled={isBtnDisabled} onClick={handleAction} className="piksel-btn">
                      <span>{isSending ? bounceLoader : isLogin ? "Giriş Yap" : "Kod Gönder"}</span>
                    </button>
                  </div>
                ) : (
                  <div className="verify-container-stack">
                    <div className="verify-row">
                      <div className={`btn-container ${isSending ? "locked" : "active"}`}>
                        <button type="submit" disabled={isSending} onClick={handleAction} className="piksel-btn">
                          {isSending ? bounceLoader : "Doğrula"}
                        </button>
                      </div>
                      {timer === 0 && (
                        <div className={`btn-container ${isSending ? "locked" : "active"} resend-btn`}>
                          <button type="button" disabled={isSending} onClick={resendCode} className="piksel-btn resend-text">
                            {isSending ? bounceLoader : "Kod İste"}
                          </button>
                        </div>
                      )}
                    </div>
                    {timer > 0 && (
                      <div className="timer-text">
                        Yeni kod istemek için kalan süre: {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, "0")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="switch-text" onClick={() => { clearForm(); setIsLogin(!isLogin); setIsVerifying(false); }}>
                {isLogin ? "Henüz kayıt olmadın mı? Kaydını yapalım" : "Zaten hesabın var mı? Giriş yapalım"} <span className="arrow"> ➜</span>
              </div>
            </div>
          </motion.div>
        </form>
      </div>

      <div className="image-section">
        {dbImage.includes("youtube.com") || dbImage.includes("youtu.be") ? (
          <iframe className="side-img youtube-mode" src={getEmbedUrl(dbImage) || ""} frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen onLoad={() => setAuthMediaReady(true)} onError={() => setAuthMediaReady(true)}></iframe>
        ) : dbImage.toLowerCase().endsWith(".mp4") ? (
          <video autoPlay loop muted playsInline className="side-img" onLoadedData={() => setAuthMediaReady(true)} onError={() => setAuthMediaReady(true)}>
            <source src={dbImage} type="video/mp4" />
          </video>
        ) : (
          <img src={dbImage} className="side-img" alt="Background" onLoad={() => setAuthMediaReady(true)} onError={() => setAuthMediaReady(true)} />
        )}

        <AnimatePresence>
          {showStatusModal && (
            <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="status-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Durumunu Güncelle</h3>
                <input type="text" className="piksel-input" placeholder="Özel durum yaz..." value={tempCustom} onChange={(e) => setTempCustom(e.target.value)} />
                <select className="status-select" value={tempStatus} onChange={(e) => setTempStatus(e.target.value)}>
                  <option value="online">Çevrim içi</option>
                  <option value="idle">Boşta</option>
                  <option value="dnd">Rahatsız Etme</option>
                  <option value="offline">Görünmez</option>
                </select>
                <div className="modal-buttons">
                  <button
                    className="status-save-btn"
                    onClick={handleSaveStatus}
                    style={{ backgroundColor: tempStatus !== userStatus || tempCustom !== customStatus ? "white" : "#444", color: tempStatus !== userStatus || tempCustom !== customStatus ? "black" : "white" }}
                  >
                    {tempStatus !== userStatus || tempCustom !== customStatus ? "Onayla" : "Iptal"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <div className="gradient-overlay" />
      </div>
    </motion.div>
  );
}

export default memo(AuthView);
