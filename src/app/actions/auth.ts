"use server";

import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, dashboardForRole, destroySession } from "@/lib/auth";
import { now, one, run, transaction } from "@/lib/db";
import type { Role } from "@/lib/types";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function loginAction(formData: FormData) {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const user = await one<{ id: number; password: string; role: Role }>(
    "SELECT id, password, role FROM users WHERE lower(email) = ?", email,
  );
  if (!user || !(await compare(password, user.password))) {
    fail("/login", "The email or password is incorrect.");
  }
  await createSession(user.id);
  redirect(dashboardForRole(user.role));
}

export async function registerAction(formData: FormData) {
  const name = value(formData, "name");
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const role: Role = value(formData, "role") === "cleaner" ? "cleaner" : "customer";
  const phone = value(formData, "phone");
  const address = value(formData, "address");

  if (name.length < 2 || !email.includes("@") || password.length < 8) {
    fail("/register", "Enter a valid name and email, with a password of at least 8 characters.");
  }
  if (await one("SELECT id FROM users WHERE lower(email) = ?", email)) {
    fail("/register", "An account already exists for that email.");
  }

  const passwordHash = await hash(password, 12);
  const userId = await transaction(async () => {
    const result = await run(
      `INSERT INTO users (name, email, password, role, phone, address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      name, email, passwordHash, role, phone || null, address || null, now(), now(),
    );
    const id = Number(result.lastInsertRowid);
    if (role === "cleaner") {
      await run(
        `INSERT INTO cleaners
          (user_id, business_name, description, address, city, phone, rating, turnaround_time, opening_hours, is_available, is_approved, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 0, ?, ?)`,
        id, `${name} Laundry`, "Tell customers what makes your laundry service special.", address || "Address not set", "Lagos", phone || "Phone not set", "24 - 48 hours", "Mon - Sat, 8am - 6pm", now(), now(),
      );
    }
    return id;
  });

  await createSession(userId);
  redirect(dashboardForRole(role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

