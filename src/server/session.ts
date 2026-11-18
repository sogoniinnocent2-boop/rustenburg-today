import { cookies } from "next/headers";
import { userFromCookie, type SessionUser } from "./auth";

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromCookie(jar.get("rt_session")?.value);
}

export async function writeSession(value: string | null): Promise<void> {
  const jar = await cookies();
  if (!value) {
    jar.delete("rt_session");
    return;
  }
  jar.set("rt_session", value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 14 * 24 * 60 * 60,
  });
}

export async function writePreference(name: "rt_theme" | "rt_locale", value: string): Promise<void> {
  const jar = await cookies();
  jar.set(name, value, { path: "/", sameSite: "lax", maxAge: 31536000 });
}
