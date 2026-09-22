import React, { createContext, useContext, useState, useEffect } from "react";
import { Globe } from "lucide-react";

export type Language = "en" | "hi" | "gu";

type Translations = Record<string, string>;

const TRANSLATIONS: Record<Language, Translations> = {
  en: {
    appName: "VeriShield AI",
    subTitle: "Tactical Identity Screening Workstation",
    officerAuth: "Officer Authentication",
    badgeId: "Badge ID",
    badgePlaceholder: "Enter Badge ID (e.g. OF-8821)",
    passwordPin: "Password / PIN",
    checkpoint: "Checkpoint Location",
    selectCheckpoint: "Select Checkpoint...",
    signIn: "Sign In to Workstation",
    quickSignIn: "Quick Sign-In (Officer OF-8821)",
    offlineCapable: "FIELD MODE — WORKS 100% OFFLINE",
    systemBuild: "SYSTEM BUILD v4.2.1 · KERNEL SECURE",
    adminLedger: "HQ Admin Ledger",
    selectDocType: "Select Document Type",
    scanDocument: "SCAN DOCUMENT",
    uploadImage: "Upload image instead",
    engineReady: "ENGINE READY",
    engineLoading: "ENGINE LOADING...",
    recentOnDevice: "RECENT ON THIS DEVICE",
    accept: "Accept",
    flagReview: "Flag Review",
    reject: "Reject",
    language: "Language",
    english: "English",
    hindi: "हिन्दी (Hindi)",
    gujarati: "ગુજરાતી (Gujarati)",
    totalSessions: "Total Sessions",
    last24h: "Last 24 Hours",
    avgRiskScore: "Avg Risk Score",
    pendingReview: "Pending Review",
    passcode: "Admin Passcode",
    autofill: "Autofill SIH26188",
    enterLedger: "Enter HQ Ledger",
    aiAssistant: "AI Assistant",
    mrzRules: "Explain MRZ Rules",
    elaForgery: "How to spot ELA Forgery?",
    riskProtocols: "Risk Band Protocols",
    verhoeffRules: "Aadhaar Verhoeff Rules",
  },
  hi: {
    appName: "वेरीशील्ड एआई",
    subTitle: "सामरिक पहचान जांच कार्यकेंद्र",
    officerAuth: "अधिकारी प्रमाणीकरण",
    badgeId: "बैज आईडी",
    badgePlaceholder: "बैज आईडी दर्ज करें (उदा. OF-8821)",
    passwordPin: "पासवर्ड / पिन",
    checkpoint: "चेकपॉइंट स्थान",
    selectCheckpoint: "चेकपॉइंट चुनें...",
    signIn: "वर्कस्टेशन में साइन इन करें",
    quickSignIn: "त्वरित साइन-इन (अधिकारी OF-8821)",
    offlineCapable: "फील्ड मोड — 100% ऑफलाइन काम करता है",
    systemBuild: "सिस्टम निर्माण v4.2.1 · सुरक्षित कर्नेल",
    adminLedger: "मुख्यालय व्यवस्थापक खाता",
    selectDocType: "दस्तावेज़ प्रकार चुनें",
    scanDocument: "दस्तावेज़ स्कैन करें",
    uploadImage: "इसके बजाय छवि अपलोड करें",
    engineReady: "इंजन तैयार है",
    engineLoading: "इंजन लोड हो रहा है...",
    recentOnDevice: "इस डिवाइस पर हाल के सत्र",
    accept: "स्वीकार करें",
    flagReview: "समीक्षा के लिए चिह्नित करें",
    reject: "अस्वीकार करें",
    language: "भाषा",
    english: "English",
    hindi: "हिन्दी (Hindi)",
    gujarati: "ગુજરાતી (Gujarati)",
    totalSessions: "कुल सत्र",
    last24h: "पिछले 24 घंटे",
    avgRiskScore: "औसत जोखिम स्कोर",
    pendingReview: "लंबित समीक्षा",
    passcode: "एडमिन पासकोड",
    autofill: "ऑटोफिल SIH26188",
    enterLedger: "मुख्यालय खाते में प्रवेश करें",
    aiAssistant: "एआई सहायक",
    mrzRules: "MRZ नियमों की व्याख्या करें",
    elaForgery: "ELA जालसाजी कैसे पहचानें?",
    riskProtocols: "जोखिम बैंड प्रोटोकॉल",
    verhoeffRules: "आधार वर्होफ नियम",
  },
  gu: {
    appName: "વેરીશીલ્ડ AI",
    subTitle: "તાંત્રિક ઓળખ તપાસ વર્કસ્ટેશન",
    officerAuth: "અધિકારી પ્રમાણીકરણ",
    badgeId: "બેજ ID",
    badgePlaceholder: "બેજ ID દાખલ કરો (દા.ત. OF-8821)",
    passwordPin: "પાસવર્ડ / PIN",
    checkpoint: "ચેકપોઇન્ટ સ્થળ",
    selectCheckpoint: "ચેકપોઇન્ટ પસંદ કરો...",
    signIn: "વર્કસ્ટેશનમાં સાઇન ઇન કરો",
    quickSignIn: "ઝડપી સાઇન-ઇન (અધિકારી OF-8821)",
    offlineCapable: "ફિલ્ડ મોડ — 100% ઑફલાઇન કાર્ય કરે છે",
    systemBuild: "સિસ્ટમ બિલ્ડ v4.2.1 · સુરક્ષિત કર્નલ",
    adminLedger: "મુખ્યાલય એડમિન ચોપડો",
    selectDocType: "દસ્તાવેજ પ્રકાર પસંદ કરો",
    scanDocument: "દસ્તાવેજ સ્કેન કરો",
    uploadImage: "તેને બદલે છબી અપલોડ કરો",
    engineReady: "એન્જિન તૈયાર છે",
    engineLoading: "એન્જિન લોડ થઈ રહ્યું છે...",
    recentOnDevice: "આ ઉપકરણ પર તાજેતરના સત્રો",
    accept: "સ્વીકારો",
    flagReview: "સમીક્ષા માટે ફ્લેગ કરો",
    reject: "અસ્વીકાર કરો",
    language: "ભાષા",
    english: "English",
    hindi: "હિન્દી (Hindi)",
    gujarati: "ગુજરાતી (Gujarati)",
    totalSessions: "કુલ સત્રો",
    last24h: "છેલ્લા 24 કલાક",
    avgRiskScore: "સરેરાશ જોખમ સ્કોર",
    pendingReview: "બાકી સમીક્ષા",
    passcode: "એડમિન પાસકોડ",
    autofill: "ઑટોફિલ SIH26188",
    enterLedger: "મુખ્યાલય ચોપડામાં પ્રવેશ કરો",
    aiAssistant: "AI મદદનીશ",
    mrzRules: "MRZ નિયમો સમજાવો",
    elaForgery: "ELA બનાવટ કેવી રીતે ઓળખવી?",
    riskProtocols: "જોખમ બેન્ડ પ્રોટોકોલ",
    verhoeffRules: "આધાર વર્હોફ નિયમો",
  },
};

type I18nContextType = {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextType>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vs_lang") as Language;
      if (saved && ["en", "hi", "gu"].includes(saved)) return saved;
    }
    return "en";
  });

  const setLang = (l: Language) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("vs_lang", l);
    }
  };

  const t = (key: string): string => {
    return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);

export function LanguageSelector() {
  const { lang, setLang } = useI18n();

  return (
    <div className="relative inline-flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs text-slate-200">
      <Globe className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Language)}
        className="bg-transparent text-slate-100 font-mono text-xs font-semibold focus:outline-none cursor-pointer pr-1"
      >
        <option value="en" className="bg-slate-900 text-slate-100">
          English
        </option>
        <option value="hi" className="bg-slate-900 text-slate-100">
          हिन्दी (Hindi)
        </option>
        <option value="gu" className="bg-slate-900 text-slate-100">
          ગુજરાતી (Gujarati)
        </option>
      </select>
    </div>
  );
}
