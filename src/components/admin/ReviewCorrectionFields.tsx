export default function ReviewCorrectionFields({ scope, onScopeChange, action, onActionChange }: {
  scope: string; onScopeChange: (value: string) => void; action: string; onActionChange: (value: string) => void;
}) {
  return <div className="space-y-3 rounded-xl border bg-slate-50 p-4 text-sm">
    <p className="font-semibold">Required when rejecting · shown to the seller</p>
    <label className="block">What must the seller correct?
      <select value={scope} onChange={event => onScopeChange(event.target.value)} className="mt-1 block w-full rounded border p-2">
        <option value="">Choose required corrections</option>
        <option value="details">Property details</option>
        <option value="documents">Upload new ownership documents</option>
        <option value="both">Both details and new ownership documents</option>
      </select>
    </label>
    <label className="block">Required seller action
      <textarea value={action} maxLength={2000} onChange={event => onActionChange(event.target.value)} placeholder="Explain exactly what to change or which ownership evidence to provide." className="mt-1 block w-full rounded border p-2" />
    </label>
  </div>;
}
