// Based on javascript_auth_all_persistance blueprint - modified for external API integration
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendEmail } from "./mailer";
import { sendViaAgentMail } from "./agentMailer";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getMagicLinkSecret(): string {
  return process.env.SESSION_SECRET || process.env.MAGIC_LINK_SECRET || "magic-link-dev-secret-change-in-prod";
}

function createMagicToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase().trim(), expiresAt: Date.now() + MAGIC_LINK_TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", getMagicLinkSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyMagicToken(token: string): { email: string } | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = createHmac("sha256", getMagicLinkSecret()).update(payload).digest("hex");
  try {
    if (sig.length !== expectedSig.length || !timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) return null;
  } catch {
    return null;
  }
  try {
    const { email, expiresAt } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!email || typeof email !== "string" || typeof expiresAt !== "number") return null;
    if (Date.now() > expiresAt) return null;
    return { email };
  } catch {
    return null;
  }
}

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  if (!stored || !supplied) {
    console.warn('Attempted authentication with empty password');
    return false; // Never allow empty password authentication
  }
  
  // Only handle properly formatted hashed passwords
  if (!stored.includes('.')) {
    console.warn('Attempted authentication with non-hashed password format');
    return false; // No plaintext fallback - all passwords must be properly hashed
  }
  
  try {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
}

export function setupAuth(app: Express) {
  const SESSION_SECRET = process.env.SESSION_SECRET;
  
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required for security');
  }
  
  const sessionSettings: session.SessionOptions = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    rolling: true, // Reset session expiry on each request for seamless experience
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for extended sessions
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`Attempting login`);
        const user = await storage.getUserByUsername(username);
        
        if (user && user.password === 'EXTERNAL_USER') {
          // This is an external user, delegate authentication to external API
          console.log(`External user found, delegating to external API`);
          const authenticatedUser = await storage.authenticateExternalUser(username, password);
          
          if (authenticatedUser) {
            console.log(`External authentication successful`);
            return done(null, authenticatedUser);
          } else {
            console.log(`External authentication failed`);
            return done(null, false, { message: 'Invalid credentials' });
          }
        } else if (user) {
          // This is a local user, use local password verification
          console.log(`Local user found, checking password`);
          const isValidPassword = await comparePasswords(password, user.password || '');
          
          if (!isValidPassword) {
            console.log(`Invalid password for local user`);
            return done(null, false, { message: 'Invalid password' });
          }
          
          console.log(`Local login successful`);
          return done(null, user);
        } else {
          // User not found, try external authentication as a fallback
          console.log(`User not found locally, trying external authentication`);
          const authenticatedUser = await storage.authenticateExternalUser(username, password);
          
          if (authenticatedUser) {
            console.log(`External authentication successful for new user`);
            return done(null, authenticatedUser);
          } else {
            console.log(`User not found`);
            return done(null, false, { message: 'User not found' });
          }
        }
      } catch (error) {
        console.error('Login error:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log(`Serializing user: ${user.id}`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      console.log(`Deserializing user: ${id}`);
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Registration attempt received');
      
      // Check if user already exists
      const existingUserByUsername = await storage.getUserByUsername(req.body.username);
      if (existingUserByUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingUserByEmail = await storage.getUserByEmail(req.body.email);
      if (existingUserByEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password for local storage (external API will handle its own hashing)
      const hashedPassword = await hashPassword(req.body.password);
      
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      console.log('User registered successfully:', user.id);

      req.login(user, (err) => {
        if (err) {
          console.error('Auto-login error after registration:', err);
          return next(err);
        }
        
        // Don't send password in response
        const { password, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log('Login attempt received');
    
    passport.authenticate("local", (err: any, user: SelectUser, info: any) => {
      if (err) {
        console.error('Authentication error:', err);
        return res.status(500).json({ message: "Authentication error" });
      }
      
      if (!user) {
        console.log('Authentication failed:', info);
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      
      req.login(user, (err) => {
        if (err) {
          console.error('Login error:', err);
          return res.status(500).json({ message: "Login failed" });
        }
        
        console.log('Login successful for user:', user.id);
        // Don't send password in response
        const { password, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return next(err);
      }
      
      console.log('Logout successful');
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('User not authenticated');
      return res.sendStatus(401);
    }
    
    console.log('Returning current user:', req.user?.id);
    // Don't send password in response
    const { password, ...userWithoutPassword } = req.user!;
    res.json(userWithoutPassword);
  });

  // Magic link: request
  app.post("/api/auth/magic-link/request", async (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }
    const token = createMagicToken(email);
    // Respect X-Forwarded-Proto so the link works correctly behind Replit's HTTPS proxy
    const proto = (req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim();
    const baseUrl = `${proto}://${req.get("host")}`;
    const link = `${baseUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`;
    // Always log for dev visibility — email is always masked; full link only in development
    const atIdx = email.indexOf("@");
    const localPart = atIdx >= 0 ? email.slice(0, atIdx) : email;
    const domain = atIdx >= 0 ? email.slice(atIdx + 1) : "unknown";
    const maskedEmail = `${localPart.slice(0, 2)}***@${domain}`;
    if (process.env.NODE_ENV === "development") {
      console.log(`[MagicLink] Generated link for ${maskedEmail}: ${link}`);
    } else {
      console.log(`[MagicLink] Generated link for ${maskedEmail}`);
    }

    const emailPayload = {
      to: email,
      subject: "Your AccessiBooks sign-in link",
      text: `Click this link to sign in (expires in 15 minutes):\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>Click the button below to sign in to AccessiBooks. This link expires in 15 minutes.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#6d28d9;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Sign In to AccessiBooks</a></p>
<p style="color:#888;font-size:12px">Or copy this URL into your browser:<br>${link}</p>
<p style="color:#888;font-size:12px">If you didn't request this link, you can safely ignore this email.</p>`,
    };

    // 1. Try AgentMail (no external credentials required)
    const sentViaAgentMail = await sendViaAgentMail(emailPayload);
    if (!sentViaAgentMail) {
      // 2. Fall back to SMTP if configured
      const sentViaSmtp = await sendEmail(emailPayload);
      if (!sentViaSmtp) {
        // 3. Final fallback: link already logged above — nothing more to do
        console.warn(`[MagicLink] No email delivery method available — link logged to console only`);
      }
    }

    res.json({ message: "Magic link sent — check your inbox" });
  });

  // Magic link: verify
  app.get("/api/auth/magic-link/verify", async (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.redirect("/?magic=invalid");
    }
    const result = verifyMagicToken(token);
    if (!result) {
      // verifyMagicToken returns null for both expired and invalid tokens;
      // use "expired" as it's more user-friendly (most likely cause)
      return res.redirect("/?magic=expired");
    }
    const { email } = result;
    let user = await storage.getUserByEmail(email);
    if (!user) {
      const username = email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") + "_" + randomBytes(3).toString("hex");
      user = await storage.createUser({ email, username, password: "MAGIC_LINK_USER", firstName: "", lastName: "" });
      console.log(`[MagicLink] Created new user: ${user.id}`);
    }
    req.login(user, (err) => {
      if (err) {
        console.error("[MagicLink] Login error:", err);
        return res.redirect("/?magic=error");
      }
      console.log(`[MagicLink] Logged in user: ${user!.id}`);
      res.redirect("/?magic=success");
    });
  });
}