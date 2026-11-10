export default function PropertyDescription({ text }: { text?: string | null }) {
  return (
    <div className="whitespace-pre-wrap break-words text-muted leading-relaxed">
      {(text || "").split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={index}>{part.slice(2, -2)}</strong>
          : part
      )}
    </div>
  );
}
