"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Status = "idle" | "loading" | "success";

interface RegisterForm {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  whatsapp: string;
  agree: boolean;
}

export default function RegisterPage() {
  const supabase = createClient();
  const router = useRouter();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState<RegisterForm>({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    whatsapp: "",
    agree: false,
  });

  const isLoading = status === "loading";

  /* ===================== PASSWORD STRENGTH ===================== */

  const passwordStrength = useMemo(() => {
    const pwd = form.password;

    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { label: "Weak", color: "text-red-500", width: "25%" };
    if (score === 2 || score === 3)
      return { label: "Moderate", color: "text-yellow-500", width: "60%" };
    return { label: "Strong", color: "text-green-600", width: "100%" };
  }, [form.password]);

  /* ===================== VALIDATION ===================== */

  function validate(): string | null {
    if (!form.agree)
      return "You must accept the Terms & Privacy Policy.";

    if (form.fullName.trim().length < 3)
      return "Full name must be at least 3 characters.";

    if (!/^\S+@\S+\.\S+$/.test(form.email))
      return "Please enter a valid email address.";

    if (form.password.length < 8)
      return "Password must be at least 8 characters.";

    if (!/[A-Z]/.test(form.password))
      return "Password must contain at least one uppercase letter.";

    if (!/[0-9]/.test(form.password))
      return "Password must contain at least one number.";

    if (!/[^A-Za-z0-9]/.test(form.password))
      return "Password must contain at least one special character.";

    if (!/^[6-9]\d{9}$/.test(form.phone))
      return "Enter valid 10-digit Indian mobile number.";

    if (!/^91[6-9]\d{9}$/.test(form.whatsapp))
      return "WhatsApp must be in 91XXXXXXXXXX format.";

    return null;
  }

  /* ===================== REGISTER ===================== */

  async function handleRegister(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();
    if (isLoading) return;

    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setStatus("loading");

    try {
      const cleanEmail = form.email.trim().toLowerCase();

      const { data, error: authError } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password: form.password,
          options: {
            data: {
              full_name: form.fullName.trim(),
              phone: form.phone.trim(),
              whatsapp_number: form.whatsapp.trim(),
            },
          },
        });

      if (authError || !data.user) {
        throw new Error(
          authError?.message || "Registration failed."
        );
      }

      setStatus("success");

      setTimeout(() => {
        router.push("/login");
      }, 5000);

    } catch (err: any) {
      setError(
        err.message ||
          "Something went wrong. Please try again."
      );
      setStatus("idle");
    }
  }

  /* ===================== UI ===================== */

  return (
    <main className="min-h-screen bg-gradient-to-br from-red-50 via-white to-white flex items-center justify-center px-4 sm:px-6 py-12 sm:py-16">
      <div className="w-full max-w-2xl">
        <Card className="p-6 sm:p-10 space-y-8">

          <div className="space-y-2 text-center">
            <h1 className="text-2xl sm:text-3xl font-semibold">
              Create Your Account
            </h1>
            <p className="text-sm text-muted max-w-md mx-auto">
              BrickInfinity uses identity verification to
              maintain marketplace trust.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-lg text-sm">
              {error}
            </div>
          )}

          {status === "success" && (
            <div className="bg-green-50 text-green-600 border border-green-200 p-4 rounded-lg text-sm">
              Registration successful. Please verify your email.
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-6">

            <Input
              type="text"
              placeholder="Full Name"
              disabled={isLoading}
              value={form.fullName}
              onChange={(e: any) =>
                setForm({ ...form, fullName: e.target.value })
              }
            />

            <Input
              type="email"
              placeholder="Email"
              disabled={isLoading}
              value={form.email}
              onChange={(e: any) =>
                setForm({ ...form, email: e.target.value })
              }
            />

            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                disabled={isLoading}
                value={form.password}
                onChange={(e: any) =>
                  setForm({ ...form, password: e.target.value })
                }
              />

              {form.password && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${passwordStrength.color.replace(
                        "text",
                        "bg"
                      )} transition-all`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                  <p className={`text-xs ${passwordStrength.color}`}>
                    Strength: {passwordStrength.label}
                  </p>
                </div>
              )}
            </div>

            <Input
              type="text"
              placeholder="Phone (10-digit Indian number)"
              disabled={isLoading}
              value={form.phone}
              onChange={(e: any) =>
                setForm({ ...form, phone: e.target.value })
              }
            />

            <Input
              type="text"
              placeholder="WhatsApp (91XXXXXXXXXX)"
              disabled={isLoading}
              value={form.whatsapp}
              onChange={(e: any) =>
                setForm({ ...form, whatsapp: e.target.value })
              }
            />

            <label className="flex items-start gap-2 text-xs text-muted leading-relaxed">
              <input
                type="checkbox"
                checked={form.agree}
                disabled={isLoading}
                onChange={() =>
                  setForm({ ...form, agree: !form.agree })
                }
              />
              I agree to the Terms of Service and Privacy Policy.
              I understand false information may result in
              account suspension.
            </label>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading
                ? "Creating Account..."
                : "Register"}
            </Button>

          </form>

          <div className="text-xs text-center text-muted pt-6 border-t">
            🔒 SSL Secured • Encrypted Authentication • Verified Marketplace
          </div>

        </Card>
      </div>
    </main>
  );
}