import crypto from "node:crypto";

let privateKey: string;
let publicKey: string;

const envPem = process.env.JWT_PRIVATE_KEY_PEM;
if (envPem) {
  privateKey = envPem.replace(/\\n/g, "\n");
  const keyObj = crypto.createPublicKey(privateKey);
  publicKey = keyObj.export({ type: "spki", format: "pem" }) as string;
  console.log("[DRM] Loaded RSA signing key from JWT_PRIVATE_KEY_PEM");
} else {
  console.warn("[DRM] JWT_PRIVATE_KEY_PEM not set — generating ephemeral dev keypair. Do NOT use in production.");
  const pair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  privateKey = pair.privateKey as string;
  publicKey = pair.publicKey as string;
}

function getJWKS(): { keys: any[] } {
  const keyObj = crypto.createPublicKey(publicKey);
  const jwk = keyObj.export({ format: "jwk" });
  return {
    keys: [
      {
        ...jwk,
        kid: "drm-signing-key-1",
        alg: "RS256",
        use: "sig",
      },
    ],
  };
}

export { privateKey, publicKey, getJWKS };
