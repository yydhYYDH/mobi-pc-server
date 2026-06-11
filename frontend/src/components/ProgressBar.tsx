export function ProgressBar(props: { active?: boolean; value: number }) {
  return (
    <div className={`progress-track ${props.active ? "active" : ""}`}>
      <div className="progress-value" style={{ width: `${props.value}%` }} />
    </div>
  );
}
