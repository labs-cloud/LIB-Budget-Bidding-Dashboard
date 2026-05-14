interface Props {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}

export function KpiCard({ label, value, sub, valueColor }: Props) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}
