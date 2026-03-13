/**
 * Custom Authentication System
 * - ID/Password login (no Manus OAuth)
 * - Invitation-based registration
 * - First-login password change enforcement
 * - JWT session management
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import bcrypt from "bcryptjs";
import type { Express, Request, Response } from "express";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import * as db from "./db";

const BCRYPT_ROUNDS = 12;

/**
 * Register custom auth REST endpoints
 */
export function registerCustomAuthRoutes(app: Express) {
  /**
   * POST /api/auth/login
   * Body: { loginId: string, password: string }
   * Returns: { success: true, user: {...}, mustChangePassword: boolean }
   */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { loginId, password } = req.body;

      if (!loginId || !password) {
        res.status(400).json({ error: "ログインIDとパスワードを入力してください" });
        return;
      }

      // Find user by loginId
      const user = await db.getUserByLoginId(loginId);
      if (!user) {
        res.status(401).json({ error: "ログインIDまたはパスワードが正しくありません" });
        return;
      }

      // Verify password
      if (!user.passwordHash) {
        res.status(401).json({ error: "パスワードが設定されていません。管理者にお問い合わせください。" });
        return;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "ログインIDまたはパスワードが正しくありません" });
        return;
      }

      // Create JWT session token
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.loginId || "",
        expiresInMs: ONE_YEAR_MS,
      });

      // Set cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Update last signed in
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: new Date(),
      });

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          loginId: user.loginId,
          appRole: user.appRole,
          mustChangePassword: user.mustChangePassword,
        },
        mustChangePassword: user.mustChangePassword,
      });
    } catch (error) {
      console.error("[CustomAuth] Login failed:", error);
      res.status(500).json({ error: "ログインに失敗しました" });
    }
  });

  /**
   * POST /api/auth/accept-invite
   * Body: { token: string }
   * Validates invitation token and creates user account
   */
  app.post("/api/auth/accept-invite", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({ error: "招待トークンが必要です" });
        return;
      }

      // Verify invitation
      const invitation = await db.getInvitationByToken(token);
      if (!invitation) {
        res.status(404).json({ error: "招待リンクが見つかりません" });
        return;
      }
      if (invitation.status === "used") {
        res.status(400).json({ error: "この招待リンクは既に使用されています" });
        return;
      }
      if (new Date() > invitation.expiresAt) {
        res.status(400).json({ error: "招待リンクの有効期限が切れています" });
        return;
      }

      // Check if loginId already exists
      const existingUser = await db.getUserByLoginId(invitation.loginId);
      if (existingUser) {
        res.status(400).json({ error: "このログインIDは既に使用されています" });
        return;
      }

      // Hash the temporary password
      const passwordHash = await bcrypt.hash(invitation.tempPassword, BCRYPT_ROUNDS);

      // Create a unique openId for this custom-auth user
      const openId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      // Create user account
      await db.upsertUser({
        openId,
        name: invitation.loginId,
        loginId: invitation.loginId,
        passwordHash,
        appRole: invitation.assignedRole,
        role: invitation.assignedRole === "admin" ? "admin" : "user",
        mustChangePassword: true,
        lastSignedIn: new Date(),
      });

      const newUser = await db.getUserByLoginId(invitation.loginId);
      if (!newUser) {
        res.status(500).json({ error: "アカウントの作成に失敗しました" });
        return;
      }

      // Mark invitation as used
      await db.markInvitationUsed(token, newUser.id);

      // Create session
      const sessionToken = await sdk.createSessionToken(openId, {
        name: invitation.loginId,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        success: true,
        user: {
          id: newUser.id,
          name: newUser.name,
          loginId: newUser.loginId,
          appRole: newUser.appRole,
          mustChangePassword: true,
        },
      });
    } catch (error) {
      console.error("[CustomAuth] Accept invite failed:", error);
      res.status(500).json({ error: "招待の受諾に失敗しました" });
    }
  });

  /**
   * POST /api/auth/change-password
   * Body: { currentPassword: string, newPassword: string }
   * Requires active session
   */
  app.post("/api/auth/change-password", async (req: Request, res: Response) => {
    try {
      // Verify session
      const user = await authenticateFromCookie(req);
      if (!user) {
        res.status(401).json({ error: "ログインが必要です" });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: "現在のパスワードと新しいパスワードを入力してください" });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: "新しいパスワードは6文字以上にしてください" });
        return;
      }

      // Verify current password
      if (!user.passwordHash) {
        res.status(400).json({ error: "パスワードが設定されていません" });
        return;
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "現在のパスワードが正しくありません" });
        return;
      }

      // Hash new password
      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      // Update password and clear mustChangePassword flag
      await db.updateUserPassword(user.id, newHash);

      res.json({ success: true });
    } catch (error) {
      console.error("[CustomAuth] Change password failed:", error);
      res.status(500).json({ error: "パスワードの変更に失敗しました" });
    }
  });
}

/**
 * Helper: authenticate user from session cookie (for custom auth users)
 */
async function authenticateFromCookie(req: Request): Promise<db.UserRecord | null> {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const { parse: parseCookieHeader } = await import("cookie");
  const cookies = parseCookieHeader(cookieHeader);
  const sessionCookie = cookies[COOKIE_NAME];

  const session = await sdk.verifySession(sessionCookie);
  if (!session) return null;

  const user = await db.getUserByOpenId(session.openId);
  return user || null;
}
