import type { Metadata } from "next";
import { changePasswordAction, updateProfileAction } from "@/app/actions/account";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const message = await searchParams;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Account settings</p>
          <h1 className="page-title">Your profile</h1>
          <p className="page-copy">Keep your contact and security details current.</p>
        </div>
      </div>
      {message.success && <p className="mx-auto mb-5 max-w-2xl rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-700">{message.success.replaceAll("+", " ")}</p>}
      {message.error && <p className="mx-auto mb-5 max-w-2xl rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{message.error.replaceAll("+", " ")}</p>}

      <div className="mx-auto grid max-w-2xl gap-6">
        <form action={updateProfileAction} className="surface p-6 sm:p-8">
          <h2 className="section-title">Profile details</h2>
          <div className="form-grid mt-5">
            <label><span className="field-label">Full name</span><input className="field" name="name" defaultValue={user.name} maxLength={100} required /></label>
            <label><span className="field-label">Email address</span><input className="field bg-zinc-50" defaultValue={user.email} disabled /></label>
            <label><span className="field-label">Phone</span><input className="field" name="phone" type="tel" defaultValue={user.phone ?? ""} maxLength={30} /></label>
            <label><span className="field-label">Primary address</span><input className="field" name="address" defaultValue={user.address ?? ""} maxLength={250} /></label>
            <button className="btn-primary" type="submit">Save profile</button>
          </div>
        </form>

        <form action={changePasswordAction} className="surface p-6 sm:p-8">
          <h2 className="section-title">Change password</h2>
          <div className="form-grid mt-5">
            <label><span className="field-label">Current password</span><input className="field" name="current_password" type="password" autoComplete="current-password" maxLength={128} required /></label>
            <label><span className="field-label">New password</span><input className="field" name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <label><span className="field-label">Confirm new password</span><input className="field" name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
            <button className="btn-primary" type="submit">Update password</button>
          </div>
        </form>
      </div>
    </div>
  );
}
