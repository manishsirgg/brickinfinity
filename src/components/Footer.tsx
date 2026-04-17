"use client";

import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-32 md:mt-40 overflow-hidden">

      {/* ===== Background Base ===== */}
      <div className="absolute inset-0 bg-[var(--color-dark)]" />

      {/* Ambient Gradients */}
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-to-br from-red-500 via-orange-400 to-red-600 opacity-20 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gradient-to-tr from-red-600 via-orange-400 to-red-500 opacity-15 rounded-full blur-3xl" />

      {/* ===== Content ===== */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 md:py-28 text-white">

        {/* ===== Grid ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-12 md:gap-20">

          {/* ===== Brand ===== */}
          <div className="space-y-6 md:space-y-8">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="BrickInfinity Logo"
                width={46}
                height={46}
                className="object-contain"
              />
              <h2 className="text-lg md:text-xl font-semibold tracking-tight">
                BrickInfinity
              </h2>
            </div>

            <p className="text-sm text-white/70 leading-relaxed max-w-sm">
              A verification-driven real estate marketplace connecting
              buyers and sellers across India. Built for transparency,
              performance, and long-term trust.
            </p>
          </div>

          {/* ===== Explore ===== */}
          <div>
            <h3 className="text-base font-semibold mb-6 relative inline-block">
              Explore
              <span className="absolute left-0 -bottom-2 w-8 h-[2px] bg-red-400"></span>
            </h3>

            <ul className="space-y-3 md:space-y-4 text-sm text-white/70">
              <li>
                <Link href="/buy" className="hover:text-white transition-colors duration-200">
                  Buy Properties
                </Link>
              </li>
              <li>
                <Link href="/rent" className="hover:text-white transition-colors duration-200">
                  Rent Properties
                </Link>
              </li>
              <li>
                <Link href="/dashboard/add-property" className="hover:text-white transition-colors duration-200">
                  List Property
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors duration-200">
                  Seller Dashboard
                </Link>
              </li>
              <li>
                <Link href="/blogs" className="hover:text-white transition-colors duration-200">
                  Blogs
                </Link>
              </li>
            </ul>
          </div>

          {/* ===== Legal ===== */}
          <div>
            <h3 className="text-base font-semibold mb-6 relative inline-block">
              Legal
              <span className="absolute left-0 -bottom-2 w-8 h-[2px] bg-red-400"></span>
            </h3>

            <ul className="space-y-3 md:space-y-4 text-sm text-white/70">
              <li>
                <Link href="/legal/disclaimer" className="hover:text-white transition-colors duration-200">
                  Disclaimer
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy-policy" className="hover:text-white transition-colors duration-200">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/terms-of-service" className="hover:text-white transition-colors duration-200">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/refund-policy" className="hover:text-white transition-colors duration-200">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* ===== Contact ===== */}
          <div>
            <h3 className="text-base font-semibold mb-6 relative inline-block">
              Contact
              <span className="absolute left-0 -bottom-2 w-8 h-[2px] bg-red-400"></span>
            </h3>

            <ul className="space-y-3 md:space-y-4 text-sm text-white/70">
              <li>Email: infobrickinfinity@gmail.com</li>
              <li>Phone: +91-8989601701</li>
              <li>Location: India</li>
              <li>
                Instagram:{" "}
                <a
                  href="https://instagarm.com/brick_infinity"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors duration-200"
                >
                  @brick_infinity
                </a>
              </li>
              <li>
                Facebook:{" "}
                <a
                  href="https://facebook.com/brickinfinity"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors duration-200"
                >
                  brickinfinity
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* ===== Divider ===== */}
        <div className="mt-16 md:mt-20 pt-8 md:pt-10 border-t border-white/10">

          <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-white/60 text-center md:text-left">

            <p>
              © {year} BrickInfinity [Infinity Global Advisory]. All rights reserved.
            </p>

            <div className="flex gap-6 md:gap-8 flex-wrap justify-center">
              <Link href="/legal/privacy-policy" className="hover:text-white transition duration-200">
                Privacy
              </Link>
              <Link href="/legal/terms-of-service" className="hover:text-white transition duration-200">
                Terms
              </Link>
              <Link href="/legal/disclaimer" className="hover:text-white transition duration-200">
                Disclaimer
              </Link>
            </div>

          </div>

        </div>

      </div>
    </footer>
  );
}
