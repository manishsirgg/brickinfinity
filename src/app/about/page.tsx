import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FileCheck2,
  Heart,
  Home,
  KeyRound,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import AboutHeroSearch from "@/components/AboutHeroSearch";
import HowBrickInfinityWorksTabs from "@/components/HowBrickInfinityWorksTabs";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export const metadata: Metadata = {
  title:
    "About Brick Infinity | Smart Property Discovery for Buy, Rent & Featured Listings",
  description:
    "Brick Infinity helps buyers, tenants, sellers, and property owners find, list, promote, and connect for properties with smarter search, verified listings, and digital visibility.",
  alternates: {
    canonical: "/about",
  },
};

const listingRoute = "/dashboard/my-listings";

const trustCards = [
  { title: "Buy Properties", copy: "Discover spaces with clearer details.", icon: Home },
  { title: "Rent Properties", copy: "Compare homes, shops, and offices faster.", icon: KeyRound },
  { title: "Promote Listings", copy: "Give serious listings more visibility.", icon: Megaphone },
];

const platformCards = [
  {
    title: "Find Properties",
    href: "/properties",
    copy: "Browse active listings across discovery routes.",
    icon: Compass,
  },
  {
    title: "Buy Properties",
    href: "/properties/buy",
    copy: "Shortlist properties for ownership decisions.",
    icon: Home,
  },
  {
    title: "Rent Properties",
    href: "/properties/rent",
    copy: "Find rental options for personal or business needs.",
    icon: KeyRound,
  },
  {
    title: "Promote Properties",
    href: listingRoute,
    copy: "Use featured visibility when attention matters most.",
    icon: TrendingUp,
  },
];

const features = [
  { title: "Smart Search", icon: Search },
  { title: "Buy & Rent Categories", icon: Building2 },
  { title: "Featured Listings", icon: Sparkles },
  { title: "Saved Properties", icon: Heart },
  { title: "Direct Enquiry Flow", icon: MessageCircle },
  { title: "Seller Dashboard", icon: BarChart3 },
  { title: "Seller CRM", icon: Users },
  { title: "Admin Verification", icon: ShieldCheck },
];

const trustSafety = [
  { title: "Owner-Focused Listing Flow", icon: Building2 },
  { title: "KYC-Based Seller Access", icon: BadgeCheck },
  { title: "Ownership Document Support", icon: FileCheck2 },
  { title: "Admin Review Workflow", icon: ClipboardCheck },
  { title: "Direct Enquiry System", icon: MessageCircle },
  { title: "Seller CRM Ready", icon: Users },
  { title: "Featured Discovery Support", icon: Sparkles },
  { title: "Buy, Rent, Latest Routes", icon: Compass },
];

const audiences = [
  { title: "For Buyers", copy: "Find purchase-ready property options with useful details.", icon: Home },
  { title: "For Tenants", copy: "Discover rental spaces that match local intent.", icon: KeyRound },
  { title: "For Property Owners", copy: "Give your property a digital presence beyond offline reach.", icon: Building2 },
  { title: "For Sellers", copy: "Manage listings, enquiries, and visibility from one place.", icon: Store },
  { title: "For Investors", copy: "Track opportunities across property types and categories.", icon: TrendingUp },
];

const stats = [
  "4+ Discovery Routes",
  "24/7 Online Visibility",
  "Direct Enquiry System",
  "Seller CRM Ready",
];

const beforePoints = [
  "Hidden from potential buyers",
  "Limited to local reach",
  "No digital presence",
  "Missed opportunities",
];

const afterPoints = [
  "Visible to serious buyers and tenants",
  "Searchable online",
  "Stronger property presentation",
  "More enquiry opportunities",
];

const featuredBenefits = [
  "Better visibility",
  "More discovery opportunities",
  "Useful for urgent sale or rent",
  "Suitable for homes, shops, offices, and commercial spaces",
];

function SectionHeader({
  eyebrow,
  title,
  copy,
  centered = false,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-[var(--color-primary)]">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-3xl font-bold tracking-tight text-[var(--color-dark)] sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {copy ? (
        <p className="mt-5 text-base leading-8 text-[var(--color-muted)] md:text-lg">
          {copy}
        </p>
      ) : null}
    </div>
  );
}

function MiniIcon({ icon: Icon }: { icon: typeof Search }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-[var(--color-primary)] ring-1 ring-red-100">
      <Icon size={21} aria-hidden="true" />
    </div>
  );
}

function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)] transition hover:gap-3 hover:text-[var(--color-primary-hover)]"
    >
      {children}
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}

