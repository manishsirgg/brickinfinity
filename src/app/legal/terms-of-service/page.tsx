export const metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">
        Terms of Service
      </h1>

      <p className="mb-6">
        By accessing or using BrickInfinity, you agree
        to comply with these Terms of Service.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        User Responsibilities
      </h2>
      <ul className="list-disc ml-6 space-y-2 mb-6">
        <li>Provide accurate property information</li>
        <li>Not post fraudulent listings</li>
        <li>Comply with applicable laws</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        Platform Rights
      </h2>
      <p className="mb-6">
        BrickInfinity reserves the right to remove
        listings, suspend accounts, or restrict access
        in case of policy violations.
      </p>

      <h2 className="text-xl font-semibold mt-10 mb-4">
        Limitation of Liability
      </h2>
      <p>
        BrickInfinity is not responsible for disputes
        between buyers and sellers.
      </p>
    <section className="my-6 space-y-2"><h2 className="text-xl font-semibold">Owner-only listings</h2><p>Only actual property owners, builder companies that own the listed project, and BrickInfinity administrators may list. Agents, brokers, channel partners, contractors without ownership, and marketing intermediaries may not list on behalf of others. False ownership declarations may lead to rejection, suspension and withdrawal of listings.</p><p>Identity, document and listing review badges describe the review performed; they do not guarantee clear legal title. Buyers must conduct their own due diligence.</p></section></main>
  );
}