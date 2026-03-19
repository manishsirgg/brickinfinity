export default function Input({
  className = "",
  ...props
}: any) {
  return (
    <input
      className={`w-full border border-[var(--color-border)] 
                  p-3 rounded-md text-sm 
                  focus:outline-none 
                  focus:ring-2 
                  focus:ring-[var(--color-primary)] 
                  ${className}`}
      {...props}
    />
  );
}