require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const crypto = require("crypto");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");

const parsedCorsOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (parsedCorsOrigins.length === 0) return true;
  return parsedCorsOrigins.includes(origin);
};

const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.get("/", (_req, res) => {
  res.status(200).json({ ok: true, service: "piksel-api" });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});
const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  },
});

const hasDbConfig = Boolean(process.env.DATABASE_URL);
const pool = hasDbConfig
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        String(process.env.PG_SSL || "").toLowerCase() === "true"
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

const chatEnabled = Boolean(pool);

const getDmConversationId = (a, b) => {
  const [x, y] = [a, b].sort();
  return `dm_${x}_${y}`;
};

const getGroupConversationId = () => `grp_${crypto.randomUUID()}`;

const sanitizeGroupName = (value, maxLen = 60) => {
  const raw = String(value || "");
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLen).trim();
};

const MAX_GROUP_PARTICIPANTS = 12;
const E2EE_MODE = "e2ee_private";
const SERVER_MANAGED_MODE = "server_managed";
const ENCRYPTED_PLACEHOLDER_BODY = "__E2EE__";
const ENCRYPTED_PREVIEW_TEXT = "Sifreli mesaj";

const canUseChat = (res) => {
  if (!chatEnabled) {
    res.status(503).send({
      success: false,
      error: "CHAT_NOT_CONFIGURED",
      message: "Chat servisi için DATABASE_URL yapılandırılmalı.",
    });
    return false;
  }
  return true;
};

