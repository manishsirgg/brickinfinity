"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const supabase = createClient();

type Status = "checking" | "idle" | "loading" | "success";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  /* ===============================
     CHECK RECOVERY SESSION
  =============================== */
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        setError("Invalid or expired reset link.");
        setStatus("idle");
        return;
      }

      setStatus("idle");
    };

    checkSession();
  }, []);

  /* ===============================
     PASSWORD STRENGTH (UI ONLY)
  =============================== */
  const strength = useMemo(() => {
    if (!password) return null;

    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1)
      return { label: "Weak", color: "text-red-500", width: "25%" };
    if (score <= 3)
      return { label: "Moderate", color: "text-yellow-500", width: "60%" };
    return { label: "Strong", color: "text-green-600", width: "100%" };
  }, [password]);

  /* ===============================
     VALIDATION
  =============================== */
  function validatePassword() {
    if (password.length < 8) {
      return "Password must be at least 8 characters.";
    }

    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter.";
    }

    if (!/[0-9]/.test(password)) {
      return "Password must contain at least one number.";
    }

    if (password !== confirmPassword) {
      return "Passwords do not match.";
    }

    return null;
  }

  /* ===============================
     UPDATE PASSWORD
  =============================== */
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (status === "loading") return;

    setError("");

    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    setStatus("loading");

    try {
      const { error } =
        await supabase.auth.updateUser({
          password,
        });

      if (error) {
        throw new Error(error.message);
      }

      setStatus("success");

      setTimeout(() => {
        router.push("/login");
      }, 2000);

    } catch (err: any) {
      setError(
        err.message ||
          "Something went wrong. Please try again."
      );
      setStatus("idle");
    }
  };

  const isLoading = status === "loading";
  const isChecking = status === "checking";

  return (
    <main className="min-h-screen bg-gradient-to-br from-red-50 via-white to-white flex items-center justify-center px-4 sm:px-6 py-12 sm:py-16">
      <div className="w-full max-w-md">
        <Card className="p-6 sm:p-10 space-y-8">

          <div className="text-center space-y-2">
            <h1 className="text-xl sm:text-2xl font-semibold">
              Set New Password
            </h1>
            <p className="text-sm text-muted">
              Choose a secure password for your account.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-lg text-sm">
              {error}
            </div>
          )}

          {status === "success" && (
            <div className="bg-green-50 text-green-600 border border-green-200 p-4 rounded-lg text-sm">
              Password updated successfully. Redirecting to login...
            </div>
          )}

          {!isChecking && status !== "success" && (
            <form
              onSubmit={handleUpdate}
              className="space-y-6"
            >
              <div className="space-y-2">
                <Input
                  type="password"
                  required
                  placeholder="New Password"
                  disabled={isLoading}
                  value={password}
                  onChange={(e: any) =>
                    setPassword(e.target.value)
                  }
                />

                {strength && (
                  <div className="space-y-1">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          strength.color.replace("text", "bg")
                        }`}
                        style={{ width: strength.width }}
                      />
                    </div>
                    <p className={`text-xs ${strength.color}`}>
                      Strength: {strength.label}
                    </p>
                  </div>
                )}
              </div>

              <Input
                type="password"
                required
                placeholder="Confirm Password"
                disabled={isLoading}
                value={confirmPassword}
                onChange={(e: any) =>
                  setConfirmPassword(e.target.value)
                }
              />

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full"
              >
                {isLoading
                  ? "Updating..."
                  : "Update Password"}
              </Button>
            </form>
          )}

        </Card>
      </div>
    </main>
  );
}