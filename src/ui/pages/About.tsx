const ATTACKS: [string, string][] = [
  ['Add a hole to one half', 'The other half lacks it → flagged, never paid as agreed'],
  ['Patch or fill a hole', 'One-sided on payday → flagged'],
  ['Punch both halves separately', 'The holes do not line up the way a single punch through both does → review'],
  ['Make up the other half', 'It cannot carry the matching pairing secret → rejected'],
  ['Swap in a half from another card', 'Different card id, code and wavy cut → rejected'],
  ['Edit the wage or the month', 'The card code no longer matches → rejected'],
  ['Change or delete an old receipt', 'The SHA-256 chain breaks at that receipt'],
  ['Get paid twice', '“Already paid on <date>” on every re-scan'],
];

export default function About() {
  return (
    <div className="stack">
      <section className="about-banner">
        <div className="kicker">16 OCTOBER 1834</div>
        <h1>The tally sticks that burned Parliament have come back from the dead.</h1>
        <p>For 700 years the English Exchequer kept accounts on notched hazel sticks, split lengthwise so debtor and creditor each held half. Forging one meant matching a grain no forger could see. In 1834 the obsolete sticks were fed into the furnaces under the House of Lords; the chimney flues caught fire and burned down most of the Palace of Westminster.</p>
        <p>Stock &amp; Foil gives the split tally a second life for people still paid by the day in cash: the cut is the signature, and the hole is the record.</p>
      </section>
      <div className="grid cols-2" style={{ alignItems: 'stretch' }}>
        <div className="panel">
          <h2>Why this is secure without a server</h2>
          <table className="table attack">
            <thead><tr><th>Attack</th><th className="num">What stops it</th></tr></thead>
            <tbody>{ATTACKS.map(([a, b]) => <tr key={a} data-reveal><td>{a}</td><td className="num wrap">{b}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="panel">
          <h2>Honest limits</h2>
          <ul className="limits">
            <li>If one person holds <em>both</em> halves they can punch both. The protocol assumes each side keeps their own half; use a witness (union, NGO) for disputes.</li>
            <li>Pairing proves the halves were issued together. The issuer could reprint either half, and anyone can copy their own half’s QR.</li>
            <li>The 1.2 mm punched-together tolerance and the scanner thresholds come from the simulator. Field-test them with real paper, punches and phones (Calibrate exists for this).</li>
            <li>The scanner is tuned for about ±25° rotation, mild tilt, blur up to about 1.3 px at about 3.6 px per mm, noise and uneven light, with the whole half in view. Outside that it warns instead of guessing.</li>
            <li>Translations were AI-drafted and need native-speaker review before field use.</li>
          </ul>
        </div>
      </div>
      <div className="panel">
        <h2>The thumb impression, kept honest</h2>
        <p className="ui">For generations, workers who were paid in cash pressed an inked thumb next to their name in the employer's pay register as proof that they received the wage. The register stayed with the employer. Here the worker presses the thumb on <b>both</b> halves, so each side keeps its own proof.</p>
        <ul className="limits">
          <li>It is a received mark, not fingerprint recognition: the app only checks that ink is present and whether it looks like a thumb mark, a signature or a smudge.</li>
          <li>No fingerprint image is stored. A small blurred picture is kept only if you turn that on in Settings, and only on this device.</li>
          <li>Older cards without the RECEIVED box still work; the result says the received mark is not available.</li>
        </ul>
      </div>
      <div className="panel">
        <h2>Built with free, local-first tech</h2>
        <p className="ui">React + TypeScript + Vite · jsQR (QR decoding, Apache-2.0) · qrcode (MIT) · custom computer vision (homography, corner-square refinement, cut-edge tracing) · Web Speech for read-aloud · Chrome’s built-in on-device AI or your own free key for plain-language explanations · everything runs in the browser and works offline as a PWA.</p>
        <p className="small ui muted">Property-based tests (fast-check, spec-driven with Kiro) generate thousands of simulated photos with rotation, blur, noise and lighting changes, plus wage-math and tamper properties. See <code>.kiro/specs</code> and <code>tests/</code>. MIT licence · <a href="https://github.com/Vishnu2663/Stock-Foil-Kiro" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      </div>
    </div>
  );
}
