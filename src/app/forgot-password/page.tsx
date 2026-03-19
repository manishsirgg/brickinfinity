"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const supabase = createClient();

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success"
  >("idle");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  /* ================= RESET HANDLER ================= */

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (cooldown > 0) return;

    setStatus("loading");
    setError("");

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo:
              window.location.origin +
              "/reset-password",
          }
        );

      // Prevent account enumeration
      if (error) {
        console.error("Reset error:", error.message);
      }

      setStatus("success");

      // Cooldown (prevent spam)
      setCooldown(30);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4 sm:px-6">
      <div className="w-full max-w-md">
        <Card className="p-6 sm:p-10 space-y-8">

          {/* HEADER */}
          <div className="text-center space-y-2">
            <h1 className="text-xl sm:text-2xl font-semibold">
              Reset Password
            </h1>
            <p className="text-sm text-[var(--color-muted)]">
              Enter your registered email to receive a reset link.
            </p>
          </div>

          {/* FORM */}
          <form
            onSubmit={handleReset}
            className="space-y-6"
          >
            <Input
              type="email"
              required
              placeholder="Enter your email"
              value={email}
              onChange={(e: any) =>
                setEmail(e.target.value)
              }
              disabled={status === "loading"}
            />

            <Button
              type="submit"
              disabled={
                status === "loading" || cooldown > 0
              }
              className="w-full transition disabled:opacity-60"
            >
              {status === "loading"
                ? "Sending..."
                : cooldown > 0
                ? `Resend in ${cooldown}s`
                : "Send Reset Link"}
            </Button>
          </form>

          {/* SUCCESS MESSAGE */}
          {status === "success" && (
            <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg text-sm text-center">
              If an account exists with this email,
              a password reset link has been sent.
            </div>
          )}

          {/* ERROR MESSAGE */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

        </Card>
      </div>
    </main>
  );
}