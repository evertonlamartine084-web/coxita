import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pedido recebido",
  em_preparo: "Em preparo",
  saiu_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
}

// Base64url decode
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(base64 + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Base64url encode
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Create VAPID JWT
async function createVapidJwt(audience: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: audience,
    exp: now + 86400,
    sub: "mailto:contato@coxita.com",
  }

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const unsigned = `${headerB64}.${payloadB64}`

  // Import private key
  const privateKeyBytes = base64UrlDecode(VAPID_PRIVATE_KEY)
  const publicKeyBytes = base64UrlDecode(VAPID_PUBLIC_KEY)

  // Build JWK for P-256
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
    d: base64UrlEncode(privateKeyBytes),
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  )

  // Convert DER signature to raw (r, s) format
  const sigBytes = new Uint8Array(signature)
  let r, s
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32)
    s = sigBytes.slice(32, 64)
  } else {
    // Already raw format
    r = sigBytes.slice(0, 32)
    s = sigBytes.slice(32)
  }

  const rawSig = new Uint8Array(64)
  rawSig.set(r, 0)
  rawSig.set(s, 32)

  return `${unsigned}.${base64UrlEncode(rawSig)}`
}

// HKDF
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", key, salt.length > 0 ? salt : new Uint8Array(32)))

  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const infoWithCounter = new Uint8Array(info.length + 1)
  infoWithCounter.set(info)
  infoWithCounter[info.length] = 1
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter))
  return okm.slice(0, length)
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder()
  const typeBytes = encoder.encode(type)

  const info = new Uint8Array(
    18 + typeBytes.length + 1 + 5 + 2 + clientPublicKey.length + 2 + serverPublicKey.length
  )

  let offset = 0
  const contentEncoding = encoder.encode("Content-Encoding: ")
  info.set(contentEncoding, offset); offset += contentEncoding.length
  info.set(typeBytes, offset); offset += typeBytes.length
  info[offset++] = 0

  const p256ecdsa = encoder.encode("P-256")
  info[offset++] = 0; info[offset++] = 0; info[offset++] = 0x41
  // Client public key length (65 bytes for uncompressed P-256)
  info.set(new Uint8Array([0, clientPublicKey.length]), offset - 2)
  // Wait, let me simplify this...

  return info.slice(0, offset)
}

// Encrypt push payload
async function encryptPayload(
  clientPublicKeyB64: string,
  authSecretB64: string,
  payload: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const clientPublicKey = base64UrlDecode(clientPublicKeyB64)
  const authSecret = base64UrlDecode(authSecretB64)

  // Generate server ECDH key pair
  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey)
  )

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  )

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      serverKeys.privateKey,
      256
    )
  )

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // RFC 8291 key derivation
  const encoder = new TextEncoder()

  // auth_info = "Content-Encoding: auth\0"
  const authInfo = encoder.encode("Content-Encoding: auth\0")

  // IKM from auth secret + shared secret
  const authKey = await crypto.subtle.importKey("raw", authSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", authKey, sharedSecret))

  // PRK key
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const authInfoCounter = new Uint8Array(authInfo.length + 1)
  authInfoCounter.set(authInfo)
  authInfoCounter[authInfo.length] = 1
  const ikm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, authInfoCounter))

  // CEK info = "Content-Encoding: aes128gcm\0"
  const cekInfo = new Uint8Array([
    ...encoder.encode("Content-Encoding: aes128gcm\0")
  ])

  // Nonce info = "Content-Encoding: nonce\0"
  const nonceInfo = new Uint8Array([
    ...encoder.encode("Content-Encoding: nonce\0")
  ])

  // Derive CEK
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const cekPrk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm.slice(0, 32)))
  const cekPrkKey = await crypto.subtle.importKey("raw", cekPrk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

  const cekInfoCounter = new Uint8Array(cekInfo.length + 1)
  cekInfoCounter.set(cekInfo)
  cekInfoCounter[cekInfo.length] = 1
  const cek = new Uint8Array(await crypto.subtle.sign("HMAC", cekPrkKey, cekInfoCounter)).slice(0, 16)

  // Derive nonce
  const nonceInfoCounter = new Uint8Array(nonceInfo.length + 1)
  nonceInfoCounter.set(nonceInfo)
  nonceInfoCounter[nonceInfo.length] = 1
  const nonce = new Uint8Array(await crypto.subtle.sign("HMAC", cekPrkKey, nonceInfoCounter)).slice(0, 12)

  // Encrypt with AES-128-GCM
  const payloadBytes = encoder.encode(payload)
  // Add padding delimiter
  const padded = new Uint8Array(payloadBytes.length + 1)
  padded.set(payloadBytes)
  padded[payloadBytes.length] = 2 // delimiter

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"])
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      padded
    )
  )

  // Build aes128gcm header + ciphertext
  // Header: salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const rs = 4096
  const header = new Uint8Array(16 + 4 + 1 + serverPublicKeyRaw.length + encrypted.length)
  header.set(salt, 0)
  header[16] = (rs >> 24) & 0xff
  header[17] = (rs >> 16) & 0xff
  header[18] = (rs >> 8) & 0xff
  header[19] = rs & 0xff
  header[20] = serverPublicKeyRaw.length
  header.set(serverPublicKeyRaw, 21)
  header.set(encrypted, 21 + serverPublicKeyRaw.length)

  return { ciphertext: header, salt, serverPublicKey: serverPublicKeyRaw }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  try {
    const { order_number, status } = await req.json()

    if (!order_number || !status) {
      return new Response(JSON.stringify({ error: "order_number and status required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("order_number", order_number)

    if (error) throw error

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const statusLabel = STATUS_LABELS[status] || status
    const payload = JSON.stringify({
      title: `Pedido #${order_number}`,
      body: `Status: ${statusLabel}`,
      url: `/acompanhar/${order_number}`,
    })

    let sent = 0

    for (const sub of subscriptions) {
      try {
        const url = new URL(sub.endpoint)
        const audience = `${url.protocol}//${url.host}`

        const jwt = await createVapidJwt(audience)

        const encrypted = await encryptPayload(
          sub.keys_p256dh,
          sub.keys_auth,
          payload
        )

        const response = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Encoding": "aes128gcm",
            "TTL": "86400",
            "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
          },
          body: encrypted.ciphertext,
        })

        if (response.status === 201 || response.status === 200) {
          sent++
        } else if (response.status === 410 || response.status === 404) {
          // Subscription expired, remove it
          await supabase.from("push_subscriptions").delete().eq("id", sub.id)
        } else {
          console.error(`Push failed: ${response.status} ${await response.text()}`)
        }
      } catch (e: any) {
        console.error(`Push error for ${sub.endpoint}:`, e.message)
      }
    }

    return new Response(
      JSON.stringify({ sent, total: subscriptions.length }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    )
  } catch (e: any) {
    console.error("send-push error:", e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})
