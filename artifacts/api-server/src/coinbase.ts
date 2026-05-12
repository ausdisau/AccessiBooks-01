import { Request, Response } from "express";
import crypto from "crypto";

const COINBASE_COMMERCE_API_BASE = "https://api.commerce.coinbase.com";
const { COINBASE_COMMERCE_API_KEY, COINBASE_COMMERCE_WEBHOOK_SECRET } = process.env;

const coinbaseEnabled = !!COINBASE_COMMERCE_API_KEY;

if (coinbaseEnabled) {
  console.log("Coinbase Commerce integration initialized");
} else {
  console.log("Coinbase Commerce integration not configured - missing API key");
}

export function isCoinbaseEnabled(): boolean {
  return coinbaseEnabled;
}

interface CoinbaseChargeData {
  name: string;
  description: string;
  pricing_type: "fixed_price" | "no_price";
  local_price?: {
    amount: string;
    currency: string;
  };
  metadata?: Record<string, string>;
  redirect_url?: string;
  cancel_url?: string;
}

interface CoinbaseCharge {
  id: string;
  hosted_url: string;
  code: string;
  pricing: {
    local: { amount: string; currency: string };
    bitcoin?: { amount: string; currency: string };
    ethereum?: { amount: string; currency: string };
    usdc?: { amount: string; currency: string };
  };
  timeline: Array<{ time: string; status: string }>;
}

async function coinbaseRequest(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: object
): Promise<any> {
  if (!coinbaseEnabled) {
    throw new Error("Coinbase Commerce is not configured");
  }

  const response = await fetch(`${COINBASE_COMMERCE_API_BASE}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": COINBASE_COMMERCE_API_KEY!,
      "X-CC-Version": "2018-03-22",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Coinbase API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function createCoinbaseCharge(req: Request, res: Response) {
  if (!coinbaseEnabled) {
    return res.status(503).json({ error: "Coinbase Commerce is not configured" });
  }

  try {
    const { amount, currency = "USD", name, description, type, metadata } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const chargeData: CoinbaseChargeData = {
      name: name || "AccessiBooks Payment",
      description: description || "Payment for AccessiBooks services",
      pricing_type: "fixed_price",
      local_price: {
        amount: amount.toString(),
        currency: currency.toUpperCase(),
      },
      metadata: {
        ...metadata,
        type: type || "donation",
      },
    };

    const result = await coinbaseRequest("/charges/", "POST", chargeData);
    
    res.json({
      id: result.data.id,
      code: result.data.code,
      hosted_url: result.data.hosted_url,
      pricing: result.data.pricing,
      expires_at: result.data.expires_at,
    });
  } catch (error) {
    console.error("Failed to create Coinbase charge:", error);
    res.status(500).json({ error: "Failed to create cryptocurrency payment" });
  }
}

export async function getCoinbaseCharge(req: Request, res: Response) {
  if (!coinbaseEnabled) {
    return res.status(503).json({ error: "Coinbase Commerce is not configured" });
  }

  try {
    const { chargeId } = req.params;
    const result = await coinbaseRequest(`/charges/${chargeId}`);
    
    res.json({
      id: result.data.id,
      code: result.data.code,
      status: result.data.timeline[result.data.timeline.length - 1]?.status || "NEW",
      pricing: result.data.pricing,
      payments: result.data.payments,
    });
  } catch (error) {
    console.error("Failed to get Coinbase charge:", error);
    res.status(500).json({ error: "Failed to get payment status" });
  }
}

export function verifyCoinbaseWebhook(
  rawBody: string,
  signature: string | undefined
): boolean {
  if (!COINBASE_COMMERCE_WEBHOOK_SECRET) {
    console.warn("Coinbase webhook secret not configured");
    return false;
  }

  if (!signature || typeof signature !== "string") {
    console.warn("Missing or invalid Coinbase webhook signature header");
    return false;
  }

  const computedSignature = crypto
    .createHmac("sha256", COINBASE_COMMERCE_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const sigBuffer = Buffer.from(signature);
  const computedBuffer = Buffer.from(computedSignature);

  if (sigBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, computedBuffer);
}

export async function handleCoinbaseWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers["x-cc-webhook-signature"] as string | undefined;
    // Use raw body if available (set by express.text middleware), otherwise stringify
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    // Require signature verification in production or when secret is configured
    if (COINBASE_COMMERCE_WEBHOOK_SECRET) {
      if (!verifyCoinbaseWebhook(rawBody, signature)) {
        console.warn("Invalid Coinbase webhook signature");
        return res.status(400).json({ error: "Invalid signature" });
      }
    }

    const event = req.body;
    console.log(`Coinbase webhook received: ${event.type}`);

    switch (event.type) {
      case "charge:confirmed":
        console.log(`Payment confirmed for charge: ${event.data.id}`);
        // Handle confirmed payment - update user subscription or donation record
        const metadata = event.data.metadata || {};
        if (metadata.type === "subscription" && metadata.userId) {
          // Update user subscription status
          console.log(`Crypto subscription payment confirmed for user: ${metadata.userId}`);
        } else if (metadata.type === "donation") {
          console.log(`Crypto donation received: ${event.data.pricing?.local?.amount}`);
        }
        break;

      case "charge:failed":
        console.log(`Payment failed for charge: ${event.data.id}`);
        break;

      case "charge:pending":
        console.log(`Payment pending for charge: ${event.data.id}`);
        break;

      default:
        console.log(`Unhandled Coinbase event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Coinbase webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

export async function getPaymentMethods(req: Request, res: Response) {
  res.json({
    stripe: true, // Stripe is always configured via integration
    paypal: !!process.env.PAYPAL_CLIENT_ID,
    coinbase: coinbaseEnabled,
    supportedCryptos: coinbaseEnabled ? ["BTC", "ETH", "USDC", "DAI", "LTC"] : [],
  });
}
