export const metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">
        Privacy Policy
      </h1>

      <p className="mb-6">
        At BrickInfinity, we respect your privacy and are
        committed to protecting your personal data.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        Information We Collect
      </h2>
      <ul className="list-disc ml-6 space-y-2 mb-6">
        <li>Name and contact details</li>
        <li>Email address</li>
        <li>Phone and WhatsApp number</li>
        <li>Property listing information</li>
        <li>Usage analytics</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        How We Use Your Information
      </h2>
      <ul className="list-disc ml-6 space-y-2 mb-6">
        <li>To provide marketplace services</li>
        <li>To connect buyers and sellers</li>
        <li>To improve platform functionality</li>
        <li>To ensure security and prevent fraud</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        Data Security
      </h2>
      <p className="mb-6">
        We implement appropriate technical and organizational
        security measures to protect your data.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        Your Rights
      </h2>
      <p>
        You may request access, correction, or deletion
        of your personal data by contacting us at
        infobrickinfinity@gmail.com.
      </p>
    </main>
  );
}