const initChatSchema = async () => {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'dm',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message TEXT,
      last_sender_id TEXT,
      name TEXT,
      avatar_url TEXT,
      owner_id TEXT,
      send_policy TEXT NOT NULL DEFAULT 'all_members'
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_conversation_participants (
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_read_at TIMESTAMPTZ,
      unread_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      client_nonce TEXT,
      message_kind TEXT NOT NULL DEFAULT 'user',
      system_actor_uid TEXT,
      body TEXT NOT NULL,
      encrypted_payload JSONB,
      is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      edited_at TIMESTAMPTZ
    );
  `);
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS client_nonce TEXT;
  `);
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS message_kind TEXT NOT NULL DEFAULT 'user';
  `);
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS system_actor_uid TEXT;
  `);
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS encrypted_payload JSONB;
  `);
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);
  await pool.query(`
    ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS deleted_by TEXT;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
    ON chat_messages (conversation_id, created_at DESC);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_sender_nonce_unique
    ON chat_messages (sender_id, client_nonce)
    WHERE client_nonce IS NOT NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chat_participants_user
    ON chat_conversation_participants (user_id, conversation_id);
  `);
  await pool.query(`
    ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS name TEXT;
  `);
  await pool.query(`
    ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `);
  await pool.query(`
    ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS owner_id TEXT;
  `);
  await pool.query(`
    ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS send_policy TEXT NOT NULL DEFAULT 'all_members';
  `);
  await pool.query(`
    ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS encryption_mode TEXT NOT NULL DEFAULT 'e2ee_private';
  `);
  await pool.query(`
    UPDATE chat_conversations
    SET encryption_mode = 'e2ee_private'
    WHERE encryption_mode IS NULL OR encryption_mode = '';
  `);
  await pool.query(`
    ALTER TABLE chat_conversation_participants
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
  `);
  await pool.query(`
    ALTER TABLE chat_conversation_participants
    ADD COLUMN IF NOT EXISTS can_send BOOLEAN NOT NULL DEFAULT TRUE;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_user_state (
      user_id TEXT PRIMARY KEY,
      active_conversation_id TEXT,
      group_members_collapsed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE chat_user_state
    ADD COLUMN IF NOT EXISTS group_members_collapsed BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_user_e2ee_keys (
      user_id TEXT PRIMARY KEY,
      public_key_jwk JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_presence_state (
      user_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'online',
      presence TEXT NOT NULL DEFAULT 'offline',
      custom_status TEXT NOT NULL DEFAULT '',
      last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_presence_connections (
      socket_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_presence_connections_user
    ON user_presence_connections (user_id);
  `);
};

const ensureDmConversation = async (myUid, otherUid) => {
  const conversationId = getDmConversationId(myUid, otherUid);
  await pool.query(
    `
    INSERT INTO chat_conversations (id, type, encryption_mode)
    VALUES ($1, 'dm', $2)
    ON CONFLICT (id) DO UPDATE
    SET encryption_mode = COALESCE(chat_conversations.encryption_mode, EXCLUDED.encryption_mode);
    `,
    [conversationId, E2EE_MODE],
  );
  await pool.query(
    `
    INSERT INTO chat_conversation_participants (conversation_id, user_id, unread_count)
    VALUES ($1, $2, 0), ($1, $3, 0)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    `,
    [conversationId, myUid, otherUid],
  );
  return conversationId;
};

const emitInboxUpdate = async (conversationId) => {
  if (!chatEnabled) return;
  const { rows } = await pool.query(
    `
    SELECT user_id
    FROM chat_conversation_participants
    WHERE conversation_id = $1
    `,
    [conversationId],
  );
  rows.forEach((r) => {
    io.to(`user:${r.user_id}`).emit("chat:inbox_updated", {
      userId: r.user_id,
      conversationId,
    });
  });
};

const sanitizeMessageText = (value, maxLen = 2000) => {
  const raw = String(value || "");
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLen)
    .trim();
};

const sanitizeActorName = (value, maxLen = 64) => {
  const raw = String(value || "");
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLen).trim();
};

const sanitizeEncryptedPayload = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = Number(value?.v || 0);
  const alg = String(value?.alg || "");
  const charset = String(value?.charset || "").toLowerCase();
  const ivB64 = String(value?.ivB64 || "");
  const ciphertextB64 = String(value?.ciphertextB64 || "");
  const recipientsRaw = value?.recipients;
  if (v !== 1) return null;
  if (alg !== "AES-GCM-256+RSA-OAEP-256") return null;
  if (charset !== "utf-8") return null;
  if (!ivB64 || !ciphertextB64) return null;
  if (!recipientsRaw || typeof recipientsRaw !== "object" || Array.isArray(recipientsRaw)) {
    return null;
  }
  const recipients = {};
  for (const [uid, item] of Object.entries(recipientsRaw)) {
    const cleanUid = String(uid || "").trim().slice(0, 120);
    const wrappedKeyB64 = String(item?.wrappedKeyB64 || "");
    if (!cleanUid || !wrappedKeyB64) continue;
    recipients[cleanUid] = { wrappedKeyB64 };
  }
  if (!Object.keys(recipients).length) return null;
  return {
    v: 1,
    alg,
    charset: "utf-8",
    ivB64,
    ciphertextB64,
    recipients,
  };
};

const getMessagePreviewText = (row) => {
  if (!row) return null;
  if (String(row?.messageKind || row?.message_kind || "") !== "user") {
    return row?.body ? String(row.body) : null;
  }
  if (Boolean(row?.isEncrypted || row?.is_encrypted)) return ENCRYPTED_PREVIEW_TEXT;
  return row?.body ? String(row.body) : null;
};

const mapMessageRow = (row) => ({
  id: String(row?.id || ""),
  conversationId: String(row?.conversationId || row?.conversation_id || ""),
  senderId: String(row?.senderId || row?.sender_id || ""),
  clientNonce: row?.clientNonce || row?.client_nonce || null,
  messageKind: row?.messageKind || row?.message_kind || "user",
  systemActorUid: row?.systemActorUid || row?.system_actor_uid || null,
  text: row?.text != null ? row.text : row?.body || "",
  encryptedPayload: row?.encryptedPayload || row?.encrypted_payload || null,
  isEncrypted: Boolean(row?.isEncrypted || row?.is_encrypted),
  createdAt: row?.createdAt || row?.created_at || null,
  editedAt: row?.editedAt || row?.edited_at || null,
  isEdited:
    typeof row?.isEdited === "boolean"
      ? row.isEdited
      : Boolean(row?.editedAt || row?.edited_at),
});

const createGroupSystemMessage = async (
  client,
  conversationId,
  messageKind,
  systemActorUid,
  body,
) => {
  if (!client || !conversationId || !messageKind || !body) return null;
  const inserted = await client.query(
    `
    INSERT INTO chat_messages (conversation_id, sender_id, message_kind, system_actor_uid, body)
    VALUES ($1, '__system__', $2, NULLIF($3, ''), $4)
    RETURNING
      id::text AS id,
      conversation_id AS "conversationId",
      sender_id AS "senderId",
      client_nonce AS "clientNonce",
      message_kind AS "messageKind",
      system_actor_uid AS "systemActorUid",
      body AS text,
      encrypted_payload AS "encryptedPayload",
      is_encrypted AS "isEncrypted",
      created_at AS "createdAt",
      edited_at AS "editedAt",
      (edited_at IS NOT NULL) AS "isEdited"
    `,
    [
      conversationId,
      messageKind,
      String(systemActorUid || "").trim(),
      sanitizeMessageText(body, 400),
    ],
  );
  return inserted.rows[0] ? mapMessageRow(inserted.rows[0]) : null;
};

const normalizeStatus = (value) => {
  const raw = String(value || "online").toLowerCase();
  if (raw === "idle" || raw === "dnd" || raw === "offline") return raw;
  return "online";
};

const normalizePresence = (value) => {
  return String(value || "").toLowerCase() === "online" ? "online" : "offline";
};

const sanitizeCustomStatus = (value, maxLen = 120) => {
  const raw = String(value || "");
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, maxLen).trim();
};

const mapPresenceRow = (row) => ({
  uid: String(row?.user_id || ""),
  status: normalizeStatus(row?.status),
  presence: normalizePresence(row?.presence),
  customStatus: String(row?.custom_status || ""),
  lastActive: row?.last_active || null,
  updatedAt: row?.updated_at || null,
});

const getPresenceStateByUid = async (uid) => {
  if (!pool) return null;
  const { rows } = await pool.query(
    `
    SELECT user_id, status, presence, custom_status, last_active, updated_at
    FROM user_presence_state
    WHERE user_id = $1
    LIMIT 1
    `,
    [uid],
  );
  if (!rows.length) return null;
  return mapPresenceRow(rows[0]);
};

const emitPresenceUpdate = async (uid) => {
  if (!pool || !uid) return;
  try {
    const payload = await getPresenceStateByUid(uid);
    if (!payload) return;
    io.emit("presence:update", payload);
  } catch (e) {
    console.error("presence emit error:", e);
  }
};

const upsertPresenceState = async (uid, input = {}) => {
  if (!pool || !uid) return null;
  const current = await getPresenceStateByUid(uid);
  const nextStatus = normalizeStatus(
    input.status != null ? input.status : current?.status || "online",
  );
  const nextPresence =
    input.presence != null
      ? normalizePresence(input.presence)
      : nextStatus === "offline"
        ? "offline"
        : "online";
  const nextCustom = sanitizeCustomStatus(
    input.customStatus != null
      ? input.customStatus
      : current?.customStatus || "",
  );
  const touchLastActive = input.touchLastActive !== false;

  const { rows } = await pool.query(
    `
    INSERT INTO user_presence_state
      (user_id, status, presence, custom_status, last_active, updated_at)
    VALUES
      ($1, $2, $3, $4, NOW(), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      presence = EXCLUDED.presence,
      custom_status = EXCLUDED.custom_status,
      last_active = CASE
        WHEN $5::boolean THEN NOW()
        ELSE user_presence_state.last_active
      END,
      updated_at = NOW()
    RETURNING user_id, status, presence, custom_status, last_active, updated_at
    `,
    [uid, nextStatus, nextPresence, nextCustom, touchLastActive],
  );
  return mapPresenceRow(rows[0]);
};

const refreshPresenceFromConnections = async (uid) => {
  if (!pool || !uid) return null;
  const cntRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM user_presence_connections
    WHERE user_id = $1
    `,
    [uid],
  );
  const count = Number(cntRes.rows[0]?.count || 0);
  const current = await getPresenceStateByUid(uid);
  const currentStatus = normalizeStatus(current?.status || "online");
  const nextPresence =
    count > 0 && currentStatus !== "offline" ? "online" : "offline";
  const touchLastActive = nextPresence === "offline";
  return await upsertPresenceState(uid, {
    status: currentStatus,
    presence: nextPresence,
    customStatus: current?.customStatus || "",
    touchLastActive,
  });
};

const smtpUser = String(process.env.SMTP_EMAIL || process.env.MAIL_USER || "").trim();
const rawSmtpPass = String(process.env.SMTP_PASS || process.env.MAIL_PASS || "");
const smtpPass = rawSmtpPass.replace(/\s+/g, "").trim();
const smtpHost = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
const smtpService = String(process.env.SMTP_SERVICE || "").trim();
const smtpPort = Number(process.env.SMTP_PORT || (smtpHost === "smtp.gmail.com" ? 465 : 587));
const smtpSecure =
  String(process.env.SMTP_SECURE || "").trim() !== ""
    ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
    : smtpPort === 465;

const smtpOptions = {
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
};

if (smtpService) {
  smtpOptions.service = smtpService;
}

const transporter = nodemailer.createTransport(smtpOptions);
const mailFromAddress = String(
  process.env.MAIL_FROM || smtpUser || process.env.SMTP_EMAIL || "",
).trim();
const mailFromName = String(process.env.MAIL_FROM_NAME || "PIKSEL").trim();
const mailFrom = mailFromAddress
  ? `${mailFromName} <${mailFromAddress}>`
  : `${mailFromName} <${smtpUser}>`;

const getMailErrorPayload = (err) => {
  const code = String(err?.code || "");
  const responseCode = Number(err?.responseCode || 0);
  if (code === "EAUTH" || responseCode === 534 || responseCode === 535) {
    return {
      success: false,
      error: "MAIL_AUTH_FAILED",
      message:
        "Mail gönderimi için Gmail uygulama şifresi doğrulanamadı. Gmail hesabında 2 adımlı doğrulama ve uygulama şifresi ayarını kontrol edin.",
    };
  }
  return {
    success: false,
    error: "MAIL_SEND_FAILED",
    message: "Mail gönderimi sırasında beklenmeyen bir hata oluştu.",
  };
};

const facts = [
  "Işık saniyede yaklaşık 300.000 kilometre hızla hareket eder.",
  "Dünyanın en derin noktası olan Mariana Çukuru yaklaşık 11 kilometre derinliktedir.",
  "Ahtapotların üç tane kalbi vardır.",
  "Mona Lisa tablosunun kaşları yoktur.",
  "Karıncalar kendi ağırlıklarının 50 katını kaldırabilirler.",
  "Zürafaların dilleri yaklaşık 50 santimetre uzunluğundadır.",
  "Venüs, Güneş sistemindeki en sıcak gezegendir.",
  "Balinalar suyun altında şarkı söyleyerek birbirleriyle haberleşirler.",
  "İnsan vücudundaki en güçlü kas çene kasıdır.",
  "Güneş, Dünya'dan yaklaşık 1.3 milyon kat daha büyüktür.",
  "Arılar beş göze sahiptir.",
  "Kutup ayıları aslında beyaz değil, şeffaf tüylere ve siyah bir deriye sahiptir.",
  "Çita, dünyanın en hızlı kara hayvanıdır ve 3 saniyede 100 km hıza çıkabilir.",
  "Eyfel Kulesi yazın genleşme nedeniyle yaklaşık 15 cm uzayabilir.",
  "Bir gün, Dünya'nın kendi etrafında dönmesi tam olarak 24 saat değil, 23 saat 56 dakika 4 saniyedir.",
  "Dünya'daki altın rezervlerinin %99'u çekirdektedir; tümünü çıkarsak Dünya'yı 45 cm kalınlığında bir altın tabakasıyla kaplayabiliriz.",
  "Uzaydaki sessizliğin nedeni ses dalgalarının iletilebileceği bir atmosfer olmamasıdır; ancak büyük gaz bulutlarının kendine has kokuları vardır.",
  "İnsan parmak izine benzeyen tek hayvan Koala'dır; mikroskop altında ayırt edilmeleri neredeyse imkansızdır.",
  "Satürn ve Jüpiter'de atmosferik basınç nedeniyle elmas yağmurları yağmaktadır.",
  "Bal bozulmayan tek gıdadır; arkeologlar Mısır piramitlerinde 3000 yıllık yenilebilir bal bulmuşlardır.",
  "Işık hızıyla gitseniz bile, Samanyolu Galaksisi'nin bir ucundan diğerine gitmeniz 100.000 yıl sürer.",
  "Kargalar yüzleri unutmazlar ve kendilerine kötü davranan insanları yıllarca hatırlayıp diğer kargalara haber verebilirler.",
  "Ahtapotların 3 kalbi, 9 beyni vardır ve kanları mavi renktedir.",
  "Dünya üzerindeki toplam karınca ağırlığı, toplam insan ağırlığına yakındır.",
  "Venüs kendi ekseni etrafında o kadar yavaş döner ki, bir günü bir yılından daha uzundur.",
  "Deniz atları, erkeklerin doğum yaptığı tek canlı türüdür.",
  "Plüton keşfedildiği andan gezegenlikten çıkarıldığı ana kadar Güneş'in etrafındaki tam turunu tamamlayamamıştır.",
  "İnsan vücudundaki tüm damarları uç uca ekleseydik Dünya'nın etrafını yaklaşık 4 kez sarardı.",
  "Bir kaşık dolusu nötron yıldızı yaklaşık 6 milyar ton ağırlığındadır.",
  "Su samurları uyurken akıntıya kapılmamak için el ele tutuşurlar.",
  "İnsanlar ve muzlar %50 oranında aynı DNA'ya sahiptir.",
  "Dünya'nın en yüksek dağı Everest değil, tabanından zirvesine ölçüldüğünde Mauna Kea'dır (yaklaşık 10.210 metre).",
  "Eyfel Kulesi sıcak havalarda genleşme nedeniyle 15 santimetreye kadar uzayabilir.",
  "Bir insan ömrü boyunca yaklaşık iki yüzme havuzu dolduracak kadar tükürük üretir.",
  "Vücudumuzdaki atomların %99'u her 10 yılda bir yenilenir; teknik olarak 10 yıl önceki 'siz' değilsiniz.",
  "Kangurular fiziksel yapıları gereği geri geri yürüyemezler.",
  "Mavi balinaların dili bir filin ağırlığı kadar olabilir.",
  "Dünya üzerindeki en eski ağaç 5000 yaşından büyüktür ve yeri gizli tutulmaktadır.",
  "İneklerin en iyi arkadaşları vardır ve onlardan ayrıldıklarında stres yaşarlar.",
  "Jüpiter'in 'Büyük Kırmızı Leke'si aslında 300 yıldır devam eden devasa bir fırtınadır.",
  "Ay'daki ayak izleri atmosfer olmadığı için milyonlarca yıl boyunca silinmeyecektir.",
  "Karıncalar ömürleri boyunca hiç uyumazlar.",
  "Dünyanın en kısa savaşı olan İngiliz-Zanzibar Savaşı sadece 38 dakika sürmüştür.",
  "Gözlerimiz doğduğumuzdan beri aynı boyuttadır ama burnumuz ve kulaklarımız büyümeye devam eder.",
  "Everest Dağı'nda internet bağlantısı bulunmaktadır.",
  "Kelebekler ayaklarıyla tat alırlar.",
  "Bir hamam böceği kafası kopsa bile haftalarca yaşayabilir; sadece yemek yiyemediği için ölür.",
  "Zürafaların ses telleri yoktur; bu yüzden tamamen sessiz hayvanlar olarak bilinirler.",
  "Sıcak su, soğuk sudan daha hızlı donar (Mpemba Etkisi).",
  "Dünya nüfusunun sadece %2'si doğal yeşil göz rengine sahiptir.",
  "Roma İmparatorluğu döneminde idrar, diş beyazlatmak için gargara olarak kullanılırdı.",
  "Kibrit, çakmaktan sonra icat edilmiştir.",
  "Bir aslanın kükremesi 8 kilometre uzaklıktan duyulabilir.",
  "Parmak izi gibi, her insanın dil izi de kendine özgüdür.",
  "İnsan kalbi vücut dışına çıkarılsa bile bir süre daha atmaya devam edebilir.",
  "Güneş Sistemi'ndeki tüm gezegenler Jüpiter'in içine sığabilir.",
  "Dünya aslında tam bir küre değil, kutuplardan basık bir 'geoid'dir.",
  "Güneş ışığının Dünya'ya ulaşması yaklaşık 8 dakika 20 saniye sürer.",
  "Arılar, insan yüzlerini birbirinden ayırt edebilirler.",
  "Rusya'nın yüzölçümü, Plüton gezegeninin yüzölçümünden daha büyüktür.",
  "Kediler tatlı tadını alamazlar.",
  "Kalamarların beyinleri halka şeklindedir ve yemek boruları bu halkanın içinden geçer.",
  "Napolyon Bonapart aslında kısa değil, dönemine göre normal bir boydaydı (1.68m).",
  "Bir salyangoz kesintisiz 3 yıl boyunca uyuyabilir.",
  "Deve kuşlarının gözleri beyinlerinden daha büyüktür.",
  "Dünya'daki oksijenin büyük bir kısmı ormanlardan değil, okyanuslardaki alglerden gelir.",
  "Havyar, aslında sadece Hazar ve Karadeniz'deki mersin balığından elde edilen yumurtadır.",
  "Penguenler partnerlerine evlenme teklifi etmek için onlara taş (çakıl taşı) verirler.",
  "Japonya'da kedi kafelerinden sonra 'baykuş kafeleri' de oldukça popülerdir.",
  "Umutsuzluğa kapılan filler bazen kalp kırıklığından ölebilirler.",
  "Ay aslında bir küre değil, limon şeklindedir.",
  "Günde yaklaşık 100 tel saç dökülmesi normal kabul edilir.",
  "İnsan kemikleri, aynı ağırlıktaki çelikten daha güçlüdür.",
  "Dünya'nın çekirdeği Güneş'in yüzeyi kadar sıcaktır.",
  "Tarantulalar yemek yemeden 2 yıl yaşayabilirler.",
  "Titanik faciasından kurtulan bir fırıncı, alkol sayesinde vücut ısısını koruyarak buzlu suda saatlerce hayatta kalmıştır.",
  "Kuzey Kutbu'nda penguen, Güney Kutbu'nda kutup ayısı bulunmaz.",
  "Bebekler doğduklarında diz kapakları yoktur; sadece kıkırdaktan oluşur.",
  "Hapşırırken gözlerinizi açık tutmanız imkansızdır.",
  "İnsan vücudunda bakteri sayısı, insan hücresi sayısından fazladır.",
  "İnternetin toplam ağırlığı yaklaşık bir çilek kadardır (elektronların kütlesi).",
  "Kutup ışıkları (Aurora) sadece Dünya'da değil, Jüpiter ve Satürn'de de görülür.",
  "Deniz yıldızlarının beyni yoktur.",
  "Dünya'nın manyetik alanı her birkaç yüz bin yılda bir yön değiştirir.",
  "Istakozlar aslında ölümsüz olabilirler; ancak dış kabuklarını değiştirirken enerjisiz kalıp ölürler.",
  "Mona Lisa tablosunun orijinal adında 'n' harfi iki tanedir (Monna Lisa).",
  "Su aslında hafif mavi renktedir ama az miktardayken şeffaf görünür.",
  "Kediler ömürlerinin %70'ini uyuyarak geçirirler.",
  "Atlar ve fareler kusamazlar.",
  "İnsan DNA'sının %8'i antik virüs kalıntılarından oluşur.",
  "Bir buut bulutu yaklaşık 500 ton ağırlığındadır.",
  "Kuşlar uçarken yönlerini Dünya'nın manyetik alanını 'görerek' bulurlar.",
  "Sahra Çölü her yıl yaklaşık 10 kilometre güneye doğru genişlemektedir.",
  "Gökkuşağı aslında tam bir dairedir; uçaktan bakıldığında halka şeklinde görülür.",
  "İskandinav ülkelerinde kışın güneş bazen haftalarca hiç batmaz.",
  "Arılar yüksek irtifalarda (Everest'in zirvesinden daha yüksekte) uçabilirler.",
  "İnsan beyni yaklaşık 2.5 petabayt (1 milyon gigabayt) veri depolayabilir.",
  "Uranüs yan yatmış bir şekilde döner; sanki bir top yuvarlanıyormuş gibi görünür.",
  "Timsahlar dillerini dışarı çıkaramazlar.",
  "Mars'taki gün batımı mavi renktedir.",
  "İnsan burnu 1 trilyondan fazla farklı kokuyu ayırt edebilir.",
  "Bir karınca kolonisi 30 yıl boyunca yaşayabilir.",
  "Kar tanelerinin her biri benzersizdir ancak atomik seviyede birbirlerine benzerler.",
  "İnsan kalbi dakikada yaklaşık 5-6 litre kan pompalar.",
  "Güneş Sistemi'nin %99.8'i sadece Güneş'in kütlesinden oluşur.",
  "Koalalar günde 22 saat uyurlar.",
  "Amazon Nehri üzerinde tek bir köprü bile bulunmamaktadır.",
  "İnci, istiridyenin içine giren kum tanesine karşı bir savunma mekanizması olarak oluşur.",
  "Ay, Dünya'dan her yıl yaklaşık 3.8 santimetre uzaklaşmaktadır.",
  "Panda yavruları doğduklarında bir fare kadar küçüktürler.",
  "İnsan vücudundaki karbon miktarı yaklaşık 9000 kurşun kalem yapmaya yeter.",
  "Balinalar aslında kara memelilerinden evrilmiştir; en yakın akrabaları su aygırlarıdır.",
  "Plüton'da kalp şeklinde devasa bir buzul ovası vardır.",
  "Dünya'daki tüm telefon görüşmelerinin %70'i mobil telefonlardan yapılmaktadır.",
];

const getHtmlTemplate = (code, opts = {}) => {
  const randomFact =
    facts[Math.floor(Math.random() * facts.length)] ||
    "Işık saniyede yaklaşık 300.000 kilometre hızla hareket eder.";
  const message = opts.message || "";
  const warning = opts.warning || "";

  return `
  <div style="background-color: #000000; padding: 60px 20px; color: #ffffff; font-family: 'Helvetica', Arial, sans-serif; text-align: center;">
    <div style="max-width: 450px; margin: 0 auto; border: 1px solid #1a1a1a; padding: 40px; border-radius: 20px; background: #000000;">
      
      <h1 style="margin: 0 0 30px 0; font-size: 28px; font-weight: 900; letter-spacing: 4px; user-select: none; font-family: 'Press Start 2P', 'Courier New', monospace; text-transform: uppercase;">
        <span style="color: #ffffff;">PIKSEL</span>
      </h1>

      <div style="background: #2a2e38; padding: 30px 5px; border-radius: 25px; margin-bottom: 16px;">
        <span style="font-size: 32px; font-weight: 500; color: #ffffff; letter-spacing: 12px;">${code}</span>
      </div>

      ${
        message
          ? `
      <div style="text-align: center; background: #0c0e12; padding: 18px; border-radius: 12px; margin-bottom: 16px;">
        <p style="font-size: 12px; color: #ffffff; margin: 0; line-height: 1.7; opacity: 0.9;">
          ${message}
        </p>
      </div>`
          : ``
      }

      <div style="text-align: center; background: #0c0e12; padding: 25px; border-radius: 15px; margin-bottom: 30px;">
        <p style="font-size: 13px; font-weight: 800; color: #ffffff; margin: 0 0 10px 0; letter-spacing: 1px; text-transform: uppercase;">BİLİYOR MUYDUNUZ?</p>
        <p style="font-size: 13px; color: #ffffff; margin: 0; line-height: 1.7; font-weight: 300; opacity: 0.8;">
          ${randomFact}
        </p>
      </div>

      <div style="border-top: 1px solid #1a1a1a; padding-top: 25px;">
        <p style="font-size: 11px; color: #ffffff; margin-bottom: 8px; opacity: 0.9;">
          Bu kod 5 dakika boyunca geçerlidir.
        </p>
        ${warning ? `<p style="font-size: 10px; color: #ffffff; opacity: 0.7; margin: 0 0 8px 0;">${warning}</p>` : ``}
        <p style="font-size: 10px; color: #ffffff; opacity: 0.5; margin: 0;">
          Bu e-posta otomatik olarak gönderilmiştir, lütfen yanıtlamayınız.
        </p>
      </div>
      
    </div>
  </div>
  `;
};

const getNoticeTemplate = (title, message) => {
  return `
  <div style="background-color: #000000; padding: 60px 20px; color: #ffffff; font-family: 'Helvetica', Arial, sans-serif; text-align: center;">
    <div style="max-width: 450px; margin: 0 auto; border: 1px solid #1a1a1a; padding: 32px; border-radius: 20px; background: #000000;">
      <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 900; letter-spacing: 4px; user-select: none; font-family: 'Press Start 2P', 'Courier New', monospace; text-transform: uppercase;">
        <span style="color: #ffffff;">PIKSEL</span>
      </h1>
      <div style="text-align: center; background: #0c0e12; padding: 24px; border-radius: 15px;">
        <p style="font-size: 14px; font-weight: 800; color: #ffffff; margin: 0 0 10px 0;">${title}</p>
        <p style="font-size: 12px; color: #ffffff; margin: 0; line-height: 1.7; opacity: 0.85;">${message}</p>
      </div>
      <p style="font-size: 10px; color: #ffffff; opacity: 0.5; margin: 18px 0 0;">Bu e-posta otomatik olarak g?nderilmi?tir.</p>
    </div>
  </div>
  `;
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getBanTemplate = (type, reason, seconds) => {
  const safeReason = escapeHtml(reason || "Belirtilmedi");
  const durationLine =
    type === "temporary"
      ? `Ceza süresi: ${Math.max(1, Math.floor((Number(seconds) || 0) / 60))} dakika`
      : "Ceza süresi: Kalıcı";
  const msg = [
    "Hesabınız banlandı.",
    `Gerekçe: ${safeReason}`,
    durationLine,
    "Eğer siz yapmadıysanız lütfen piksel@piksel.me'ye bildiriniz.",
  ].join("<br>");
  return getNoticeTemplate("Ban Bilgilendirmesi", msg);
};
const args = process.argv;
if (args[2] === "send") {
  const targetEmail = args[3];
  const targetCode =
    args[4] || Math.floor(100000 + Math.random() * 900000).toString();
  if (!targetEmail) {
    console.log("Hata: Mail adresi eksik");
    process.exit();
  }

  transporter.sendMail(
    {
      from: mailFrom,
      to: targetEmail,
      subject: `Doğrulama Kodu: ${targetCode}`,
      html: getHtmlTemplate(targetCode),
    },
    (err) => {
      if (err) console.error(err);
      else console.log(`Mail ${targetEmail} adresine başarıyla gönderildi.`);
      process.exit();
    },
  );
} else {
  app.post("/send-code", async (req, res) => {
    const { email, code, message, warning } = req.body;
    try {
      await transporter.sendMail({
        from: mailFrom,
        to: email,
        subject: "Güvenlik Doğrulaması",
        html: getHtmlTemplate(code, { message, warning }),
      });
      res.status(200).send({ success: true });
    } catch (e) {
      console.error("send-code error:", e);
      res.status(500).send(getMailErrorPayload(e));
    }
  });
  app.post("/send-email-change-code", async (req, res) => {
    const { email, code } = req.body;
    try {
      await transporter.sendMail({
        from: mailFrom,
        to: email,
        subject: "E-Postanı Doğrula",
        html: getHtmlTemplate(code, {
          message: "E-posta değişikliği işlemi için doğrulama kodunuz.",
          warning:
            "Bu işlemi siz gerçekleştirmediyseniz lütfen şifrenizi değiştiriniz.",
        }),
      });
      res.status(200).send({ success: true });
    } catch (e) {
      console.error("send-email-change-code error:", e);
      res.status(500).send(getMailErrorPayload(e));
    }
  });
  app.post("/send-account-change-notice", async (req, res) => {
    const { email, field, oldValue, newValue } = req.body;
    const label = field === "email" ? "E-posta" : "Kullanıcı Adı";
    const safeOld = escapeHtml(oldValue || "Belirtilmedi");
    const safeNew = escapeHtml(newValue || "Belirtilmedi");
    const msg = [
      `${label} bilginiz güncellendi.`,
      `${label} bundan buna çevrildi:<br><b>${safeOld}</b><br>-&gt;<br><b>${safeNew}</b>`,
      "Eğer siz yapmadıysanız lütfen piksel@piksel.me'ye bildiriniz.",
    ].join("<br><br>");
    try {
      await transporter.sendMail({
        from: mailFrom,
        to: email,
        subject: `${label} Değiştirildi`,
        html: getNoticeTemplate(`${label} Değiştirildi`, msg),
      });
      res.status(200).send({ success: true });
    } catch (e) {
      console.error("send-account-change-notice error:", e);
      res.status(500).send(getMailErrorPayload(e));
    }
  });
  app.post("/send-ban-mail", async (req, res) => {
    const { email, type, seconds, reason } = req.body;
    try {
      await transporter.sendMail({
        from: mailFrom,
        to: email,
        subject: "Ban Bilgilendirmesi",
        html: getBanTemplate(type, reason, seconds),
      });
      res.status(200).send({ success: true });
    } catch (e) {
      console.error("send-ban-mail error:", e);
      res.status(500).send(getMailErrorPayload(e));
    }
  });

  app.post("/cloudinary-signature", (req, res) => {
    const { publicId } = req.body || {};
    if (!publicId) {
      res.status(400).send({ success: false, error: "publicId gerekli." });
      return;
    }
    if (
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET ||
      !process.env.CLOUDINARY_CLOUD_NAME
    ) {
      res
        .status(500)
        .send({ success: false, error: "Cloudinary ayarları eksik" });
      return;
    }
    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash("sha1")
      .update(paramsToSign + process.env.CLOUDINARY_API_SECRET)
      .digest("hex");
    res.status(200).send({
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      publicId,
    });
  });

  app.get("/chat/health", async (_req, res) => {
    if (!canUseChat(res)) return;
    res.status(200).send({ success: true });
  });

  app.get("/presence/:uid", async (req, res) => {
    if (!canUseChat(res)) return;
    const uid = String(req.params.uid || "").trim();
    if (!uid) {
      res.status(400).send({ success: false, error: "UID_REQUIRED" });
      return;
    }
    try {
      const state = await getPresenceStateByUid(uid);
      res.status(200).send({
        success: true,
        state: state || {
          uid,
          status: "online",
          presence: "offline",
          customStatus: "",
          lastActive: null,
          updatedAt: null,
        },
      });
    } catch (e) {
      console.error("presence get error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.post("/presence/batch", async (req, res) => {
    if (!canUseChat(res)) return;
    const uids = Array.isArray(req.body?.uids)
      ? Array.from(
          new Set(
            req.body.uids
              .map((v) => String(v || "").trim())
              .filter(Boolean),
          ),
        ).slice(0, 400)
      : [];
    if (uids.length === 0) {
      res.status(200).send({ success: true, rows: [] });
      return;
    }
    try {
      const { rows } = await pool.query(
        `
        SELECT user_id, status, presence, custom_status, last_active, updated_at
        FROM user_presence_state
        WHERE user_id = ANY($1::text[])
        `,
        [uids],
      );
      res.status(200).send({
        success: true,
        rows: rows.map(mapPresenceRow),
      });
    } catch (e) {
      console.error("presence batch error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.put("/presence/:uid", async (req, res) => {
    if (!canUseChat(res)) return;
    const uid = String(req.params.uid || "").trim();
    if (!uid) {
      res.status(400).send({ success: false, error: "UID_REQUIRED" });
      return;
    }
    try {
      const next = await upsertPresenceState(uid, {
        status: req.body?.status,
        presence: req.body?.presence,
        customStatus: req.body?.customStatus,
        touchLastActive: req.body?.touchLastActive !== false,
      });
      await emitPresenceUpdate(uid);
      res.status(200).send({ success: true, state: next });
    } catch (e) {
      console.error("presence put error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.post("/presence/ping", async (req, res) => {
    if (!canUseChat(res)) return;
    const uid = String(req.body?.uid || "").trim();
    if (!uid) {
      res.status(400).send({ success: false, error: "UID_REQUIRED" });
      return;
    }
    try {
      const current = await getPresenceStateByUid(uid);
      const status = normalizeStatus(current?.status || "online");
      const next = await upsertPresenceState(uid, {
        status,
        presence: status === "offline" ? "offline" : "online",
        customStatus: current?.customStatus || "",
        touchLastActive: true,
      });
      await emitPresenceUpdate(uid);
      res.status(200).send({ success: true, state: next });
    } catch (e) {
      console.error("presence ping error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.post("/chat/dm/open", async (req, res) => {
    if (!canUseChat(res)) return;
    const { myUid, otherUid, autoOpenBoth } = req.body || {};
    if (!myUid || !otherUid || myUid === otherUid) {
      res.status(400).send({ success: false, error: "INVALID_UIDS" });
      return;
    }
    try {
      const conversationId = await ensureDmConversation(myUid, otherUid);
      await pool.query(
        `
        UPDATE chat_conversations
        SET updated_at = NOW()
        WHERE id = $1
        `,
        [conversationId],
      );
      await emitInboxUpdate(conversationId);
      if (autoOpenBoth === true) {
        io.to(`user:${myUid}`).emit("chat:dm_opened", {
          conversationId,
          otherUid,
        });
        io.to(`user:${otherUid}`).emit("chat:dm_opened", {
          conversationId,
          otherUid: myUid,
        });
      }
      res.status(200).send({ success: true, conversationId });
    } catch (e) {
      console.error("chat/dm/open error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.post("/chat/group/create", async (req, res) => {
    if (!canUseChat(res)) return;
    const ownerUid = String(req.body?.ownerUid || "").trim();
    const groupName = sanitizeGroupName(req.body?.name, 60);
    const avatarUrl = String(req.body?.avatarUrl || "").trim().slice(0, 500);
    const rawMembers = Array.isArray(req.body?.memberUids)
      ? req.body.memberUids
      : [];
    const memberUids = Array.from(
      new Set(rawMembers.map((x) => String(x || "").trim()).filter(Boolean)),
    );
    if (!ownerUid || !groupName) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    const filteredMembers = memberUids.filter((uid) => uid !== ownerUid);
    if (filteredMembers.length + 1 > MAX_GROUP_PARTICIPANTS) {
      res.status(400).send({
        success: false,
        error: "GROUP_MEMBER_LIMIT",
        maxParticipants: MAX_GROUP_PARTICIPANTS,
      });
      return;
    }
    const conversationId = getGroupConversationId();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        INSERT INTO chat_conversations (id, type, name, avatar_url, owner_id, send_policy, encryption_mode)
        VALUES ($1, 'group', $2, NULLIF($3, ''), $4, 'all_members', $5)
        `,
        [conversationId, groupName, avatarUrl, ownerUid, E2EE_MODE],
      );
      await client.query(
        `
        INSERT INTO chat_conversation_participants
          (conversation_id, user_id, unread_count, role, can_send)
        VALUES ($1, $2, 0, 'owner', TRUE)
        ON CONFLICT (conversation_id, user_id) DO NOTHING
        `,
        [conversationId, ownerUid],
      );
      for (const uid of filteredMembers) {
        await client.query(
          `
          INSERT INTO chat_conversation_participants
            (conversation_id, user_id, unread_count, role, can_send)
          VALUES ($1, $2, 0, 'member', TRUE)
          ON CONFLICT (conversation_id, user_id) DO NOTHING
          `,
          [conversationId, uid],
        );
      }
      await client.query("COMMIT");
      await emitInboxUpdate(conversationId);
      res.status(200).send({ success: true, conversationId });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("chat/group/create error:", e);
      res.status(500).send({ success: false });
    } finally {
      client.release();
    }
  });

  app.post("/chat/group/add-members", async (req, res) => {
    if (!canUseChat(res)) return;
    const conversationId = String(req.body?.conversationId || "").trim();
    const uid = String(req.body?.uid || "").trim();
    const memberNamesRaw =
      req.body?.memberNames && typeof req.body.memberNames === "object"
        ? req.body.memberNames
        : {};
    const rawMembers = Array.isArray(req.body?.memberUids) ? req.body.memberUids : [];
    const memberUids = Array.from(
      new Set(rawMembers.map((x) => String(x || "").trim()).filter(Boolean)),
    );
    if (!conversationId || !uid || memberUids.length === 0) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    const targets = memberUids.filter((x) => x !== uid);
    if (targets.length === 0) {
      res.status(400).send({ success: false, error: "MEMBERS_REQUIRED" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const access = await client.query(
        `
        SELECT cp.role, c.type, c.send_policy
        FROM chat_conversation_participants cp
        INNER JOIN chat_conversations c ON c.id = cp.conversation_id
        WHERE cp.conversation_id = $1
          AND cp.user_id = $2
        LIMIT 1
        `,
        [conversationId, uid],
      );
      if (!access.rowCount) {
        await client.query("ROLLBACK");
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }
      const type = String(access.rows[0]?.type || "");
      const myRole = String(access.rows[0]?.role || "");
      const sendPolicy = String(access.rows[0]?.send_policy || "all_members");
      if (type !== "group" || myRole !== "owner") {
        await client.query("ROLLBACK");
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }

      const existingRes = await client.query(
        `
        SELECT user_id
        FROM chat_conversation_participants
        WHERE conversation_id = $1
        `,
        [conversationId],
      );
      const existing = new Set(
        existingRes.rows
          .map((r) => String(r?.user_id || "").trim())
          .filter(Boolean),
      );
      const newMembers = targets.filter((x) => !existing.has(x));
      if (newMembers.length === 0) {
        await client.query("ROLLBACK");
        res.status(200).send({ success: true, added: 0 });
        return;
      }
      const nextCount = existing.size + newMembers.length;
      if (nextCount > MAX_GROUP_PARTICIPANTS) {
        await client.query("ROLLBACK");
        res.status(400).send({
          success: false,
          error: "GROUP_MEMBER_LIMIT",
          maxParticipants: MAX_GROUP_PARTICIPANTS,
        });
        return;
      }

      const canSendForNew = sendPolicy === "all_members";
      for (const memberUid of newMembers) {
        await client.query(
          `
          INSERT INTO chat_conversation_participants
            (conversation_id, user_id, unread_count, role, can_send)
          VALUES ($1, $2, 0, 'member', $3)
          ON CONFLICT (conversation_id, user_id) DO NOTHING
          `,
          [conversationId, memberUid, canSendForNew],
        );
      }
      const systemMessages = [];
      for (const memberUid of newMembers) {
        const actorLabel = sanitizeActorName(memberNamesRaw?.[memberUid]) || memberUid;
        const body = `${actorLabel} kullanıcısı gruba katıldı.`;
        const msg = await createGroupSystemMessage(
          client,
          conversationId,
          "group_join",
          memberUid,
          body,
        );
        if (msg) systemMessages.push(msg);
      }
      await client.query(
        `
        UPDATE chat_conversations
        SET
          updated_at = NOW(),
          last_message = $2,
          last_sender_id = $3
        WHERE id = $1
        `,
        [
          conversationId,
          systemMessages.length > 0
            ? systemMessages[systemMessages.length - 1].text
            : null,
          systemMessages.length > 0 ? "__system__" : null,
        ],
      );
      const memberCountRes = await client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM chat_conversation_participants
        WHERE conversation_id = $1
        `,
        [conversationId],
      );
      const memberCount = Number(memberCountRes.rows[0]?.c || 0);
      await client.query("COMMIT");
      await emitInboxUpdate(conversationId);
      for (const msg of systemMessages) {
        io.to(`conv:${conversationId}`).emit("chat:message", {
          conversationId,
          message: msg,
        });
      }
      io.to(`conv:${conversationId}`).emit("chat:group_updated", {
        conversationId,
        memberCount,
      });
      res.status(200).send({
        success: true,
        conversationId,
        added: newMembers.length,
        memberCount,
      });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("chat/group/add-members error:", e);
      res.status(500).send({ success: false });
    } finally {
      client.release();
    }
  });

  app.get("/chat/inbox/:uid", async (req, res) => {
    if (!canUseChat(res)) return;
    const uid = String(req.params.uid || "");
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    if (!uid) {
      res.status(400).send({ success: false, error: "UID_REQUIRED" });
      return;
    }
    try {
      const { rows } = await pool.query(
        `
        SELECT
          c.id AS id,
          c.type AS type,
          c.encryption_mode AS "encryptionMode",
          c.updated_at AS "updatedAt",
          c.last_message AS "lastMessage",
          c.last_sender_id AS "lastSenderId",
          cp.unread_count AS "unreadCount",
          CASE WHEN c.type = 'dm' THEN other.user_id ELSE NULL END AS "otherUid",
          CASE WHEN c.type = 'group' THEN c.name ELSE NULL END AS "groupName",
          CASE WHEN c.type = 'group' THEN c.avatar_url ELSE NULL END AS "groupAvatarUrl",
          CASE WHEN c.type = 'group' THEN c.owner_id ELSE NULL END AS "groupOwnerId",
          CASE WHEN c.type = 'group' THEN c.send_policy ELSE NULL END AS "groupSendPolicy",
          cp.role AS "myRole",
          cp.can_send AS "myCanSend",
          CASE WHEN c.type = 'group' THEN stats.member_count ELSE NULL END AS "memberCount"
        FROM chat_conversation_participants cp
        INNER JOIN chat_conversations c ON c.id = cp.conversation_id
        LEFT JOIN LATERAL (
          SELECT p2.user_id
          FROM chat_conversation_participants p2
          WHERE p2.conversation_id = cp.conversation_id
            AND p2.user_id <> cp.user_id
          ORDER BY p2.user_id ASC
          LIMIT 1
        ) other ON c.type = 'dm'
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS member_count
          FROM chat_conversation_participants p3
          WHERE p3.conversation_id = cp.conversation_id
        ) stats ON c.type = 'group'
        WHERE cp.user_id = $1
        ORDER BY c.updated_at DESC
        LIMIT $2
        `,
        [uid, limit],
      );
      res.status(200).send({ success: true, rows });
    } catch (e) {
      console.error("chat/inbox error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.get("/chat/participants/:conversationId", async (req, res) => {
    if (!canUseChat(res)) return;
    const conversationId = String(req.params.conversationId || "");
    const uid = String(req.query.uid || "");
    if (!conversationId || !uid) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    try {
      const access = await pool.query(
        `
        SELECT 1
        FROM chat_conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
        LIMIT 1
        `,
        [conversationId, uid],
      );
      if (!access.rowCount) {
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }
      const { rows } = await pool.query(
        `
        SELECT
          cp.user_id AS "uid",
          cp.role AS "role",
          cp.can_send AS "canSend"
        FROM chat_conversation_participants cp
        WHERE cp.conversation_id = $1
        ORDER BY cp.user_id ASC
        `,
        [conversationId],
      );
      res.status(200).send({ success: true, rows });
    } catch (e) {
      console.error("chat/participants error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.put("/chat/e2ee/keys/:uid", async (req, res) => {
    if (!canUseChat(res)) return;
    const uid = String(req.params.uid || "").trim();
    const publicKeyJwk = req.body?.publicKeyJwk;
    if (!uid || !publicKeyJwk || typeof publicKeyJwk !== "object") {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    try {
      await pool.query(
        `
        INSERT INTO chat_user_e2ee_keys (user_id, public_key_jwk, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          public_key_jwk = EXCLUDED.public_key_jwk,
          updated_at = NOW()
        `,
        [uid, JSON.stringify(publicKeyJwk)],
      );
      res.status(200).send({ success: true });
    } catch (e) {
      console.error("chat/e2ee/keys put error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.get("/chat/e2ee/conversation-keys/:conversationId", async (req, res) => {
    if (!canUseChat(res)) return;
    const conversationId = String(req.params.conversationId || "").trim();
    const uid = String(req.query.uid || "").trim();
    if (!conversationId || !uid) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    try {
      const access = await pool.query(
        `
        SELECT 1
        FROM chat_conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
        LIMIT 1
        `,
        [conversationId, uid],
      );
      if (!access.rowCount) {
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }
      const { rows } = await pool.query(
        `
        SELECT
          cp.user_id AS "uid",
          k.public_key_jwk AS "publicKeyJwk"
        FROM chat_conversation_participants cp
        LEFT JOIN chat_user_e2ee_keys k ON k.user_id = cp.user_id
        WHERE cp.conversation_id = $1
        ORDER BY cp.user_id ASC
        `,
        [conversationId],
      );
      res.status(200).send({ success: true, rows });
    } catch (e) {
      console.error("chat/e2ee/conversation-keys get error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.post("/chat/group/leave", async (req, res) => {
    if (!canUseChat(res)) return;
    const conversationId = String(req.body?.conversationId || "").trim();
    const uid = String(req.body?.uid || "").trim();
    const actorNameRaw = sanitizeActorName(req.body?.actorName || "");
    if (!conversationId || !uid) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const convo = await client.query(
        `
        SELECT id, type, owner_id
        FROM chat_conversations
        WHERE id = $1
        LIMIT 1
        `,
        [conversationId],
      );
      if (!convo.rowCount || String(convo.rows[0]?.type || "") !== "group") {
        await client.query("ROLLBACK");
        res.status(404).send({ success: false, error: "NOT_GROUP" });
        return;
      }
      const mine = await client.query(
        `
        SELECT user_id, role
        FROM chat_conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
        LIMIT 1
        `,
        [conversationId, uid],
      );
      if (!mine.rowCount) {
        await client.query("ROLLBACK");
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }

      const isOwner = String(mine.rows[0]?.role || "") === "owner";
      if (isOwner) {
        const nextOwner = await client.query(
          `
          SELECT user_id
          FROM chat_conversation_participants
          WHERE conversation_id = $1 AND user_id <> $2
          ORDER BY RANDOM()
          LIMIT 1
          `,
          [conversationId, uid],
        );
        if (nextOwner.rowCount) {
          const newOwnerUid = String(nextOwner.rows[0].user_id);
          await client.query(
            `
            UPDATE chat_conversations
            SET owner_id = $2, updated_at = NOW()
            WHERE id = $1
            `,
            [conversationId, newOwnerUid],
          );
          await client.query(
            `
            UPDATE chat_conversation_participants
            SET role = CASE WHEN user_id = $2 THEN 'owner' ELSE role END,
                can_send = CASE WHEN user_id = $2 THEN TRUE ELSE can_send END
            WHERE conversation_id = $1
            `,
            [conversationId, newOwnerUid],
          );
        }
      }

      await client.query(
        `
        DELETE FROM chat_conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
        `,
        [conversationId, uid],
      );

      const leftCount = await client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM chat_conversation_participants
        WHERE conversation_id = $1
        `,
        [conversationId],
      );
      const memberCount = Number(leftCount.rows[0]?.c || 0);
      if (memberCount <= 0) {
        await client.query(
          `
          DELETE FROM chat_conversations
          WHERE id = $1
          `,
          [conversationId],
        );
      }
      let systemMessage = null;
      if (memberCount > 0) {
        const actorLabel = actorNameRaw || uid;
        const body = `${actorLabel} kullanıcısı gruptan ayrıldı.`;
        systemMessage = await createGroupSystemMessage(
          client,
          conversationId,
          "group_leave",
          uid,
          body,
        );
        if (systemMessage) {
          await client.query(
            `
            UPDATE chat_conversations
            SET
              updated_at = NOW(),
              last_message = $2,
              last_sender_id = $3
            WHERE id = $1
            `,
            [conversationId, systemMessage.text, "__system__"],
          );
        }
      }

      await client.query("COMMIT");
      await emitInboxUpdate(conversationId);
      if (memberCount > 0) {
        if (systemMessage) {
          io.to(`conv:${conversationId}`).emit("chat:message", {
            conversationId,
            message: systemMessage,
          });
        }
        io.to(`conv:${conversationId}`).emit("chat:group_updated", {
          conversationId,
          memberCount,
        });
      }
      res.status(200).send({ success: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("chat/group/leave error:", e);
      res.status(500).send({ success: false });
    } finally {
      client.release();
    }
  });

  app.post("/chat/group/settings", async (req, res) => {
    if (!canUseChat(res)) return;
    const conversationId = String(req.body?.conversationId || "").trim();
    const uid = String(req.body?.uid || "").trim();
    const nextName = sanitizeGroupName(req.body?.name, 60);
    const nextAvatarUrl = String(req.body?.avatarUrl || "").trim().slice(0, 500);
    const nextSendPolicy = String(req.body?.sendPolicy || "all_members").trim();
    const allowedSenderUids = Array.isArray(req.body?.allowedSenderUids)
      ? Array.from(
          new Set(
            req.body.allowedSenderUids
              .map((x) => String(x || "").trim())
              .filter(Boolean),
          ),
        )
      : [];
    if (!conversationId || !uid) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    const sendPolicy = ["all_members", "owner_only", "selected_members"].includes(
      nextSendPolicy,
    )
      ? nextSendPolicy
      : "all_members";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const access = await client.query(
        `
        SELECT cp.role
        FROM chat_conversation_participants cp
        INNER JOIN chat_conversations c ON c.id = cp.conversation_id
        WHERE cp.conversation_id = $1
          AND cp.user_id = $2
          AND c.type = 'group'
        LIMIT 1
        `,
        [conversationId, uid],
      );
      if (!access.rowCount || String(access.rows[0]?.role || "") !== "owner") {
        await client.query("ROLLBACK");
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }
      await client.query(
        `
        UPDATE chat_conversations
        SET
          name = COALESCE(NULLIF($2, ''), name),
          avatar_url = NULLIF($3, ''),
          send_policy = $4,
          updated_at = NOW()
        WHERE id = $1
        `,
        [conversationId, nextName || null, nextAvatarUrl || null, sendPolicy],
      );

      if (sendPolicy === "all_members") {
        await client.query(
          `
          UPDATE chat_conversation_participants
          SET can_send = TRUE
          WHERE conversation_id = $1
          `,
          [conversationId],
        );
      } else if (sendPolicy === "owner_only") {
        await client.query(
          `
          UPDATE chat_conversation_participants
          SET can_send = CASE WHEN role = 'owner' THEN TRUE ELSE FALSE END
          WHERE conversation_id = $1
          `,
          [conversationId],
        );
      } else {
        await client.query(
          `
          UPDATE chat_conversation_participants
          SET can_send = CASE WHEN role = 'owner' THEN TRUE ELSE FALSE END
          WHERE conversation_id = $1
          `,
          [conversationId],
        );
        if (allowedSenderUids.length > 0) {
          await client.query(
            `
            UPDATE chat_conversation_participants
            SET can_send = TRUE
            WHERE conversation_id = $1
              AND user_id = ANY($2::text[])
            `,
            [conversationId, allowedSenderUids],
          );
        }
      }
      const memberCountRes = await client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM chat_conversation_participants
        WHERE conversation_id = $1
        `,
        [conversationId],
      );
      const memberCount = Number(memberCountRes.rows[0]?.c || 0);
      await client.query("COMMIT");
      await emitInboxUpdate(conversationId);
      io.to(`conv:${conversationId}`).emit("chat:group_updated", {
        conversationId,
        memberCount,
      });
      res.status(200).send({ success: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("chat/group/settings error:", e);
      res.status(500).send({ success: false });
    } finally {
      client.release();
    }
  });

  app.post("/chat/group/kick", async (req, res) => {
    if (!canUseChat(res)) return;
    const conversationId = String(req.body?.conversationId || "").trim();
    const uid = String(req.body?.uid || "").trim();
    const targetUid = String(req.body?.targetUid || "").trim();
    const targetName = sanitizeActorName(req.body?.targetName || "");
    if (!conversationId || !uid || !targetUid) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    if (uid === targetUid) {
      res.status(400).send({ success: false, error: "INVALID_TARGET" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const access = await client.query(
        `
        SELECT cp.role
        FROM chat_conversation_participants cp
        INNER JOIN chat_conversations c ON c.id = cp.conversation_id
        WHERE cp.conversation_id = $1
          AND cp.user_id = $2
          AND c.type = 'group'
        LIMIT 1
        `,
        [conversationId, uid],
      );
      if (!access.rowCount || String(access.rows[0]?.role || "") !== "owner") {
        await client.query("ROLLBACK");
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }
      const target = await client.query(
        `
        SELECT user_id, role
        FROM chat_conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
        LIMIT 1
        `,
        [conversationId, targetUid],
      );
      if (!target.rowCount) {
        await client.query("ROLLBACK");
        res.status(404).send({ success: false, error: "NOT_FOUND" });
        return;
      }
      if (String(target.rows[0]?.role || "") === "owner") {
        await client.query("ROLLBACK");
        res.status(403).send({ success: false, error: "OWNER_PROTECTED" });
        return;
      }
      await client.query(
        `
        DELETE FROM chat_conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
        `,
        [conversationId, targetUid],
      );
      await client.query(
        `
        UPDATE chat_conversations
        SET updated_at = NOW()
        WHERE id = $1
        `,
        [conversationId],
      );
      const leftLabel = targetName || targetUid;
      const leaveSystemMessage = await createGroupSystemMessage(
        client,
        conversationId,
        "group_leave",
        targetUid,
        `${leftLabel} kullanıcısı gruptan ayrıldı.`,
      );
      if (leaveSystemMessage) {
        await client.query(
          `
          UPDATE chat_conversations
          SET
            updated_at = NOW(),
            last_message = $2,
            last_sender_id = $3
          WHERE id = $1
          `,
          [conversationId, leaveSystemMessage.text, "__system__"],
        );
      }
      const leftCount = await client.query(
        `
        SELECT COUNT(*)::int AS c
        FROM chat_conversation_participants
        WHERE conversation_id = $1
        `,
        [conversationId],
      );
      const memberCount = Number(leftCount.rows[0]?.c || 0);
      await client.query("COMMIT");
      await emitInboxUpdate(conversationId);
      io.to(`user:${targetUid}`).emit("chat:inbox_updated", {
        userId: targetUid,
        conversationId,
      });
      if (leaveSystemMessage) {
        io.to(`conv:${conversationId}`).emit("chat:message", {
          conversationId,
          message: leaveSystemMessage,
        });
      }
      io.to(`conv:${conversationId}`).emit("chat:group_updated", {
        conversationId,
        memberCount,
      });
      res.status(200).send({ success: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("chat/group/kick error:", e);
      res.status(500).send({ success: false });
    } finally {
      client.release();
    }
  });

  app.get("/chat/state/:uid", async (req, res) => {
    if (!canUseChat(res)) return;
    const uid = String(req.params.uid || "");
    if (!uid) {
      res.status(400).send({ success: false, error: "UID_REQUIRED" });
      return;
    }
    try {
      const { rows } = await pool.query(
        `
        SELECT
          active_conversation_id AS "activeConversationId",
          group_members_collapsed AS "groupMembersCollapsed"
        FROM chat_user_state
        WHERE user_id = $1
        LIMIT 1
        `,
        [uid],
      );
      const activeConversationId = rows[0]?.activeConversationId || null;
      const groupMembersCollapsed = !!rows[0]?.groupMembersCollapsed;
      res.status(200).send({
        success: true,
        activeConversationId,
        groupMembersCollapsed,
      });
    } catch (e) {
      console.error("chat/state get error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.put("/chat/state/:uid", async (req, res) => {
    if (!canUseChat(res)) return;
    const uid = String(req.params.uid || "");
    const rawConversationId = req.body?.activeConversationId;
    const activeConversationId =
      rawConversationId == null ? null : String(rawConversationId || "").trim();
    const hasGroupMembersCollapsed =
      Object.prototype.hasOwnProperty.call(req.body || {}, "groupMembersCollapsed");
    const groupMembersCollapsedInput =
      hasGroupMembersCollapsed ? !!req.body?.groupMembersCollapsed : null;
    if (!uid) {
      res.status(400).send({ success: false, error: "UID_REQUIRED" });
      return;
    }
    try {
      if (activeConversationId) {
        const access = await pool.query(
          `
          SELECT 1
          FROM chat_conversation_participants
          WHERE conversation_id = $1 AND user_id = $2
          LIMIT 1
          `,
          [activeConversationId, uid],
        );
        if (!access.rowCount) {
          res.status(403).send({ success: false, error: "FORBIDDEN" });
          return;
        }
      }

      let nextGroupMembersCollapsed = false;
      if (hasGroupMembersCollapsed) {
        nextGroupMembersCollapsed = !!groupMembersCollapsedInput;
      } else {
        const current = await pool.query(
          `
          SELECT group_members_collapsed AS "groupMembersCollapsed"
          FROM chat_user_state
          WHERE user_id = $1
          LIMIT 1
          `,
          [uid],
        );
        nextGroupMembersCollapsed = !!current.rows[0]?.groupMembersCollapsed;
      }
      await pool.query(
        `
        INSERT INTO chat_user_state
          (user_id, active_conversation_id, group_members_collapsed, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          active_conversation_id = EXCLUDED.active_conversation_id,
          group_members_collapsed = EXCLUDED.group_members_collapsed,
          updated_at = NOW()
        `,
        [uid, activeConversationId || null, nextGroupMembersCollapsed],
      );
      res.status(200).send({ success: true });
    } catch (e) {
      console.error("chat/state put error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.get("/chat/messages/:conversationId", async (req, res) => {
    if (!canUseChat(res)) return;
    const conversationId = String(req.params.conversationId || "");
    const uid = String(req.query.uid || "");
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
    const beforeRaw = req.query.before ? String(req.query.before) : null;
    const beforeDate =
      beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? beforeRaw : null;
    if (!conversationId || !uid) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    try {
      const access = await pool.query(
        `
        SELECT 1
        FROM chat_conversation_participants
        WHERE conversation_id = $1 AND user_id = $2
        LIMIT 1
        `,
        [conversationId, uid],
      );
      if (!access.rowCount) {
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }

      const { rows } = await pool.query(
        `
        SELECT * FROM (
          SELECT
            id::text AS id,
            conversation_id AS "conversationId",
            sender_id AS "senderId",
            client_nonce AS "clientNonce",
            message_kind AS "messageKind",
            system_actor_uid AS "systemActorUid",
            body AS text,
            encrypted_payload AS "encryptedPayload",
            is_encrypted AS "isEncrypted",
            created_at AS "createdAt",
            edited_at AS "editedAt",
            (edited_at IS NOT NULL) AS "isEdited"
          FROM chat_messages
          WHERE conversation_id = $1
            AND is_deleted = FALSE
            AND ($3::timestamptz IS NULL OR created_at < $3::timestamptz)
          ORDER BY created_at DESC
          LIMIT $2
        ) x
        ORDER BY "createdAt" ASC
        `,
        [conversationId, limit, beforeDate],
      );
      res.status(200).send({ success: true, rows: rows.map(mapMessageRow) });
    } catch (e) {
      console.error("chat/messages get error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.post("/chat/messages", async (req, res) => {
    if (!canUseChat(res)) return;
    const { conversationId, senderId, text, clientNonce, encryptedPayload } = req.body || {};
    const cleanText = sanitizeMessageText(text, 2000);
    const cleanEncryptedPayload = sanitizeEncryptedPayload(encryptedPayload);
    const safeNonce = String(clientNonce || "").trim().slice(0, 120);
    if (!conversationId || !senderId) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    if (cleanText.length > 2000) {
      res.status(400).send({ success: false, error: "TEXT_TOO_LONG" });
      return;
    }
    try {
      const access = await pool.query(
        `
        SELECT
          c.type AS type,
          c.send_policy AS "sendPolicy",
          c.encryption_mode AS "encryptionMode",
          cp.role AS role,
          cp.can_send AS "canSend"
        FROM chat_conversation_participants cp
        INNER JOIN chat_conversations c
          ON c.id = cp.conversation_id
        WHERE cp.conversation_id = $1 AND cp.user_id = $2
        LIMIT 1
        `,
        [conversationId, senderId],
      );
      if (!access.rowCount) {
        res.status(403).send({ success: false, error: "FORBIDDEN" });
        return;
      }
      const accessRow = access.rows[0] || {};
      const isOwner = String(accessRow?.role || "") === "owner";
      const isGroup = String(accessRow?.type || "") === "group";
      const allMembersCanSend =
        String(accessRow?.sendPolicy || "all_members") === "all_members";
      const canSendFlag = Boolean(accessRow?.canSend);
      const encryptionMode =
        String(accessRow?.encryptionMode || E2EE_MODE).trim() || E2EE_MODE;
      if (isGroup && !isOwner && !allMembersCanSend && !canSendFlag) {
        res.status(403).send({ success: false, error: "CANNOT_SEND" });
        return;
      }
      const isE2ee = encryptionMode === E2EE_MODE;
      if (isE2ee && !cleanEncryptedPayload) {
        res.status(400).send({ success: false, error: "E2EE_PAYLOAD_REQUIRED" });
        return;
      }
      if (!isE2ee && !cleanText) {
        res.status(400).send({ success: false, error: "BAD_REQUEST" });
        return;
      }

      if (safeNonce) {
        const existing = await pool.query(
          `
          SELECT
            id::text AS id,
            conversation_id AS "conversationId",
            sender_id AS "senderId",
            client_nonce AS "clientNonce",
            message_kind AS "messageKind",
            system_actor_uid AS "systemActorUid",
            body AS text,
            encrypted_payload AS "encryptedPayload",
            is_encrypted AS "isEncrypted",
            created_at AS "createdAt",
            edited_at AS "editedAt",
            (edited_at IS NOT NULL) AS "isEdited"
          FROM chat_messages
          WHERE sender_id = $1 AND client_nonce = $2
          LIMIT 1
          `,
          [senderId, safeNonce],
        );
        if (existing.rowCount) {
          res.status(200).send({ success: true, message: mapMessageRow(existing.rows[0]) });
          return;
        }
      }

      const messageBody = isE2ee ? ENCRYPTED_PLACEHOLDER_BODY : cleanText;
      const messageIsEncrypted = isE2ee;
      const lastMessagePreview = isE2ee ? ENCRYPTED_PREVIEW_TEXT : cleanText;

      const inserted = await pool.query(
        `
        INSERT INTO chat_messages (
          conversation_id,
          sender_id,
          client_nonce,
          message_kind,
          body,
          encrypted_payload,
          is_encrypted
        )
        VALUES ($1, $2, $3, 'user', $4, $5::jsonb, $6)
        RETURNING
          id::text AS id,
          conversation_id AS "conversationId",
          sender_id AS "senderId",
          client_nonce AS "clientNonce",
          message_kind AS "messageKind",
          system_actor_uid AS "systemActorUid",
          body AS text,
          encrypted_payload AS "encryptedPayload",
          is_encrypted AS "isEncrypted",
          created_at AS "createdAt",
          edited_at AS "editedAt",
          (edited_at IS NOT NULL) AS "isEdited"
        `,
        [
          conversationId,
          senderId,
          safeNonce || null,
          messageBody,
          cleanEncryptedPayload ? JSON.stringify(cleanEncryptedPayload) : null,
          messageIsEncrypted,
        ],
      );
      const message = mapMessageRow(inserted.rows[0]);

      await pool.query(
        `
        UPDATE chat_conversations
        SET
          updated_at = NOW(),
          last_message = $2,
          last_sender_id = $3
        WHERE id = $1
        `,
        [conversationId, lastMessagePreview, senderId],
      );
      await pool.query(
        `
        UPDATE chat_conversation_participants
        SET unread_count = 0, last_read_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
        `,
        [conversationId, senderId],
      );
      await pool.query(
        `
        UPDATE chat_conversation_participants
        SET unread_count = unread_count + 1
        WHERE conversation_id = $1 AND user_id <> $2
        `,
        [conversationId, senderId],
      );

      io.to(`conv:${conversationId}`).emit("chat:message", {
        conversationId,
        message,
      });
      await emitInboxUpdate(conversationId);

      res.status(200).send({ success: true, message });
    } catch (e) {
      console.error("chat/messages post error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.patch("/chat/messages/:messageId", async (req, res) => {
    if (!canUseChat(res)) return;
    const messageId = String(req.params.messageId || "");
    const { conversationId, senderId, text, encryptedPayload } = req.body || {};
    const cleanText = sanitizeMessageText(text, 2000);
    const cleanEncryptedPayload = sanitizeEncryptedPayload(encryptedPayload);
    if (!messageId || !conversationId || !senderId) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    try {
      const convo = await pool.query(
        `
        SELECT encryption_mode AS "encryptionMode"
        FROM chat_conversations
        WHERE id = $1
        LIMIT 1
        `,
        [conversationId],
      );
      if (!convo.rowCount) {
        res.status(404).send({ success: false, error: "NOT_FOUND" });
        return;
      }
      const encryptionMode =
        String(convo.rows[0]?.encryptionMode || E2EE_MODE).trim() || E2EE_MODE;
      const isE2ee = encryptionMode === E2EE_MODE;
      if (isE2ee && !cleanEncryptedPayload) {
        res.status(400).send({ success: false, error: "E2EE_PAYLOAD_REQUIRED" });
        return;
      }
      if (!isE2ee && !cleanText) {
        res.status(400).send({ success: false, error: "BAD_REQUEST" });
        return;
      }
      const messageBody = isE2ee ? ENCRYPTED_PLACEHOLDER_BODY : cleanText;
      const messageIsEncrypted = isE2ee;

      const updated = await pool.query(
        `
        UPDATE chat_messages
        SET
          body = $4,
          encrypted_payload = $5::jsonb,
          is_encrypted = $6,
          edited_at = NOW()
        WHERE id = $1
          AND conversation_id = $2
          AND sender_id = $3
          AND is_deleted = FALSE
        RETURNING
          id::text AS id,
          conversation_id AS "conversationId",
          sender_id AS "senderId",
          client_nonce AS "clientNonce",
          message_kind AS "messageKind",
          system_actor_uid AS "systemActorUid",
          body AS text,
          encrypted_payload AS "encryptedPayload",
          is_encrypted AS "isEncrypted",
          created_at AS "createdAt",
          edited_at AS "editedAt",
          (edited_at IS NOT NULL) AS "isEdited"
        `,
        [
          messageId,
          conversationId,
          senderId,
          messageBody,
          cleanEncryptedPayload ? JSON.stringify(cleanEncryptedPayload) : null,
          messageIsEncrypted,
        ],
      );
      if (!updated.rowCount) {
        res.status(404).send({ success: false, error: "NOT_FOUND" });
        return;
      }
      const message = mapMessageRow(updated.rows[0]);
      io.to(`conv:${conversationId}`).emit("chat:message_updated", {
        conversationId,
        message,
      });
      res.status(200).send({ success: true, message });
    } catch (e) {
      console.error("chat/messages patch error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.delete("/chat/messages/:messageId", async (req, res) => {
    if (!canUseChat(res)) return;
    const messageId = String(req.params.messageId || "");
    const { conversationId, senderId } = req.body || {};
    if (!messageId || !conversationId || !senderId) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    try {
      const deleted = await pool.query(
        `
        UPDATE chat_messages
        SET
          is_deleted = TRUE,
          deleted_at = NOW(),
          deleted_by = $3
        WHERE id = $1
          AND conversation_id = $2
          AND sender_id = $3
          AND is_deleted = FALSE
        RETURNING id::text AS id
        `,
        [messageId, conversationId, senderId],
      );
      if (!deleted.rowCount) {
        res.status(404).send({ success: false, error: "NOT_FOUND" });
        return;
      }

      const latest = await pool.query(
        `
        SELECT
          body,
          message_kind AS "messageKind",
          is_encrypted AS "isEncrypted",
          sender_id AS "senderId",
          created_at AS "createdAt"
        FROM chat_messages
        WHERE conversation_id = $1
          AND is_deleted = FALSE
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [conversationId],
      );
      const last = latest.rows[0] || null;
      const lastPreview = getMessagePreviewText(last);

      await pool.query(
        `
        UPDATE chat_conversations
        SET
          updated_at = COALESCE($2::timestamptz, NOW()),
          last_message = $3,
          last_sender_id = $4
        WHERE id = $1
        `,
        [
          conversationId,
          last?.createdAt || null,
          lastPreview,
          last?.senderId || null,
        ],
      );

      io.to(`conv:${conversationId}`).emit("chat:message_deleted", {
        conversationId,
        messageId,
      });
      await emitInboxUpdate(conversationId);

      res.status(200).send({ success: true, id: String(deleted.rows[0].id) });
    } catch (e) {
      console.error("chat/messages delete error:", e);
      res.status(500).send({ success: false });
    }
  });

  app.post("/chat/read", async (req, res) => {
    if (!canUseChat(res)) return;
    const { conversationId, uid } = req.body || {};
    if (!conversationId || !uid) {
      res.status(400).send({ success: false, error: "BAD_REQUEST" });
      return;
    }
    try {
      await pool.query(
        `
        UPDATE chat_conversation_participants
        SET unread_count = 0, last_read_at = NOW()
        WHERE conversation_id = $1 AND user_id = $2
        `,
        [conversationId, uid],
      );
      io.to(`user:${uid}`).emit("chat:inbox_updated", { userId: uid, conversationId });
      res.status(200).send({ success: true });
    } catch (e) {
      console.error("chat/read error:", e);
      res.status(500).send({ success: false });
    }
  });

  io.on("connection", (socket) => {
    socket.on("chat:auth", async (payload) => {
      const uid = String(payload?.uid || "");
      if (!uid) return;
      socket.data.uid = uid;
      socket.join(`user:${uid}`);
      try {
        if (pool) {
          await pool.query(
            `
            INSERT INTO user_presence_connections (socket_id, user_id, connected_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (socket_id)
            DO UPDATE SET user_id = EXCLUDED.user_id, connected_at = NOW()
            `,
            [socket.id, uid],
          );
          await refreshPresenceFromConnections(uid);
          const snapshot = await getPresenceStateByUid(uid);
          if (snapshot) {
            socket.emit("presence:snapshot", snapshot);
          }
          await emitPresenceUpdate(uid);
        }
      } catch (e) {
        console.error("presence auth error:", e);
      }
    });

    socket.on("chat:join_conversation", async (payload) => {
      try {
        if (!chatEnabled || !pool) return;
        const uid = String(socket.data.uid || "");
        const conversationId = String(payload?.conversationId || "");
        if (!uid || !conversationId) return;
        const access = await pool.query(
          `
          SELECT 1
          FROM chat_conversation_participants
          WHERE conversation_id = $1 AND user_id = $2
          LIMIT 1
          `,
          [conversationId, uid],
        );
        if (!access.rowCount) return;
        socket.join(`conv:${conversationId}`);
      } catch {}
    });

    socket.on("chat:typing_start", (payload) => {
      try {
        if (!chatEnabled || !pool) return;
        const conversationId = String(payload?.conversationId || "");
        const uid = String(socket.data.uid || payload?.uid || "");
        if (!conversationId || !uid) return;
        socket.to(`conv:${conversationId}`).emit("chat:typing_start", {
          conversationId,
          uid,
        });
      } catch {}
    });

    socket.on("chat:typing_stop", (payload) => {
      try {
        if (!chatEnabled || !pool) return;
        const conversationId = String(payload?.conversationId || "");
        const uid = String(socket.data.uid || payload?.uid || "");
        if (!conversationId || !uid) return;
        socket.to(`conv:${conversationId}`).emit("chat:typing_stop", {
          conversationId,
          uid,
        });
      } catch {}
    });

    socket.on("disconnect", async () => {
      const uid = String(socket.data.uid || "");
      if (!uid || !pool) return;
      try {
        await pool.query(
          `
          DELETE FROM user_presence_connections
          WHERE socket_id = $1
          `,
          [socket.id],
        );
        await refreshPresenceFromConnections(uid);
        await emitPresenceUpdate(uid);
      } catch (e) {
        console.error("presence disconnect error:", e);
      }
    });
  });

  const start = async () => {
    if (chatEnabled) {
      try {
        await initChatSchema();
        await pool.query(`DELETE FROM user_presence_connections`);
        await pool.query(`
          UPDATE user_presence_state
          SET presence = 'offline', updated_at = NOW()
          WHERE presence <> 'offline'
        `);
        if (process.env.REDIS_URL) {
          const pubClient = new Redis(process.env.REDIS_URL);
          const subClient = pubClient.duplicate();
          io.adapter(createAdapter(pubClient, subClient));
        }
        console.log("✔️ - Sohbet sistemi hazır");
      } catch (e) {
        console.error("✖️ - Sohbet sistemi başlatılamadı:", e);
      }
    } else {
      console.warn("✖️ - Chat devre dışı: DATABASE_URL yok");
    }

    httpServer.listen(process.env.PORT || 3001, () =>
      console.log("✔️ - PIKSEL Backend Aktif"),
    );
  };

  start();
}
