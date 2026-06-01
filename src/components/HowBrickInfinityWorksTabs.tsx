"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

const tabs = {
  buyers: {
    label: "Buyers / Tenants",
    eyebrow: "Search with clarity",
    title: "Find spaces that match real intent.",
    image: "/images/about/forbuyerstenants.png",
    alt: "Buyers and tenants discovering property options on Brick Infinity",
    flow: ["Search", "Compare", "Connect"],
    points: [
      "Explore buy, rent, featured, and latest discovery routes.",
      "Compare properties with clearer digital presentation.",
      "Use direct enquiry options when a property feels right.",
    ],
  },
  sellers: {
    label: "Sellers / Owners",
    eyebrow: "List with confidence",
    title: "Turn offline property interest into online visibility.",
    image: "/images/about/forsellersowners.png",
    alt: "Sellers and owners listing and promoting property on Brick Infinity",
    flow: ["List", "Get Verified", "Promote"],
    points: [
      "Owner-focused listing flow with KYC-based seller access.",
      "Ownership document support and admin review workflow.",
      "Promote urgent or high-priority properties as featured listings.",
    ],
  },
};

type TabKey = keyof typeof tabs;

export default function HowBrickInfinityWorksTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>("buyers");
  const active = tabs[activeTab];

  return (
    <div className="mt-10 overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-4 shadow-[var(--shadow-soft)] md:p-6">
      <div className="grid gap-3 rounded-3xl bg-slate-50 p-2 sm:grid-cols-2" role="tablist" aria-label="How Brick Infinity works by audience">
        {(Object.keys(tabs) as TabKey[]).map((key) => {
          const tab = tabs[key];
          const selected = activeTab === key;

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="about-workflow-panel"
              id={`about-workflow-tab-${key}`}
              onClick={() => setActiveTab(key)}
              className={`rounded-2xl px-5 py-4 text-left text-sm font-bold transition duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 ${
                selected
                  ? "bg-[var(--color-dark)] text-white shadow-lg"
                  : "bg-white text-slate-700 hover:bg-red-50 hover:text-[var(--color-primary)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id="about-workflow-panel"
        role="tabpanel"
        aria-labelledby={`about-workflow-tab-${activeTab}`}
        className="mt-6 grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center"
      >
        <div className="relative min-h-[300px] overflow-hidden rounded-3xl border border-slate-100 bg-slate-100 shadow-lg sm:min-h-[380px]">
          <Image
            src={active.image}
            alt={active.alt}
            fill
            sizes="(min-width: 1024px) 48vw, 100vw"
            className="object-cover transition duration-500 hover:scale-105"
          />
        </div>

        <div className="px-1 pb-2 md:px-2">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">{active.eyebrow}</p>
          <h3 className="mt-3 text-2xl font-black tracking-tight text-[var(--color-dark)] md:text-4xl">{active.title}</h3>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {active.flow.map((step, index) => (
              <div key={step} className="group rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white transition group-hover:bg-[var(--color-primary)]">
                  {index + 1}
                </div>
                <p className="mt-4 text-lg font-bold">{step}</p>
              </div>
            ))}
          </div>

          <ul className="mt-7 space-y-3 text-sm leading-6 text-[var(--color-muted)]">
            {active.points.map((point) => (
              <li key={point} className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-green-600" size={18} aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
