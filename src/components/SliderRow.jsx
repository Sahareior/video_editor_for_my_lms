export default function SliderRow({ label, v, set, min, max, step }) {
  return (
    <div className="row">
      <label>{label}</label>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e => set(parseFloat(e.target.value))} />
      <span className="val">{(+v).toFixed(2)}</span>
    </div>
  );
}
