export interface CoverPreset {
  id: string;
  label: string;
  url: string;
  category?: string;
}

export const COVER_PRESETS: CoverPreset[] = [
  { id: 'clinical-1', label: 'Clinical Blue', url: '/covers/clinical-blue.svg', category: 'clinical_skills' },
  { id: 'clinical-2', label: 'Clinical Teal', url: '/covers/clinical-teal.svg', category: 'clinical_skills' },
  { id: 'compliance-1', label: 'Compliance Green', url: '/covers/compliance-green.svg', category: 'compliance' },
  { id: 'hospice-1', label: 'Hospice Warm', url: '/covers/hospice-warm.svg', category: 'hospice' },
  { id: 'onboarding-1', label: 'Onboarding Sky', url: '/covers/onboarding-sky.svg', category: 'onboarding' },
  { id: 'safety-1', label: 'Safety Amber', url: '/covers/safety-amber.svg', category: 'safety' },
  { id: 'abstract-1', label: 'Abstract Emerald', url: '/covers/abstract-emerald.svg' },
  { id: 'abstract-2', label: 'Abstract Slate', url: '/covers/abstract-slate.svg' },
  { id: 'abstract-3', label: 'Abstract Violet', url: '/covers/abstract-violet.svg' },
  { id: 'minimal-1', label: 'Minimal White', url: '/covers/minimal-white.svg' },
];
