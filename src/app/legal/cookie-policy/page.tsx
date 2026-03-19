export const metadata = {
  title: "Cookie Policy",
};

export default function CookiePolicyPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">
        Cookie Policy
      </h1>

      <p className="mb-6">
        BrickInfinity uses cookies to improve user
        experience, analyze traffic, and enhance
        platform functionality.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        What Are Cookies?
      </h2>
      <p className="mb-6">
        Cookies are small text files stored on your
        device when you visit a website.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        How We Use Cookies
      </h2>
      <ul className="list-disc ml-6 space-y-2 mb-6">
        <li>Authentication</li>
        <li>Analytics</li>
        <li>Security</li>
      </ul>

      <p>
        You may disable cookies in your browser settings.
      </p>
    </main>
  );
}