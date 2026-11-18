export default function Punch() {
  return (
    <div className="stack">
      <h1>The daily punch</h1>
      <p className="lead">At the end of each workday: stack, align, punch once through both. That single hole is the whole protocol.</p>
      <div className="grid cols-2" style={{ alignItems: 'stretch' }}>
        <div className="panel punch-stage">
          <div className="punch-scene" role="img" aria-label="Two halves stacked; a punch goes through both at once">
            <div className="p-card p-foil" />
            <div className="p-card p-stock">
              <div className="p-title"><b>STOCK</b> worker keeps</div>
              <div className="p-cells">
                {[4, 5, 6, 7, 8, 9, 10].map((d) => <span key={d} className={'p-cell' + (d === 5 ? ' p-target' : '')}><i>{d}</i>{d === 5 && <span className="p-hole" />}</span>)}
              </div>
              <div className="p-qr" />
            </div>
            <div className="p-punch"><span /></div>
          </div>
          <p className="small ui muted" style={{ textAlign: 'center' }}>one punch · two halves · same moment</p>
        </div>
        <div className="panel">
          <h2>Rules that keep it honest</h2>
          <ol className="rules">
            <li><b>Both people present.</b> The supervisor punches while the worker watches the halves line up.</li>
            <li><b>Punch inside the day’s circle.</b> Late punches for an earlier day are fine; the hole is in that day’s box.</li>
            <li><b>Advances use the token row.</b> One hole per advance on both halves, same moment.</li>
            <li><b>Half days use one circle.</b> On half-day cards, both circles of a date are a full day, one circle is half a day.</li>
            <li><b>Never punch just one half.</b> A one-sided hole will be flagged on payday, and that flag is a feature.</li>
            <li><b>Missed a day?</b> Don’t patch it later alone. Agree together and punch both.</li>
          </ol>
          <h3>Why it can’t be quietly changed</h3>
          <p className="small ui">A hole can be added to a half but not made to match on the other half without having both halves. Holes can’t be removed from paper. A replacement half must carry the other half’s pairing secret and the same card code, and neither is possible to fake from a photo.</p>
          <a className="btn primary" href="#/issue">+ Make a card</a>
        </div>
      </div>
    </div>
  );
}
