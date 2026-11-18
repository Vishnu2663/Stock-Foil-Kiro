// Slip, verdict, spoken-prompt and explanation dictionaries per language (Phase 10).
// AI-drafted, native review recommended.
import type { Verdict } from '../core/history';

export interface LangInfo { code: string; name: string; english: string; rtl?: boolean; speech: string }

export const UI_LANGS: LangInfo[] = [
  { code: 'en', name: 'English', english: 'English', speech: 'en-IN' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', speech: 'hi-IN' },
  { code: 'bn', name: 'বাংলা', english: 'Bengali', speech: 'bn-IN' },
  { code: 'ta', name: 'தமிழ்', english: 'Tamil', speech: 'ta-IN' },
  { code: 'es', name: 'Español', english: 'Spanish', speech: 'es-ES' },
  { code: 'sw', name: 'Kiswahili', english: 'Swahili', speech: 'sw-KE' },
];

export const STORY_EXTRA_LANGS: LangInfo[] = [
  { code: 'te', name: 'తెలుగు', english: 'Telugu', speech: 'te-IN' },
  { code: 'mr', name: 'मराठी', english: 'Marathi', speech: 'mr-IN' },
  { code: 'fr', name: 'Français', english: 'French', speech: 'fr-FR' },
  { code: 'pt', name: 'Português', english: 'Portuguese', speech: 'pt-BR' },
  { code: 'ar', name: 'العربية', english: 'Arabic', rtl: true, speech: 'ar-SA' },
];

export const ALL_LANGS = [...UI_LANGS, ...STORY_EXTRA_LANGS];
export const langInfo = (code: string): LangInfo => ALL_LANGS.find((l) => l.code === code.split('-')[0]) ?? UI_LANGS[0];
export const pickUiLang = (code: string): string => (UI_LANGS.some((l) => l.code === code) ? code : 'en');

export interface SlipDict {
  title: string; month: string; days: string; fullDays: string; halfDays: string; advances: string; carried: string;
  total: string; owes: string; notes: string; disputed: string; noDispute: string; spoken: string; spokenOwes: string;
}

export const SLIP: Record<string, SlipDict> = {
  en: {
    title: 'Pay slip', month: 'Month', days: 'Days worked', fullDays: 'Full days', halfDays: 'Half days', advances: 'Advances taken',
    carried: 'Carried from last month', total: 'To pay', owes: 'Worker owes', notes: 'Notes to hand over', disputed: 'Days in dispute',
    noDispute: 'Both halves agree.', spoken: 'You worked {0} days. You get {1}.', spokenOwes: 'You worked {0} days. You owe {1}. It moves to next month.',
  },
  hi: {
    title: 'वेतन पर्ची', month: 'महीना', days: 'काम के दिन', fullDays: 'पूरे दिन', halfDays: 'आधे दिन', advances: 'लिया गया अग्रिम',
    carried: 'पिछले महीने से', total: 'देना है', owes: 'मज़दूर पर बाकी', notes: 'देने वाले नोट', disputed: 'विवाद वाले दिन',
    noDispute: 'दोनों हिस्से मेल खाते हैं।', spoken: 'आपने {0} दिन काम किया। आपको {1} मिलेंगे।', spokenOwes: 'आपने {0} दिन काम किया। आप पर {1} बाकी है। यह अगले महीने जाएगा।',
  },
  bn: {
    title: 'বেতনের রসিদ', month: 'মাস', days: 'কাজের দিন', fullDays: 'পুরো দিন', halfDays: 'অর্ধেক দিন', advances: 'নেওয়া অগ্রিম',
    carried: 'গত মাস থেকে', total: 'দিতে হবে', owes: 'শ্রমিকের বাকি', notes: 'যে নোট দিতে হবে', disputed: 'বিতর্কিত দিন',
    noDispute: 'দুই অংশ মিলে গেছে।', spoken: 'আপনি {0} দিন কাজ করেছেন। আপনি পাবেন {1}।', spokenOwes: 'আপনি {0} দিন কাজ করেছেন। আপনার {1} বাকি। এটি পরের মাসে যাবে।',
  },
  ta: {
    title: 'சம்பளச் சீட்டு', month: 'மாதம்', days: 'வேலை நாட்கள்', fullDays: 'முழு நாட்கள்', halfDays: 'அரை நாட்கள்', advances: 'பெற்ற முன்பணம்',
    carried: 'கடந்த மாதத்திலிருந்து', total: 'கொடுக்க வேண்டியது', owes: 'தொழிலாளி தர வேண்டியது', notes: 'கொடுக்க வேண்டிய நோட்டுகள்', disputed: 'சர்ச்சை நாட்கள்',
    noDispute: 'இரண்டு பாதிகளும் ஒத்துப்போகின்றன.', spoken: 'நீங்கள் {0} நாட்கள் வேலை செய்தீர்கள். உங்களுக்கு {1} கிடைக்கும்.', spokenOwes: 'நீங்கள் {0} நாட்கள் வேலை செய்தீர்கள். நீங்கள் {1} தர வேண்டும். இது அடுத்த மாதத்திற்குச் செல்லும்.',
  },
  es: {
    title: 'Recibo de pago', month: 'Mes', days: 'Días trabajados', fullDays: 'Días completos', halfDays: 'Medios días', advances: 'Adelantos',
    carried: 'Del mes pasado', total: 'A pagar', owes: 'El trabajador debe', notes: 'Billetes a entregar', disputed: 'Días en disputa',
    noDispute: 'Las dos mitades coinciden.', spoken: 'Trabajaste {0} días. Recibes {1}.', spokenOwes: 'Trabajaste {0} días. Debes {1}. Pasa al mes siguiente.',
  },
  sw: {
    title: 'Hati ya malipo', month: 'Mwezi', days: 'Siku za kazi', fullDays: 'Siku nzima', halfDays: 'Nusu siku', advances: 'Malipo ya awali',
    carried: 'Kutoka mwezi uliopita', total: 'Kulipwa', owes: 'Mfanyakazi anadaiwa', notes: 'Noti za kukabidhi', disputed: 'Siku zenye ubishi',
    noDispute: 'Nusu zote mbili zinakubaliana.', spoken: 'Ulifanya kazi siku {0}. Unapata {1}.', spokenOwes: 'Ulifanya kazi siku {0}. Unadaiwa {1}. Itahamia mwezi ujao.',
  },
};

export const VERDICTS: Record<string, Record<Verdict, string>> = {
  en: { 'genuine-consistent': 'Genuine pair', 'genuine-disputed': 'Genuine pair, holes differ', review: 'Genuine pair, check the holes', inconclusive: 'Cut not clear', 'pair-mismatch': 'Halves do not match', unreliable: 'Photo not reliable', paid: 'Paid' },
  hi: { 'genuine-consistent': 'असली जोड़ी', 'genuine-disputed': 'असली जोड़ी, छेद अलग हैं', review: 'असली जोड़ी, छेद जाँचें', inconclusive: 'कटाई साफ़ नहीं', 'pair-mismatch': 'हिस्से मेल नहीं खाते', unreliable: 'फ़ोटो भरोसेमंद नहीं', paid: 'भुगतान हो गया' },
  bn: { 'genuine-consistent': 'আসল জোড়া', 'genuine-disputed': 'আসল জোড়া, ছিদ্র আলাদা', review: 'আসল জোড়া, ছিদ্র দেখুন', inconclusive: 'কাটা পরিষ্কার নয়', 'pair-mismatch': 'অংশ মেলে না', unreliable: 'ছবি নির্ভরযোগ্য নয়', paid: 'পরিশোধিত' },
  ta: { 'genuine-consistent': 'உண்மையான ஜோடி', 'genuine-disputed': 'உண்மையான ஜோடி, துளைகள் வேறுபடுகின்றன', review: 'உண்மையான ஜோடி, துளைகளைச் சரிபார்க்கவும்', inconclusive: 'வெட்டு தெளிவில்லை', 'pair-mismatch': 'பாதிகள் பொருந்தவில்லை', unreliable: 'புகைப்படம் நம்பகமில்லை', paid: 'செலுத்தப்பட்டது' },
  es: { 'genuine-consistent': 'Par auténtico', 'genuine-disputed': 'Par auténtico, los agujeros difieren', review: 'Par auténtico, revisa los agujeros', inconclusive: 'Corte poco claro', 'pair-mismatch': 'Las mitades no coinciden', unreliable: 'Foto poco fiable', paid: 'Pagado' },
  sw: { 'genuine-consistent': 'Jozi halisi', 'genuine-disputed': 'Jozi halisi, matundu yanatofautiana', review: 'Jozi halisi, kagua matundu', inconclusive: 'Mkato hauko wazi', 'pair-mismatch': 'Nusu hazilingani', unreliable: 'Picha haiaminiki', paid: 'Imelipwa' },
};

export type PromptKey = 'stock' | 'foil' | 'closer' | 'light' | 'still' | 'done' | 'whole' | 'grey';

export const PROMPTS: Record<string, Record<PromptKey, string>> = {
  en: { stock: 'Show the worker half.', foil: 'Now show the employer half.', closer: 'Move closer.', light: 'More light, please.', still: 'Hold still.', done: 'Done. Both halves are read.', whole: 'Show the whole half.', grey: 'The surface is too close to the grey. Use a dark or white surface.' },
  hi: { stock: 'मज़दूर वाला हिस्सा दिखाएँ।', foil: 'अब मालिक वाला हिस्सा दिखाएँ।', closer: 'पास लाएँ।', light: 'थोड़ी और रोशनी करें।', still: 'स्थिर रखें।', done: 'हो गया। दोनों हिस्से पढ़ लिए।', whole: 'पूरा हिस्सा दिखाएँ।', grey: 'सतह स्लेटी रंग के बहुत करीब है। गहरी या सफ़ेद सतह पर रखें।' },
  bn: { stock: 'শ্রমিকের অংশ দেখান।', foil: 'এখন মালিকের অংশ দেখান।', closer: 'কাছে আনুন।', light: 'আরও আলো দিন।', still: 'স্থির রাখুন।', done: 'হয়ে গেছে। দুই অংশই পড়া হয়েছে।', whole: 'পুরো অংশ দেখান।', grey: 'পৃষ্ঠটি ধূসরের খুব কাছাকাছি। গাঢ় বা সাদা পৃষ্ঠ ব্যবহার করুন।' },
  ta: { stock: 'தொழிலாளி பாதியைக் காட்டுங்கள்.', foil: 'இப்போது முதலாளி பாதியைக் காட்டுங்கள்.', closer: 'அருகில் கொண்டு வாருங்கள்.', light: 'இன்னும் வெளிச்சம் தேவை.', still: 'அசையாமல் பிடியுங்கள்.', done: 'முடிந்தது. இரண்டு பாதிகளும் படிக்கப்பட்டன.', whole: 'முழு பாதியையும் காட்டுங்கள்.', grey: 'மேற்பரப்பு சாம்பல் நிறத்துக்கு மிக அருகில் உள்ளது. கருப்பு அல்லது வெள்ளை மேற்பரப்பைப் பயன்படுத்துங்கள்.' },
  es: { stock: 'Muestra la mitad del trabajador.', foil: 'Ahora muestra la mitad del empleador.', closer: 'Acércate más.', light: 'Más luz, por favor.', still: 'Quédate quieto.', done: 'Listo. Las dos mitades están leídas.', whole: 'Muestra la mitad entera.', grey: 'La superficie se parece demasiado al gris. Usa una superficie oscura o blanca.' },
  sw: { stock: 'Onyesha nusu ya mfanyakazi.', foil: 'Sasa onyesha nusu ya mwajiri.', closer: 'Sogeza karibu.', light: 'Mwanga zaidi, tafadhali.', still: 'Shika bila kutikisa.', done: 'Imekamilika. Nusu zote mbili zimesomwa.', whole: 'Onyesha nusu nzima.', grey: 'Uso unafanana sana na kijivu. Tumia uso mweusi au mweupe.' },
};

export interface ExplainDict { sum: string; disputed: string; stockOnly: string; foilOnly: string; disputedAmount: string; noDispute: string; owes: string }

export const EXPLAIN: Record<string, ExplainDict> = {
  en: { sum: 'The sum: {0}', disputed: 'Disputed days: {0}', stockOnly: 'Only on the worker half: {0}', foilOnly: 'Only on the employer half: {0}', disputedAmount: 'Disputed amount: {0}. It is not paid until both sides agree.', noDispute: 'Disputed days: none. Both halves agree on every day.', owes: 'The worker owes {0}. It can be carried to next month.' },
  hi: { sum: 'हिसाब: {0}', disputed: 'विवाद वाले दिन: {0}', stockOnly: 'सिर्फ़ मज़दूर वाले हिस्से पर: {0}', foilOnly: 'सिर्फ़ मालिक वाले हिस्से पर: {0}', disputedAmount: 'विवाद की रकम: {0}। दोनों के मानने तक यह नहीं दी जाएगी।', noDispute: 'विवाद वाले दिन: कोई नहीं। दोनों हिस्से हर दिन पर मेल खाते हैं।', owes: 'मज़दूर पर {0} बाकी है। यह अगले महीने जा सकता है।' },
  bn: { sum: 'হিসাব: {0}', disputed: 'বিতর্কিত দিন: {0}', stockOnly: 'শুধু শ্রমিকের অংশে: {0}', foilOnly: 'শুধু মালিকের অংশে: {0}', disputedAmount: 'বিতর্কিত টাকা: {0}। দুই পক্ষ রাজি না হওয়া পর্যন্ত দেওয়া হবে না।', noDispute: 'বিতর্কিত দিন: নেই। দুই অংশ প্রতিদিন মিলে গেছে।', owes: 'শ্রমিকের {0} বাকি। এটি পরের মাসে যেতে পারে।' },
  ta: { sum: 'கணக்கு: {0}', disputed: 'சர்ச்சை நாட்கள்: {0}', stockOnly: 'தொழிலாளி பாதியில் மட்டும்: {0}', foilOnly: 'முதலாளி பாதியில் மட்டும்: {0}', disputedAmount: 'சர்ச்சைத் தொகை: {0}. இருவரும் ஒப்புக்கொள்ளும் வரை இது செலுத்தப்படாது.', noDispute: 'சர்ச்சை நாட்கள்: இல்லை. இரண்டு பாதிகளும் எல்லா நாளிலும் ஒத்துப்போகின்றன.', owes: 'தொழிலாளி {0} தர வேண்டும். இது அடுத்த மாதத்திற்குச் செல்லலாம்.' },
  es: { sum: 'La cuenta: {0}', disputed: 'Días en disputa: {0}', stockOnly: 'Solo en la mitad del trabajador: {0}', foilOnly: 'Solo en la mitad del empleador: {0}', disputedAmount: 'Cantidad en disputa: {0}. No se paga hasta que ambos estén de acuerdo.', noDispute: 'Días en disputa: ninguno. Las dos mitades coinciden en todos los días.', owes: 'El trabajador debe {0}. Puede pasar al mes siguiente.' },
  sw: { sum: 'Hesabu: {0}', disputed: 'Siku zenye ubishi: {0}', stockOnly: 'Kwenye nusu ya mfanyakazi tu: {0}', foilOnly: 'Kwenye nusu ya mwajiri tu: {0}', disputedAmount: 'Kiasi chenye ubishi: {0}. Hakilipwi hadi pande zote zikubaliane.', noDispute: 'Siku zenye ubishi: hakuna. Nusu zote mbili zinakubaliana kila siku.', owes: 'Mfanyakazi anadaiwa {0}. Inaweza kuhamia mwezi ujao.' },
};

const base = (lang: string) => lang.split('-')[0];
export const slipDict = (lang: string): SlipDict => SLIP[base(lang)] ?? SLIP.en;
export const verdictWord = (lang: string, v: Verdict): string => (VERDICTS[base(lang)] ?? VERDICTS.en)[v];
export const prompt = (lang: string, k: PromptKey): string => (PROMPTS[base(lang)] ?? PROMPTS.en)[k];
export const explainTemplates = (lang: string): ExplainDict => EXPLAIN[base(lang)] ?? EXPLAIN.en;

export const fill = (s: string, ...args: (string | number)[]): string =>
  s.replace(/\{(\d+)\}/g, (m, i) => (args[+i] !== undefined ? String(args[+i]) : m));
