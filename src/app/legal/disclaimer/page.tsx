export const metadata = {
  title: "Disclaimer",
};

export default function DisclaimerPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">
        Disclaimer
      </h1>

      <p className="mb-6">
        The information provided on BrickInfinity
        (https://brickinfinity.com) is for general
        informational purposes only. All property listings,
        descriptions, pricing, and related information are
        submitted by property owners or authorized sellers.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        No Professional Advice
      </h2>
      <p className="mb-6">
        BrickInfinity does not provide legal, financial,
        tax, or real estate advisory services. Users are
        advised to conduct independent verification before
        making any property transaction.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        Accuracy of Information
      </h2>
      <p className="mb-6">
        While we strive to maintain accurate and up-to-date
        listings, BrickInfinity does not guarantee the
        completeness, reliability, or accuracy of property
        details. Any reliance you place on such information
        is strictly at your own risk.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        Limitation of Liability
      </h2>
      <p>
        BrickInfinity shall not be held liable for any
        direct or indirect loss or damage arising from
        property transactions, listing inaccuracies,
        or user interactions conducted through the platform.
      </p>
    </main>
  );
}