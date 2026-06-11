export function MetricCard(props: { title: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="metric-card">
      <span>{props.title}</span>
      <strong>{props.value}</strong>
      <small className={props.tone ? `metric-tone ${props.tone}` : ""}>{props.detail}</small>
    </div>
  );
}
