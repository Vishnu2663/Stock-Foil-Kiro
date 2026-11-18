// Story translations (one file per language). AI-drafted, native review recommended.
import type { Chapter } from '../story';
import { hi } from './hi';
import { bn } from './bn';
import { ta } from './ta';
import { es } from './es';
import { sw } from './sw';
import { te } from './te';
import { mr } from './mr';
import { fr } from './fr';
import { pt } from './pt';
import { ar } from './ar';

export const STORY_PACKS: Record<string, Chapter[]> = { hi, bn, ta, es, sw, te, mr, fr, pt, ar };
