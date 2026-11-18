import { useMemo } from 'react';
import { imageToDataURL } from '../imageIO';
import type { ScenarioRun } from '../sim';
import { PaydayCard, HalfView, ChecksList } from './Result';
import { useApp } from '../ctx';

export function Thumbs({ run, burn }: { run: ScenarioRun; burn?: boolean }) {
  const { t } = useApp();
  const urls = useMemo(() => [imageToDataURL(run.sim.stock, 420), imageToDataURL(run.sim.foil, 420)], [run]);
  return (
    <div className="thumbs">
      <img src={urls[0]} alt={t('Simulated photo of the worker half')} />
      <img src={urls[1]} alt={t('Simulated photo of the employer half')} className={burn ? 'burn' : ''} />
    </div>
  );
}

export function SimView({ run, full = true }: { run: ScenarioRun; full?: boolean }) {
  const { t } = useApp();
  const cmp = run.result.comparison;
  const one = new Set(cmp ? [...cmp.stockOnly, ...cmp.foilOnly] : []);
  return (
    <div className="stack">
      <PaydayCard result={run.result}>
        <div style={{ marginTop: 12 }}><Thumbs run={run} /></div>
      </PaydayCard>
      {full && (
        <>
          <div className="grid cols-2">
            {run.stock && <HalfView half={run.stock} title={t('Worker half (stock)')} oneSided={one} />}
            {run.foil && <HalfView half={run.foil} title={t('Employer half (foil)')} oneSided={one} />}
          </div>
          <div className="panel"><h3>Checks</h3><ChecksList result={run.result} /></div>
        </>
      )}
    </div>
  );
}
