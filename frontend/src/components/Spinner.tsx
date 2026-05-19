export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${size / 8}px solid #2a2f5a`,
        borderTop: `${size / 8}px solid #3b5bdb`,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}