export default function AboutPage() {
  return (
    <div className="overflow-hidden bg-[#F7F8FA] text-[var(--color-dark)]">
      <section className="relative isolate px-4 py-16 sm:px-6 md:py-24 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(229,57,53,0.14),transparent_34%),radial-gradient(circle_at_85%_18%,rgba(255,111,0,0.13),transparent_28%)]" />
        <div className="absolute left-1/2 top-24 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-red-200/30 blur-3xl" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
          <div>
            <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-red-100 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-primary)] shadow-sm backdrop-blur">
              <Sparkles size={15} aria-hidden="true" />
              Find. Connect. Move.
            </div>
            <h1 className="max-w-4xl text-4xl font-black tracking-tight text-[var(--color-dark)] sm:text-5xl md:text-6xl lg:text-7xl">
              Real Estate Discovery,
              <span className="block bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-hover)] bg-clip-text text-transparent">
                Made Smarter.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-700 md:text-xl">
              Brick Infinity helps you find, list, promote, and connect for properties with more clarity, more visibility, and less confusion.
            </p>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--color-muted)] md:text-lg">
              Whether you want to buy, rent, sell, or promote a property, Brick Infinity gives you a digital platform where properties are easier to discover, easier to compare, and easier to act on.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button href="/properties" className="w-full sm:w-auto">
                Explore Properties
              </Button>
              <Button href={listingRoute} variant="secondary" className="w-full sm:w-auto">
                List Your Property
              </Button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {trustCards.map((item) => (
                <Card
                  key={item.title}
                  className="group p-4 transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-[var(--shadow-medium)]"
                >
                  <MiniIcon icon={item.icon} />
                  <h2 className="mt-4 text-base font-bold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{item.copy}</p>
                </Card>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="absolute -left-4 top-8 hidden rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl ring-1 ring-black/5 md:flex md:items-center md:gap-2">
              <MapPin className="text-[var(--color-primary)]" size={18} aria-hidden="true" />
              Local intent, online reach
            </div>
            <div className="absolute -right-2 bottom-16 hidden rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white shadow-xl md:block">
              Featured
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/80 p-3 shadow-2xl backdrop-blur">
              <div className="rounded-[1.5rem] bg-gradient-to-br from-slate-950 via-[#17365f] to-[#0f2747] p-4 sm:p-6">
                <AboutHeroSearch />

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="group rounded-3xl bg-white p-4 shadow-xl transition duration-300 hover:-translate-y-2">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100">
                      <Image
                        src="/images/about/verifiedhome.png"
                        alt="Verified home listing card on Brick Infinity"
                        fill
                        priority
                        sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 100vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">Verified Home</p>
                        <p className="mt-1 text-xs text-slate-500">Buy • Prime locality</p>
                      </div>
                      <span className="rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700">
                        Approved
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <HeroMiniImageCard
                      src="/images/about/commercialspace.png"
                      alt="Commercial space listing preview"
                      title="Commercial Space"
                      copy="Rent • Direct enquiry"
                    />
                    <HeroMiniImageCard
                      src="/images/about/promotedlisting.png"
                      alt="Promoted listing preview with higher visibility"
                      title="Promoted Listing"
                      copy="More visibility paths"
                      featured
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 text-center text-xs font-semibold text-white/90">
                  {stats.slice(0, 3).map((item) => (
                    <div key={item} className="rounded-2xl border border-white/10 bg-white/10 px-2 py-3 backdrop-blur">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="The visibility problem"
            title="Your Property Should Not Stay Hidden."
            copy="In real estate, visibility matters. A property may be valuable, well-located, and fairly priced — but if people cannot discover it, it remains stuck. Brick Infinity solves this by bringing property discovery online, making it easier for buyers, tenants, and owners to connect at the right time."
          />

          <div className="relative mt-10 grid gap-8 md:grid-cols-2 md:gap-10">
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-4 text-[var(--color-primary)] shadow-xl ring-1 ring-red-100 md:block">
              <ArrowRight size={28} aria-hidden="true" />
            </div>
            <BeforeAfterCard
              image="/images/about/beforebrickinfinity.png"
              alt="Property with limited visibility before Brick Infinity"
              label="Before Brick Infinity"
              title="Offline reach limits discovery."
              points={beforePoints}
              tone="before"
            />
            <BeforeAfterCard
              image="/images/about/afterbrickinfinity.png"
              alt="Property gaining digital visibility after Brick Infinity"
              label="After Brick Infinity"
              title="Digital presence creates action."
              points={afterPoints}
              tone="after"
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="What we do" title="One Platform. Multiple Real Estate Needs." centered />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {platformCards.map((item) => (
              <Card key={item.title} className="group h-full p-6 transition duration-300 hover:-translate-y-2 hover:border-red-200 hover:shadow-[var(--shadow-medium)]">
                <MiniIcon icon={item.icon} />
                <h3 className="mt-5 text-xl font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">{item.copy}</p>
                <ArrowLink href={item.href}>Open route</ArrowLink>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="Why Brick Infinity exists"
              title="Built for Real People, Real Properties, and Real Decisions."
              copy="Brick Infinity was created to make property discovery simpler, more transparent, and more accessible. Many good properties remain unnoticed because they are not presented digitally in the right way. Our mission is to help property owners increase visibility and help buyers or tenants make better property decisions with clear information, useful filters, and direct communication options."
            />
            <blockquote className="mt-8 rounded-3xl border border-red-100 bg-white p-6 text-xl font-black leading-snug text-[var(--color-dark)] shadow-[var(--shadow-soft)] md:text-2xl">
              “A property cannot find the right buyer or tenant if it stays invisible.”
            </blockquote>
          </div>
          <div className="relative min-h-[320px] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl sm:min-h-[430px]">
            <Image
              src="/images/about/missionhighlight.png"
              alt="Mission highlight showing digital property decisions"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="Simple flow" title="How Brick Infinity Works" copy="Choose your path and see the steps Brick Infinity supports for discovery, verification, and promotion." centered />
          <HowBrickInfinityWorksTabs />
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="Key features" title="Designed to Make Property Discovery Easier" centered />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((item) => (
              <Card key={item.title} className="group p-5 transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-[var(--shadow-medium)]">
                <div className="flex items-center gap-4">
                  <MiniIcon icon={item.icon} />
                  <h3 className="font-bold">{item.title}</h3>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Trust & safety"
            title="Built With Verification, Ownership, and Accountability in Mind"
            copy="Real estate requires trust. Brick Infinity is designed with seller verification, ownership documentation, listing approval, direct enquiries, and role-based access so that the platform remains organized and reliable."
            centered
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trustSafety.map((item) => (
              <Card key={item.title} className="p-6 text-center transition duration-300 hover:-translate-y-1 hover:border-green-200 hover:shadow-[var(--shadow-medium)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50 text-green-700 ring-1 ring-green-100">
                  <item.icon size={22} aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-bold">{item.title}</h3>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="Featured listing promotion"
              title="Want More Visibility for Your Property?"
              copy="If your property is listed but not getting enough attention, Featured Listing promotion can help increase its visibility. Your property can appear more prominently so more potential buyers or tenants can notice it."
            />
            <div className="mt-8">
              <Button href={listingRoute}>Promote Your Property</Button>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {featuredBenefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold shadow-sm ring-1 ring-slate-100">
                  <CheckCircle2 className="shrink-0 text-green-600" size={18} aria-hidden="true" />
                  {benefit}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <ListingComparison
              image="/images/about/normallisting.png"
              alt="Normal property listing visibility preview"
              title="Normal Listing"
              points={["Standard listing placement", "Discoverable through search", "Good for regular visibility"]}
            />
            <ListingComparison
              featured
              image="/images/about/featuredlisting.png"
              alt="Featured property listing visibility preview"
              title="Featured Listing"
              points={["More prominent positioning", "Highlight badge experience", "Built for faster attention"]}
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="Who it is for" title="Made for Everyone Involved in Property Decisions" centered />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {audiences.map((item) => (
              <Card key={item.title} className="p-5 transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-[var(--shadow-medium)]">
                <MiniIcon icon={item.icon} />
                <h3 className="mt-5 font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">{item.copy}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="Local + digital"
              title="Local Real Estate Needs a Strong Digital Presence"
              copy="Most property decisions still begin with local intent: people want property in a specific area, city, market, or neighborhood. Brick Infinity connects that local need with digital visibility. Instead of depending only on offline reach, your property can now be searchable, shareable, and discoverable online."
            />
            <Card className="mt-8 border-red-100 bg-gradient-to-br from-white to-orange-50 p-6 md:p-8">
              <MapPin className="text-[var(--color-primary)]" size={32} aria-hidden="true" />
              <p className="mt-5 text-xl font-black leading-snug md:text-2xl">
                The more people see your property, the higher the chances of finding the right buyer or tenant.
              </p>
            </Card>
          </div>
          <div className="relative min-h-[320px] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl sm:min-h-[420px]">
            <Image
              src="/images/about/localdigital.png"
              alt="Local real estate gaining a strong digital presence"
              fill
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader eyebrow="Interactive stats" title="Visibility Signals That Matter" centered />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <Card
                key={stat}
                className="group relative overflow-hidden p-6 transition duration-300 hover:-translate-y-2 hover:shadow-[var(--shadow-medium)]"
              >
                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-red-100 transition duration-300 group-hover:scale-125" />
                <p className="relative text-sm font-bold uppercase tracking-[0.24em] text-[var(--color-primary)]">
                  Signal 0{index + 1}
                </p>
                <h3 className="relative mt-5 text-2xl font-black">{stat}</h3>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[var(--color-dark)] px-6 py-12 text-white shadow-2xl md:px-12 md:py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.78fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-red-200">Take the next step</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
                Ready to Find, List, or Promote a Property?
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-8 text-white/75 md:text-lg">
                Whether you are searching for your next space or trying to give your property better visibility, Brick Infinity helps you take the next step with confidence.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button href="/properties" className="w-full sm:w-auto">
                  Explore Properties
                </Button>
                <Button href={listingRoute} variant="secondary" className="w-full sm:w-auto">
                  List Your Property
                </Button>
                <Button href={listingRoute} variant="outline" className="w-full bg-white/5 sm:w-auto">
                  Promote Your Property
                </Button>
              </div>
            </div>
            <Card className="border-white/10 bg-white/10 p-6 text-center text-white backdrop-blur md:p-8">
              <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-white/20 bg-white p-2 shadow-xl">
                <Image
                  src="/images/about/logo.jpg"
                  alt="Brick Infinity logo"
                  width={96}
                  height={96}
                  className="h-full w-full object-contain"
                />
              </div>
              <h3 className="mt-6 text-xl font-bold">Contact Brick Infinity</h3>
              <div className="mt-5 space-y-4 text-sm text-white/80">
                <a className="flex items-center justify-center gap-3 transition hover:text-white" href="https://wa.me/918989601701" target="_blank" rel="noreferrer">
                  <MessageCircle size={18} aria-hidden="true" />
                  WhatsApp: +91-8989601701
                </a>
                <a className="flex items-center justify-center gap-3 transition hover:text-white" href="tel:+918989601701">
                  <Phone size={18} aria-hidden="true" />
                  Call: +91-8989601701
                </a>
                <a className="flex items-center justify-center gap-3 break-all transition hover:text-white" href="mailto:infobrickinfinity@gmail.com">
                  <Mail size={18} aria-hidden="true" />
                  Email: infobrickinfinity@gmail.com
                </a>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroMiniImageCard({
  src,
  alt,
  title,
  copy,
  featured = false,
}: {
  src: string;
  alt: string;
  title: string;
  copy: string;
  featured?: boolean;
}) {
  return (
    <div className={`group rounded-3xl p-4 shadow-xl transition duration-300 hover:-translate-y-2 ${featured ? "border border-orange-200 bg-gradient-to-r from-red-50 to-orange-50" : "bg-white"}`}>
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100 sm:h-20 sm:w-24">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="120px"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-xs text-slate-600">{copy}</p>
        </div>
      </div>
    </div>
  );
}

function BeforeAfterCard({
  image,
  alt,
  label,
  title,
  points,
  tone,
}: {
  image: string;
  alt: string;
  label: string;
  title: string;
  points: string[];
  tone: "before" | "after";
}) {
  const isAfter = tone === "after";

  return (
    <Card className={`group relative overflow-hidden p-0 transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-medium)] ${isAfter ? "border-green-100 bg-gradient-to-br from-white to-orange-50" : "border-slate-200 bg-white"}`}>
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        <Image
          src={image}
          alt={alt}
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <div className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold text-white shadow-lg ${isAfter ? "bg-green-600" : "bg-slate-700"}`}>
          {label}
        </div>
      </div>
      <div className="p-6 md:p-8">
        <h3 className={`text-2xl font-bold ${isAfter ? "text-green-800" : "text-slate-800"}`}>{title}</h3>
        <ul className="mt-5 space-y-3 text-sm text-[var(--color-muted)]">
          {points.map((point) => (
            <li key={point} className="flex gap-3">
              <CheckCircle2 className={`mt-0.5 shrink-0 ${isAfter ? "text-green-600" : "text-red-500"}`} size={18} aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function ListingComparison({
  title,
  points,
  image,
  alt,
  featured = false,
}: {
  title: string;
  points: string[];
  image: string;
  alt: string;
  featured?: boolean;
}) {
  return (
    <Card className={`p-0 transition duration-300 hover:-translate-y-2 hover:shadow-[var(--shadow-medium)] ${featured ? "border-red-200 bg-gradient-to-br from-red-50 to-orange-50" : ""}`}>
      <div className="p-5 pb-0">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-black">{title}</h3>
          {featured ? (
            <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-bold text-white">
              Higher visibility
            </span>
          ) : null}
        </div>
      </div>
      <div className="relative mx-5 mt-6 aspect-[4/3] overflow-hidden rounded-3xl bg-slate-100 ring-1 ring-slate-100">
        <Image
          src={image}
          alt={alt}
          fill
          sizes="(min-width: 640px) 25vw, 100vw"
          className="object-cover transition duration-500 hover:scale-105"
        />
      </div>
      <ul className="p-5 pt-6 space-y-3 text-sm text-[var(--color-muted)]">
        {points.map((point) => (
          <li key={point} className="flex gap-3">
            <CheckCircle2 className={featured ? "text-[var(--color-primary)]" : "text-slate-400"} size={18} aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
